import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


burden = load_script("analyze_row_to_trajectory_burden")
intervention = load_script("evaluate_trajectory_aware_budgeted_intervention")
claim = load_script("check_batch9h_claim_boundaries")


def row(tid, step, score, target=0, source="swe_bench_like"):
    return {
        "trajectory_id": tid,
        "step_index": step,
        "score": score,
        "target": target,
        "next_step_bad": target,
        "source_bucket": source,
        "source_group": "SWE-like",
    }


class Batch9HTrajectoryBurdenTests(unittest.TestCase):
    def test_row_to_trajectory_burden_metrics(self):
        rows = [row("a", 1, 0.9, 1), row("a", 2, 0.1), row("b", 1, 0.8)]
        metrics = burden.compute_metrics(rows, [True, False, False])
        self.assertAlmostEqual(metrics["row_deferral_rate"], 1 / 3)
        self.assertAlmostEqual(metrics["trajectory_burden"], 1 / 2)
        self.assertAlmostEqual(metrics["burden_inflation"], 1.5)

    def test_random_row_deferral_analytic_expectation(self):
        rows = [row("a", i, 0.1) for i in range(3)] + [row("b", 1, 0.2)]
        expected = burden.analytic_random_trajectory_burden(rows, 0.1)
        manual = ((1 - 0.9**3) + (1 - 0.9)) / 2
        self.assertAlmostEqual(expected, manual)

    def test_oracle_bad_row_deferral(self):
        rows = [row("a", 1, 0.1, 1), row("a", 2, 0.2), row("b", 1, 0.3, 1), row("c", 1, 0.4)]
        decisions = burden.oracle_bad_row_decisions(rows, 0.5)
        self.assertEqual(sum(decisions), 2)
        self.assertEqual(burden.compute_metrics(rows, decisions)["bad_row_capture"], 1.0)

    def test_oracle_first_bad_row_deferral(self):
        rows = [row("a", 1, 0.1), row("a", 2, 0.2, 1), row("a", 3, 0.3, 1), row("b", 1, 0.4, 1)]
        decisions = burden.oracle_first_bad_decisions(rows, 1.0, "trajectory")
        self.assertEqual(sum(decisions), 2)
        self.assertEqual(burden.compute_metrics(rows, decisions)["first_failure_coverage"], 1.0)

    def test_no_raw_text_in_metric_outputs(self):
        rows = [row("a", 1, 0.9, 1)]
        metrics = burden.compute_metrics(rows, [True])
        self.assertNotIn("action_text", metrics)
        self.assertNotIn("observation_text", metrics)

    def test_metadata_stratification_not_feature_use(self):
        r = row("a", 1, 0.1, source="openhands")
        self.assertEqual(burden.source_group(r), "OpenHands-like")
        self.assertEqual(r["score"], 0.1)

    def test_trajectory_policy_respects_budget_with_threshold(self):
        cal = [row(f"c{i}", 1, i / 10) for i in range(10)]
        test = [row(f"t{i}", 1, i / 10) for i in range(10)]
        threshold = intervention.trajectory_threshold(cal, 0.2, "max_score")
        selected = intervention.selected_trajectories(test, threshold, "max_score")
        self.assertLessEqual(len(selected), 3)  # allows one tie/tolerance in small fixtures

    def test_fixed_tables_have_required_metrics(self):
        rows = [row("a", 1, 0.9, 1), row("b", 1, 0.1)]
        metrics = burden.compute_metrics(rows, [True, False])
        for key in ["row_deferral_rate", "trajectory_burden", "bad_row_capture", "first_failure_coverage"]:
            self.assertIn(key, metrics)

    def test_pareto_frontier_required_columns(self):
        rows = [
            {"policy_family": "a", "bad_row_capture": 0.5, "first_failure_coverage": 0.5, "row_deferral_rate": 0.1, "trajectory_burden": 0.2, "allowed_bad_rate": 0.03},
            {"policy_family": "b", "bad_row_capture": 0.4, "first_failure_coverage": 0.4, "row_deferral_rate": 0.2, "trajectory_burden": 0.3, "allowed_bad_rate": 0.04},
        ]
        frontier = intervention.pareto_frontier(rows)
        self.assertEqual(frontier[0]["policy_family"], "a")

    def test_by_group_output_has_group(self):
        out = intervention.by_group_rows([{"policy_family": "x"}], {})
        self.assertEqual(out[0]["group"], "all")

    def test_claim_checker_catches_forbidden(self):
        result = claim.check_text("This validates CodingActionGate and prevents failures.")
        self.assertIn("validates CodingActionGate", result["forbidden_phrase_hits"])
        self.assertIn("prevents failures", result["forbidden_phrase_hits"])

    def test_claim_checker_accepts_safe_text(self):
        text = "benchmark-level CodeTraceBench-derived offline proxy with trajectory-level burden, row-level risk, calibration support, domain shift, not production validation, not causal prevention"
        result = claim.check_text(text)
        self.assertEqual(result["forbidden_phrase_hits"], [])
        self.assertEqual(result["missing_required_concepts"], [])

    def test_claim_checker_generated_file_pass_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "safe.md"
            p.write_text("benchmark-level CodeTraceBench-derived offline proxy with trajectory-level burden, row-level risk, calibration support, domain shift, not production validation, not causal prevention")
            report = claim.check_files([p])
            self.assertTrue(report["passed"])


if __name__ == "__main__":
    unittest.main()
