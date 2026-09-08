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


batch9d = load_script("evaluate_cross_source_heldout_robustness")


class Batch9DCrossSourceTests(unittest.TestCase):
    def row(self, tid="t1", step=1, source="swe_bench_like", parser="p1", bad=0, inc=0, un=0):
        return {
            "trajectory_id": tid,
            "step_index": step,
            "source_bucket": source,
            "source_inferred": source,
            "agent": "agent",
            "layout_family": parser,
            "parser_adapter": parser,
            "category": "cat",
            "difficulty": "easy",
            "model": "model",
            "next_step_bad": bad,
            "next_step_incorrect": inc,
            "next_step_unuseful": un,
            "prefix_length": step,
        }

    def test_grouping_audit(self):
        rows = [self.row("a", bad=1, inc=1), self.row("b", source="terminalbench_like")]
        audit = batch9d.grouping_audit(rows)
        self.assertIn("source_bucket", audit)
        self.assertEqual(audit["source_bucket"]["swe_bench_like"]["positives"]["next_step_bad"], 1)

    def test_feasibility_logic(self):
        support = {
            "train": {"positive_rows": 30, "positive_trajectories": 10},
            "calibration": {"positive_rows": 10, "positive_trajectories": 5},
            "test": {"positive_rows": 10, "positive_trajectories": 5},
        }
        feasible, reasons = batch9d.feasibility(support, "next_step_bad")
        self.assertTrue(feasible)
        self.assertEqual(reasons, [])
        support["test"]["positive_rows"] = 0
        feasible, reasons = batch9d.feasibility(support, "next_step_bad")
        self.assertFalse(feasible)
        self.assertTrue(reasons)

    def test_heldout_split_no_group_leakage(self):
        rows = []
        for i in range(8):
            rows.append(self.row(f"s{i}", source="swe_bench_like", bad=i % 2, inc=i % 2))
            rows.append(self.row(f"t{i}", source="terminalbench_like", bad=i % 2, inc=i % 2))
        grouped = batch9d.group_rows_by_trajectory(rows)
        meta = {tid: batch9d.trajectory_meta(traj_rows) for tid, traj_rows in grouped.items()}
        scenario = {"scenario_type": "cross_source", "train_group_type": "source_bucket", "train_groups": ["swe_bench_like"], "test_group_type": "source_bucket", "test_groups": ["terminalbench_like"]}
        train_pool, test_pool = batch9d.resolve_scenario_ids(scenario, meta)
        assignments = batch9d.split_ids_for_target(grouped, train_pool, test_pool, "next_step_bad", 1)
        self.assertTrue(all(assignments[tid] == "test" for tid in test_pool))
        self.assertFalse(any(assignments[tid] in {"train", "calibration"} for tid in test_pool))

    def test_metadata_excluded_from_features(self):
        policy = {"target_name": "next_step_bad", "model_name": "logistic_regression", "feature_set": "prefix_position_only"}
        self.assertEqual(batch9d.validate_feature_set(policy), [])

    def test_policy_set_loading_schema(self):
        policies = [{"target_name": "next_step_bad", "model_name": "always_allow", "feature_set": "policy_baseline", "scores_available": True, "early_intervention_events_available": True}]
        self.assertEqual(batch9d.policy_id(policies[0]), "next_step_bad::always_allow::policy_baseline")

    def test_fixed_budget_thresholding_calibration_only_helper(self):
        tau = batch9d.batch9c.threshold_for_budget([0.1, 0.2, 0.9, 1.0], 0.25)
        self.assertEqual(tau, 0.9)

    def test_low_base_rate_flag_inputs(self):
        selected = batch9d.batch9c.select_alpha_threshold([0.1, 0.2], [0, 0], 0.02)
        self.assertEqual(selected["allowed_count"], 2)

    def test_ap_lift_calculation(self):
        rows = [self.row("a", bad=0), self.row("b", bad=1, inc=1)]
        metrics = batch9d.ranking_metrics([0.1, 0.9], rows, "next_step_bad")
        self.assertEqual(metrics["average_precision"], 1.0)
        self.assertEqual(metrics["ap_lift_ratio"], 2.0)

    def test_degradation_metric_calculation_and_classification(self):
        value = {"test_auroc": {"mean": 0.8}, "test_capture": {"mean": 0.4}, "calibration_test_allowed_rate_gap": {"mean": 0.01}, "test_prevalence": {"mean": 0.05}}
        delta = {"delta_auroc": -0.01, "delta_capture": -0.02}
        self.assertEqual(batch9d.classify_outcome(value, delta), "robust")
        delta["delta_auroc"] = -0.2
        self.assertEqual(batch9d.classify_outcome(value, delta), "ranking_degrades")

    def test_score_distribution_summary(self):
        summary = batch9d.score_summary([0.1, 0.2, 0.9])
        self.assertEqual(summary["count"], 3)
        self.assertEqual(summary["median"], 0.2)

    def test_output_schema_and_raw_guard(self):
        score = batch9d.scored_rows([self.row("a")], [0.2], "s", 1, {"target_name": "next_step_bad", "model_name": "m", "feature_set": "f"}, "next_step_bad", "test")[0]
        self.assertFalse(batch9d.RAW_KEYS & set(score))
        self.assertEqual(batch9d.raw_key_hits([{"action_text": "x"}]), 1)

    def test_markdown_creation(self):
        report = {
            "grouping_audit": {"source_bucket": {"x": {"trajectory_count": 1, "prefix_row_count": 2, "positives": {"next_step_bad": 1}, "prevalence": {"next_step_bad": 0.5}}}},
            "feasibility_audit": {"feasible": [], "skipped": []},
            "aggregate_metrics": {},
            "degradation_comparisons": [],
        }
        self.assertIn("Row-level budget is not trajectory-level burden", batch9d.markdown(report))
        self.assertIn("candidate / not final", batch9d.report_tables({"aggregate_metrics": {}}))

    def test_forbidden_language_guard(self):
        self.assertEqual(batch9d.forbidden_language_hits("No causal prevention claim is made."), [])
        self.assertTrue(batch9d.forbidden_language_hits("This causally prevents failures."))

    def test_quick_check_options(self):
        ns = type("Args", (), {"quick_check": True, "scenarios": None, "targets": None, "policies": None, "seeds": None, "budgets": None, "alphas": None})()
        targets, policies, seeds, budgets, alphas, scenario_filter = batch9d.selected_options(ns, [{"target_name": "next_step_bad", "model_name": "always_allow", "feature_set": "policy_baseline", "scores_available": True, "early_intervention_events_available": True}], [{"scenario_id": "x"}])
        self.assertEqual(targets, ["next_step_bad"])
        self.assertEqual(len(seeds), 1)
        self.assertTrue(scenario_filter)


if __name__ == "__main__":
    unittest.main()
