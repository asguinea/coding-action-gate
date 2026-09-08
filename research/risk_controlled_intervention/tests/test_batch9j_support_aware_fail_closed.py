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


class Batch9JSupportAwareTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = load_script("batch9j_dataset", "build_support_diagnostic_dataset.py")
        cls.gates = load_script("batch9j_gates", "evaluate_support_gates.py")
        cls.claim = load_script("batch9j_claim", "check_batch9j_claim_boundaries.py")





    def test_claim_checker_catches_forbidden_phrase(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("This production guarantee is safe to deploy.")
            handle.flush()
            result = self.claim.check_file(Path(handle.name))
        self.assertIn("production guarantee", result["forbidden_phrase_hits"])
        self.assertIn("safe to deploy", result["forbidden_phrase_hits"])




    def test_missing_required_evidence_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.csv"
            with self.assertRaises(FileNotFoundError):
                self.dataset.require(missing)


if __name__ == "__main__":
    unittest.main()
