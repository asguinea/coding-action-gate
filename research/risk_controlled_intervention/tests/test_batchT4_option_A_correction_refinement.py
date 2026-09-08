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


class BatchT4OptionACorrectionRefinementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.opt = load_script("option_a_t4", "option_a_first_event_calibration.py")

    def test_correction_rules_include_required_options(self):
        for name in ["hoeffding_union_bound", "clopper_pearson_union", "plus_one_empirical_proxy"]:
            got = self.opt.correction_upper_bound(name, empirical_risk=0.1, n=100, m=10, delta=0.05)
            self.assertEqual(got["correction_name"], name)
            self.assertIn("upper_bound", got)

    def test_clopper_pearson_union_upper_bound_toy_examples(self):
        zero = self.opt.correction_upper_bound("clopper_pearson_union", empirical_risk=0.0, n=100, m=10, delta=0.05)
        ten = self.opt.correction_upper_bound("clopper_pearson_union", empirical_risk=0.1, n=100, m=10, delta=0.05)
        full = self.opt.correction_upper_bound("clopper_pearson_union", empirical_risk=1.0, n=100, m=10, delta=0.05)
        self.assertGreaterEqual(zero["upper_bound"], 0.0)
        self.assertLess(zero["upper_bound"], 0.1)
        self.assertGreater(ten["upper_bound"], 0.1)
        self.assertEqual(full["upper_bound"], 1.0)
        self.assertTrue(ten["is_uniform_over_grid"])

    def test_pointwise_correction_marked_diagnostic_only(self):
        got = self.opt.correction_upper_bound("pointwise_clopper_pearson_no_union", empirical_risk=0.1, n=100, m=10, delta=0.05)
        self.assertFalse(got["is_uniform_over_grid"])
        self.assertTrue(got["is_empirical_proxy_only"])
        self.assertIn("Pointwise diagnostic", got["caveats"])






    def test_no_raw_text_appears_in_outputs(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in list(REPORTS.glob("batch_T4_*")) + list(THEORY.glob("batch_T4_*")):
            if path.suffix in {".json", ".md", ".csv"}:
                text = path.read_text()
                self.assertFalse(any(term in text for term in forbidden), str(path))


if __name__ == "__main__":
    unittest.main()
