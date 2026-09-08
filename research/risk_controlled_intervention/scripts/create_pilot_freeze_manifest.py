#!/usr/bin/env python3
"""Create a reproducibility freeze manifest for the bounded pilot outputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
FREEZE_JSON = REPORTS_DIR / "pilot_freeze_manifest.json"
FREEZE_MD = REPORTS_DIR / "pilot_freeze_manifest.md"
KEY_FILES = [
    "data/processed/prefix_pilot.jsonl",
    "data/processed/pilot_splits.json",
    "reports/prefix_pilot_audit.json",
    "reports/pilot_split_audit.json",
    "reports/pilot_failure_taxonomy.json",
    "reports/pilot_quality_gate.json",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create pilot freeze manifest with hashes of generated files.")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit_hash() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=WORKSPACE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def build_manifest() -> dict[str, Any]:
    pilot_manifest = load_json(WORKSPACE / "reports" / "pilot_artifact_manifest.json")
    quality_gate = load_json(WORKSPACE / "reports" / "pilot_quality_gate.json")
    hashes = {}
    for rel_path in KEY_FILES:
        path = WORKSPACE / rel_path
        hashes[rel_path] = sha256_file(path) if path.exists() else None
    return {
        "schema_version": "risk-controlled-intervention-pilot-freeze.v1",
        "freeze_timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit_hash": git_commit_hash(),
        "claim_boundary": (
            "Batch 5 pilot freeze only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "scripts_used": [
            "scripts/sample_pilot_artifacts.py",
            "scripts/build_prefix_pilot.py",
            "scripts/inspect_pilot_failures.py",
            "scripts/summarize_uncovered_pilot_cases.py",
            "scripts/make_pilot_splits.py",
            "scripts/qa_pilot_extraction.py",
            "scripts/create_pilot_freeze_manifest.py",
        ],
        "command_lines_used": [
            "research/risk_controlled_intervention/.venv/bin/python research/risk_controlled_intervention/scripts/sample_pilot_artifacts.py --max-trajectories 50 --seed 20250617",
            "python3 research/risk_controlled_intervention/scripts/build_prefix_pilot.py",
            "python3 research/risk_controlled_intervention/scripts/inspect_pilot_failures.py",
            "python3 research/risk_controlled_intervention/scripts/summarize_uncovered_pilot_cases.py",
            "python3 research/risk_controlled_intervention/scripts/make_pilot_splits.py --seed 20250617",
            "python3 research/risk_controlled_intervention/scripts/qa_pilot_extraction.py",
            "python3 research/risk_controlled_intervention/scripts/create_pilot_freeze_manifest.py",
        ],
        "input_manifests": {
            "pilot_artifact_manifest": "reports/pilot_artifact_manifest.json",
            "verified_manifest_cache": "data/raw/bench_manifest.verified.jsonl",
        },
        "artifact_sample_size": pilot_manifest.get("artifacts", {}).get("selected"),
        "seed": pilot_manifest.get("selection_policy", {}).get("seed"),
        "schema_version_locked": "Prefix Extraction Schema v0.2",
        "quality_gate_decision": quality_gate.get("decision"),
        "output_file_paths": KEY_FILES,
        "sha256": hashes,
    }


def markdown(manifest: dict[str, Any]) -> str:
    lines = [
        "# Pilot Freeze Manifest",
        "",
        f"- `freeze_timestamp`: `{manifest['freeze_timestamp']}`",
        f"- `git_commit_hash`: `{manifest['git_commit_hash']}`",
        f"- `artifact_sample_size`: `{manifest['artifact_sample_size']}`",
        f"- `seed`: `{manifest['seed']}`",
        f"- `schema_version_locked`: `{manifest['schema_version_locked']}`",
        f"- `quality_gate_decision`: `{manifest['quality_gate_decision']}`",
        "",
        "## File Hashes",
        "",
    ]
    for path, digest in manifest["sha256"].items():
        lines.append(f"- `{path}`: `{digest}`")
    lines.extend(["", "## Commands", ""])
    for command in manifest["command_lines_used"]:
        lines.append(f"- `{command}`")
    return "\n".join(lines)


def main() -> int:
    parse_args()
    manifest = build_manifest()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    FREEZE_JSON.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    FREEZE_MD.write_text(markdown(manifest) + "\n")
    print(json.dumps({"quality_gate_decision": manifest["quality_gate_decision"], "files_hashed": len(manifest["sha256"])}, indent=2))
    print(f"Saved freeze manifest: {FREEZE_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
