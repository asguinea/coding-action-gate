#!/usr/bin/env python3
"""Create verified extraction freeze manifest with hashes."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
SHARD_DIR = WORKSPACE / "data" / "processed" / "verified_prefix_shards"
FREEZE_JSON = REPORTS_DIR / "verified_freeze_manifest.json"
FREEZE_MD = REPORTS_DIR / "verified_freeze_manifest.md"
KEY_FILES = [
    "data/processed/prefix_verified.jsonl",
    "reports/prefix_verified_audit.json",
    "data/processed/verified_splits.json",
    "reports/verified_split_audit.json",
    "reports/verified_failure_taxonomy.json",
    "reports/verified_quality_gate.json",
    "reports/verified_prefix_feature_schema.json",
    "reports/final_verified_coverage_recovery.json",
    "reports/missing_artifact_recovery.json",
    "reports/final_unsupported_layout_recovery.json",
    "reports/zero_prefix_verified_inspection.json",
    "reports/unsupported_verified_layout_clusters.json",
    "reports/v03_parser_candidate_decisions.json",
]


def parse_args() -> argparse.Namespace:
    return argparse.ArgumentParser(description="Create verified freeze manifest.").parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit_hash() -> str | None:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=WORKSPACE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def build_manifest() -> dict:
    quality = load_json(REPORTS_DIR / "verified_quality_gate.json")
    download = load_json(REPORTS_DIR / "verified_artifact_download_manifest.json")
    hashes = {}
    for shard in sorted(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        rel = str(shard.relative_to(WORKSPACE))
        hashes[rel] = sha256_file(shard)
    for rel in KEY_FILES:
        path = WORKSPACE / rel
        hashes[rel] = sha256_file(path) if path.exists() else None
    return {
        "schema_version": "risk-controlled-intervention-verified-freeze.v1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit_hash": git_commit_hash(),
        "claim_boundary": (
            "Batch 6 verified freeze only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "scripts_used": [
            "scripts/cluster_unsupported_verified_layouts.py",
            "scripts/inspect_unsupported_cluster_deep.py",
            "scripts/download_verified_artifacts.py",
            "scripts/build_prefix_verified.py",
            "scripts/inspect_verified_failures.py",
            "scripts/make_verified_splits.py",
            "scripts/qa_verified_extraction.py",
            "scripts/create_verified_freeze_manifest.py",
            "scripts/compare_verified_coverage.py",
            "scripts/recover_missing_verified_artifacts.py",
            "scripts/final_unsupported_layout_recovery.py",
            "scripts/inspect_zero_prefix_verified_cases.py",
            "scripts/final_verified_coverage_recovery.py",
        ],
        "command_lines_used": [
            "python3 research/risk_controlled_intervention/scripts/cluster_unsupported_verified_layouts.py",
            "python3 research/risk_controlled_intervention/scripts/inspect_unsupported_cluster_deep.py --cluster-id cluster_327e312b6d70 --max-examples 5",
            "python3 research/risk_controlled_intervention/scripts/inspect_unsupported_cluster_deep.py --cluster-id cluster_a02b7b446e5c --max-examples 5",
            "python3 research/risk_controlled_intervention/scripts/inspect_unsupported_cluster_deep.py --cluster-id cluster_bad2d1988386 --max-examples 5",
            "python3 research/risk_controlled_intervention/scripts/inspect_unsupported_cluster_deep.py --cluster-id cluster_b467cd6ea0fb --max-examples 5",
            "python3 research/risk_controlled_intervention/scripts/build_prefix_verified.py",
            "python3 research/risk_controlled_intervention/scripts/inspect_verified_failures.py",
            "python3 research/risk_controlled_intervention/scripts/make_verified_splits.py --seed 20250617",
            "python3 research/risk_controlled_intervention/scripts/qa_verified_extraction.py",
            "python3 research/risk_controlled_intervention/scripts/create_verified_freeze_manifest.py",
            "python3 research/risk_controlled_intervention/scripts/compare_verified_coverage.py",
            "python3 research/risk_controlled_intervention/scripts/recover_missing_verified_artifacts.py",
            "python3 research/risk_controlled_intervention/scripts/final_unsupported_layout_recovery.py",
            "python3 research/risk_controlled_intervention/scripts/inspect_zero_prefix_verified_cases.py",
            "python3 research/risk_controlled_intervention/scripts/final_verified_coverage_recovery.py",
        ],
        "verified_manifest_input": "data/raw/bench_manifest.verified.jsonl",
        "artifact_cache_directory": "data/verified_artifacts",
        "schema_version_locked": "Prefix Extraction Schema v0.4",
        "split_seed": 20250617,
        "quality_gate_decision": quality.get("decision"),
        "artifact_cache_summary": download.get("summary"),
        "output_file_paths": sorted(hashes),
        "sha256": hashes,
    }


def markdown(manifest: dict) -> str:
    lines = [
        "# Verified Freeze Manifest",
        "",
        f"- `timestamp`: `{manifest['timestamp']}`",
        f"- `git_commit_hash`: `{manifest['git_commit_hash']}`",
        f"- `schema_version_locked`: `{manifest['schema_version_locked']}`",
        f"- `split_seed`: `{manifest['split_seed']}`",
        f"- `quality_gate_decision`: `{manifest['quality_gate_decision']}`",
        "",
        "## File Hashes",
        "",
    ]
    for path, digest in manifest["sha256"].items():
        lines.append(f"- `{path}`: `{digest}`")
    return "\n".join(lines)


def main() -> int:
    parse_args()
    manifest = build_manifest()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    FREEZE_JSON.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    FREEZE_MD.write_text(markdown(manifest) + "\n")
    print(json.dumps({"quality_gate_decision": manifest["quality_gate_decision"], "files_hashed": len(manifest["sha256"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
