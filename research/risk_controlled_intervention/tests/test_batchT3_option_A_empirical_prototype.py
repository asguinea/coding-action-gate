import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
REPORTS = ROOT / "reports"


def load_script(name: str, filename: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class BatchT3OptionAEmpiricalPrototypeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.opt = load_script("option_a", "option_a_first_event_calibration.py")

    def test_module_exists_and_exposes_required_functions(self):
        for name in [
            "compute_first_crossing_warning_times",
            "compute_trajectory_event_losses",
            "hoeffding_union_upper_bound",
            "build_threshold_grid",
            "option_a_select_threshold",
            "evaluate_selected_threshold",
        ]:
            self.assertTrue(hasattr(self.opt, name), name)

    def test_hoeffding_union_bound_toy_example(self):
        got = self.opt.hoeffding_union_upper_bound(0.1, n=100, m=10, delta=0.05)
        expected = min(1.0, 0.1 + math.sqrt(math.log(10 / 0.05) / 200))
        self.assertAlmostEqual(got, expected)

    def test_option_a_returns_no_safe_when_all_upper_bounds_exceed_alpha(self):
        table = [
            {"threshold": 0.1, "n_risk": 50, "empirical_miss_rate": 0.5, "empirical_burden": 0.1},
            {"threshold": 0.2, "n_risk": 50, "empirical_miss_rate": 0.6, "empirical_burden": 0.05},
        ]
        result = self.opt.option_a_select_threshold(table, alpha=0.05, delta=0.1, threshold_grid=[0.1, 0.2])
        self.assertTrue(result["no_safe"])
        self.assertEqual(result["feasible_count"], 0)

    def test_option_a_chooses_least_burden_among_feasible(self):
        table = [
            {"threshold": 0.1, "n_risk": 10000, "empirical_miss_rate": 0.01, "empirical_burden": 0.5, "empirical_false_alarm_rate": 0.1, "empirical_pre_failure_coverage": 0.9},
            {"threshold": 0.2, "n_risk": 10000, "empirical_miss_rate": 0.02, "empirical_burden": 0.2, "empirical_false_alarm_rate": 0.2, "empirical_pre_failure_coverage": 0.8},
        ]
        result = self.opt.option_a_select_threshold(table, alpha=0.1, delta=0.1, threshold_grid=[0.1, 0.2])
        self.assertFalse(result["no_safe"])
        self.assertEqual(result["selected_threshold"], 0.2)

    def test_tie_breaking_is_deterministic(self):
        table = [
            {"threshold": 0.1, "threshold_order": 0, "n_risk": 10000, "empirical_miss_rate": 0.01, "empirical_burden": 0.2, "empirical_false_alarm_rate": 0.1, "empirical_pre_failure_coverage": 0.8},
            {"threshold": 0.2, "threshold_order": 1, "n_risk": 10000, "empirical_miss_rate": 0.01, "empirical_burden": 0.2, "empirical_false_alarm_rate": 0.1, "empirical_pre_failure_coverage": 0.8},
        ]
        result = self.opt.option_a_select_threshold(table, alpha=0.1, delta=0.1, threshold_grid=[0.1, 0.2])
        self.assertEqual(result["selected_threshold"], 0.2)






    def test_no_raw_text_appears_in_outputs(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in REPORTS.glob("batch_T3_*"):
            if path.suffix in {".json", ".md", ".csv"}:
                text = path.read_text()
                self.assertFalse(any(term in text for term in forbidden), str(path))


if __name__ == "__main__":
    unittest.main()
