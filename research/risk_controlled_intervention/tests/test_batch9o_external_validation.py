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
DATA = ROOT / "data" / "intervention_outputs"


def load_script(name: str, filename: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class Batch9OExternalValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.claim = load_script("batch9o_claim", "check_batch9o_claim_boundaries.py")
        cls.scan = load_script("batch9o_scan", "scan_external_validation_resources.py")







    def test_claim_checker_catches_forbidden_phrase(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("This is externally validated and safe to deploy.")
            handle.flush()
            hits, _missing = self.claim.check_text(Path(handle.name).read_text())
        self.assertIn("externally validated", hits)
        self.assertIn("safe to deploy", hits)




    def test_missing_required_evidence_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                self.scan.require(Path(tmp) / "missing.json")


if __name__ == "__main__":
    unittest.main()
