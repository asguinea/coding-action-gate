#!/usr/bin/env python3
"""Evaluate support-aware dual-unit intervention using Batch 9J gates."""

from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DATASET_CSV = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.csv"
GATE_JSON = REPORTS_DIR / "batch_9j_support_gate_evaluation.json"
RESULTS_CSV = REPORTS_DIR / "batch_9j_support_aware_dual_unit_results.csv"
COMPARISON_CSV = REPORTS_DIR / "batch_9j_support_aware_comparison.csv"
REPORT_JSON = REPORTS_DIR / "batch_9j_support_aware_dual_unit_intervention.json"
REPORT_MD = REPORTS_DIR / "batch_9j_support_aware_dual_unit_intervention.md"

ACCEPT = "ACCEPT_RECOMMENDATION"
FAIL = "FAIL_CLOSED"
FALLBACK = "CONSERVATIVE_FALLBACK"
REQUIRE_TARGET = "REQUIRE_TARGET_CALIBRATION"
INSUFFICIENT = "INSUFFICIENT_SUPPORT"


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required support-aware input: {path}")


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


def apply_gate(row: dict[str, Any], gate_name: str) -> str:
    if b(row, "no_safe_recommendation_9i"):
        return FAIL
    if gate_name == "shift_aware_gate":
        if row.get("scenario_type") in {"openhands_stress", "unknown_shift"}:
            return REQUIRE_TARGET
        if row.get("scenario_type") in {"framework_shift", "source_shift"}:
            return FALLBACK
        return ACCEPT
    if gate_name.startswith("margin_traj_"):
        try:
            threshold = float(gate_name.replace("margin_traj_", ""))
        except ValueError:
            threshold = 0.0
        if row.get("row_budget_requested") not in (None, "", "None") and f(row, "calibration_margin_to_row_budget", -1.0) < 0.0:
            return FAIL
        if row.get("trajectory_budget_requested") not in (None, "", "None") and f(row, "calibration_margin_to_trajectory_budget", -1.0) < threshold:
            return FAIL
        return ACCEPT
    if gate_name.startswith("feasibility_pareto_"):
        try:
            threshold = float(gate_name.replace("feasibility_pareto_", ""))
        except ValueError:
            threshold = 10.0
        if f(row, "pareto_policy_count") < threshold:
            return FAIL
        return ACCEPT
    if gate_name == "combined_transparent_gate":
        if f(row, "calibration_positive_rows") < 50 or f(row, "calibration_positive_trajectories") < 10:
            return INSUFFICIENT
        if f(row, "pareto_policy_count") < 10:
            return FAIL
        if row.get("trajectory_budget_requested") not in (None, "", "None") and f(row, "calibration_margin_to_trajectory_budget", -1.0) < 0.02:
            return FAIL
        if row.get("scenario_type") in {"openhands_stress", "unknown_shift"}:
            return REQUIRE_TARGET
        return ACCEPT
    # Fallback: reproduce existing 9I fail-closed behavior.
    return FAIL if b(row, "no_safe_recommendation_9i") else ACCEPT


def bad(row: dict[str, Any]) -> bool:
    return b(row, "bad_recommendation_outcome")


def violation(row: dict[str, Any]) -> bool:
    return b(row, "any_test_constraint_violation")


def useful(row: dict[str, Any]) -> bool:
    return f(row, "test_bad_row_capture") >= 0.10 or f(row, "test_first_failure_coverage") >= 0.10


def summarize(rows: list[dict[str, Any]], name: str, outputs: list[str] | None = None) -> dict[str, Any]:
    outputs = outputs or [ACCEPT] * len(rows)
    accepted = [row for row, out in zip(rows, outputs) if out == ACCEPT]
    not_accepted = [row for row, out in zip(rows, outputs) if out != ACCEPT]
    nums = lambda vals, key: [f(row, key) for row in vals if row.get(key) not in (None, "", "None")]
    false_reject = [row for row in not_accepted if (not violation(row)) and useful(row)]
    false_accept = [row for row in accepted if violation(row)]
    return {
        "method": name,
        "rows": len(rows),
        "recommendation_accept_rate": len(accepted) / len(rows) if rows else None,
        "no_safe_recommendation_rate": sum(1 for out in outputs if out == FAIL) / len(rows) if rows else None,
        "conservative_fallback_rate": sum(1 for out in outputs if out == FALLBACK) / len(rows) if rows else None,
        "require_target_calibration_rate": sum(1 for out in outputs if out == REQUIRE_TARGET) / len(rows) if rows else None,
        "insufficient_support_rate": sum(1 for out in outputs if out == INSUFFICIENT) / len(rows) if rows else None,
        "violation_rate_among_accepted": sum(1 for row in accepted if violation(row)) / len(accepted) if accepted else None,
        "mean_accepted_bad_row_capture": statistics.mean(nums(accepted, "test_bad_row_capture")) if accepted else None,
        "mean_accepted_first_failure_coverage": statistics.mean(nums(accepted, "test_first_failure_coverage")) if accepted else None,
        "mean_accepted_allowed_bad_rate": statistics.mean(nums(accepted, "test_allowed_bad_rate")) if accepted else None,
        "mean_accepted_trajectory_burden": statistics.mean(nums(accepted, "test_trajectory_burden")) if accepted else None,
        "accepted_policy_calibration_to_test_gap": statistics.mean([f(row, "test_trajectory_burden") - f(row, "selected_calibration_trajectory_burden") for row in accepted]) if accepted else None,
        "false_accept_rate": len(false_accept) / len(accepted) if accepted else None,
        "false_reject_rate": len(false_reject) / len(not_accepted) if not_accepted else None,
        "support_aware_utility": (
            sum((f(row, "test_bad_row_capture") + f(row, "test_first_failure_coverage") - 2.0 * float(violation(row))) for row in accepted)
            - 0.1 * len(not_accepted)
        ) / len(rows) if rows else None,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def markdown(report: dict[str, Any]) -> str:
    best = report["support_aware_summary"]
    unsupported = report["unsupported_dual_unit_summary"]
    return "\n".join([
        "# Batch 9J Support-Aware Dual-Unit Intervention",
        "",
        "Exploratory benchmark-level support-aware dual-unit intervention on CodeTraceBench-derived trajectories. This offline proxy uses calibration support and fail-closed gates for row-level risk and trajectory-level burden; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Gate used: `{report['gate_used']}`",
        f"- Unsupported accepted rate: `{unsupported['recommendation_accept_rate']}`",
        f"- Support-aware accepted rate: `{best['recommendation_accept_rate']}`",
        f"- Unsupported violation among accepted: `{unsupported['violation_rate_among_accepted']}`",
        f"- Support-aware violation among accepted: `{best['violation_rate_among_accepted']}`",
        f"- Support-aware false reject rate: `{best['false_reject_rate']}`",
        "",
        "## Interpretation",
        "",
        "- Support-aware gating is useful only if it lowers accepted-policy violations while retaining useful capture or first-failure coverage.",
        "- Fail-closed behavior is treated as an explicit recommendation, not as hidden missingness.",
    ])


def main() -> None:
    rows = read_rows()
    require(GATE_JSON)
    gate_report = json.loads(GATE_JSON.read_text())
    gate_name = gate_report.get("best_gate", {}).get("gate_name", "combined_transparent_gate")
    outputs = [apply_gate(row, gate_name) for row in rows]
    unsupported_outputs = [FAIL if b(row, "no_safe_recommendation_9i") else ACCEPT for row in rows]
    accept_all_outputs = [ACCEPT for _ in rows]
    result_rows = [{**row, "support_gate_decision": out} for row, out in zip(rows, outputs)]
    summaries = [
        summarize(rows, "accept_all_reference", accept_all_outputs),
        summarize(rows, "batch_9i_dual_unit_selector", unsupported_outputs),
        summarize(rows, f"support_aware_{gate_name}", outputs),
    ]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; support-aware dual-unit row-level risk and trajectory-level burden; calibration support and fail-closed; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "gate_used": gate_name,
        "unsupported_dual_unit_summary": summaries[1],
        "support_aware_summary": summaries[2],
        "comparison": summaries,
        "guard_results": {"test_features_used_as_gate_inputs": False, "raw_text_output": False, "metadata_as_risk_model_features": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(RESULTS_CSV, result_rows)
    write_csv(COMPARISON_CSV, summaries)
    print(json.dumps({"gate_used": gate_name, "accepted_rate": summaries[2]["recommendation_accept_rate"], "violation_rate_accepted": summaries[2]["violation_rate_among_accepted"]}, indent=2))


if __name__ == "__main__":
    main()
