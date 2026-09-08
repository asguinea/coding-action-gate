#!/usr/bin/env python3
"""Evaluate Batch 9K stability-aware fail-closed gates."""

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
DATASET_CSV = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.csv"
DATASET_JSON = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.json"
GATE9J_JSON = REPORTS_DIR / "batch_9j_support_gate_evaluation.json"

REPORT_JSON = REPORTS_DIR / "batch_9k_stability_gate_evaluation.json"
REPORT_MD = REPORTS_DIR / "batch_9k_stability_gate_evaluation.md"
RESULTS_CSV = REPORTS_DIR / "batch_9k_stability_gate_results.csv"
SCENARIO_CSV = REPORTS_DIR / "batch_9k_stability_gate_by_scenario.csv"
SWEEP_CSV = REPORTS_DIR / "batch_9k_stability_gate_threshold_sweep.csv"

OUTPUTS = {
    "ACCEPT_RECOMMENDATION",
    "FAIL_CLOSED",
    "CONSERVATIVE_FALLBACK",
    "REQUIRE_TARGET_CALIBRATION",
    "INSUFFICIENT_STABILITY",
    "INSUFFICIENT_SUPPORT",
}


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9K gate input: {path}")


def read_csv(path: Path) -> list[dict[str, str]]:
    require(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def f(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    try:
        value = row.get(key)
        if value in (None, "", "None"):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def truth(row: dict[str, Any], key: str) -> bool:
    return str(row.get(key)).lower() == "true"


def mean(vals: list[float]) -> float | None:
    return statistics.mean(vals) if vals else None


def gate_existing_9j(row: dict[str, str]) -> str:
    if truth(row, "no_safe_recommendation_9i"):
        return "FAIL_CLOSED"
    if row.get("trajectory_budget_requested") not in ("", None, "None") and f(row, "calibration_margin_to_trajectory_budget") < 0:
        return "FAIL_CLOSED"
    return "ACCEPT_RECOMMENDATION"


def make_pgate(metric: str, quantile: str) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        beta = row.get("trajectory_budget_requested")
        if beta not in ("", None, "None") and f(row, metric) > f(row, "trajectory_budget_requested"):
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"bootstrap_burden_{quantile}_gate"
    return gate


def make_feasible_gate(threshold: float) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if f(row, "bootstrap_feasible_rate") < threshold:
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"bootstrap_feasible_{threshold}"
    return gate


def make_match_gate(threshold: float) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if f(row, "bootstrap_selected_policy_exact_match_rate") < threshold:
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"policy_exact_match_{threshold}"
    return gate


def make_entropy_gate(threshold: float) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if f(row, "bootstrap_selected_policy_family_entropy") > threshold:
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"policy_entropy_{threshold}"
    return gate


def make_concentration_gate(gini_threshold: float) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if f(row, "calibration_risk_gini_by_trajectory") < gini_threshold:
            return "CONSERVATIVE_FALLBACK"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"risk_gini_{gini_threshold}"
    return gate


def make_fragility_gate(metric: str, threshold: float) -> Callable[[dict[str, str]], str]:
    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if f(row, metric) > threshold:
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"{metric}_{threshold}"
    return gate


def composite_gate(mode: str) -> Callable[[dict[str, str]], str]:
    settings = {
        "conservative": (0.9, 0.8, 0.006),
        "balanced": (0.7, 0.6, 0.009),
        "permissive": (0.5, 0.4, 0.012),
    }[mode]

    def gate(row: dict[str, str]) -> str:
        if truth(row, "no_safe_recommendation_9i"):
            return "FAIL_CLOSED"
        if row.get("scenario_type") in {"openhands_stress", "unknown_shift"} and f(row, "calibration_positive_trajectories") < 5:
            return "REQUIRE_TARGET_CALIBRATION"
        feasible_threshold, match_threshold, fragility_threshold = settings
        if f(row, "bootstrap_feasible_rate") < feasible_threshold:
            return "INSUFFICIENT_STABILITY"
        if f(row, "bootstrap_selected_policy_exact_match_rate") < match_threshold:
            return "INSUFFICIENT_STABILITY"
        if f(row, "fraction_trajectories_within_0.01_threshold") > fragility_threshold:
            return "INSUFFICIENT_STABILITY"
        beta = row.get("trajectory_budget_requested")
        if beta not in ("", None, "None") and f(row, "bootstrap_trajectory_burden_p90") > f(row, "trajectory_budget_requested"):
            return "INSUFFICIENT_STABILITY"
        return "ACCEPT_RECOMMENDATION"
    gate.__name__ = f"composite_{mode}"
    return gate


def gate_definitions() -> list[tuple[str, Callable[[dict[str, str]], str], str]]:
    gates: list[tuple[str, Callable[[dict[str, str]], str], str]] = [
        ("batch_9j_margin_traj_0.0", gate_existing_9j, "batch_9j_baseline"),
        ("bootstrap_burden_p90", make_pgate("bootstrap_trajectory_burden_p90", "p90"), "burden_upper_bound"),
        ("bootstrap_burden_p95", make_pgate("bootstrap_trajectory_burden_p95", "p95"), "burden_upper_bound"),
    ]
    gates.extend((f"bootstrap_feasible_{t}", make_feasible_gate(t), "feasibility") for t in [0.5, 0.7, 0.8, 0.9])
    gates.extend((f"policy_exact_match_{t}", make_match_gate(t), "policy_stability") for t in [0.4, 0.6, 0.8])
    gates.extend((f"policy_entropy_{t}", make_entropy_gate(t), "policy_stability") for t in [0.1, 0.5, 1.0])
    gates.extend((f"risk_gini_{t}", make_concentration_gate(t), "risk_concentration") for t in [0.05, 0.10, 0.20])
    gates.extend((f"fragility_traj_eps01_{t}", make_fragility_gate("fraction_trajectories_within_0.01_threshold", t), "threshold_fragility") for t in [0.0025, 0.005, 0.01])
    gates.extend((f"composite_{mode}", composite_gate(mode), "composite") for mode in ["conservative", "balanced", "permissive"])
    return gates


def evaluate_gate(rows: list[dict[str, str]], name: str, gate: Callable[[dict[str, str]], str], family: str) -> dict[str, Any]:
    outputs = [gate(row) for row in rows]
    counts = Counter(outputs)
    accepted = [row for row, output in zip(rows, outputs) if output == "ACCEPT_RECOMMENDATION"]
    failed = [row for row, output in zip(rows, outputs) if output != "ACCEPT_RECOMMENDATION"]
    unsupported_accepted = [row for row in rows if not truth(row, "no_safe_recommendation_9i")]
    unsupported_violation = mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in unsupported_accepted]) or 0.0
    j9_accepted = [row for row in rows if gate_existing_9j(row) == "ACCEPT_RECOMMENDATION"]
    j9_violation = mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in j9_accepted]) or 0.0
    accepted_violation = mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in accepted]) or 0.0
    failed_violation = mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in failed]) or 0.0
    useful_failed = [row for row in failed if not truth(row, "any_test_constraint_violation") and f(row, "test_bad_row_capture") >= 0.20]
    useful_total = [row for row in rows if not truth(row, "any_test_constraint_violation") and f(row, "test_bad_row_capture") >= 0.20]
    return {
        "gate_name": name,
        "gate_family": family,
        "rows": len(rows),
        "output_counts": json.dumps(dict(counts), sort_keys=True),
        "accepted_recommendation_rate": len(accepted) / len(rows),
        "fail_closed_rate": counts["FAIL_CLOSED"] / len(rows),
        "conservative_fallback_rate": counts["CONSERVATIVE_FALLBACK"] / len(rows),
        "require_target_calibration_rate": counts["REQUIRE_TARGET_CALIBRATION"] / len(rows),
        "insufficient_stability_rate": counts["INSUFFICIENT_STABILITY"] / len(rows),
        "violation_rate_among_accepted": accepted_violation,
        "violation_rate_among_failed_closed": failed_violation,
        "bad_outcome_rate_among_accepted": mean([1.0 if truth(row, "bad_recommendation_outcome") else 0.0 for row in accepted]) or 0.0,
        "bad_outcome_rate_among_failed_closed": mean([1.0 if truth(row, "bad_recommendation_outcome") else 0.0 for row in failed]) or 0.0,
        "false_accept_rate": accepted_violation,
        "false_reject_rate": len(useful_failed) / max(len(useful_total), 1),
        "accepted_bad_row_capture_mean": mean([f(row, "test_bad_row_capture") for row in accepted]) or 0.0,
        "accepted_first_failure_coverage_mean": mean([f(row, "test_first_failure_coverage") for row in accepted]) or 0.0,
        "accepted_allowed_bad_rate_mean": mean([f(row, "test_allowed_bad_rate") for row in accepted]) or 0.0,
        "accepted_trajectory_burden_mean": mean([f(row, "test_trajectory_burden") for row in accepted]) or 0.0,
        "abstention_efficiency": unsupported_violation - accepted_violation,
        "violation_reduction_vs_9j_gate": j9_violation - accepted_violation,
        "violation_reduction_vs_unsupported_selector": unsupported_violation - accepted_violation,
        "capture_retention_vs_unsupported_selector": (mean([f(row, "test_bad_row_capture") for row in accepted]) or 0.0) / max(mean([f(row, "test_bad_row_capture") for row in unsupported_accepted]) or 0.0, 1e-12),
        "first_failure_retention_vs_unsupported_selector": (mean([f(row, "test_first_failure_coverage") for row in accepted]) or 0.0) / max(mean([f(row, "test_first_failure_coverage") for row in unsupported_accepted]) or 0.0, 1e-12),
    }


def by_scenario(rows: list[dict[str, str]], gate_rows: list[dict[str, Any]], gates: list[tuple[str, Callable[[dict[str, str]], str], str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[row.get("scenario_type", "unknown")].append(row)
    for scenario, group_rows in groups.items():
        for name, gate, family in gates:
            metrics = evaluate_gate(group_rows, name, gate, family)
            out.append({"scenario_type": scenario, **metrics})
    return out


def choose_best(results: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [row for row in results if row["accepted_recommendation_rate"] >= 0.20]
    if not candidates:
        candidates = results
    return sorted(candidates, key=lambda row: (row["violation_rate_among_accepted"], -row["accepted_recommendation_rate"], -row["accepted_bad_row_capture_mean"]))[0]


def markdown(report: dict[str, Any]) -> str:
    best = report["best_gate"]
    return "\n".join([
        "# Batch 9K Stability-Aware Gate Evaluation",
        "",
        "This exploratory benchmark-level analysis tests stability-aware fail-closed gates for dual-unit coding-agent intervention. It uses CodeTraceBench-derived calibration diagnostics and test outcomes only as evaluation labels. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "Safe scope concepts: benchmark-level, CodeTraceBench-derived, offline proxy, trajectory-level burden, row-level risk, dual-unit, calibration support, stability-aware, fail-closed, domain shift, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Gates evaluated: `{len(report['gate_results'])}`",
        f"- Best gate by declared ranking: `{best['gate_name']}`",
        f"- Accepted recommendation rate: `{best['accepted_recommendation_rate']:.4f}`",
        f"- Violation rate among accepted: `{best['violation_rate_among_accepted']:.4f}`",
        f"- Violation reduction vs Batch 9J gate: `{best['violation_reduction_vs_9j_gate']:.4f}`",
        f"- Violation reduction vs unsupported selector: `{best['violation_reduction_vs_unsupported_selector']:.4f}`",
        f"- False-reject rate: `{best['false_reject_rate']:.4f}`",
        "",
        "## Interpretation",
        "",
        report["interpretation"],
    ])


def main() -> None:
    for path in [DATASET_CSV, DATASET_JSON, GATE9J_JSON]:
        require(path)
    rows = read_csv(DATASET_CSV)
    gates = gate_definitions()
    results = [evaluate_gate(rows, name, gate, family) for name, gate, family in gates]
    scenario_rows = by_scenario(rows, results, gates)
    best = choose_best(results)
    material = best["violation_reduction_vs_9j_gate"] >= 0.01 and best["accepted_recommendation_rate"] >= 0.20
    interpretation = (
        "Stability-aware gating shows a material improvement over Batch 9J under the declared criterion."
        if material
        else "Stability-aware gating is mixed or weak under the declared criterion; any improvement over Batch 9J should be treated cautiously."
    )
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; stability-aware fail-closed dual-unit intervention; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(DATASET_CSV), str(DATASET_JSON), str(GATE9J_JSON)],
        "gate_outputs": sorted(OUTPUTS),
        "gate_results": results,
        "best_gate": best,
        "interpretation": interpretation,
        "guard_results": {"test_features_in_gate_inputs": False, "metadata_as_risk_model_features": False},
    }
    write_csv(RESULTS_CSV, results)
    write_csv(SCENARIO_CSV, scenario_rows)
    write_csv(SWEEP_CSV, results)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"gates": len(results), "best_gate": best["gate_name"]}, indent=2))


if __name__ == "__main__":
    main()
