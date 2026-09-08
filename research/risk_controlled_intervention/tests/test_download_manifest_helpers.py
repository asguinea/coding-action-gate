import importlib.util
import argparse
import contextlib
import hashlib
import io
import json
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "download_manifests.py"
)
SPEC = importlib.util.spec_from_file_location("download_manifests", SCRIPT_PATH)
download = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = download
SPEC.loader.exec_module(download)


class DownloadManifestHelperTests(unittest.TestCase):
    def test_discovery_finds_verified_and_full_manifests(self):
        candidates = download.discover_manifest_candidates(
            [
                "verified_manifest.jsonl",
                "full_manifest.parquet",
                "artifacts/full_traces.tar.gz",
                "README.md",
            ],
            ["verified", "full"],
        )
        by_split = {candidate.split: candidate.repo_path for candidate in candidates}
        self.assertEqual(by_split["verified"], "verified_manifest.jsonl")
        self.assertEqual(by_split["full"], "full_manifest.parquet")

    def test_discovery_ignores_large_artifacts(self):
        candidates = download.discover_manifest_candidates(
            [
                "verified_artifacts.zip",
                "verified_manifest.csv",
            ],
            ["verified"],
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].repo_path, "verified_manifest.csv")

    def test_requested_splits(self):
        self.assertEqual(download.requested_splits("verified"), ["verified"])
        self.assertEqual(download.requested_splits("both"), ["verified", "full"])

    def run_pinned_download(self, *, corrupted_download=False, conflicting_cache=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            name = "bench_manifest.verified.jsonl"
            content = b'{"trajectory": "synthetic"}\n'
            incoming = root / "incoming.jsonl"
            incoming.write_bytes(b"wrong" if corrupted_download else content)
            raw = root / "data" / "raw"
            if conflicting_cache:
                raw.mkdir(parents=True)
                (raw / name).write_bytes(b"stale")
            lock = root / "source.json"
            lock.write_text(json.dumps({"revision": "a" * 40, "manifests": {
                name: {"sha256": hashlib.sha256(content).hexdigest()}
            }}))
            api = Mock()
            api.list_repo_files.return_value = [name]
            fetch = Mock(return_value=str(incoming))
            with patch.multiple(download, WORKSPACE=root, RAW_DIR=raw, SOURCE_LOCK=lock), \
                    patch.object(download, "parse_args", return_value=argparse.Namespace(split="verified", force=False)), \
                    patch.object(download, "import_huggingface_hub", return_value=(lambda: api, fetch)), \
                    contextlib.redirect_stdout(io.StringIO()):
                result = download.main()
            api.list_repo_files.assert_called_once_with(repo_id=download.REPO_ID, repo_type="dataset", revision="a" * 40)
            self.assertEqual(fetch.call_args.kwargs["revision"], "a" * 40)
            self.assertEqual((raw / name).read_bytes(), content)
            metadata = json.loads((raw / "manifest_downloads.json").read_text())
            self.assertEqual(metadata["revision"], "a" * 40)
            return result

    def test_download_records_pinned_revision_and_verified_content(self):
        self.assertEqual(self.run_pinned_download(), 0)

    def test_download_rejects_hash_mismatch(self):
        with self.assertRaisesRegex(SystemExit, "Checksum mismatch"):
            self.run_pinned_download(corrupted_download=True)

    def test_download_rejects_conflicting_cache(self):
        with self.assertRaisesRegex(SystemExit, "Cached manifest differs"):
            self.run_pinned_download(conflicting_cache=True)


if __name__ == "__main__":
    unittest.main()
