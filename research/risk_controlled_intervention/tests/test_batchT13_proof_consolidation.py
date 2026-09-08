import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEORY = ROOT / "theory"
REPORTS = ROOT / "reports"
CHECKER = ROOT / "scripts" / "check_batchT13_claim_boundaries.py"


class BatchT13ProofConsolidationTests(unittest.TestCase):




    def test_claim_boundary_checker_catches_forbidden_phrase(self):
        checker = __import__("importlib.util").util.spec_from_file_location("checker", CHECKER)
        module = __import__("importlib.util").util.module_from_spec(checker)
        assert checker.loader is not None
        checker.loader.exec_module(module)
        self.assertFalse(module.allowed("This production guarantee is unsupported.", "production guarantee"))
        self.assertTrue(module.allowed("no formal conformal guarantee claimed", "conformal guarantee"))


    def test_no_completed_theorem_or_formal_claim(self):
        for path in THEORY.glob("batch_T13_*"):
            if path.suffix not in {".md", ".json"}:
                continue
            text = path.read_text().lower()
            self.assertNotIn("final theorem", text)
            self.assertNotIn("production guarantee", text)
            self.assertNotIn("safe to deploy", text)
            if "conformal guarantee" in text:
                self.assertIn("no formal conformal guarantee claimed", text)

    def test_no_raw_text_in_outputs(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in list(THEORY.glob("batch_T13_*")) + list(REPORTS.glob("batch_T13_*")):
            if path.suffix not in {".md", ".json", ".csv"}:
                continue
            text = path.read_text().lower()
            self.assertFalse(any(term in text for term in forbidden), str(path))


if __name__ == "__main__":
    unittest.main()
