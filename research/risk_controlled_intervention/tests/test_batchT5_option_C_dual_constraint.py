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


class BatchT5OptionCDualConstraintTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.optc = load_script("option_c", "option_c_dual_constraint_calibration.py")


    def test_module_exposes_required_functions(self):
        for name in [
            "compute_dual_loss_bounds",
            "clopper_pearson_dual_union_bounds",
            "option_c_select_threshold",
            "evaluate_option_c_threshold",
        ]:
            self.assertTrue(hasattr(self.optc, name), name)

    def test_dual_loss_cp_union_bound_toy(self):
        got = self.optc.clopper_pearson_dual_union_bounds(0, 5, n=100, n_burden=100, M=10, delta=0.05)
        self.assertLess(got["miss_upper"], 0.1)
        self.assertGreater(got["burden_upper"], 0.05)
        self.assertTrue(got["is_uniform_over_grid_and_losses"])

    def test_option_c_returns_no_safe_when_either_bound_fails(self):
        table = [
            {"threshold": 0.1, "n_miss": 100, "n_burden": 100, "empirical_miss_rate": 0.01, "empirical_burden": 0.9},
            {"threshold": 0.2, "n_miss": 100, "n_burden": 100, "empirical_miss_rate": 0.8, "empirical_burden": 0.01},
        ]
        got = self.optc.option_c_select_threshold(table, alpha=0.1, beta=0.1, delta=0.1, threshold_grid=[0.1, 0.2])
        self.assertTrue(got["no_safe"])

    def test_option_c_secondary_objective_order(self):
        table = [
            {"threshold": 0.1, "n_miss": 10000, "n_burden": 10000, "empirical_miss_rate": 0.01, "empirical_burden": 0.01, "empirical_pre_failure_coverage": 0.4, "empirical_false_alarm_rate": 0.0, "empirical_mean_lead_time": 1.0},
            {"threshold": 0.2, "n_miss": 10000, "n_burden": 10000, "empirical_miss_rate": 0.01, "empirical_burden": 0.01, "empirical_pre_failure_coverage": 0.8, "empirical_false_alarm_rate": 0.1, "empirical_mean_lead_time": 1.0},
        ]
        got = self.optc.option_c_select_threshold(table, alpha=0.1, beta=0.1, delta=0.1, threshold_grid=[0.1, 0.2])
        self.assertFalse(got["no_safe"])
        self.assertEqual(got["selected_threshold"], 0.2)




    def test_no_raw_text_in_outputs(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in list(REPORTS.glob("batch_T5_*")) + list(THEORY.glob("batch_T5_*")):
            if path.suffix in {".json", ".md", ".csv"}:
                text = path.read_text()
                self.assertFalse(any(term in text for term in forbidden), str(path))


if __name__ == "__main__":
    unittest.main()
