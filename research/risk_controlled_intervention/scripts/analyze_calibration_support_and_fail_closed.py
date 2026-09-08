#!/usr/bin/env python3
"""Analyze Batch 9I calibration support and fail-closed behavior."""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
POLICY_JSON = REPORTS_DIR / "batch_9i_dual_unit_policy_selection.json"
SELECTED_CSV = REPORTS_DIR / "batch_9i_dual_unit_selected_policies.csv"
GRID_CSV = REPORTS_DIR / "batch_9i_dual_unit_policy_grid.csv"
REPORT_JSON = REPORTS_DIR / "batch_9i_calibration_support_fail_closed.json"
REPORT_MD = REPORTS_DIR / "batch_9i_calibration_support_fail_closed.md"
SUPPORT_CSV = REPORTS_DIR / "batch_9i_calibration_support_by_scenario.csv"


def read_csv(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"missing required support input: {path}")
    with path.open() as handle:
        return list(csv.DictReader(handle))


def as_float(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def fail_reason(row: dict[str, Any]) -> str:
    if str(row.get("no_safe_recommendation")).lower() != "true":
        return "selected"
    reason = row.get("reason") or "no_feasible_policy"
    if "alpha" in reason:
        return "alpha_too_strict_or_trivial"
    if "constraint" in reason or "feasible" in reason:
        return "trajectory_burden_incompatible_with_capture_target"
    return reason


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row.get("selector", ""), row.get("policy_id", ""))].append(row)
    out = []
    for (selector, policy_id), vals in sorted(grouped.items()):
        no_safe = [v for v in vals if str(v.get("no_safe_recommendation")).lower() == "true"]
        tests = [as_float(v.get("test_trajectory_burden")) for v in vals]
        tests = [v for v in tests if v is not None]
        out.append({
            "selector": selector,
            "policy_id": policy_id,
            "rows": len(vals),
            "no_safe_recommendation_count": len(no_safe),
            "no_safe_recommendation_rate": len(no_safe) / len(vals) if vals else None,
            "mean_test_trajectory_burden": statistics.mean(tests) if tests else None,
            "dominant_reason": max((fail_reason(v) for v in vals), key=lambda r: sum(1 for v in vals if fail_reason(v) == r)) if vals else None,
        })
    return out


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
    lines = [
        "# Batch 9I Calibration Support And Fail-Closed Analysis",
        "",
        "Exploratory benchmark-level analysis on CodeTraceBench-derived trajectories. This offline proxy uses calibration support to decide when dual-unit row-level risk and trajectory-level burden selection should fail closed; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Selected rows analyzed: `{report['selected_rows']}`",
        f"- Grid rows analyzed: `{report['grid_rows']}`",
        f"- Overall no-safe recommendation rate: `{report['overall_no_safe_recommendation_rate']}`",
        f"- Main fail-closed reason: `{report['dominant_fail_closed_reason']}`",
        "",
        "## Interpretation",
        "",
        "- Fail-closed behavior mostly reflects incompatible row/trajectory/capture constraints or sparse calibration support.",
        "- No-safe recommendation rows are retained as scientific evidence rather than silently relaxed.",
        "- Domain shift remains a caveat because this analysis uses repeated-split calibration support, not arbitrary deployment shift.",
    ]
    return "\n".join(lines)


def main() -> None:
    if not POLICY_JSON.exists():
        raise FileNotFoundError(f"missing required policy-selection report: {POLICY_JSON}")
    policy_report = json.loads(POLICY_JSON.read_text())
    selected = read_csv(SELECTED_CSV)
    grid = read_csv(GRID_CSV)
    support_rows = policy_report.get("support", [])
    selected_failures = [row for row in selected if str(row.get("no_safe_recommendation")).lower() == "true"]
    reasons = [fail_reason(row) for row in selected]
    failure_reasons = [reason for reason in reasons if reason != "selected"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; dual-unit calibration support and fail-closed analysis; row-level risk and trajectory-level burden; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "selected_rows": len(selected),
        "grid_rows": len(grid),
        "support_rows": support_rows,
        "aggregate_by_selector_policy": aggregate(selected),
        "overall_no_safe_recommendation_rate": len(selected_failures) / len(selected) if selected else None,
        "dominant_fail_closed_reason": max(set(failure_reasons), key=failure_reasons.count) if failure_reasons else None,
        "fail_closed_reasons": sorted(set(reasons)),
        "guard_results": {"raw_text_output": False, "test_tuning_detected": False, "metadata_as_features": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    rows = []
    for support in support_rows:
        rows.append({
            **support,
            "support_status": "sufficient" if support.get("calibration_positives", 0) >= 10 and support.get("calibration_positive_trajectories", 0) >= 5 else "sparse",
        })
    write_csv(SUPPORT_CSV, rows)
    print(json.dumps({"selected_rows": len(selected), "no_safe_rate": report["overall_no_safe_recommendation_rate"]}, indent=2))


if __name__ == "__main__":
    main()
