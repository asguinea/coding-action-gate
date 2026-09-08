#!/usr/bin/env python3
"""Synthetic evaluation for Option C dual-constraint calibration."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from evaluate_option_a_synthetic import (
    DELTAS,
    QUANTILES,
    evaluate_threshold_table,
    generate_split,
)
from option_a_first_event_calibration import build_calibration_table, build_threshold_grid
from option_c_dual_constraint_calibration import evaluate_option_c_threshold, option_c_select_threshold

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T5_option_C_synthetic_results.json"
OUT_MD = REPORTS / "batch_T5_option_C_synthetic_results.md"
OUT_CSV = REPORTS / "batch_T5_option_C_synthetic_results.csv"

SCENARIOS = [
    "easy_concentrated_failures",
    "diffuse_failures",
    "early_failures",
    "late_failures",
    "noisy_scores",
    "length_confounded_scores",
    "calibration_test_shift",
    "infeasible_low_burden_high_coverage",
    "feasible_moderate_burden",
    "impossible_alpha_beta_conflict",
]
SCENARIO_MAP = {
    "infeasible_low_burden_high_coverage": "diffuse_failures",
    "feasible_moderate_burden": "easy_concentrated_failures",
    "impossible_alpha_beta_conflict": "infeasible_low_alpha",
}
ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
CORRECTIONS = ["clopper_pearson_union", "hoeffding_union_bound", "plus_one_empirical_proxy"]


def synth_split(scenario: str, seed: int, n: int, shifted: bool = False):
    mapped = SCENARIO_MAP.get(scenario, scenario)
    return generate_split(mapped, seed, n, shifted=shifted or scenario == "calibration_test_shift")


def run() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    seeds = [20250621, 20250622, 20250623]
    for scenario in SCENARIOS:
        for seed in seeds:
            cal_rows, cal_ff = synth_split(scenario, seed, 220)
            test_rows, test_ff = synth_split(scenario, seed + 999, 220, shifted=scenario == "calibration_test_shift")
            grid = build_threshold_grid([row["score"] for row in cal_rows], QUANTILES)
            cal_table = build_calibration_table(cal_rows, cal_ff, grid)
            test_table = evaluate_threshold_table(test_rows, test_ff, grid)
            for correction in CORRECTIONS:
                for alpha in ALPHAS:
                    for beta in BETAS:
                        for delta in DELTAS:
                            selected = option_c_select_threshold(cal_table, alpha, beta, delta, grid, correction=correction)
                            out: dict[str, Any] = {
                                "scenario": scenario,
                                "seed": seed,
                                "correction_name": correction,
                                "grid_protocol": "calibration_score_quantiles",
                                "alpha": alpha,
                                "beta": beta,
                                "delta": delta,
                                "no_safe": selected["no_safe"],
                                "feasible_count": selected["feasible_count"],
                                "M": selected["M"],
                                "n_calibration": selected["n_calibration"],
                                "selection_split": "calibration",
                                "evaluation_split": "test",
                                "test_tuning": False,
                                "is_empirical_proxy": correction == "plus_one_empirical_proxy",
                            }
                            if not selected["no_safe"]:
                                test_eval = evaluate_option_c_threshold(test_table, selected["selected_threshold"])
                                out.update({
                                    "selected_threshold": selected["selected_threshold"],
                                    "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                                    "calibration_burden": selected["selected_calibration_burden"],
                                    "calibration_miss_upper": selected["selected_calibration_miss_upper"],
                                    "calibration_burden_upper": selected["selected_calibration_burden_upper"],
                                    "calibration_pre_failure_coverage": selected["selected_calibration_pre_failure_coverage"],
                                    "calibration_false_alarm_rate": selected["selected_calibration_false_alarm_rate"],
                                    **test_eval,
                                    "test_alpha_success": test_eval["selected_test_miss_rate"] <= alpha,
                                    "test_beta_success": test_eval["selected_test_burden"] <= beta,
                                    "test_joint_success": test_eval["selected_test_miss_rate"] <= alpha and test_eval["selected_test_burden"] <= beta,
                                    "conservatism_gap_miss": selected["selected_calibration_miss_upper"] - selected["selected_calibration_miss_rate"],
                                    "conservatism_gap_burden": selected["selected_calibration_burden_upper"] - selected["selected_calibration_burden"],
                                })
                            rows.append(out)
    summary = aggregate(rows, ["correction_name", "scenario"])
    return rows, summary


def aggregate(rows: list[dict[str, Any]], keys: list[str]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[k] for k in keys)].append(row)
    out = []
    for vals, group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        feasible = [r for r in group if not r["no_safe"]]
        item = {k: v for k, v in zip(keys, vals)}
        item.update({
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"]) / len(group),
            "mean_test_miss_rate_feasible": mean([r["selected_test_miss_rate"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["selected_test_burden"] for r in feasible]) if feasible else None,
            "joint_success_rate_feasible": mean([1.0 if r["test_joint_success"] else 0.0 for r in feasible]) if feasible else None,
        })
        out.append(item)
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows, summary = run()
    cp = [r for r in summary if r["correction_name"] == "clopper_pearson_union"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "dual-constraint feasible set; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "scenarios": SCENARIOS,
        "alphas": ALPHAS,
        "betas": BETAS,
        "deltas": DELTAS,
        "corrections": CORRECTIONS,
        "summary": summary,
        "clopper_pearson_mean_no_safe_rate": mean([r["no_safe_rate"] for r in cp]) if cp else None,
        "result_rows": len(rows),
        "guard_results": {"test_tuning": False, "raw_text_used": False, "mock_data_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, rows)
    lines = [
        "# Batch T-5 Option C Synthetic Results",
        "",
        report["claim_boundary"],
        "",
        f"- Result rows: `{len(rows)}`",
        f"- Clopper-Pearson mean no-safe rate across scenarios: `{report['clopper_pearson_mean_no_safe_rate']}`",
        "",
        "| Correction | Scenario | No-safe rate | Mean miss feasible | Mean burden feasible | Joint success feasible |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for item in summary:
        lines.append(f"| {item['correction_name']} | {item['scenario']} | {item['no_safe_rate']:.3f} | {item['mean_test_miss_rate_feasible']} | {item['mean_test_burden_feasible']} | {item['joint_success_rate_feasible']} |")
    lines.extend([
        "",
        "Option C should return no_safe_recommendation when alpha and beta conflict. These synthetic results are offline proxy checks for a theory candidate, not production validation.",
    ])
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(json.dumps({"rows": len(rows), "cp_mean_no_safe": report["clopper_pearson_mean_no_safe_rate"]}, indent=2))


if __name__ == "__main__":
    main()
