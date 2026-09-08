#!/usr/bin/env python3
"""Compare frozen v0.2 verified extraction metrics with current verified outputs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_AUDIT_PATH = REPORTS_DIR / "prefix_verified_audit.json"
QUALITY_GATE_PATH = REPORTS_DIR / "verified_quality_gate.json"
SPLIT_AUDIT_PATH = REPORTS_DIR / "verified_split_audit.json"
FAILURE_TAXONOMY_PATH = REPORTS_DIR / "verified_failure_taxonomy.json"
OUTPUT_JSON = REPORTS_DIR / "verified_coverage_comparison_v02_v03.json"
OUTPUT_MD = REPORTS_DIR / "verified_coverage_comparison_v02_v03.md"

V02_BASELINE = {
    "schema_version": "v0.2",
    "verified_manifest_trajectories": 1000,
    "artifacts_available": 992,
    "artifacts_parsed_with_prefix_examples": 652,
    "unsupported_layouts": 329,
    "parsed_zero_prefix_trajectories": 11,
    "ordered_steps_recovered": 25169,
    "prefix_examples_created": 24516,
    "next_step_bad_positives": 1613,
    "next_step_bad_positive_rate": 0.06579376733561755,
    "label_mapping_success_rate": 0.8524159663865546,
    "raw_text_exclusion_status": True,
    "no_future_leakage_guard_status": True,
    "quality_gate_result": "READY_WITH_CAVEATS",
    "split_summary": {
        "train": {"trajectories": 391, "prefix_rows": 14904, "next_step_bad_positives": 1084},
        "calibration": {"trajectories": 130, "prefix_rows": 4584, "next_step_bad_positives": 237},
        "test": {"trajectories": 131, "prefix_rows": 5028, "next_step_bad_positives": 292},
    },
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def split_summary(split_audit: dict[str, Any]) -> dict[str, dict[str, Any]]:
    summary = {}
    for split_name, split in split_audit.get("splits", {}).items():
        summary[split_name] = {
            "trajectories": split.get("trajectory_count"),
            "prefix_rows": split.get("prefix_row_count"),
            "next_step_bad_positives": split.get("next_step_bad_positives"),
        }
    return summary


def current_metrics(
    prefix_audit: dict[str, Any],
    quality_gate: dict[str, Any],
    split_audit: dict[str, Any],
    failure_taxonomy: dict[str, Any],
) -> dict[str, Any]:
    summary = prefix_audit.get("summary", {})
    taxonomy_summary = failure_taxonomy.get("summary", {})
    return {
        "schema_version": "v0.3",
        "verified_manifest_trajectories": summary.get("verified_manifest_trajectories"),
        "artifacts_available": summary.get("artifacts_cached_found") or summary.get("selected_artifacts"),
        "artifacts_parsed_with_prefix_examples": summary.get("artifacts_parsed_with_prefix_examples"),
        "unsupported_layouts": taxonomy_summary.get("unsupported_layout", summary.get("unsupported_layouts")),
        "parsed_zero_prefix_trajectories": taxonomy_summary.get(
            "parsed_zero_prefix",
            summary.get("parsed_zero_prefix_trajectories"),
        ),
        "ordered_steps_recovered": summary.get("ordered_steps_recovered"),
        "prefix_examples_created": summary.get("prefix_examples_created"),
        "next_step_bad_positives": summary.get("next_step_bad_positives"),
        "next_step_bad_positive_rate": summary.get("next_step_bad_positive_rate")
        if summary.get("next_step_bad_positive_rate") is not None
        else (
            float(summary.get("next_step_bad_positive_percent")) / 100.0
            if summary.get("next_step_bad_positive_percent") is not None
            else None
        ),
        "label_mapping_success_rate": summary.get("label_mapping_success_rate"),
        "raw_text_exclusion_status": summary.get("raw_text_exclusion_status"),
        "no_future_leakage_guard_status": summary.get("no_future_leakage_guard_status"),
        "quality_gate_result": quality_gate.get("decision"),
        "split_summary": split_summary(split_audit),
    }


def delta(before: dict[str, Any], after: dict[str, Any], key: str) -> Any:
    left = before.get(key)
    right = after.get(key)
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return right - left
    return None


def build_report() -> dict[str, Any]:
    after = current_metrics(
        load_json(PREFIX_AUDIT_PATH),
        load_json(QUALITY_GATE_PATH),
        load_json(SPLIT_AUDIT_PATH),
        load_json(FAILURE_TAXONOMY_PATH),
    )
    comparable_keys = [
        "artifacts_parsed_with_prefix_examples",
        "unsupported_layouts",
        "parsed_zero_prefix_trajectories",
        "ordered_steps_recovered",
        "prefix_examples_created",
        "next_step_bad_positives",
        "label_mapping_success_rate",
    ]
    return {
        "schema_version": "risk-controlled-intervention-verified-coverage-comparison.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.5 coverage comparison only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "v02_baseline_source": "Frozen Batch 6 verified extraction metrics recorded before v0.3 parser expansion.",
        "v02": V02_BASELINE,
        "v03": after,
        "deltas": {key: delta(V02_BASELINE, after, key) for key in comparable_keys},
        "status": {
            "v03_implemented": True,
            "raw_text_exclusion_preserved": bool(after.get("raw_text_exclusion_status")),
            "no_future_leakage_preserved": bool(after.get("no_future_leakage_guard_status")),
            "quality_gate_changed": V02_BASELINE["quality_gate_result"] != after.get("quality_gate_result"),
        },
    }


def markdown(report: dict[str, Any]) -> str:
    before = report["v02"]
    after = report["v03"]
    lines = [
        "# Verified Coverage Comparison v0.2 to v0.3",
        "",
        "Batch 6.5 parser expansion comparison. This is data infrastructure only.",
        "",
        "| metric | v0.2 | v0.3 | delta |",
        "|---|---:|---:|---:|",
    ]
    for key, value in report["deltas"].items():
        lines.append(f"| `{key}` | `{before.get(key)}` | `{after.get(key)}` | `{value}` |")
    lines.extend(
        [
            "",
            "## Guard Status",
            "",
            f"- `raw_text_exclusion_preserved`: `{report['status']['raw_text_exclusion_preserved']}`",
            f"- `no_future_leakage_preserved`: `{report['status']['no_future_leakage_preserved']}`",
            f"- `quality_gate_before`: `{before.get('quality_gate_result')}`",
            f"- `quality_gate_after`: `{after.get('quality_gate_result')}`",
            "",
            "## Split Summary",
            "",
            f"- `v0.2`: `{before.get('split_summary')}`",
            f"- `v0.3`: `{after.get('split_summary')}`",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["status"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
