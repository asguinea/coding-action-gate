#!/usr/bin/env python3
"""Create verified-scale failure taxonomy from verified extraction outputs."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DOWNLOAD_MANIFEST = REPORTS_DIR / "verified_artifact_download_manifest.json"
PREFIX_AUDIT = REPORTS_DIR / "prefix_verified_audit.json"
TAXONOMY_JSON = REPORTS_DIR / "verified_failure_taxonomy.json"
TAXONOMY_MD = REPORTS_DIR / "verified_failure_taxonomy.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build verified failure taxonomy.")
    parser.add_argument("--download-manifest", default=str(DOWNLOAD_MANIFEST))
    parser.add_argument("--prefix-audit", default=str(PREFIX_AUDIT))
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def feasible_adapter(layout_family: str, zero_prefix_cause: str | None, classification: str) -> str:
    if classification in {"parse_failure", "corrupted_or_unreadable_archive"}:
        return "unknown"
    if layout_family == "unsupported_layout":
        return "manual_review_required"
    if zero_prefix_cause == "manifest/artifact step_count mismatch":
        return "unlikely_without_manifest_reconciliation"
    return "not_needed"


def should_block_modeling(classification: str) -> bool:
    return classification in {"parse_failure", "corrupted_or_unreadable_archive", "unknown_failure"}


def taxonomy_from_reports(download_manifest: dict[str, Any], prefix_audit: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {item["trajectory_id"]: item for item in prefix_audit.get("trajectories", [])}
    parse_failures = {item.get("trajectory_id"): item for item in prefix_audit.get("parse_failures", [])}
    artifacts = []
    for unresolved in download_manifest.get("missing_unresolved_artifact_path_rows", {}).get("examples", []):
        artifacts.append(
            {
                "trajectory_id": unresolved.get("traj_id"),
                "classification": "missing_or_unresolved_artifact",
                "inferred_source": None,
                "source_bucket": None,
                "agent": None,
                "model": None,
                "category": None,
                "difficulty": None,
                "step_count": None,
                "label_presence": None,
                "label_bucket": None,
                "layout_family": None,
                "likely_reason_uncovered": unresolved.get("reason", "missing or unresolved artifact_path"),
                "v0_3_parser_adapter_feasibility": "not_applicable_manifest_missing",
                "should_block_modeling": False,
            }
        )
    for sample in download_manifest.get("samples", []):
        trajectory_id = sample.get("traj_id")
        local_path = WORKSPACE / str(sample.get("local_path"))
        report = by_id.get(trajectory_id)
        failure = parse_failures.get(trajectory_id)
        if report is not None:
            if int(report.get("prefix_examples") or 0) > 0:
                classification = "parsed_with_prefix_examples"
            elif report.get("layout_family") == "unsupported_layout":
                classification = "unsupported_layout"
            else:
                classification = "parsed_zero_prefix"
            layout_family = report.get("layout_family")
            zero_cause = report.get("zero_prefix_cause")
        elif failure is not None:
            classification = "parse_failure"
            layout_family = None
            zero_cause = failure.get("reason")
        elif not local_path.exists() or local_path.stat().st_size == 0:
            classification = "missing_or_unresolved_artifact"
            layout_family = None
            zero_cause = "local artifact missing"
        else:
            classification = "unknown_failure"
            layout_family = None
            zero_cause = "artifact cached but absent from extraction audit"
        artifacts.append(
            {
                "trajectory_id": trajectory_id,
                "classification": classification,
                "inferred_source": sample.get("inferred_source"),
                "source_bucket": sample.get("source_bucket"),
                "agent": sample.get("agent"),
                "model": sample.get("model"),
                "category": sample.get("category"),
                "difficulty": sample.get("difficulty"),
                "step_count": sample.get("step_count"),
                "label_presence": sample.get("label_presence"),
                "label_bucket": sample.get("label_bucket"),
                "layout_family": layout_family,
                "likely_reason_uncovered": zero_cause,
                "v0_3_parser_adapter_feasibility": feasible_adapter(str(layout_family), zero_cause, classification),
                "should_block_modeling": should_block_modeling(classification),
            }
        )
    return artifacts


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Verified Failure Taxonomy",
        "",
        "Verified-scale extraction taxonomy. No raw action, observation, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Uncovered Examples", ""])
    for item in report["artifacts"]:
        if item["classification"] == "parsed_with_prefix_examples":
            continue
        lines.append(
            f"- `{item['trajectory_id']}` `{item['classification']}` layout `{item.get('layout_family')}` reason `{item.get('likely_reason_uncovered')}`"
        )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    download_manifest = load_json(Path(args.download_manifest))
    prefix_audit = load_json(Path(args.prefix_audit))
    artifacts = taxonomy_from_reports(download_manifest, prefix_audit)
    report = {
        "schema_version": "risk-controlled-intervention-verified-failure-taxonomy.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6 verified failure taxonomy only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": dict(Counter(item["classification"] for item in artifacts)),
        "layout_family_counts": dict(Counter(str(item.get("layout_family")) for item in artifacts)),
        "blocking_for_modeling_count": sum(1 for item in artifacts if item["should_block_modeling"]),
        "artifacts": artifacts,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    TAXONOMY_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    TAXONOMY_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
