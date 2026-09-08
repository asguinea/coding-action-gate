#!/usr/bin/env python3
"""Create final Batch 6.75 coverage recovery comparison."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_AUDIT = REPORTS_DIR / "prefix_verified_audit.json"
TAXONOMY = REPORTS_DIR / "verified_failure_taxonomy.json"
QUALITY = REPORTS_DIR / "verified_quality_gate.json"
MISSING = REPORTS_DIR / "missing_artifact_recovery.json"
UNSUPPORTED = REPORTS_DIR / "final_unsupported_layout_recovery.json"
ZERO = REPORTS_DIR / "zero_prefix_verified_inspection.json"
OUTPUT_JSON = REPORTS_DIR / "final_verified_coverage_recovery.json"
OUTPUT_MD = REPORTS_DIR / "final_verified_coverage_recovery.md"

BEFORE_BATCH_675 = {
    "missing_unresolved_artifact_paths": 8,
    "artifacts_available_cached": 992,
    "parsed_with_prefix_examples": 911,
    "unsupported_layouts": 70,
    "supported_zero_prefix_cases": 11,
    "ordered_steps": 34096,
    "prefix_examples": 33184,
    "next_step_bad_positives": 1744,
    "label_mapping_success_rate": 0.9212184873949579,
    "raw_text_exclusion": True,
    "no_future_leakage": True,
    "positive_target_traceability": True,
    "qa_gate_result": "READY_FOR_BASELINE_MODELING",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def after_metrics() -> dict[str, Any]:
    audit = load_json(PREFIX_AUDIT)
    taxonomy = load_json(TAXONOMY)
    quality = load_json(QUALITY)
    summary = audit.get("summary", {})
    taxonomy_summary = taxonomy.get("summary", {})
    return {
        "missing_unresolved_artifact_paths": taxonomy_summary.get("missing_or_unresolved_artifact", 0),
        "artifacts_available_cached": summary.get("artifacts_cached_found"),
        "parsed_with_prefix_examples": taxonomy_summary.get("parsed_with_prefix_examples", 0),
        "unsupported_layouts": taxonomy_summary.get("unsupported_layout", 0),
        "supported_zero_prefix_cases": taxonomy_summary.get("parsed_zero_prefix", 0),
        "ordered_steps": summary.get("ordered_steps_recovered"),
        "prefix_examples": summary.get("prefix_examples_created"),
        "next_step_bad_positives": summary.get("next_step_bad_positives"),
        "label_mapping_success_rate": summary.get("label_mapping_success_rate"),
        "raw_text_exclusion": summary.get("raw_text_exclusion_status"),
        "no_future_leakage": summary.get("no_future_leakage_guard_status"),
        "positive_target_traceability": summary.get("positive_target_traceability_status"),
        "qa_gate_result": quality.get("decision"),
    }


def delta(before: dict[str, Any], after: dict[str, Any], key: str) -> Any:
    left = before.get(key)
    right = after.get(key)
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return right - left
    return None


def build_report() -> dict[str, Any]:
    after = after_metrics()
    keys = list(BEFORE_BATCH_675)
    missing = load_json(MISSING) if MISSING.exists() else {}
    unsupported = load_json(UNSUPPORTED) if UNSUPPORTED.exists() else {}
    zero = load_json(ZERO) if ZERO.exists() else {}
    changed = any(delta(BEFORE_BATCH_675, after, key) not in (0, None) for key in keys)
    return {
        "schema_version": "risk-controlled-intervention-final-verified-coverage-recovery.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.75 final coverage recovery only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "before_batch_6_75": BEFORE_BATCH_675,
        "after_batch_6_75": after,
        "deltas": {key: delta(BEFORE_BATCH_675, after, key) for key in keys},
        "coverage_changed": changed,
        "recovery_inputs": {
            "missing_artifact_recovery_summary": missing.get("summary"),
            "unsupported_layout_recovery_summary": unsupported.get("summary"),
            "zero_prefix_inspection_summary": zero.get("summary"),
        },
        "conclusion": {
            "baseline_modeling_can_proceed": (
                after.get("qa_gate_result") in {"READY_FOR_BASELINE_MODELING", "READY_WITH_CAVEATS"}
                and bool(after.get("raw_text_exclusion"))
                and bool(after.get("no_future_leakage"))
                and bool(after.get("positive_target_traceability"))
            ),
            "why_no_change_if_unchanged": (
                "Remaining cases lack exact artifact paths or deterministic non-speculative action/observation contracts."
                if not changed
                else None
            ),
            "schema_preference": (
                "Preserving v0.3 avoids speculative parsers and keeps extraction assumptions auditable."
                if not changed
                else "Coverage changed; consult schema lock and regenerated QA outputs."
            ),
        },
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Final Verified Coverage Recovery",
        "",
        "Batch 6.75 coverage comparison. This is pre-modeling infrastructure only.",
        "",
        "| metric | before | after | delta |",
        "|---|---:|---:|---:|",
    ]
    before = report["before_batch_6_75"]
    after = report["after_batch_6_75"]
    for key, value in report["deltas"].items():
        lines.append(f"| `{key}` | `{before.get(key)}` | `{after.get(key)}` | `{value}` |")
    lines.extend(["", "## Conclusion", ""])
    for key, value in report["conclusion"].items():
        lines.append(f"- `{key}`: `{value}`")
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["conclusion"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
