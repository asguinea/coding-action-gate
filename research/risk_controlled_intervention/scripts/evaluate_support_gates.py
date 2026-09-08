#!/usr/bin/env python3
"""Evaluate support-aware fail-closed gates for Batch 9J."""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DATASET_CSV = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.csv"
DATASET_JSON = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.json"

REPORT_JSON = REPORTS_DIR / "batch_9j_support_gate_evaluation.json"
REPORT_MD = REPORTS_DIR / "batch_9j_support_gate_evaluation.md"
RESULTS_CSV = REPORTS_DIR / "batch_9j_support_gate_results.csv"
BY_SCENARIO_CSV = REPORTS_DIR / "batch_9j_support_gate_by_scenario.csv"
SWEEP_CSV = REPORTS_DIR / "batch_9j_support_gate_threshold_sweep.csv"

ACCEPT = "ACCEPT_RECOMMENDATION"
FAIL = "FAIL_CLOSED"
FALLBACK = "CONSERVATIVE_FALLBACK"
REQUIRE_TARGET = "REQUIRE_TARGET_CALIBRATION"
INSUFFICIENT = "INSUFFICIENT_SUPPORT"
GATE_OUTPUTS = [ACCEPT, FAIL, FALLBACK, REQUIRE_TARGET, INSUFFICIENT]


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9J gate input: {path}")


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


def existing_9i_gate(row: dict[str, Any]) -> str:
    return FAIL if b(row, "no_safe_recommendation_9i") else ACCEPT


def minimum_support_gate(pos_rows: int, pos_traj: int, cal_traj: int) -> Callable[[dict[str, Any]], str]:
    def gate(row: dict[str, Any]) -> str:
        if f(row, "calibration_trajectories") < cal_traj:
            return INSUFFICIENT
        if f(row, "calibration_positive_rows") < pos_rows or f(row, "calibration_positive_trajectories") < pos_traj:
            return INSUFFICIENT
        if f(row, "feasible_policy_count") <= 0:
            return FAIL
        return ACCEPT
    return gate


def margin_gate(row_margin: float, traj_margin: float, alpha_margin: float = -math.inf) -> Callable[[dict[str, Any]], str]:
    def gate(row: dict[str, Any]) -> str:
        if b(row, "no_safe_recommendation_9i"):
            return FAIL
        rb = row.get("row_budget_requested")
        tb = row.get("trajectory_budget_requested")
        if rb not in (None, "", "None") and f(row, "calibration_margin_to_row_budget", -1.0) < row_margin:
            return FAIL
        if tb not in (None, "", "None") and f(row, "calibration_margin_to_trajectory_budget", -1.0) < traj_margin:
            return FAIL
        if row.get("alpha_requested") not in (None, "", "None") and f(row, "calibration_margin_to_alpha", -1.0) < alpha_margin:
            return FAIL
        return ACCEPT
    return gate


def feasibility_gate(feasible_min: int, pareto_min: int, rank_max: int) -> Callable[[dict[str, Any]], str]:
    def gate(row: dict[str, Any]) -> str:
        if f(row, "feasible_policy_count") < feasible_min:
            return FAIL
        if f(row, "pareto_policy_count") < pareto_min:
            return FAIL
        rank = f(row, "selected_policy_rank_on_calibration", rank_max + 1)
        if rank > rank_max:
            return FAIL
        return ACCEPT
    return gate


def shift_gate(row: dict[str, Any]) -> str:
    if b(row, "no_safe_recommendation_9i"):
        return FAIL
    scenario = str(row.get("scenario_type", "unknown"))
    if scenario in {"openhands_stress", "unknown_shift", "framework_shift"}:
        if f(row, "calibration_positive_trajectories") < 10:
            return REQUIRE_TARGET
        return FALLBACK
    return ACCEPT


def combined_gate(row: dict[str, Any]) -> str:
    if b(row, "no_safe_recommendation_9i"):
        return FAIL
    if f(row, "calibration_positive_rows") < 50 or f(row, "calibration_positive_trajectories") < 10:
        return INSUFFICIENT
    if f(row, "pareto_policy_count") < 10:
        return FAIL
    if row.get("trajectory_budget_requested") not in (None, "", "None") and f(row, "calibration_margin_to_trajectory_budget", -1.0) < 0.02:
        return FAIL
    if row.get("scenario_type") in {"openhands_stress", "unknown_shift"}:
        return REQUIRE_TARGET
    return ACCEPT


def outcome_bad(row: dict[str, Any]) -> bool:
    return b(row, "bad_recommendation_outcome")


def violation(row: dict[str, Any]) -> bool:
    return b(row, "any_test_constraint_violation")


def useful(row: dict[str, Any]) -> bool:
    return f(row, "test_bad_row_capture") >= 0.10 or f(row, "test_first_failure_coverage") >= 0.10


def evaluate_gate(rows: list[dict[str, Any]], name: str, gate: Callable[[dict[str, Any]], str], params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    outputs = [gate(row) for row in rows]
    accepted = [row for row, out in zip(rows, outputs) if out == ACCEPT]
    failed = [row for row, out in zip(rows, outputs) if out != ACCEPT]
    bad_acc = [row for row in accepted if outcome_bad(row)]
    bad_fail = [row for row in failed if outcome_bad(row)]
    viol_acc = [row for row in accepted if violation(row)]
    viol_fail = [row for row in failed if violation(row)]
    false_reject = [row for row in failed if (not violation(row)) and useful(row)]
    nums = lambda vals, key: [f(row, key) for row in vals if row.get(key) not in (None, "", "None")]
    baseline_violation = sum(1 for row in rows if violation(row)) / len(rows) if rows else None
    accepted_violation = len(viol_acc) / len(accepted) if accepted else None
    return {
        "gate_name": name,
        **params,
        "rows": len(rows),
        "accepted_recommendation_rate": len(accepted) / len(rows) if rows else None,
        "fail_closed_rate": len(failed) / len(rows) if rows else None,
        "output_counts": dict(Counter(outputs)),
        "violation_rate_among_accepted": accepted_violation,
        "violation_rate_among_failed_closed": len(viol_fail) / len(failed) if failed else None,
        "bad_outcome_rate_among_accepted": len(bad_acc) / len(accepted) if accepted else None,
        "bad_outcome_rate_among_failed_closed": len(bad_fail) / len(failed) if failed else None,
        "capture_retained_among_accepted": statistics.mean(nums(accepted, "test_bad_row_capture")) if accepted else None,
        "first_failure_retained_among_accepted": statistics.mean(nums(accepted, "test_first_failure_coverage")) if accepted else None,
        "mean_accepted_bad_row_capture": statistics.mean(nums(accepted, "test_bad_row_capture")) if accepted else None,
        "mean_accepted_first_failure_coverage": statistics.mean(nums(accepted, "test_first_failure_coverage")) if accepted else None,
        "mean_accepted_trajectory_burden": statistics.mean(nums(accepted, "test_trajectory_burden")) if accepted else None,
        "false_accept_rate": len(viol_acc) / len(accepted) if accepted else None,
        "false_reject_rate": len(false_reject) / len(failed) if failed else None,
        "abstention_efficiency": (baseline_violation - accepted_violation) / (len(failed) / len(rows)) if rows and accepted and failed and baseline_violation is not None and accepted_violation is not None else None,
    }


def gate_suite() -> list[tuple[str, Callable[[dict[str, Any]], str], dict[str, Any]]]:
    gates: list[tuple[str, Callable[[dict[str, Any]], str], dict[str, Any]]] = [("existing_9i_fail_closed", existing_9i_gate, {})]
    for pr in (10, 20, 50, 100):
        for pt in (3, 5, 10, 20):
            gates.append((f"minimum_support_pr{pr}_pt{pt}", minimum_support_gate(pr, pt, 20), {"positive_rows": pr, "positive_trajectories": pt, "calibration_trajectories": 20}))
    for tm in (0.0, 0.01, 0.02, 0.05):
        gates.append((f"margin_traj_{tm}", margin_gate(0.0, tm), {"trajectory_margin": tm}))
    for pareto in (5, 10, 20):
        gates.append((f"feasibility_pareto_{pareto}", feasibility_gate(1, pareto, 50), {"pareto_min": pareto}))
    gates.extend([("shift_aware_gate", shift_gate, {}), ("combined_transparent_gate", combined_gate, {})])
    return gates


def by_scenario(rows: list[dict[str, Any]], best_gate: tuple[str, Callable[[dict[str, Any]], str], dict[str, Any]]) -> list[dict[str, Any]]:
    name, gate, params = best_gate
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("scenario_type", "unknown"))].append(row)
    return [evaluate_gate(vals, name, gate, {"scenario_type": scenario, **params}) for scenario, vals in grouped.items()]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(row.get(key)) if isinstance(row.get(key), dict) else row.get(key) for key in keys})


def markdown(report: dict[str, Any]) -> str:
    best = report["best_gate"]
    return "\n".join([
        "# Batch 9J Support Gate Evaluation",
        "",
        "Exploratory benchmark-level support-gate evaluation on CodeTraceBench-derived trajectories. This offline proxy uses calibration support for fail-closed dual-unit row-level risk and trajectory-level burden decisions; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Gates evaluated: `{len(report['gate_results'])}`",
        f"- Best gate: `{best['gate_name']}`",
        f"- Accepted rate: `{best['accepted_recommendation_rate']}`",
        f"- Violation rate among accepted: `{best['violation_rate_among_accepted']}`",
        f"- Fail-closed rate: `{best['fail_closed_rate']}`",
        f"- False reject rate: `{best['false_reject_rate']}`",
        "",
        "## Interpretation",
        "",
        "- A useful gate should reduce violations among accepted recommendations without abstaining from everything.",
        "- Negative results are retained; fail-closed behavior has a real opportunity cost.",
        "- Learned gates are skipped unless diagnostic support is large enough and separated validation is available.",
    ])


def main() -> None:
    require(DATASET_JSON)
    rows = read_rows()
    gates = gate_suite()
    results = [evaluate_gate(rows, name, gate, params) for name, gate, params in gates]
    # Prefer lower violation among accepted, then lower fail-closed rate, then higher capture.
    viable = [row for row in results if row["violation_rate_among_accepted"] is not None and row["accepted_recommendation_rate"] and row["accepted_recommendation_rate"] > 0.05]
    best = sorted(viable, key=lambda r: (r["violation_rate_among_accepted"], r["fail_closed_rate"], -(r["mean_accepted_bad_row_capture"] or 0)))[0] if viable else results[0]
    gate_lookup = {name: (name, gate, params) for name, gate, params in gates}
    scenario_rows = by_scenario(rows, gate_lookup[best["gate_name"]])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; dual-unit row-level risk and trajectory-level burden; calibration support and fail-closed; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "gate_outputs": GATE_OUTPUTS,
        "gate_results": results,
        "best_gate": best,
        "learned_gate_status": "skipped_interpretable_rules_sufficient_for_current_batch",
        "guard_results": {"test_features_used_as_gate_inputs": False, "raw_text_output": False, "metadata_as_risk_model_features": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(RESULTS_CSV, results)
    write_csv(BY_SCENARIO_CSV, scenario_rows)
    write_csv(SWEEP_CSV, results)
    print(json.dumps({"best_gate": best["gate_name"], "accepted_rate": best["accepted_recommendation_rate"], "violation_rate_accepted": best["violation_rate_among_accepted"]}, indent=2))


if __name__ == "__main__":
    main()
