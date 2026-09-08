#!/usr/bin/env python3
"""Automated QA gate for the bounded pilot prefix extraction."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_PATH = PROCESSED_DIR / "prefix_pilot.jsonl"
PREFIX_AUDIT_PATH = REPORTS_DIR / "prefix_pilot_audit.json"
TAXONOMY_PATH = REPORTS_DIR / "pilot_failure_taxonomy.json"
SPLITS_PATH = PROCESSED_DIR / "pilot_splits.json"
SPLIT_AUDIT_PATH = REPORTS_DIR / "pilot_split_audit.json"
SCHEMA_LOCK_PATH = WORKSPACE / "SCHEMA_LOCK.md"
QUALITY_GATE_JSON = REPORTS_DIR / "pilot_quality_gate.json"
QUALITY_GATE_MD = REPORTS_DIR / "pilot_quality_gate.md"
FEATURE_SCHEMA_JSON = REPORTS_DIR / "prefix_feature_schema.json"
FEATURE_SCHEMA_MD = REPORTS_DIR / "prefix_feature_schema.md"

FORBIDDEN_RAW_KEYS = {
    "action_text",
    "observation_text",
    "raw_action",
    "raw_observation",
    "content",
    "prompt",
    "response",
    "code",
    "raw_code",
}
FUTURE_HASH_KEYS = {
    "next_action_text_hash",
    "next_observation_text_hash",
    "target_action_text_hash",
    "target_observation_text_hash",
}
TARGET_KEYS = {
    "next_step_bad",
    "next_step_incorrect",
    "next_step_unuseful",
    "current_step_bad",
    "current_step_incorrect",
    "current_step_unuseful",
    "trajectory_has_any_bad_step",
}
METADATA_KEYS = {
    "trajectory_id",
    "artifact_id",
    "artifact_path",
    "source_inferred",
    "source_bucket",
    "agent",
    "model",
    "category",
    "difficulty",
    "step_index",
    "next_step_index",
}
ALLOWED_FEATURE_KEYS = {
    "current_stage_index",
    "current_stage_name",
    "prefix_length",
    "current_stage_step_count_so_far",
    "total_stage_transitions_so_far",
    "recent_error_keyword_count",
    "recent_failure_keyword_count",
    "recent_timeout_keyword_count",
    "recent_test_keyword_count",
    "recent_exception_keyword_count",
    "repeated_action_indicator",
    "repeated_observation_indicator",
    "action_text_hash",
    "observation_text_hash",
    "action_length_chars",
    "observation_length_chars",
    "action_kind_guess",
    "observation_kind_guess",
}
SUPPORTED_LAYOUTS = (
    "mini_swe_mini_traj",
    "mini_swe_generic_traj_json",
    "terminus_episode",
    "swe_agent_traj",
    "openhands_events",
    "openhands_tensorblock",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run automated pilot extraction QA.")
    parser.add_argument("--prefix-jsonl", default=str(PREFIX_PATH))
    parser.add_argument("--prefix-audit", default=str(PREFIX_AUDIT_PATH))
    parser.add_argument("--taxonomy", default=str(TAXONOMY_PATH))
    parser.add_argument("--splits", default=str(SPLITS_PATH))
    parser.add_argument("--split-audit", default=str(SPLIT_AUDIT_PATH))
    parser.add_argument("--schema-lock", default=str(SCHEMA_LOCK_PATH))
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"ERROR: malformed JSONL at {path}:{line_number}: {exc}") from exc
    return rows


def check(name: str, passed: bool, observed: Any, expected: str, critical: bool = False) -> dict[str, Any]:
    return {
        "name": name,
        "passed": bool(passed),
        "observed": observed,
        "expected": expected,
        "critical": critical,
    }


def positive_rate(rows: list[dict[str, Any]]) -> float:
    if not rows:
        return 0.0
    return sum(int(row.get("next_step_bad", 0)) for row in rows) / len(rows)


def raw_text_key_hits(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hits = []
    for index, row in enumerate(rows, start=1):
        found = sorted(FORBIDDEN_RAW_KEYS & set(row))
        if found:
            hits.append({"row_number": index, "keys": found})
    return hits


def no_future_hash_keys(rows: list[dict[str, Any]]) -> bool:
    return all(not (FUTURE_HASH_KEYS & set(row)) for row in rows)


def target_integrity_failures(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    failures = []
    for index, row in enumerate(rows, start=1):
        next_bad = int(row.get("next_step_bad", 0))
        next_incorrect = int(row.get("next_step_incorrect", 0))
        next_unuseful = int(row.get("next_step_unuseful", 0))
        current_bad = int(row.get("current_step_bad", 0))
        current_incorrect = int(row.get("current_step_incorrect", 0))
        current_unuseful = int(row.get("current_step_unuseful", 0))
        if next_bad != int(bool(next_incorrect or next_unuseful)):
            failures.append({"row_number": index, "reason": "next_step_bad mismatch"})
        if current_bad != int(bool(current_incorrect or current_unuseful)):
            failures.append({"row_number": index, "reason": "current_step_bad mismatch"})
    return failures


def no_future_step_failures(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    failures = []
    for index, row in enumerate(rows, start=1):
        if int(row["next_step_index"]) <= int(row["step_index"]):
            failures.append({"row_number": index, "trajectory_id": row.get("trajectory_id")})
    return failures


def final_step_prefix_failures(prefix_audit: dict[str, Any]) -> list[str]:
    failures = []
    for trajectory in prefix_audit.get("trajectories", []):
        recovered = int(trajectory.get("ordered_steps_recovered") or 0)
        expected = max(0, recovered - 1)
        actual = int(trajectory.get("prefix_examples") or 0)
        if actual != expected:
            failures.append(str(trajectory.get("trajectory_id")))
    return failures


def split_assignment_issues(rows: list[dict[str, Any]], splits: dict[str, Any], split_audit: dict[str, Any]) -> dict[str, Any]:
    assignments = splits.get("assignments", {})
    row_trajectories = {row["trajectory_id"] for row in rows}
    missing = sorted(row_trajectories - set(assignments))
    invalid = sorted(set(assignments.values()) - {"train", "calibration", "test"})
    split_sets = {
        split: set(splits.get("split_trajectories", {}).get(split, []))
        for split in ("train", "calibration", "test")
    }
    overlaps = []
    for left in split_sets:
        for right in split_sets:
            if left < right:
                overlap = sorted(split_sets[left] & split_sets[right])
                if overlap:
                    overlaps.append({"left": left, "right": right, "trajectory_ids": overlap})
    counts = {split: len(values) for split, values in split_sets.items()}
    total = sum(counts.values())
    ratios = {split: (counts[split] / total if total else 0.0) for split in counts}
    approx = (
        abs(ratios.get("train", 0.0) - 0.60) <= 0.15
        and abs(ratios.get("calibration", 0.0) - 0.20) <= 0.12
        and abs(ratios.get("test", 0.0) - 0.20) <= 0.12
    )
    return {
        "missing_assignments_for_row_trajectories": missing,
        "invalid_split_values": invalid,
        "split_overlaps": overlaps,
        "trajectory_counts": counts,
        "trajectory_ratios": ratios,
        "ratios_approximately_60_20_20": approx,
        "split_audit_leakage": bool(split_audit.get("trajectory_leakage_across_splits")),
    }


def infer_dtype(values: list[Any]) -> str:
    non_missing = [value for value in values if value is not None]
    if not non_missing:
        return "null"
    if all(isinstance(value, bool) for value in non_missing):
        return "bool"
    if all(isinstance(value, int) and not isinstance(value, bool) for value in non_missing):
        return "int"
    if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in non_missing):
        return "float"
    if all(isinstance(value, str) for value in non_missing):
        return "string"
    return "mixed"


def classify_field(key: str) -> dict[str, Any]:
    if key in FORBIDDEN_RAW_KEYS:
        return {
            "role": "prohibited_raw_text",
            "allowed_as_model_feature": False,
            "target_or_label_only": False,
            "prohibited_from_model_features": True,
        }
    if key in TARGET_KEYS:
        return {
            "role": "target_or_label",
            "allowed_as_model_feature": False,
            "target_or_label_only": True,
            "prohibited_from_model_features": True,
        }
    if key in METADATA_KEYS:
        return {
            "role": "metadata",
            "allowed_as_model_feature": False,
            "target_or_label_only": False,
            "prohibited_from_model_features": key in {"trajectory_id", "artifact_id", "artifact_path", "next_step_index"},
        }
    if key in ALLOWED_FEATURE_KEYS:
        return {
            "role": "feature",
            "allowed_as_model_feature": True,
            "target_or_label_only": False,
            "prohibited_from_model_features": False,
        }
    return {
        "role": "unknown",
        "allowed_as_model_feature": False,
        "target_or_label_only": False,
        "prohibited_from_model_features": True,
    }


def build_feature_schema(rows: list[dict[str, Any]]) -> dict[str, Any]:
    keys = sorted({key for row in rows for key in row})
    fields = []
    total = len(rows)
    for key in keys:
        values = [row.get(key) for row in rows]
        missing = sum(1 for value in values if value is None)
        fields.append(
            {
                "name": key,
                "dtype": infer_dtype(values),
                "missing_count": missing,
                "missing_percent": (missing / total * 100.0) if total else 0.0,
                **classify_field(key),
            }
        )
    return {
        "schema_version": "risk-controlled-intervention-prefix-feature-schema.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "row_count": total,
        "field_count": len(fields),
        "fields": fields,
    }


def feature_schema_markdown(schema: dict[str, Any]) -> str:
    lines = [
        "# Prefix Feature Schema",
        "",
        "Field classification for `data/processed/prefix_pilot.jsonl`.",
        "",
        "| field | role | dtype | missing % | model feature | label only | prohibited |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for field in schema["fields"]:
        lines.append(
            "| {name} | {role} | {dtype} | {missing_percent:.2f} | {allowed_as_model_feature} | {target_or_label_only} | {prohibited_from_model_features} |".format(
                **field
            )
        )
    return "\n".join(lines)


def schema_checks(schema_text: str) -> list[dict[str, Any]]:
    checks = [
        check("schema lock includes v0.2", "Prefix Extraction Schema v0.2" in schema_text, "present", "section present"),
        check(
            "supported layout families documented",
            all(layout in schema_text for layout in SUPPORTED_LAYOUTS),
            "all supported layout names",
            ", ".join(SUPPORTED_LAYOUTS),
        ),
        check(
            "claim boundary preserved",
            all(term in schema_text for term in ("not production CodingActionGate validation", "does not claim CodingActionGate is conformal", "does not claim production statistical guarantees")),
            "claim boundary terms",
            "no production validation / no conformal claim / no production guarantees",
            critical=True,
        ),
        check(
            "privacy rule preserved",
            "Privacy Rule For Derived JSONL" in schema_text and "must not store full raw action text" in schema_text,
            "privacy rule",
            "raw text exclusion stated",
            critical=True,
        ),
        check(
            "no-future-leakage rule preserved",
            "No target-step action text" in schema_text and "future labels" in schema_text,
            "no future feature rule",
            "future target text/labels excluded",
            critical=True,
        ),
        check(
            "conformal risk-control support statement preserved",
            "calibration-based threshold selection" in schema_text and "{0.05, 0.10, 0.20}" in schema_text,
            "risk-control support statement",
            "alpha set and calibration language present",
        ),
    ]
    return checks


def run_quality_gate(
    rows: list[dict[str, Any]],
    prefix_audit: dict[str, Any],
    taxonomy: dict[str, Any],
    splits: dict[str, Any],
    split_audit: dict[str, Any],
    schema_text: str,
) -> dict[str, Any]:
    summary = prefix_audit.get("summary", {})
    taxonomy_summary = taxonomy.get("summary", {})
    selected = int(summary.get("selected_manifest_rows") or 0)
    parsed_with_prefix = int(summary.get("trajectories_with_prefix_examples") or 0)
    rate = positive_rate(rows)
    raw_hits = raw_text_key_hits(rows)
    future_step_failures = no_future_step_failures(rows)
    target_failures = target_integrity_failures(rows)
    final_step_failures = final_step_prefix_failures(prefix_audit)
    split_issues = split_assignment_issues(rows, splits, split_audit)
    source_count = len({row.get("source_bucket") for row in rows if row.get("source_bucket") is not None})
    agent_count = len({row.get("agent") for row in rows if row.get("agent") is not None})
    layout_count = len(
        [
            layout
            for layout, counts in prefix_audit.get("parser_coverage", {}).get("by_layout_family", {}).items()
            if int(counts.get("with_prefix", 0)) > 0
        ]
    )
    checks_by_category = {
        "coverage": [
            check("total selected artifacts >= 50", selected >= 50, selected, ">= 50"),
            check("parsed_with_prefix_examples >= 40", parsed_with_prefix >= 40, parsed_with_prefix, ">= 40"),
            check(
                "parsed_with_prefix_examples / selected >= 0.80",
                selected > 0 and parsed_with_prefix / selected >= 0.80,
                parsed_with_prefix / selected if selected else 0.0,
                ">= 0.80",
            ),
            check("parse_failures == 0", int(summary.get("parse_failures") or 0) == 0, summary.get("parse_failures"), "0", critical=True),
            check(
                "corrupted_or_unreadable_archives == 0",
                int(summary.get("corrupted_or_unreadable_archives") or 0) == 0,
                summary.get("corrupted_or_unreadable_archives"),
                "0",
                critical=True,
            ),
        ],
        "dataset_utility": [
            check("prefix examples >= 1000", len(rows) >= 1000, len(rows), ">= 1000"),
            check("next_step_bad positives >= 50", sum(int(row["next_step_bad"]) for row in rows) >= 50, sum(int(row["next_step_bad"]) for row in rows), ">= 50"),
            check("next_step_bad positive rate between 1% and 50%", 0.01 <= rate <= 0.50, rate, "0.01 <= rate <= 0.50"),
            check("at least two source buckets represented", source_count >= 2, source_count, ">= 2"),
            check("at least two agents represented", agent_count >= 2, agent_count, ">= 2"),
            check("at least two layout families represented", layout_count >= 2, layout_count, ">= 2"),
        ],
        "leakage_privacy": [
            check("no forbidden raw-text keys", not raw_hits, raw_hits[:5], "[]", critical=True),
            check("next_step_index > step_index", not future_step_failures, future_step_failures[:5], "[]", critical=True),
            check("no target-step action/observation hash keys", no_future_hash_keys(rows), "checked keys", "no future hash keys", critical=True),
            check(
                "trajectory leakage across splits == false",
                not bool(split_audit.get("trajectory_leakage_across_splits")),
                split_audit.get("trajectory_leakage_across_splits"),
                "false",
                critical=True,
            ),
        ],
        "label_integrity": [
            check(
                "positive next_step_bad targets traceable",
                bool(summary.get("positive_targets_traceable")),
                summary.get("positive_targets_traceable"),
                "true",
                critical=True,
            ),
            check("next/current bad labels match components", not target_failures, target_failures[:5], "[]", critical=True),
            check("final step has no prefix row", not final_step_failures, final_step_failures[:5], "[]", critical=True),
            check(
                "label mapping success rate >= 90%",
                float(summary.get("label_mapping_success_rate") or 0.0) >= 0.90,
                summary.get("label_mapping_success_rate"),
                ">= 0.90",
                critical=True,
            ),
        ],
        "split_quality": [
            check("train/calibration/test splits exist", all(split in splits.get("split_trajectories", {}) for split in ("train", "calibration", "test")), sorted(splits.get("split_trajectories", {})), "train, calibration, test"),
            check("every trajectory appears in exactly one split", not split_issues["missing_assignments_for_row_trajectories"] and not split_issues["split_overlaps"] and not split_issues["invalid_split_values"], split_issues, "no missing/overlap/invalid", critical=True),
            check("calibration split contains at least one positive", split_audit["splits"]["calibration"]["next_step_bad_positives"] >= 1, split_audit["splits"]["calibration"]["next_step_bad_positives"], ">= 1"),
            check("test split contains at least one positive", split_audit["splits"]["test"]["next_step_bad_positives"] >= 1, split_audit["splits"]["test"]["next_step_bad_positives"], ">= 1"),
            check("split ratios approximately 60/20/20", split_issues["ratios_approximately_60_20_20"], split_issues["trajectory_ratios"], "within tolerance"),
        ],
        "schema_consistency": schema_checks(schema_text),
    }
    all_checks = [item for checks in checks_by_category.values() for item in checks]
    critical_failures = [item for item in all_checks if item["critical"] and not item["passed"]]
    noncritical_failures = [item for item in all_checks if not item["critical"] and not item["passed"]]
    uncovered_count = int(taxonomy_summary.get("parsed_zero_prefix", 0)) + int(taxonomy_summary.get("unsupported_layout", 0))
    uncovered_nonblocking = uncovered_count > 0
    if critical_failures:
        decision = "NOT_READY"
    elif noncritical_failures or uncovered_nonblocking:
        decision = "READY_WITH_CAVEATS"
    else:
        decision = "READY_FOR_VERIFIED_EXTRACTION"
    return {
        "schema_version": "risk-controlled-intervention-pilot-quality-gate.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 5 automated pilot QA only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "decision": decision,
        "checks_by_category": checks_by_category,
        "critical_failures": critical_failures,
        "noncritical_failures": noncritical_failures,
        "uncovered_case_count": uncovered_count,
        "uncovered_cases_nonblocking": uncovered_nonblocking,
        "summary": {
            "selected_artifacts": selected,
            "parsed_with_prefix_examples": parsed_with_prefix,
            "prefix_examples": len(rows),
            "next_step_bad_positives": sum(int(row["next_step_bad"]) for row in rows),
            "next_step_bad_positive_rate": rate,
            "label_mapping_success_rate": summary.get("label_mapping_success_rate"),
            "raw_text_key_hit_count": len(raw_hits),
            "future_step_failure_count": len(future_step_failures),
            "target_integrity_failure_count": len(target_failures),
            "split_leakage": bool(split_audit.get("trajectory_leakage_across_splits")),
        },
    }


def gate_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Pilot Quality Gate",
        "",
        "Automated pre-modeling QA for the bounded CodeTraceBench pilot extraction.",
        "",
        "This is not production CodingActionGate validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        f"## Decision: `{report['decision']}`",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    for category, checks in report["checks_by_category"].items():
        lines.extend(["", f"## {category.replace('_', ' ').title()}", ""])
        for item in checks:
            status = "PASS" if item["passed"] else "FAIL"
            lines.append(f"- `{status}` `{item['name']}` observed `{item['observed']}` expected `{item['expected']}`")
    if report["critical_failures"]:
        lines.extend(["", "## Critical Failures", ""])
        for item in report["critical_failures"]:
            lines.append(f"- `{item['name']}`")
    if report["noncritical_failures"]:
        lines.extend(["", "## Noncritical Failures", ""])
        for item in report["noncritical_failures"]:
            lines.append(f"- `{item['name']}`")
    lines.extend(
        [
            "",
            "## Readiness Conclusion",
            "",
            f"`{report['decision']}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_jsonl(Path(args.prefix_jsonl))
    prefix_audit = load_json(Path(args.prefix_audit))
    taxonomy = load_json(Path(args.taxonomy))
    splits = load_json(Path(args.splits))
    split_audit = load_json(Path(args.split_audit))
    schema_text = Path(args.schema_lock).read_text()
    feature_schema = build_feature_schema(rows)
    report = run_quality_gate(rows, prefix_audit, taxonomy, splits, split_audit, schema_text)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    QUALITY_GATE_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    QUALITY_GATE_MD.write_text(gate_markdown(report) + "\n")
    FEATURE_SCHEMA_JSON.write_text(json.dumps(feature_schema, indent=2, sort_keys=True) + "\n")
    FEATURE_SCHEMA_MD.write_text(feature_schema_markdown(feature_schema) + "\n")
    print(json.dumps({"decision": report["decision"], "summary": report["summary"]}, indent=2, sort_keys=True))
    print(f"Saved quality gate: {QUALITY_GATE_JSON}")
    print(f"Saved feature schema: {FEATURE_SCHEMA_JSON}")
    return 1 if report["decision"] == "NOT_READY" else 0


if __name__ == "__main__":
    raise SystemExit(main())
