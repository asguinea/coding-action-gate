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


metrics = load_script("risk_control_metrics")
thresholds = load_script("run_risk_control_thresholds")
frontier = load_script("build_risk_cost_frontier")
early = load_script("early_intervention_metrics")
subgroups = load_script("risk_control_subgroups")


class Batch8RiskControlTests(unittest.TestCase):
    def score_row(self, baseline, split, score, target, trajectory="t1", step=0):
        return {
            "trajectory_id": trajectory,
            "step_index": step,
            "split": split,
            "baseline_name": baseline,
            "model_family": "toy",
            "score": score,
            "target": target,
            "next_step_bad": target,
            "higher_means_riskier": True,
            "source_bucket": "swe_like",
            "agent": "agent",
            "layout_family": "layout",
            "difficulty": "medium",
            "category": "cat",
        }

    def test_empirical_threshold_respects_calibration_alpha_when_feasible(self):
        selected = metrics.select_threshold([0.1, 0.2, 0.9, 1.0], [0, 0, 1, 1], 0.0)
        self.assertGreaterEqual(selected["tau"], 0.2)
        cal = metrics.decision_metrics([0.1, 0.2, 0.9, 1.0], [0, 0, 1, 1], selected["tau"], 0.0)
        self.assertEqual(cal["allowed_bad_rate"], 0.0)

    def test_conservative_threshold_is_no_less_permissive_than_empirical(self):
        scores = [0.1, 0.2, 0.3, 0.4, 0.9]
        labels = [0, 0, 1, 0, 1]
        empirical = metrics.select_threshold(scores, labels, 0.25, conservative=False)
        conservative = metrics.select_threshold(scores, labels, 0.25, conservative=True)
        self.assertLessEqual(conservative["allowed_count"], empirical["allowed_count"])

    def test_allowed_bad_rate_handles_zero_allowed_count(self):
        result = metrics.decision_metrics([1.0, 1.0], [0, 1], threshold=0.0, alpha=0.1)
        self.assertIsNone(result["allowed_bad_rate"])
        self.assertIsNone(result["risk_gap"])
        self.assertFalse(result["risk_violation"])

    def test_fixed_policy_extremes(self):
        scores = [0.0, 0.0, 0.0]
        self.assertGreater(thresholds.fixed_policy_threshold("always_allow", scores), max(scores))
        self.assertLess(thresholds.fixed_policy_threshold("always_review", [1.0, 1.0]), 1.0)
        self.assertIsNone(thresholds.fixed_policy_threshold("logistic_regression", scores))

    def test_run_thresholding_uses_calibration_only_for_tau(self):
        rows = []
        for i, (score, label) in enumerate([(0.1, 0), (0.2, 0), (0.9, 1)]):
            rows.append(self.score_row("toy_model", "calibration", score, label, trajectory=f"c{i}", step=i))
        for i, (score, label) in enumerate([(0.1, 1), (0.2, 1), (0.9, 0)]):
            rows.append(self.score_row("toy_model", "test", score, label, trajectory=f"s{i}", step=i))
        report, _decisions = thresholds.run_thresholding(rows)
        first = next(row for row in report["threshold_results"] if row["split"] == "calibration" and row["alpha"] == 0.05)
        self.assertEqual(first["selection"]["allowed_count"], 2)
        self.assertEqual(first["bad_allowed"], 0)

    def test_score_schema_validation_rejects_raw_key_and_target_mismatch(self):
        rows = [self.score_row("b", "test", 0.1, 0)]
        rows[0]["action_text"] = "raw"
        rows[0]["target"] = 1
        validation = thresholds.validate_score_schema(rows, {"raw_text_fields_allowed": False, "higher_means_riskier": True})
        self.assertEqual(validation["raw_text_key_hit_count"], 1)
        self.assertGreater(validation["error_count"], 0)

    def test_bootstrap_ci_deterministic_under_seed(self):
        rows = [
            {"score": 0.1, "target": 0, "tau": 0.5, "alpha": 0.1, "trajectory_id": "t1"},
            {"score": 0.9, "target": 1, "tau": 0.5, "alpha": 0.1, "trajectory_id": "t2"},
        ]
        a = metrics.bootstrap_metric_ci(rows, "deferral_rate", seed=7, iterations=20)
        b = metrics.bootstrap_metric_ci(rows, "deferral_rate", seed=7, iterations=20)
        self.assertEqual(a, b)
        self.assertEqual(a["unit"], "trajectory")

    def test_risk_cost_frontier_compacts_thresholds(self):
        thresholds_list = frontier.compact_thresholds([float(i) for i in range(500)], max_points=25)
        self.assertLessEqual(len(thresholds_list), 27)
        self.assertGreater(thresholds_list[-1], 499.0)

    def test_subgroup_sparse_suppression(self):
        rows = [self.score_row("b", "test", 0.1, 0, trajectory=f"t{i}", step=i) for i in range(10)]
        rows[0]["target"] = 1
        rows[0]["next_step_bad"] = 1
        for row in rows:
            row["alpha"] = 0.1
            row["tau"] = 0.5
        report_rows = subgroups.evaluate_subgroups(rows, subgroup_fields=("source_bucket",), min_rows=100, min_positives=10)
        self.assertTrue(report_rows[0]["sparse"])
        self.assertIsNone(report_rows[0]["metrics"])

    def test_early_intervention_toy_trajectory_metrics(self):
        rows = [
            {"trajectory_id": "t1", "step_index": 0, "target": 0, "decision": "ALLOW"},
            {"trajectory_id": "t1", "step_index": 1, "target": 1, "decision": "DEFER"},
            {"trajectory_id": "t1", "step_index": 2, "target": 0, "decision": "ALLOW"},
        ]
        summary = early.trajectory_summary(rows)
        self.assertEqual(summary["trajectories_with_any_bad_step"], 1)
        self.assertEqual(summary["trajectories_with_any_intervention"], 1)
        self.assertEqual(summary["intervention_at_step_immediately_before_bad_step"], 1)


if __name__ == "__main__":
    unittest.main()
