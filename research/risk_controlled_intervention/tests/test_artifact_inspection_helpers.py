import importlib.util
import io
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "inspect_artifacts.py"
)
SPEC = importlib.util.spec_from_file_location("inspect_artifacts", SCRIPT_PATH)
inspect = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = inspect
SPEC.loader.exec_module(inspect)


class ArtifactInspectionHelperTests(unittest.TestCase):
    def test_safe_truncate_text(self):
        self.assertEqual(inspect.safe_truncate_text("a\nb", 10), "a\\nb")
        self.assertEqual(inspect.safe_truncate_text("abcdef", 3), "abc...[truncated]")

    def test_detect_artifact_format_for_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "artifact.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("trace.json", "{}")
            self.assertEqual(inspect.detect_artifact_format(path)["format"], "zip")

    def test_detect_artifact_format_for_tar(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "artifact.tar"
            with tarfile.open(path, "w") as archive:
                payload = b"hello"
                info = tarfile.TarInfo("trace.txt")
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            self.assertEqual(inspect.detect_artifact_format(path)["format"], "tar")

    def test_reconcile_labels_to_steps(self):
        result = inspect.reconcile_labels_to_steps(
            {"2": {"incorrect"}, "4": {"unuseful"}},
            ["1", "2", "3"],
        )
        self.assertEqual(result["mapped_labeled_step_ids"], ["2"])
        self.assertEqual(result["missing_labeled_step_ids"], ["4"])
        self.assertFalse(result["all_labeled_steps_mapped"])

    def test_reconcile_labels_to_steps_uses_ref_path_mapping(self):
        result = inspect.reconcile_labels_to_steps(
            {"2": {"incorrect"}, "4": {"unuseful"}},
            [],
            ["2", "4"],
        )
        self.assertEqual(result["mapped_labeled_step_ids"], ["2", "4"])
        self.assertEqual(result["ref_path_mapped_step_ids"], ["2", "4"])
        self.assertTrue(result["all_labeled_steps_mapped"])

    def test_detect_step_ids_from_jsonish_text(self):
        self.assertEqual(inspect.detect_step_ids('{"step_id": 12}'), {"12"})

    def test_mapped_label_steps_by_ref_path(self):
        sample_record = {
            "incorrect_stages": [
                {
                    "steps": [
                        {
                            "step_id": 7,
                            "action_ref": {"path": "traj/run/response.txt"},
                        }
                    ]
                }
            ]
        }
        mapped = inspect.mapped_label_steps_by_ref_path(
            sample_record,
            [inspect.ArchiveMember("root/traj/run/response.txt")],
        )
        self.assertEqual(mapped, {"7": ["traj/run/response.txt"]})

    def test_ref_path_exists_strips_traj_prefix(self):
        self.assertTrue(
            inspect.ref_path_exists_in_members(
                "traj/miniswe/run/agent-logs/mini.traj.json",
                {"miniswe/run/agent-logs/mini.traj.json"},
            )
        )


if __name__ == "__main__":
    unittest.main()
