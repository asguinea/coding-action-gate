#!/usr/bin/env python3
"""Summarize remaining pilot cases without prefix coverage."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PILOT_MANIFEST = REPORTS_DIR / "pilot_artifact_manifest.json"
TAXONOMY_PATH = REPORTS_DIR / "pilot_failure_taxonomy.json"
UNCOVERED_JSON = REPORTS_DIR / "uncovered_pilot_cases.json"
UNCOVERED_MD = REPORTS_DIR / "uncovered_pilot_cases.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize pilot artifacts that remain uncovered by prefix extraction.")
    parser.add_argument("--pilot-manifest", default=str(PILOT_MANIFEST))
    parser.add_argument("--taxonomy", default=str(TAXONOMY_PATH))
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def feasible_adapter(item: dict[str, Any]) -> tuple[str, str]:
    layout = item.get("layout_family")
    candidates = item.get("candidate_files", {}).get("trajectory_or_log_files", [])
    if layout == "swe_agent_traj" and item.get("zero_prefix_cause") == "manifest/artifact step_count mismatch":
        return "unlikely_without_manifest_reconciliation", "The parser exists, but recovered trajectory rows do not align with manifest step_count."
    if layout == "unsupported_layout" and candidates:
        return "manual_review_required", "Candidate files exist, but no authoritative step-ordering rule has been established."
    if layout == "unsupported_layout":
        return "unclear", "No trajectory/log files with a known step-ordering rule were detected."
    return "not_needed", "Already covered or not an uncovered case."


def should_block_full_verified_extraction(item: dict[str, Any]) -> bool:
    if item.get("classification") in {"corrupted_or_unreadable_archive", "parse_failure"}:
        return True
    return False


def summarize_cases(manifest: dict[str, Any], taxonomy: dict[str, Any]) -> list[dict[str, Any]]:
    samples_by_id = {sample.get("traj_id"): sample for sample in manifest.get("samples", [])}
    cases = []
    for item in taxonomy.get("artifacts", []):
        if item.get("classification") == "parsed_with_prefix_examples":
            continue
        sample = samples_by_id.get(item.get("trajectory_id"), {})
        feasibility, reason = feasible_adapter(item)
        cases.append(
            {
                "trajectory_id": item.get("trajectory_id"),
                "artifact_path": item.get("local_path"),
                "inferred_source": sample.get("inferred_source"),
                "source_bucket": item.get("source_bucket"),
                "agent": item.get("agent"),
                "model": item.get("model"),
                "category": item.get("category"),
                "difficulty": item.get("difficulty"),
                "step_count": sample.get("step_count"),
                "label_presence": sample.get("label_presence"),
                "label_bucket": sample.get("label_bucket"),
                "classification": item.get("classification"),
                "layout_family": item.get("layout_family"),
                "likely_reason_not_covered": item.get("zero_prefix_cause") or item.get("classification"),
                "v0_3_parser_adapter_feasibility": feasibility,
                "v0_3_parser_adapter_note": reason,
                "should_block_full_verified_extraction": should_block_full_verified_extraction(item),
                "candidate_file_count": len(item.get("candidate_files", {}).get("trajectory_or_log_files", [])),
                "member_count": item.get("member_count"),
            }
        )
    return cases


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Uncovered Pilot Cases",
        "",
        "Remaining pilot artifacts that did not produce prefix examples after Batch 4 parser hardening.",
        "",
        "No full raw action, observation, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Cases", ""])
    for case in report["cases"]:
        lines.append(f"### {case['trajectory_id']}")
        lines.append("")
        for key in (
            "classification",
            "layout_family",
            "agent",
            "model",
            "category",
            "difficulty",
            "step_count",
            "label_presence",
            "likely_reason_not_covered",
            "v0_3_parser_adapter_feasibility",
            "should_block_full_verified_extraction",
        ):
            lines.append(f"- `{key}`: `{case.get(key)}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    manifest = load_json(Path(args.pilot_manifest))
    taxonomy = load_json(Path(args.taxonomy))
    cases = summarize_cases(manifest, taxonomy)
    report = {
        "schema_version": "risk-controlled-intervention-uncovered-pilot-cases.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 5 uncovered-case summary only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": {
            "case_count": len(cases),
            "blocking_case_count": sum(1 for case in cases if case["should_block_full_verified_extraction"]),
            "nonblocking_case_count": sum(1 for case in cases if not case["should_block_full_verified_extraction"]),
        },
        "cases": cases,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    UNCOVERED_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    UNCOVERED_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    print(f"Saved uncovered case report: {UNCOVERED_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
