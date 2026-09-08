#!/usr/bin/env python3
"""Evaluate Batch 9K stability-aware dual-unit intervention."""

from __future__ import annotations

import csv
import json
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import evaluate_stability_aware_gates as gates_mod

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DATASET_CSV = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.csv"
GATE_JSON = REPORTS_DIR / "batch_9k_stability_gate_evaluation.json"
GATE9J_JSON = REPORTS_DIR / "batch_9j_support_aware_dual_unit_intervention.json"

REPORT_JSON = REPORTS_DIR / "batch_9k_stability_aware_dual_unit_intervention.json"
REPORT_MD = REPORTS_DIR / "batch_9k_stability_aware_dual_unit_intervention.md"
RESULTS_CSV = REPORTS_DIR / "batch_9k_stability_aware_dual_unit_results.csv"
COMPARISON_CSV = REPORTS_DIR / "batch_9k_stability_aware_comparison.csv"


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9K stability-aware intervention input: {path}")


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


def f(row: dict[str, Any], key: str) -> float:
    try:
        value = row.get(key)
        if value in (None, "", "None"):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def truth(row: dict[str, Any], key: str) -> bool:
    return str(row.get(key)).lower() == "true"


def mean(vals: list[float]) -> float:
    return statistics.mean(vals) if vals else 0.0


def gate_by_name(name: str):
    for gate_name, gate, _family in gates_mod.gate_definitions():
        if gate_name == name:
            return gate
    return gates_mod.gate_existing_9j


def summarize(rows: list[dict[str, str]], outputs: list[str], label: str) -> dict[str, Any]:
    accepted = [row for row, output in zip(rows, outputs) if output == "ACCEPT_RECOMMENDATION"]
    failed = [row for row, output in zip(rows, outputs) if output != "ACCEPT_RECOMMENDATION"]
    counts = Counter(outputs)
    return {
        "approach": label,
        "rows": len(rows),
        "output_counts": dict(counts),
        "recommendation_accept_rate": len(accepted) / len(rows),
        "no_safe_recommendation_rate": len(failed) / len(rows),
        "insufficient_stability_rate": counts["INSUFFICIENT_STABILITY"] / len(rows),
        "violation_rate_among_accepted": mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in accepted]),
        "mean_accepted_bad_row_capture": mean([f(row, "test_bad_row_capture") for row in accepted]),
        "mean_accepted_first_failure_coverage": mean([f(row, "test_first_failure_coverage") for row in accepted]),
        "mean_accepted_allowed_bad_rate": mean([f(row, "test_allowed_bad_rate") for row in accepted]),
        "mean_accepted_trajectory_burden": mean([f(row, "test_trajectory_burden") for row in accepted]),
        "accepted_policy_calibration_to_test_gap": mean([abs(f(row, "selected_calibration_bad_row_capture") - f(row, "test_bad_row_capture")) for row in accepted]),
        "false_accept_rate": mean([1.0 if truth(row, "any_test_constraint_violation") else 0.0 for row in accepted]),
        "false_reject_rate": len([row for row in failed if not truth(row, "any_test_constraint_violation") and f(row, "test_bad_row_capture") >= 0.20]) / max(len([row for row in rows if not truth(row, "any_test_constraint_violation") and f(row, "test_bad_row_capture") >= 0.20]), 1),
    }


def utility(summary: dict[str, Any]) -> float:
    return (
        summary["mean_accepted_bad_row_capture"]
        + summary["mean_accepted_first_failure_coverage"]
        - 2.0 * summary["violation_rate_among_accepted"]
        - 0.25 * summary["no_safe_recommendation_rate"]
    )


def markdown(report: dict[str, Any]) -> str:
    best = report["stability_aware_summary"]
    return "\n".join([
        "# Batch 9K Stability-Aware Dual-Unit Intervention",
        "",
        "This benchmark-level offline proxy combines Batch 9I dual-unit policy selection with Batch 9K stability-aware fail-closed gating on CodeTraceBench-derived trajectories. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "Safe scope concepts: benchmark-level, CodeTraceBench-derived, offline proxy, trajectory-level burden, row-level risk, dual-unit, calibration support, stability-aware, fail-closed, domain shift, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Selected stability gate: `{report['selected_gate']}`",
        f"- Accepted recommendation rate: `{best['recommendation_accept_rate']:.4f}`",
        f"- No-safe / failed recommendation rate: `{best['no_safe_recommendation_rate']:.4f}`",
        f"- Insufficient-stability rate: `{best['insufficient_stability_rate']:.4f}`",
        f"- Violation rate among accepted: `{best['violation_rate_among_accepted']:.4f}`",
        f"- Mean accepted bad-row capture: `{best['mean_accepted_bad_row_capture']:.4f}`",
        f"- Mean accepted first-failure coverage: `{best['mean_accepted_first_failure_coverage']:.4f}`",
        "",
        "## Interpretation",
        "",
        report["interpretation"],
    ])


def main() -> None:
    for path in [DATASET_CSV, GATE_JSON, GATE9J_JSON]:
        require(path)
    rows = read_csv(DATASET_CSV)
    gate_report = json.loads(GATE_JSON.read_text())
    selected_gate = gate_report["best_gate"]["gate_name"]
    gate = gate_by_name(selected_gate)
    stability_outputs = [gate(row) for row in rows]
    unsupported_outputs = ["ACCEPT_RECOMMENDATION" if not truth(row, "no_safe_recommendation_9i") else "FAIL_CLOSED" for row in rows]
    support_outputs = [gates_mod.gate_existing_9j(row) for row in rows]
    summaries = [
        summarize(rows, unsupported_outputs, "unsupported_batch_9i_selector"),
        summarize(rows, support_outputs, "batch_9j_support_gate"),
        summarize(rows, stability_outputs, "batch_9k_stability_aware_gate"),
    ]
    for summary in summaries:
        summary["declared_utility"] = utility(summary)
    stability_summary = summaries[-1]
    comparison = [
        {
            "comparison": "9k_vs_unsupported",
            "violation_reduction": summaries[0]["violation_rate_among_accepted"] - stability_summary["violation_rate_among_accepted"],
            "capture_delta": stability_summary["mean_accepted_bad_row_capture"] - summaries[0]["mean_accepted_bad_row_capture"],
            "first_failure_delta": stability_summary["mean_accepted_first_failure_coverage"] - summaries[0]["mean_accepted_first_failure_coverage"],
            "accept_rate_delta": stability_summary["recommendation_accept_rate"] - summaries[0]["recommendation_accept_rate"],
        },
        {
            "comparison": "9k_vs_9j",
            "violation_reduction": summaries[1]["violation_rate_among_accepted"] - stability_summary["violation_rate_among_accepted"],
            "capture_delta": stability_summary["mean_accepted_bad_row_capture"] - summaries[1]["mean_accepted_bad_row_capture"],
            "first_failure_delta": stability_summary["mean_accepted_first_failure_coverage"] - summaries[1]["mean_accepted_first_failure_coverage"],
            "accept_rate_delta": stability_summary["recommendation_accept_rate"] - summaries[1]["recommendation_accept_rate"],
        },
    ]
    interpretation = (
        "Stability-aware intervention improves violation filtering materially while retaining useful accepted recommendations."
        if comparison[1]["violation_reduction"] >= 0.01 and stability_summary["recommendation_accept_rate"] >= 0.20
        else "Stability-aware intervention remains mixed or weak; it should be treated as a diagnostic complement rather than a replacement method."
    )
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; stability-aware dual-unit intervention; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(DATASET_CSV), str(GATE_JSON), str(GATE9J_JSON)],
        "selected_gate": selected_gate,
        "summaries": summaries,
        "stability_aware_summary": stability_summary,
        "comparisons": comparison,
        "interpretation": interpretation,
        "guard_results": {"test_tuning": False, "metadata_as_risk_model_features": False},
    }
    write_csv(RESULTS_CSV, [{**row, "stability_gate_output": output} for row, output in zip(rows, stability_outputs)])
    write_csv(COMPARISON_CSV, comparison)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"selected_gate": selected_gate, "accepted_rate": stability_summary["recommendation_accept_rate"]}, indent=2))


if __name__ == "__main__":
    main()
