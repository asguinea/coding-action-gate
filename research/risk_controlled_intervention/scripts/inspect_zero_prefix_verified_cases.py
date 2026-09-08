#!/usr/bin/env python3
"""Inspect supported-layout zero-prefix verified cases without raw text output."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_AUDIT = REPORTS_DIR / "prefix_verified_audit.json"
DOWNLOAD_MANIFEST = REPORTS_DIR / "verified_artifact_download_manifest.json"
OUTPUT_JSON = REPORTS_DIR / "zero_prefix_verified_inspection.json"
OUTPUT_MD = REPORTS_DIR / "zero_prefix_verified_inspection.md"
PARSER_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")


def _load_parser():
    spec = importlib.util.spec_from_file_location("prefix_parsing", PARSER_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser_mod = _load_parser()
inspect = parser_mod.inspect
audit = parser_mod.audit


def parse_args() -> argparse.Namespace:
    return argparse.ArgumentParser(description="Inspect supported zero-prefix verified cases.").parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def json_member_schema(path: Path, artifact_format: str, member_name: str, max_bytes: int = 25_000_000) -> dict[str, Any]:
    text = inspect.read_member(path, artifact_format, member_name, max_bytes)
    truncated = len(text) >= max_bytes
    try:
        parsed = json.loads(text)
    except Exception as exc:
        return {
            "member": member_name,
            "read_chars": len(text),
            "json_valid": False,
            "parse_error_type": type(exc).__name__,
            "possibly_truncated": truncated,
        }
    if isinstance(parsed, dict):
        return {
            "member": member_name,
            "read_chars": len(text),
            "json_valid": True,
            "json_type": "object",
            "top_level_keys": sorted(parsed.keys())[:40],
            "list_lengths": {key: len(value) for key, value in parsed.items() if isinstance(value, list)},
            "nested_object_keys": [
                {"object_key": key, "child_keys": sorted(value.keys())[:30]}
                for key, value in parsed.items()
                if isinstance(value, dict)
            ],
        }
    return {"member": member_name, "read_chars": len(text), "json_valid": True, "json_type": type(parsed).__name__}


def classify_zero_prefix(report: dict[str, Any], schema_summaries: list[dict[str, Any]]) -> tuple[str, bool, str]:
    recovered = int(report.get("ordered_steps_recovered") or 0)
    declared = audit.as_int(report.get("declared_step_count"))
    trajectory_lengths = [
        int(item.get("list_lengths", {}).get("trajectory") or 0)
        for item in schema_summaries
        if item.get("json_valid")
    ]
    truncated_invalid = any(item.get("json_valid") is False and item.get("possibly_truncated") for item in schema_summaries)
    if recovered >= 2:
        return "unknown", True, "audit reports zero prefixes despite at least two recovered steps"
    if any(length >= 2 for length in trajectory_lengths):
        return "parser_filter_too_strict", True, "authoritative .traj file has a trajectory list with at least two rows"
    if truncated_invalid:
        return "parser_filter_too_strict", True, "authoritative .traj file likely exceeds previous inspection/parser read bounds"
    if declared is not None and int(report.get("missing_declared_step_count") or 0) >= max(1, declared - 1):
        if any(item.get("json_valid") is False for item in schema_summaries):
            return "malformed_steps", False, "authoritative trajectory member is not parseable under current JSON contract"
        return "step_count_mismatch", False, "manifest declares many steps but parser recovered fewer than two ordered steps"
    if recovered < 2 and int(report.get("label_count") or 0) > 0:
        return "only_label_refs_no_ordered_steps", False, "labels exist but no ordered action/observation sequence is recoverable"
    if recovered < 2:
        return "true_less_than_two_steps", False, "fewer than two ordered steps are recoverable"
    return "unknown", False, "zero-prefix cause is not identifiable from audit metadata"


def inspect_case(report: dict[str, Any], sample: dict[str, Any]) -> dict[str, Any]:
    path = WORKSPACE / report["artifact_path"]
    fmt = inspect.detect_artifact_format(path)["format"]
    members = inspect.list_members(path, fmt)
    candidate_members = [
        member.name
        for member in members
        if member.name.endswith((".traj", ".traj.json", "mini.traj.json", "trajectory.json", "history.json"))
    ][:10]
    schemas = []
    for member_name in candidate_members[:3]:
        schemas.append(json_member_schema(path, fmt, member_name))
    cause, recoverable, rationale = classify_zero_prefix(report, schemas)
    action = "recover_with_existing_parser_fix" if recoverable else "keep_zero_prefix_documented"
    if cause == "unknown":
        action = "block_until_resolved"
    return {
        "trajectory_id": report.get("trajectory_id"),
        "artifact_path": report.get("artifact_path"),
        "parser_layout_family": report.get("layout_family"),
        "parser_adapter": report.get("parser_adapter"),
        "manifest_step_count": report.get("declared_step_count"),
        "recovered_step_count_before_prefix_filtering": report.get("ordered_steps_recovered"),
        "label_presence": sample.get("label_presence"),
        "label_count": report.get("label_count"),
        "malformed_or_unmapped_step_parts": report.get("malformed_or_unmapped_step_parts"),
        "candidate_trajectory_files": candidate_members,
        "trajectory_file_schema_summaries": schemas,
        "reason_for_zero_prefix": cause,
        "prefix_examples_can_be_recovered_safely": recoverable,
        "recommended_action": action,
        "rationale": rationale,
    }


def build_report() -> dict[str, Any]:
    prefix_audit = load_json(PREFIX_AUDIT)
    samples = {str(item.get("traj_id")): item for item in load_json(DOWNLOAD_MANIFEST).get("samples", [])}
    cases = [
        report
        for report in prefix_audit.get("trajectories", [])
        if int(report.get("prefix_examples") or 0) == 0 and report.get("layout_family") != "unsupported_layout"
    ]
    artifacts = [inspect_case(report, samples.get(str(report.get("trajectory_id")), {})) for report in cases]
    return {
        "schema_version": "risk-controlled-intervention-zero-prefix-verified-inspection.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.75 zero-prefix inspection only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": {
            "zero_prefix_cases_inspected": len(artifacts),
            "reason_counts": dict(Counter(item["reason_for_zero_prefix"] for item in artifacts)),
            "recommended_action_counts": dict(Counter(item["recommended_action"] for item in artifacts)),
            "recoverable_safely_count": sum(1 for item in artifacts if item["prefix_examples_can_be_recovered_safely"]),
        },
        "artifacts": artifacts,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Zero-Prefix Verified Inspection",
        "",
        "Supported-layout zero-prefix diagnostics. No full raw action, observation, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Cases", ""])
    for item in report["artifacts"]:
        lines.append(
            f"- `{item['trajectory_id']}` layout `{item['parser_layout_family']}` cause `{item['reason_for_zero_prefix']}` "
            f"action `{item['recommended_action']}`: {item['rationale']}"
        )
    return "\n".join(lines)


def main() -> int:
    parse_args()
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
