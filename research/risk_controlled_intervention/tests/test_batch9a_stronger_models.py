import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


def load_script(name):
    script_path = Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9a = load_script("evaluate_stronger_models_and_ablations")


class Batch9AStrongerModelTests(unittest.TestCase):
    def row(self, **updates):
        row = {
            "trajectory_id": "t1",
            "step_index": 1,
            "next_step_bad": 0,
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
        row.update(updates)
        return row

    def test_feature_set_construction(self):
        validation = batch9a.validate_feature_sets()
        self.assertTrue(validation["ok"], validation)
        self.assertIn("action_kind_guess", batch9a.FEATURE_SETS["non_position_history_only"])
        self.assertNotIn("prefix_length", batch9a.FEATURE_SETS["all_minus_prefix_position"])

    def test_current_step_labels_explicitly_excluded(self):
        for forbidden in ("current_step_bad", "current_step_incorrect", "current_step_unuseful"):
            self.assertIn(forbidden, batch9a.PROHIBITED_FEATURES)
            self.assertNotIn(forbidden, batch9a.ALLOWED_FEATURES)

    def test_interaction_feature_construction(self):
        train = [self.row(prefix_length=2, recent_error_keyword_count=3)]
        features = ("prefix_length", "recent_error_keyword_count", "prefix_x_error")
        encoder = batch9a.build_encoder(train, features)
        encoded = batch9a.encode_rows(train, features, encoder)
        self.assertEqual(encoded[0][-1], 6.0)

    def test_categorical_unseen_category_uses_unknown_bucket(self):
        train = [self.row(action_kind_guess="test")]
        test = [self.row(action_kind_guess="deploy")]
        features = ("action_kind_guess",)
        encoder = batch9a.build_encoder(train, features)
        encoded = batch9a.encode_rows(test, features, encoder)
        self.assertEqual(encoded[0][-1], 1.0)

    def test_train_only_preprocessing_fit_behavior(self):
        train = [self.row(prefix_length=1), self.row(prefix_length=3)]
        encoder = batch9a.build_encoder(train, ("prefix_length",))
        self.assertEqual(encoder["fit_split"], "train")
        self.assertEqual(encoder["numeric_impute"]["prefix_length"], 2.0)

    def test_score_output_schema_has_no_raw_text(self):
        record = batch9a.score_output_record(20250617, "test", self.row(next_step_bad=1), "m", "f", 0.2)
        self.assertEqual(record["target"], 1)
        self.assertFalse(batch9a.RAW_TEXT_KEYS & set(record))
        self.assertIn("split_seed", record)

    def test_fixed_budget_and_strict_alpha_calibration_helpers(self):
        tau = batch9a.threshold_for_budget([0.1, 0.2, 0.9], 0.33)
        self.assertEqual(tau, 0.2)
        selected = batch9a.strict_threshold([0.1, 0.2, 0.9], [0, 0, 1], 0.0)
        self.assertGreaterEqual(selected["tau"], 0.2)

    def test_overfitting_diagnostic(self):
        flags = batch9a.overfit_flags({"auroc": 0.9, "average_precision": 0.6}, {"auroc": 0.7, "average_precision": 0.4})
        self.assertTrue(flags["overfit_flag"])

    def test_paired_delta_calculation(self):
        rows = [
            {"seed": 1, "model_name": "logistic_regression", "feature_set": "all_structured", "ranking_metrics": {"test": {"auroc": 0.5, "average_precision": 0.1}}, "risk_concentration": {"top_10pct_bad_step_capture": 0.2, "top_20pct_bad_step_capture": 0.3}},
            {"seed": 1, "model_name": "m", "feature_set": "f", "ranking_metrics": {"test": {"auroc": 0.6, "average_precision": 0.2}}, "risk_concentration": {"top_10pct_bad_step_capture": 0.4, "top_20pct_bad_step_capture": 0.5}},
        ]
        deltas = batch9a.paired_deltas(rows)
        match = [row for row in deltas if row["model_name"] == "m" and row["comparison"] == "vs_logistic_regression_all_structured"]
        self.assertEqual(match[0]["improved"], 1)

    def test_runtime_option_parsing_quick_check(self):
        args = batch9a.parse_args.__wrapped__ if hasattr(batch9a.parse_args, "__wrapped__") else None
        namespace = type("Args", (), {"quick_check": True, "models": None, "feature_sets": None, "seeds": None})()
        models, feature_sets, seeds = batch9a.selected_options(namespace)
        self.assertEqual(seeds, [batch9a.SEED_DEFAULTS[0]])
        self.assertIn("all_structured", feature_sets)

    def test_markdown_report_creation(self):
        report = {
            "seeds": [1],
            "score_output": "scores.jsonl",
            "environment": {"sklearn": "x"},
            "aggregate_metrics": {
                "logistic_regression::all_structured": {
                    "test_average_precision": {"mean": 0.2},
                    "test_auroc": {"mean": 0.6},
                    "top_10pct_bad_step_capture": {"mean": 0.3},
                    "top_20pct_bad_step_capture": {"mean": 0.4},
                    "overfit_flag_rate": {"mean": 0.0},
                    "train_test_auroc_gap": {"mean": 0.0},
                }
            },
            "paired_comparisons": [],
        }
        self.assertIn("Does this reduce to prefix length?", batch9a.markdown(report))
        self.assertIn("candidate / not final", batch9a.report_tables(report))


if __name__ == "__main__":
    unittest.main()
