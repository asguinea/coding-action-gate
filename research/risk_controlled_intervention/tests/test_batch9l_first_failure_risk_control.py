import csv
import importlib.util
import json
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
REPORTS = ROOT / "reports"
INTERVENTION = ROOT / "data" / "intervention_outputs"


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class Batch9LFirstFailureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.targets = load_script("batch9l_targets", "build_first_failure_targets.py")
        cls.claim = load_script("batch9l_claim", "check_batch9l_claim_boundaries.py")









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
                self.targets.require(Path(tmp) / "missing.jsonl")


if __name__ == "__main__":
    unittest.main()
