import importlib.util
import json
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


class BatchT6OptionCInfeasibilityDiagnosisTests(unittest.TestCase):






    def test_claim_boundary_checker_catches_forbidden_phrase(self):
        checker = load_script("check_t6", "check_batchT6_claim_boundaries.py")
        hits, _ = checker.check_text("This validates StepHarbor and gives a production guarantee.")
        self.assertGreaterEqual(len(hits), 2)


    def test_no_raw_text_or_test_tuning_or_formal_guarantee(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in REPORTS.glob("batch_T6_*"):
            if path.suffix in {".json", ".md", ".csv"}:
                text = path.read_text().lower()
                self.assertFalse(any(term in text for term in forbidden), str(path))
                self.assertNotIn("formal conformal guarantee claimed\": true", text)
                if path.suffix == ".json":
                    obj = json.loads(path.read_text())
                    if "guard_results" in obj:
                        self.assertFalse(obj["guard_results"].get("test_tuning", False))


if __name__ == "__main__":
    unittest.main()
