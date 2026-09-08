#!/usr/bin/env python3
"""Synthetic sanity checks for Option A first-event calibration."""

from __future__ import annotations

import csv
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from option_a_first_event_calibration import (
    build_calibration_table,
    build_threshold_grid,
    compute_first_crossing_warning_times,
    compute_trajectory_event_losses,
    evaluate_selected_threshold,
    option_a_select_threshold,
)

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T3_option_A_synthetic_results.json"
OUT_MD = REPORTS / "batch_T3_option_A_synthetic_results.md"
OUT_CSV = REPORTS / "batch_T3_option_A_synthetic_results.csv"

SCENARIOS = [
    "easy_concentrated_failures",
    "diffuse_failures",
    "early_failures",
    "late_failures",
    "noisy_scores",
    "length_confounded_scores",
    "calibration_test_shift",
    "infeasible_low_alpha",
]
ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
DELTAS = [0.10, 0.05]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def generate_split(scenario: str, seed: int, n: int, shifted: bool = False) -> tuple[list[dict[str, Any]], dict[str, float]]:
    rng = random.Random(seed)
    rows = []
    first_failure = {}
    for i in range(n):
        tid = f"{scenario}_{seed}_{i}"
        length = rng.randint(8, 60)
        if scenario == "length_confounded_scores":
            length = rng.randint(20, 90)
        bad_prob = 0.38
        if scenario == "infeasible_low_alpha":
            bad_prob = 0.65
        has_bad = rng.random() < bad_prob
        if not has_bad:
            f = float("inf")
        elif scenario == "early_failures":
            f = rng.randint(1, max(1, min(8, length - 1)))
        elif scenario == "late_failures":
            f = rng.randint(max(1, int(length * 0.65)), length - 1)
        else:
            f = rng.randint(1, length - 1)
        first_failure[tid] = f
        for t in range(length):
            distance = (f - t) if f < float("inf") else 99
            if scenario == "easy_concentrated_failures":
                base = 2.8 - 0.35 * abs(distance)
                noise = rng.gauss(0, 0.35)
            elif scenario == "diffuse_failures":
                base = 1.0 if has_bad else 0.3
                noise = rng.gauss(0, 0.8)
            elif scenario == "noisy_scores":
                base = 1.5 - 0.18 * abs(distance)
                noise = rng.gauss(0, 1.4)
            elif scenario == "length_confounded_scores":
                base = (t / max(1, length)) * 2.0 + (0.8 if has_bad else 0.0)
                noise = rng.gauss(0, 0.7)
            elif scenario == "calibration_test_shift" and shifted:
                base = 0.8 - 0.10 * abs(distance)
                noise = rng.gauss(0, 1.0)
            elif scenario == "infeasible_low_alpha":
                base = 0.5 if has_bad else 0.2
                noise = rng.gauss(0, 1.2)
            else:
                base = 1.8 - 0.22 * abs(distance)
                noise = rng.gauss(0, 0.7)
            score = sigmoid(base + noise)
            rows.append({"trajectory_id": tid, "row_index": t, "score": score})
    return rows, first_failure


def evaluate_threshold_table(score_rows: list[dict[str, Any]], first_failure: dict[str, float], threshold_grid: list[float]) -> list[dict[str, Any]]:
    table = []
    for order, threshold in enumerate(threshold_grid):
        warnings = compute_first_crossing_warning_times(score_rows, threshold)
        metrics = compute_trajectory_event_losses(warnings, first_failure)
        table.append({
            "threshold": threshold,
            "threshold_order": order,
            "empirical_miss_rate": metrics["miss_rate"],
            "empirical_burden": metrics["trajectory_burden"],
            "empirical_false_alarm_rate": metrics["false_alarm_rate"],
            "empirical_pre_failure_coverage": metrics["pre_failure_coverage"],
            "n_risk": metrics["bad_trajectory_count"],
            **metrics,
        })
    return table


def run() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    results = []
    seeds = [20250621, 20250622, 20250623]
    for scenario in SCENARIOS:
        for seed in seeds:
            cal_rows, cal_ff = generate_split(scenario, seed, 220)
            test_rows, test_ff = generate_split(scenario, seed + 999, 220, shifted=scenario == "calibration_test_shift")
            grid = build_threshold_grid([row["score"] for row in cal_rows], QUANTILES)
            cal_table = build_calibration_table(cal_rows, cal_ff, grid)
            test_table = evaluate_threshold_table(test_rows, test_ff, grid)
            for alpha in ALPHAS:
                for delta in DELTAS:
                    selected = option_a_select_threshold(cal_table, alpha, delta, grid)
                    row = {
                        "scenario": scenario,
                        "seed": seed,
                        "alpha": alpha,
                        "delta": delta,
                        "no_safe": selected["no_safe"],
                        "feasible_count": selected["feasible_count"],
                        "M": selected["M"],
                        "n_calibration": selected["n_calibration"],
                        "selection_split": "calibration",
                        "evaluation_split": "test",
                        "test_tuning": False,
                    }
                    if not selected["no_safe"]:
                        test_eval = evaluate_selected_threshold(test_table, selected["selected_threshold"])
                        row.update({
                            "selected_threshold": selected["selected_threshold"],
                            "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                            "calibration_upper_bound": selected["selected_calibration_upper_bound"],
                            "calibration_burden": selected["selected_calibration_burden"],
                            "calibration_false_alarm_rate": selected["selected_calibration_false_alarm_rate"],
                            "calibration_pre_failure_coverage": selected["selected_calibration_pre_failure_coverage"],
                            **test_eval,
                            "test_miss_le_alpha": test_eval["selected_test_miss_rate"] <= alpha,
                            "calibration_to_test_miss_gap": test_eval["selected_test_miss_rate"] - selected["selected_calibration_miss_rate"],
                        })
                    results.append(row)
    summary = {}
    for scenario in SCENARIOS:
        subset = [r for r in results if r["scenario"] == scenario]
        feasible = [r for r in subset if not r["no_safe"]]
        summary[scenario] = {
            "rows": len(subset),
            "no_safe_rate": sum(1 for r in subset if r["no_safe"]) / len(subset),
            "mean_test_miss_rate_feasible": mean([r["selected_test_miss_rate"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["selected_test_burden"] for r in feasible]) if feasible else None,
            "test_alpha_success_rate_feasible": mean([1.0 if r["test_miss_le_alpha"] else 0.0 for r in feasible]) if feasible else None,
        }
    return results, summary


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    results, summary = run()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "empirical prototype; theory candidate; trajectory-level loss; first-event; missed first failure; Hoeffding union-bound correction; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "scenarios": SCENARIOS,
        "alphas": ALPHAS,
        "deltas": DELTAS,
        "summary": summary,
        "result_rows": len(results),
        "guard_results": {"raw_text_used": False, "test_tuning": False, "mock_data_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, results)
    lines = [
        "# Batch T-3 Option A Synthetic Results",
        "",
        report["claim_boundary"],
        "",
        "## Summary",
        "",
        "| Scenario | No-safe rate | Mean test miss feasible | Mean burden feasible | Alpha success feasible |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for scenario, values in summary.items():
        lines.append(f"| {scenario} | {values['no_safe_rate']:.3f} | {values['mean_test_miss_rate_feasible']} | {values['mean_test_burden_feasible']} | {values['test_alpha_success_rate_feasible']} |")
    lines.extend([
        "",
        "The synthetic sanity checks are intended to test behavior under known scenario design. They are not production validation, and no formal conformal guarantee claimed.",
    ])
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(json.dumps({"rows": len(results), "scenarios": len(SCENARIOS)}, indent=2))


if __name__ == "__main__":
    main()
