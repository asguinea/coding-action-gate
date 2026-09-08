import importlib.util
import sys
import unittest
from pathlib import Path


def load_script(name):
    script_path = Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9b = load_script("evaluate_label_target_ablations")


class Batch9BTargetAblationTests(unittest.TestCase):
    def row(self, inc=0, un=0, tid="t1"):
        return {
            "trajectory_id": tid,
            "step_index": 1,
            "next_step_bad": int(inc or un),
            "next_step_incorrect": inc,
            "next_step_unuseful": un,
            "prefix_length": 1,
            "current_stage_index": 1,
            "current_stage_step_count_so_far": 1,
            "total_stage_transitions_so_far": 0,
            "action_length_chars": 10,
            "observation_length_chars": 20,
            "recent_error_keyword_count": 0,
            "recent_exception_keyword_count": 0,
            "recent_failure_keyword_count": 0,
            "recent_test_keyword_count": 1,
            "recent_timeout_keyword_count": 0,
            "repeated_action_indicator": 0,
            "repeated_observation_indicator": 0,
            "action_kind_guess": "test",
            "observation_kind_guess": "success",
        }

    def test_target_definition_correctness(self):
        rows = [self.row(1, 0), self.row(0, 1), self.row(0, 0)]
        self.assertTrue(batch9b.validate_target_identity(rows)["ok"])
        rows[0]["next_step_bad"] = 0
        self.assertFalse(batch9b.validate_target_identity(rows)["ok"])

    def test_prevalence_and_overlap(self):
        rows = [self.row(1, 0, "a"), self.row(0, 1, "b"), self.row(1, 1, "c"), self.row(0, 0, "d")]
        splits = {"splits": [{"seed": 1, "assignments": {"a": "train", "b": "calibration", "c": "test", "d": "test"}}]}
        report = batch9b.prevalence_and_overlap(rows, splits)
        self.assertEqual(report["next_step_incorrect_positives"], 2)
        self.assertEqual(report["next_step_unuseful_positives"], 2)
        self.assertEqual(report["row_overlap_incorrect_and_unuseful"], 1)

    def test_ap_lift_over_prevalence(self):
        metrics = batch9b.metric_summary([0.1, 0.9], [0, 1])
        self.assertEqual(metrics["average_precision"], 1.0)
        self.assertEqual(metrics["ap_lift_ratio"], 2.0)
        self.assertEqual(metrics["ap_lift_absolute"], 0.5)

    def test_sparse_and_no_positive_edge_cases(self):
        metrics = batch9b.metric_summary([0.1, 0.2], [0, 0])
        self.assertIsNone(metrics["auroc"])
        self.assertIsNone(metrics["average_precision"])
        self.assertIsNone(metrics["ap_lift_ratio"])

    def test_no_prohibited_feature_columns(self):
        for feature_set in batch9b.DEFAULT_FEATURE_SETS:
            for feature in batch9b.batch9a.FEATURE_SETS[feature_set]:
                self.assertNotIn(feature, batch9b.batch9a.PROHIBITED_FEATURES)
                self.assertNotIn("target", feature)
                self.assertNotIn("label", feature)
        self.assertIn("current_step_bad", batch9b.batch9a.PROHIBITED_FEATURES)

    def test_categorical_encoding_handles_unseen(self):
        train = [self.row()]
        test = [self.row()]
        test[0]["action_kind_guess"] = "deploy"
        encoder = batch9b.batch9a.build_encoder(train, ("action_kind_guess",))
        encoded = batch9b.batch9a.encode_rows(test, ("action_kind_guess",), encoder)
        self.assertEqual(encoded[0][-1], 1.0)

    def test_fixed_budget_and_strict_alpha_calibration_helpers(self):
        tau = batch9b.risk_utils.threshold_for_deferral_budget([0.1, 0.2, 0.9], 0.33)
        self.assertEqual(tau, 0.2)
        selected = batch9b.repeated_utils.select_threshold_fast([0.1, 0.2, 0.9], [0, 0, 1], 0.0)
        self.assertGreaterEqual(selected["tau"], 0.2)

    def test_cross_target_capture_diagnostic(self):
        rows = []
        for i, score in enumerate([0.1, 0.9]):
            rows.append({
                "split_seed": 1,
                "split": "test",
                "trajectory_id": f"t{i}",
                "step_index": i,
                "target_name": "next_step_bad",
                "target_value": i,
                "model_name": "logistic_regression",
                "feature_set": "all_structured",
                "score": score,
                "next_step_bad": i,
                "next_step_incorrect": i,
                "next_step_unuseful": 0,
            })
        report = batch9b.cross_target_capture(rows)
        self.assertTrue(report)

    def test_score_output_schema(self):
        rec = batch9b.score_record(1, "test", self.row(1, 0), "next_step_incorrect", 1, "m", "f", 0.5)
        self.assertEqual(rec["target_name"], "next_step_incorrect")
        self.assertFalse(batch9b.RAW_KEYS & set(rec))
        self.assertIn("next_step_bad", rec)

    def test_runtime_option_parsing_quick_check(self):
        ns = type("Args", (), {"quick_check": True, "targets": None, "models": None, "feature_sets": None, "seeds": None})()
        targets, models, feature_sets, seeds = batch9b.selected_options(ns)
        self.assertEqual(set(targets), set(batch9b.TARGETS))
        self.assertEqual(len(seeds), 1)

    def test_markdown_creation(self):
        report = {
            "target_prevalence_and_overlap": {
                "total_prefix_rows": 2,
                "next_step_bad_positives": 1,
                "next_step_incorrect_positives": 1,
                "next_step_unuseful_positives": 0,
                "row_overlap_incorrect_and_unuseful": 0,
                "incorrect_only_rows": 1,
                "unuseful_only_rows": 0,
                "trajectory_counts": {
                    "both_incorrect_and_unuseful": 0,
                    "incorrect_only": 1,
                    "unuseful_only": 0,
                    "neither": 1,
                    "total": 2,
                },
            },
            "aggregate_metrics": {},
            "cross_target_capture": [],
        }
        self.assertIn("Target Prevalence", batch9b.markdown(report))
        self.assertIn("candidate / not final", batch9b.report_tables(report))

    def test_aggregate_includes_strict_alpha_metrics(self):
        per_split = [{
            "target_name": "next_step_bad",
            "model_name": "logistic_regression",
            "feature_set": "all_structured",
            "ranking_metrics": {
                "train": {"auroc": 1.0, "average_precision": 1.0, "ap_lift_ratio": 2.0, "ap_lift_absolute": 0.5, "prevalence": 0.5},
                "calibration": {"auroc": 1.0, "average_precision": 1.0, "ap_lift_ratio": 2.0, "ap_lift_absolute": 0.5, "prevalence": 0.5},
                "test": {"auroc": 1.0, "average_precision": 1.0, "ap_lift_ratio": 2.0, "ap_lift_absolute": 0.5, "prevalence": 0.5},
            },
            "risk_concentration": {
                "top_decile_target_positive_rate": 1.0,
                "bottom_decile_target_positive_rate": 0.0,
                "top_10pct_target_positive_capture": 1.0,
                "top_20pct_target_positive_capture": 1.0,
            },
            "overfitting": {"train_test_auroc_gap": 0.0, "train_test_ap_gap": 0.0, "overfit_flag": False},
            "fixed_budget": {
                "0.05": {
                    "test": {
                        "deferral_rate": 0.05,
                        "allowed_target_positive_rate": 0.4,
                        "fraction_of_target_positives_deferred": 0.2,
                    }
                }
            },
            "strict_alpha": {
                "0.02": {
                    "low_base_rate_allow_all_case": False,
                    "calibration": {"deferral_rate": 0.5, "allowed_target_positive_rate": 0.01},
                    "test": {"deferral_rate": 0.6, "allowed_target_positive_rate": 0.03, "risk_violation": True},
                }
            },
        }]
        aggregate = batch9b.aggregate_metrics(per_split)
        metrics = aggregate["next_step_bad::logistic_regression::all_structured"]
        self.assertEqual(metrics["alpha_0.02_test_deferral_rate"]["mean"], 0.6)
        self.assertEqual(metrics["alpha_0.02_test_target_met_rate"]["mean"], 0.0)


if __name__ == "__main__":
    unittest.main()
