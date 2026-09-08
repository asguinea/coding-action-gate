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


utils = load_script("risk_diagnostic_utils")
strict = load_script("run_strict_alpha_thresholds")
relative = load_script("run_relative_risk_thresholds")
budget = load_script("run_deferral_budget_analysis")
decile = load_script("run_score_decile_analysis")
mismatch = load_script("audit_calibration_test_mismatch")
protocol = load_script("recommend_repeated_split_protocol")
summary = load_script("summarize_risk_diagnostics")


class Batch85RiskDiagnosticTests(unittest.TestCase):
    def row(self, baseline, split, score, target, trajectory="t", step=0):
        return {
            "trajectory_id": trajectory,
            "step_index": step,
            "split": split,
            "baseline_name": baseline,
            "score": score,
            "target": target,
            "next_step_bad": target,
            "higher_means_riskier": True,
        }

    def toy_score_rows(self):
        rows = []
        for i, (score, label) in enumerate([(0.1, 0), (0.2, 0), (0.3, 1), (0.9, 1)]):
            rows.append(self.row("toy", "calibration", score, label, f"c{i}", i))
        for i, (score, label) in enumerate([(0.1, 0), (0.2, 1), (0.3, 0), (0.9, 1)]):
            rows.append(self.row("toy", "test", score, label, f"s{i}", i))
        return rows

    def test_strict_alpha_below_base_forces_nontrivial_deferral_when_feasible(self):
        report = strict.run_strict_alpha(self.toy_score_rows(), alphas=(0.01,))
        row = next(r for r in report["threshold_results"] if r["split"] == "calibration" and r["thresholding_variant"] == "empirical_threshold")
        self.assertGreater(row["deferral_rate"], 0.0)
        self.assertFalse(row["risk_violation"])

    def test_relative_risk_target_calculation(self):
        report = relative.run_relative_risk(self.toy_score_rows())
        row = report["threshold_results"][0]
        self.assertEqual(row["calibration_base_risk"], 0.5)
        self.assertIn(row["target_allowed_bad_rate"], {0.375, 0.25, 0.125})

    def test_fixed_deferral_budget_thresholding(self):
        tau = utils.threshold_for_deferral_budget([0.1, 0.2, 0.3, 0.9], 0.25)
        self.assertEqual(tau, 0.3)
        report = budget.run_budget_analysis(self.toy_score_rows(), budgets=(0.25,))
        row = next(r for r in report["budget_results"] if r["split"] == "calibration")
        self.assertAlmostEqual(row["deferral_rate"], 0.25)

    def test_decile_assignment_uses_calibration_cutpoints(self):
        cuts = utils.decile_cutpoints([0.1, 0.2, 0.3, 0.9])
        self.assertEqual(utils.assign_decile(0.95, cuts), 10)
        report = decile.run_decile_analysis(self.toy_score_rows())
        self.assertEqual(len(report["decile_results"]), 2)

    def test_mismatch_audit_on_toy_data(self):
        rows = [
            {"split": "calibration", "next_step_bad": 0, "source_bucket": "a", "agent": "x", "layout_family": "l", "difficulty": "d", "category": "c", "action_kind_guess": "test", "observation_kind_guess": "success", "prefix_length": 1},
            {"split": "test", "next_step_bad": 1, "source_bucket": "b", "agent": "x", "layout_family": "l", "difficulty": "d", "category": "c", "action_kind_guess": "test", "observation_kind_guess": "error", "prefix_length": 3},
        ]
        audit = mismatch.build_audit(rows)
        self.assertEqual(audit["split_prevalence"]["test"]["base_risk"], 1.0)
        self.assertGreater(audit["calibration_test_base_risk_gap"], 0.0)

    def test_protocol_creation(self):
        report = protocol.build_protocol({"calibration_test_base_risk_gap": 0.01})
        self.assertTrue(report["recommended"])
        self.assertEqual(report["number_of_random_trajectory_splits"], 10)

    def test_summary_creation_from_toy_reports(self):
        strict_report = {"threshold_results": [{"alpha": 0.01, "split": "test", "thresholding_variant": "empirical_threshold", "allowed_bad_rate": 0.0, "risk_violation": False, "deferral_rate": 0.5, "baseline_name": "toy"}]}
        self.assertEqual(summary.strict_summary(strict_report)["best_test_rows_by_alpha"][0]["baseline_name"], "toy")

    def test_no_raw_text_fields_in_report_shape(self):
        report = budget.run_budget_analysis(self.toy_score_rows(), budgets=(0.25,))
        text = str(report)
        self.assertNotIn("action_text", text)
        self.assertNotIn("observation_text", text)


if __name__ == "__main__":
    unittest.main()
