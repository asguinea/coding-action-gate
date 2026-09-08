import importlib.util
import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEORY = ROOT / "theory"
REPORTS = ROOT / "reports"
CHECKER = ROOT / "scripts" / "check_batchT14_claim_boundaries.py"


class BatchT14FiniteGridProofTests(unittest.TestCase):






    def test_claim_boundary_checker_catches_forbidden_phrase(self):
        spec = importlib.util.spec_from_file_location("checker14", CHECKER)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        self.assertFalse(module.allowed("This production guarantee is unsupported.", "production guarantee"))
        self.assertTrue(module.allowed("no formal conformal guarantee claimed", "conformal guarantee"))


    def test_no_production_formal_conformal_or_shift_claims(self):
        for path in list(THEORY.glob("batch_T14_*")) + list(REPORTS.glob("batch_T14_*")):
            if path.suffix not in {".md", ".json", ".csv"}:
                continue
            text = path.read_text().lower()
            self.assertNotIn("production guarantee", text)
            self.assertNotIn("safe to deploy", text)
            self.assertNotIn("works under arbitrary distribution shift", text)
            if "conformal guarantee" in text:
                self.assertIn("no formal conformal guarantee claimed", text)

    def test_no_raw_text_in_outputs(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in list(THEORY.glob("batch_T14_*")) + list(REPORTS.glob("batch_T14_*")):
            if path.suffix not in {".md", ".json", ".csv"}:
                continue
            text = path.read_text().lower()
            self.assertFalse(any(term in text for term in forbidden), str(path))


if __name__ == "__main__":
    unittest.main()
