import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
PACKAGE = ROOT / "reports" / "internal_evidence_package"


def load_script(name: str, filename: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class Batch9PInternalEvidencePackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.checker = load_script("batch9p_claims", "check_internal_evidence_package_claims.py")









    def test_claim_checker_catches_forbidden_unsupported_claims(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("CodingActionGate validated. This is safe to deploy.")
            handle.flush()
            hits = self.checker.forbidden_hits(Path(handle.name).read_text())
        phrases = {hit["phrase"] for hit in hits}
        self.assertIn("codingactiongate validated", phrases)
        self.assertIn("safe to deploy", phrases)


    def test_no_raw_schema_fields_or_latex_files(self):
        forbidden = ["action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "code_text"]
        for path in PACKAGE.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".md", ".json", ".csv"}:
                text = path.read_text()
                self.assertFalse(any(term in text for term in forbidden), str(path))
        self.assertFalse(list(PACKAGE.rglob("*.tex")))




if __name__ == "__main__":
    unittest.main()
