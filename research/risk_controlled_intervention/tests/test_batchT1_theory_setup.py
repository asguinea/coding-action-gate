import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEORY = ROOT / "theory"
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


class BatchT1TheorySetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.claim = load_script("batchT1_claim", "check_batchT1_claim_boundaries.py")








    def test_files_state_no_formal_guarantee_claimed_yet(self):
        for path in THEORY.glob("batch_T1_*.md"):
            text = path.read_text().lower()
            self.assertIn("no formal guarantee claimed yet", text, str(path))

    def test_claim_boundary_checker_catches_forbidden_phrase(self):
        with tempfile.NamedTemporaryFile("w+", suffix=".md") as handle:
            handle.write("This production guarantee is safe to deploy.")
            handle.flush()
            hits, _missing = self.claim.check_text(Path(handle.name).read_text())
        phrases = {hit["phrase"] for hit in hits}
        self.assertIn("production guarantee", phrases)
        self.assertIn("safe to deploy", phrases)



if __name__ == "__main__":
    unittest.main()
