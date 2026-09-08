import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
REPORTS = ROOT / "reports"


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class Batch9IDualUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.formulation = load_script("batch9i_formulation", "write_dual_unit_formulation.py")
        cls.selection = load_script("batch9i_selection", "evaluate_dual_unit_policy_selection.py")
        cls.support = load_script("batch9i_support", "analyze_calibration_support_and_fail_closed.py")
        cls.claim = load_script("batch9i_claim", "check_batch9i_claim_boundaries.py")

    def test_dual_unit_formulation_has_required_units_and_objectives(self):
        report = self.formulation.formulation()
        self.assertIn("prediction_unit", report)
        self.assertIn("control_unit", report)
        self.assertIn("row_level_quantities", report)
        self.assertIn("trajectory_level_quantities", report)
        self.assertIn("dual_unit_quantities", report)
        names = {item["name"] for item in report["optimization_templates"]}
        self.assertIn("max_capture_under_dual_budget", names)
        self.assertIn("no_safe_recommendation", names)
        self.assertIn("no formal conformal guarantee", report["guarantee_statement"])




    def test_no_safe_recommendation_can_be_triggered(self):
        rows = [
            {"calibration_row_deferral_rate": 0.20, "calibration_trajectory_burden": 0.80, "calibration_bad_row_capture": 0.1, "calibration_first_failure_coverage": 0.1}
        ]
        selected = self.selection.select_policies(rows, [0.01], [0.10])
        self.assertTrue(any(row.get("no_safe_recommendation") for row in selected))




    def test_claim_checker_catches_forbidden_phrase(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("This production guarantee validates StepHarbor.")
            handle.flush()
            result = self.claim.check_file(Path(handle.name))
        self.assertIn("production guarantee", result["forbidden_phrase_hits"])
        self.assertIn("validates StepHarbor", result["forbidden_phrase_hits"])



    def test_missing_evidence_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            with self.assertRaises(FileNotFoundError):
                self.support.read_csv(missing)


if __name__ == "__main__":
    unittest.main()
