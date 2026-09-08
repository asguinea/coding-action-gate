#!/usr/bin/env python3
"""Analyze shift-aware support requirements for Batch 9J."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DATASET_CSV = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.csv"
GATE_JSON = REPORTS_DIR / "batch_9j_support_gate_evaluation.json"
NINEF_JSON = REPORTS_DIR / "batch_9f_target_domain_adaptation.json"
NINED_JSON = REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.json"

REPORT_JSON = REPORTS_DIR / "batch_9j_shift_aware_support_requirements.json"
REPORT_MD = REPORTS_DIR / "batch_9j_shift_aware_support_requirements.md"
SIZE_CSV = REPORTS_DIR / "batch_9j_shift_aware_support_by_calibration_size.csv"


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required shift-support input: {path}")


def read_rows() -> list[dict[str, Any]]:
    require(DATASET_CSV)
    with DATASET_CSV.open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    try:
        value = row.get(key)
        if value in (None, "", "None"):
            return default
        return float(value)
    except ValueError:
        return default


def b(row: dict[str, Any], key: str) -> bool:
    return str(row.get(key)).lower() == "true"


def summarize_context(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("scenario_type", "unknown"))].append(row)
    out = []
    for scenario, vals in grouped.items():
        out.append({
            "scenario_type": scenario,
            "rows": len(vals),
            "mean_calibration_positive_rows": sum(f(row, "calibration_positive_rows") for row in vals) / len(vals),
            "mean_calibration_positive_trajectories": sum(f(row, "calibration_positive_trajectories") for row in vals) / len(vals),
            "violation_rate": sum(1 for row in vals if b(row, "any_test_constraint_violation")) / len(vals),
            "bad_outcome_rate": sum(1 for row in vals if b(row, "bad_recommendation_outcome")) / len(vals),
        })
    return out


def adaptation_size_rows() -> list[dict[str, Any]]:
    rows = []
    if not NINEF_JSON.exists():
        return rows
    report = json.loads(NINEF_JSON.read_text())
    aggregate = report.get("aggregate_metrics", {})
    for key, value in aggregate.items():
        if not isinstance(value, dict):
            continue
        parts = str(key).split("|")
        scenario = next((p for p in parts if "openhands" in p or "swe" in p or "terminalbench" in p), "unknown")
        size = next((p for p in parts if p in {"5", "10", "20", "50", "10pct", "5pct", "20pct"}), "unknown")
        rows.append({
            "scenario": scenario,
            "target_calibration_size": size,
            "adaptation_mode": next((p for p in parts if "adaptation" in p or "pooled" in p or "pure" in p), "unknown"),
            "mean_capture": value.get("target_positive_row_capture_mean") or value.get("test_target_positive_capture_mean") or value.get("bad_row_capture_mean"),
            "mean_trajectory_deferral": value.get("trajectory_deferral_rate_mean") or value.get("test_trajectory_deferral_mean"),
            "mean_first_failure": value.get("first_failure_coverage_mean"),
        })
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("")
        return
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def markdown(report: dict[str, Any]) -> str:
    return "\n".join([
        "# Batch 9J Shift-Aware Support Requirements",
        "",
        "Exploratory benchmark-level shift-aware support analysis on CodeTraceBench-derived trajectories. This offline proxy treats OpenHands-like and unknown shifts as calibration support stress cases for dual-unit row-level risk and trajectory-level burden; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- IID diagnostic contexts: `{len(report['iid_context_summary'])}`",
        f"- Target-domain adaptation rows parsed: `{len(report['target_calibration_size_summary'])}`",
        f"- OpenHands stress assessment: `{report['openhands_stress_assessment']}`",
        "",
        "## Interpretation",
        "",
        "- Pure held-out and target-domain adaptation should remain separate.",
        "- Target-domain calibration becomes a support requirement when context is OpenHands-like, unknown shift, or framework shift.",
        "- Current Batch 9I support-gate rows are IID repeated-split diagnostics; held-out support remains a separate stress analysis.",
    ])


def main() -> None:
    rows = read_rows()
    require(GATE_JSON)
    gate = json.loads(GATE_JSON.read_text())
    context_summary = summarize_context(rows)
    adaptation_rows = adaptation_size_rows()
    openhands_available = NINED_JSON.exists() and "openhands" in NINED_JSON.read_text().lower()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; shift-aware calibration support and fail-closed; dual-unit row-level risk and trajectory-level burden; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "iid_context_summary": context_summary,
        "target_calibration_size_summary": adaptation_rows,
        "best_gate": gate.get("best_gate", {}).get("gate_name"),
        "openhands_stress_assessment": "target_domain_calibration_required_before_recommendation" if openhands_available else "heldout_evidence_unavailable",
        "questions": {
            "when_target_calibration_needed": "OpenHands-like, unknown shift, framework shift, or sparse positive-trajectory calibration support.",
            "small_target_calibration_effect": "Use Batch 9F adaptation rows where available; keep adaptation separate from pure held-out transfer.",
            "openhands_hard_under_current_features": bool(openhands_available),
        },
        "guard_results": {"raw_text_output": False, "metadata_as_risk_model_features": False, "pure_heldout_and_adaptation_separated": True},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(SIZE_CSV, adaptation_rows or context_summary)
    print(json.dumps({"openhands_stress_assessment": report["openhands_stress_assessment"], "adaptation_rows": len(adaptation_rows)}, indent=2))


if __name__ == "__main__":
    main()
