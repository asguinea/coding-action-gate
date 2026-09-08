#!/usr/bin/env python3
"""Synthetic correction comparison for Batch T-4 Option A refinement."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from evaluate_option_a_synthetic import (
    ALPHAS,
    DELTAS,
    QUANTILES,
    SCENARIOS,
    evaluate_threshold_table,
    generate_split,
)
from option_a_first_event_calibration import (
    build_calibration_table,
    build_threshold_grid,
    evaluate_selected_threshold,
    option_a_select_threshold,
)

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T4_option_A_correction_synthetic.json"
OUT_MD = REPORTS / "batch_T4_option_A_correction_synthetic.md"
OUT_CSV = REPORTS / "batch_T4_option_A_correction_synthetic.csv"

CORRECTIONS = [
    "hoeffding_union_bound",
    "clopper_pearson_union",
    "plus_one_empirical_proxy",
    "pointwise_clopper_pearson_no_union",
]
GRID_PROTOCOLS = [
    "calibration_score_quantiles",
    "predeclared_quantile_grid",
    "fixed_score_threshold_grid",
]
FIXED_THRESHOLDS = [0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.975, 0.99]


def threshold_grid(protocol: str, cal_rows: list[dict[str, Any]]) -> list[float]:
    if protocol in {"calibration_score_quantiles", "predeclared_quantile_grid"}:
        return build_threshold_grid([row["score"] for row in cal_rows], QUANTILES)
    if protocol == "fixed_score_threshold_grid":
        return FIXED_THRESHOLDS
    raise ValueError(f"unknown grid protocol: {protocol}")


def run() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seeds = [20250621, 20250622, 20250623]
    for scenario in SCENARIOS:
        for seed in seeds:
            cal_rows, cal_ff = generate_split(scenario, seed, 220)
            test_rows, test_ff = generate_split(scenario, seed + 999, 220, shifted=scenario == "calibration_test_shift")
            for protocol in GRID_PROTOCOLS:
                grid = threshold_grid(protocol, cal_rows)
                cal_table = build_calibration_table(cal_rows, cal_ff, grid)
                test_table = evaluate_threshold_table(test_rows, test_ff, grid)
                for correction in CORRECTIONS:
                    for alpha in ALPHAS:
                        for delta in DELTAS:
                            selected = option_a_select_threshold(cal_table, alpha, delta, grid, correction_name=correction)
                            row: dict[str, Any] = {
                                "scenario": scenario,
                                "seed": seed,
                                "grid_protocol": protocol,
                                "correction_name": correction,
                                "alpha": alpha,
                                "delta": delta,
                                "no_safe": selected["no_safe"],
                                "feasible_count": selected["feasible_count"],
                                "M": selected["M"],
                                "n_calibration": selected["n_calibration"],
                                "selection_split": "calibration",
                                "evaluation_split": "test",
                                "test_tuning": False,
                                "is_empirical_proxy": correction in {"plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"},
                                "is_uniform_over_grid": correction in {"hoeffding_union_bound", "clopper_pearson_union"},
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
                                    "conservatism_gap": selected["selected_calibration_upper_bound"] - selected["selected_calibration_miss_rate"],
                                    "calibration_to_test_miss_gap": test_eval["selected_test_miss_rate"] - selected["selected_calibration_miss_rate"],
                                })
                            results.append(row)
    summary: dict[str, Any] = {}
    groups = defaultdict(list)
    for row in results:
        groups[(row["correction_name"], row["grid_protocol"])].append(row)
    for (correction, protocol), group in sorted(groups.items()):
        feasible = [row for row in group if not row["no_safe"]]
        summary[f"{correction}::{protocol}"] = {
            "rows": len(group),
            "no_safe_rate": sum(1 for row in group if row["no_safe"]) / len(group),
            "mean_test_miss_rate_feasible": mean([row["selected_test_miss_rate"] for row in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([row["selected_test_burden"] for row in feasible]) if feasible else None,
            "mean_false_alarm_rate_feasible": mean([row["selected_test_false_alarm_rate"] for row in feasible]) if feasible else None,
            "test_alpha_success_rate_feasible": mean([1.0 if row["test_miss_le_alpha"] else 0.0 for row in feasible]) if feasible else None,
            "mean_conservatism_gap_feasible": mean([row["conservatism_gap"] for row in feasible]) if feasible else None,
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
    uniform = {k: v for k, v in summary.items() if k.startswith("hoeffding_union_bound") or k.startswith("clopper_pearson_union")}
    best_uniform_key = min(
        uniform,
        key=lambda key: (
            uniform[key]["no_safe_rate"],
            uniform[key]["mean_test_burden_feasible"] if uniform[key]["mean_test_burden_feasible"] is not None else 9.0,
        ),
    )
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "correction refinement; theory candidate; trajectory-level loss; first-event; missed first failure; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "scenarios": SCENARIOS,
        "corrections": CORRECTIONS,
        "grid_protocols": GRID_PROTOCOLS,
        "summary": summary,
        "best_uniform_synthetic": {"key": best_uniform_key, **uniform[best_uniform_key]},
        "result_rows": len(results),
        "guard_results": {"raw_text_used": False, "test_tuning": False, "mock_data_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, results)
    lines = [
        "# Batch T-4 Option A Correction Synthetic Comparison",
        "",
        report["claim_boundary"],
        "",
        f"- Result rows: `{len(results)}`",
        f"- Best uniform synthetic combination: `{best_uniform_key}`",
        "",
        "| Correction/Grid | No-safe rate | Mean test miss feasible | Mean burden feasible | Alpha success feasible |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for key, values in summary.items():
        lines.append(f"| {key} | {values['no_safe_rate']:.3f} | {values['mean_test_miss_rate_feasible']} | {values['mean_test_burden_feasible']} | {values['test_alpha_success_rate_feasible']} |")
    lines.extend([
        "",
        "Tighter corrections are evaluated as correction refinement for a theory candidate. The shift scenario remains an offline proxy stress case and no formal conformal guarantee claimed.",
    ])
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(json.dumps({"rows": len(results), "best_uniform": best_uniform_key}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
