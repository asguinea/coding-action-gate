#!/usr/bin/env python3
"""Download CodeTraceBench manifest files without fetching large artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ID = "NJU-LINK/CodeTraceBench"
WORKSPACE = Path(__file__).resolve().parents[1]
RAW_DIR = WORKSPACE / "data" / "raw"
SOURCE_LOCK = WORKSPACE / "data-source.json"
SUPPORTED_SPLITS = ("verified", "full")
MANIFEST_EXTENSIONS = (".json", ".jsonl", ".csv", ".parquet")
LARGE_ARTIFACT_EXTENSIONS = (
    ".zip",
    ".tar",
    ".tar.gz",
    ".tgz",
    ".gz",
    ".bz2",
    ".xz",
    ".7z",
)


@dataclass(frozen=True)
class ManifestCandidate:
    split: str
    repo_path: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover and download only verified/full manifest files from "
            "NJU-LINK/CodeTraceBench."
        )
    )
    parser.add_argument(
        "--split",
        choices=("verified", "full", "both"),
        default="both",
        help="Manifest split to download.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite cached manifest files.",
    )
    return parser.parse_args()


def requested_splits(split: str) -> list[str]:
    return list(SUPPORTED_SPLITS) if split == "both" else [split]


def fail_setup(message: str) -> None:
    setup = (
        "\nSetup instructions:\n"
        "  python -m pip install huggingface_hub\n"
        "  huggingface-cli login  # only if the dataset requires authentication\n"
        "\nThis script does not use mock data and does not download artifact archives by default."
    )
    raise SystemExit(f"ERROR: {message}{setup}")


def import_huggingface_hub():
    try:
        from huggingface_hub import HfApi, hf_hub_download
    except ImportError:
        fail_setup("Missing dependency: huggingface_hub.")
    return HfApi, hf_hub_download


def is_large_artifact(path: str) -> bool:
    lower = path.lower()
    return lower.endswith(LARGE_ARTIFACT_EXTENSIONS)


def is_supported_manifest_extension(path: str) -> bool:
    lower = path.lower()
    return lower.endswith(MANIFEST_EXTENSIONS)


def manifest_score(repo_path: str, split: str) -> int:
    lower = repo_path.lower()
    name = Path(repo_path).name.lower()
    score = 0

    if split not in lower:
        return -1
    if is_large_artifact(lower) or not is_supported_manifest_extension(lower):
        return -1
    if "manifest" in lower:
        score += 6
    if name.startswith(split):
        score += 4
    if f"{split}_manifest" in lower or f"{split}-manifest" in lower:
        score += 4
    if "data/" in lower or "manifest" in Path(repo_path).parts:
        score += 1
    return score


def discover_manifest_candidates(repo_files: Iterable[str], splits: Iterable[str]) -> list[ManifestCandidate]:
    candidates: list[ManifestCandidate] = []
    for split in splits:
        scored = [
            (manifest_score(repo_path, split), repo_path)
            for repo_path in repo_files
        ]
        split_candidates = [
            ManifestCandidate(split=split, repo_path=repo_path)
            for score, repo_path in sorted(scored, key=lambda item: (-item[0], item[1]))
            if score >= 0
        ]
        candidates.extend(split_candidates)
    return candidates


def local_manifest_path(candidate: ManifestCandidate) -> Path:
    source_name = Path(candidate.repo_path).name
    if candidate.split not in source_name.lower():
        source_name = f"{candidate.split}_{source_name}"
    return RAW_DIR / source_name


def copy_downloaded_file(downloaded_path: str, destination: Path, force: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not force:
        print(f"cached: {destination}")
        return
    shutil.copy2(downloaded_path, destination)
    print(f"wrote: {destination}")


def main() -> int:
    args = parse_args()
    source = json.loads(SOURCE_LOCK.read_text())
    revision = source["revision"]
    splits = requested_splits(args.split)
    HfApi, hf_hub_download = import_huggingface_hub()
    api = HfApi()

    try:
        repo_files = api.list_repo_files(repo_id=REPO_ID, repo_type="dataset", revision=revision)
    except Exception as exc:  # pragma: no cover - depends on local HF setup.
        fail_setup(f"Could not list files for dataset {REPO_ID}: {exc}")

    candidates = discover_manifest_candidates(repo_files, splits)
    if not candidates:
        available = "\n".join(f"  - {path}" for path in repo_files[:80])
        fail_setup(
            "No verified/full manifest candidates were found. "
            "Inspect the dataset file list and update the discovery heuristic.\n"
            f"First listed files:\n{available}"
        )

    selected_by_split: dict[str, ManifestCandidate] = {}
    for candidate in candidates:
        selected_by_split.setdefault(candidate.split, candidate)

    missing = [split for split in splits if split not in selected_by_split]
    if missing:
        fail_setup(f"Missing manifest candidates for split(s): {', '.join(missing)}")

    written: list[dict[str, str]] = []
    for split in splits:
        candidate = selected_by_split[split]
        print(f"selected {split}: {candidate.repo_path}")
        try:
            downloaded = hf_hub_download(
                repo_id=REPO_ID,
                repo_type="dataset",
                filename=candidate.repo_path,
                revision=revision,
            )
        except Exception as exc:  # pragma: no cover - depends on local HF setup.
            fail_setup(f"Could not download {candidate.repo_path}: {exc}")
        destination = local_manifest_path(candidate)
        expected = source["manifests"].get(candidate.repo_path)
        if expected is None:
            fail_setup(f"Manifest is not in data-source.json: {candidate.repo_path}")
        with Path(downloaded).open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        if digest != expected["sha256"]:
            fail_setup(f"Checksum mismatch for {candidate.repo_path}")
        if destination.exists() and not args.force:
            with destination.open("rb") as handle:
                cached_digest = hashlib.file_digest(handle, "sha256").hexdigest()
            if cached_digest != digest:
                fail_setup(f"Cached manifest differs from the pinned input: {destination.name}; use --force to replace it")
        copy_downloaded_file(downloaded, destination, args.force)
        written.append(
            {
                "split": split,
                "repo_path": candidate.repo_path,
                "local_path": str(destination.relative_to(WORKSPACE)),
                "sha256": digest,
            }
        )

    metadata_path = RAW_DIR / "manifest_downloads.json"
    metadata_path.write_text(json.dumps({"repo_id": REPO_ID, "revision": revision, "files": written}, indent=2) + "\n")
    print(f"metadata: {metadata_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
