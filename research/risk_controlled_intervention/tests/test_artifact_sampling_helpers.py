import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "sample_artifacts.py"
)
SPEC = importlib.util.spec_from_file_location("sample_artifacts", SCRIPT_PATH)
sample = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = sample
SPEC.loader.exec_module(sample)


class ArtifactSamplingHelperTests(unittest.TestCase):
    def test_resolve_artifact_repo_path_accepts_relative_paths(self):
        self.assertEqual(
            sample.resolve_artifact_repo_path(
                {"artifact_path": "bench_artifacts/full/example.tar.zst"}
            ),
            "bench_artifacts/full/example.tar.zst",
        )

    def test_resolve_artifact_repo_path_rejects_missing_path(self):
        with self.assertRaises(ValueError):
            sample.resolve_artifact_repo_path({})

    def test_resolve_artifact_repo_path_rejects_parent_escape(self):
        with self.assertRaises(ValueError):
            sample.resolve_artifact_repo_path({"artifact_path": "../artifact.tar.zst"})

    def test_label_and_source_buckets(self):
        row = {
            "artifact_path": "bench_artifacts/full/a.tar.zst",
            "source_relpath": "swe_raw/task",
            "incorrect_stages": [{"incorrect_step_ids": [2], "steps": []}],
        }
        self.assertEqual(sample.label_bucket_for_row(row), "incorrect")
        self.assertEqual(sample.source_bucket_for_row(row), "swe_bench_like")

    def test_sample_selection_includes_labeled_and_unlabeled_when_available(self):
        rows = [
            {
                "artifact_path": "bench_artifacts/full/labeled-swe.tar.zst",
                "source_relpath": "swe_raw/task",
                "incorrect_stages": [{"incorrect_step_ids": [2], "steps": []}],
                "agent": "a",
                "model": "m",
                "category": "software-engineering",
                "difficulty": "hard",
            },
            {
                "artifact_path": "bench_artifacts/full/unlabeled-terminus.tar.zst",
                "source_relpath": "terminus2/task",
                "incorrect_stages": [],
                "agent": "b",
                "model": "n",
                "category": "security",
                "difficulty": "easy",
            },
        ]
        candidates = [
            sample.SampleCandidate(
                row=row,
                split="full",
                manifest_path=Path("manifest.jsonl"),
                label_bucket=sample.label_bucket_for_row(row),
                source_bucket=sample.source_bucket_for_row(row),
                artifact_path=row["artifact_path"],
                score=sample.row_score(row),
            )
            for row in rows
        ]
        selected = sample.select_representative_sample(candidates, 2)
        self.assertEqual({item.label_bucket for item in selected}, {"incorrect", "no_labels"})


if __name__ == "__main__":
    unittest.main()
