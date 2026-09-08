import csv
import importlib.util
import json
import sys
import tempfile
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


class Batch9NFirstEventCalibrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.claim = load_script("batch9n_claim", "check_batch9n_claim_boundaries.py")
        cls.utils = load_script("batch9n_utils", "first_event_calibration_utils.py")






    def test_claim_checker_catches_forbidden_phrase(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("This production guarantee is safe to deploy.")
            handle.flush()
            hits, _missing = self.claim.check_text(Path(handle.name).read_text())
        self.assertIn("production guarantee", hits)
        self.assertIn("safe to deploy", hits)




    def test_missing_required_evidence_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                self.utils.require(Path(tmp) / "missing.csv")


if __name__ == "__main__":
    unittest.main()
