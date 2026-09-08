import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
REPORTS = ROOT / "reports"
THEORY = ROOT / "theory"


def load_script(name: str, filename: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class BatchT12FeasibilityAwareControllerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctrl = load_script("feasibility_aware_first_event_control", "feasibility_aware_first_event_control.py")


    def test_prevalence_estimation_toy(self):
        got = self.ctrl.estimate_first_failure_prevalence([
            {"trajectory_has_first_failure": 1},
            {"trajectory_has_first_failure": 0},
            {"trajectory_has_first_failure": True},
            {"trajectory_has_first_failure": False},
        ])
        self.assertEqual(got["n"], 4)
        self.assertEqual(got["k_first_failure"], 2)
        self.assertAlmostEqual(got["p_hat"], 0.5)

    def test_structural_lower_bound_toy(self):
        self.assertAlmostEqual(self.ctrl.structural_burden_lower_bound(0.1, 0.4), 0.3)
        self.assertAlmostEqual(self.ctrl.structural_burden_lower_bound(0.5, 0.4), 0.0)

    def test_clopper_pearson_lower_bound_sensible(self):
        zero = self.ctrl.clopper_pearson_lower_bound(0, 20, 0.05)
        mid = self.ctrl.clopper_pearson_lower_bound(10, 20, 0.05)
        full = self.ctrl.clopper_pearson_lower_bound(20, 20, 0.05)
        self.assertEqual(zero, 0.0)
        self.assertGreater(mid, 0.25)
        self.assertLess(mid, 0.5)
        self.assertGreater(full, 0.8)
        self.assertLessEqual(full, 1.0)

    def test_structural_check_distinguishes_empirical_and_certified(self):
        empirical_only = self.ctrl.structural_feasibility_check(alpha=0.1, beta=0.2, p_hat=0.4, p_lcb=0.25)
        self.assertTrue(empirical_only["empirical_structurally_infeasible"])
        self.assertFalse(empirical_only["certified_structurally_infeasible"])
        self.assertEqual(empirical_only["reason"], "empirically_structurally_infeasible_by_first_failure_prevalence")

        certified = self.ctrl.structural_feasibility_check(alpha=0.1, beta=0.2, p_hat=0.5, p_lcb=0.4)
        self.assertTrue(certified["certified_structurally_infeasible"])
        self.assertEqual(certified["reason"], "structurally_infeasible_by_first_failure_prevalence")

    def test_selector_returns_structural_no_safe(self):
        table = [
            {"threshold": 0.1, "n_miss": 1000, "n_burden": 1000, "empirical_miss_rate": 0.0, "empirical_burden": 0.0},
        ]
        got = self.ctrl.feasibility_aware_select_policy(
            table,
            alpha=0.05,
            beta=0.10,
            delta=0.10,
            p_hat=0.80,
            p_lcb=0.70,
            threshold_grid=[0.1],
        )
        self.assertTrue(got["no_safe"])
        self.assertEqual(got["no_safe_reason"], "structurally_infeasible_by_first_failure_prevalence")

    def test_selector_can_return_corrected_feasible_policy(self):
        table = [
            {
                "threshold": 0.1,
                "threshold_order": 0,
                "n_miss": 200,
                "n_burden": 200,
                "empirical_miss_rate": 0.01,
                "empirical_burden": 0.10,
                "empirical_pre_failure_coverage": 0.5,
                "empirical_false_alarm_rate": 0.1,
            },
            {
                "threshold": 0.2,
                "threshold_order": 1,
                "n_miss": 200,
                "n_burden": 200,
                "empirical_miss_rate": 0.02,
                "empirical_burden": 0.05,
                "empirical_pre_failure_coverage": 0.7,
                "empirical_false_alarm_rate": 0.05,
            },
        ]
        test_table = [
            {"threshold": 0.1, "test_missed_first_failure_rate": 0.02, "test_trajectory_burden": 0.10},
            {"threshold": 0.2, "test_missed_first_failure_rate": 0.03, "test_trajectory_burden": 0.06},
        ]
        got = self.ctrl.feasibility_aware_select_policy(
            table,
            alpha=0.20,
            beta=0.30,
            delta=0.10,
            p_hat=0.20,
            p_lcb=0.10,
            threshold_grid=[0.1, 0.2],
            test_table=test_table,
        )
        self.assertFalse(got["no_safe"])
        self.assertEqual(got["selected_threshold"], 0.2)
        self.assertTrue(got["selected_test_joint_success"])



    def test_no_raw_text_metadata_or_test_tuning(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in list(REPORTS.glob("batch_T12_*")) + list(THEORY.glob("batch_T12_*")):
            if path.suffix not in {".json", ".md", ".csv"}:
                continue
            text = path.read_text().lower()
            self.assertFalse(any(term in text for term in forbidden), str(path))
            if path.suffix == ".json":
                obj = json.loads(path.read_text())
                guard = obj.get("guard_results")
                if guard:
                    self.assertFalse(guard.get("raw_text_used", True), path.name)
                    self.assertFalse(guard.get("metadata_used_as_model_features", True), path.name)
                    self.assertFalse(guard.get("test_tuning", True), path.name)

    def test_no_completed_theorem_or_formal_claim(self):
        for path in list(REPORTS.glob("batch_T12_*")) + list(THEORY.glob("batch_T12_*")):
            if path.suffix not in {".json", ".md", ".csv"}:
                continue
            text = path.read_text().lower()
            self.assertNotIn("final theorem", text)
            self.assertNotIn("production guarantee", text)
            self.assertNotIn("safe to deploy", text)
            if "conformal guarantee" in text:
                self.assertIn("no formal conformal guarantee claimed", text)


if __name__ == "__main__":
    unittest.main()
