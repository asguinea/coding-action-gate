#!/usr/bin/env python3
"""Evaluate Option C with Batch T-7 clean threshold grids."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from option_c_dual_constraint_calibration import option_c_select_threshold
from theory_clean_grid_utils import build_threshold_table, evaluate_threshold_table, load_grids, load_scores, split_rows_for_protocol, write_csv

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T7_option_C_clean_grid_results.json"
OUT_MD = REPORTS / "batch_T7_option_C_clean_grid_results.md"
OUT_CSV = REPORTS / "batch_T7_option_C_clean_grid_results.csv"
HEATMAP = REPORTS / "batch_T7_option_C_clean_grid_heatmap.csv"
BY_SCORE = REPORTS / "batch_T7_option_C_clean_grid_by_score.csv"
T5 = REPORTS / "batch_T5_option_C_assessment.json"
ORACLE = REPORTS / "batch_T6_option_C_oracle_feasible_region.json"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
DELTAS = [0.10, 0.05]
CORRECTIONS = ["clopper_pearson_union", "hoeffding_union_bound", "plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"]


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
            "feasible_rate": len(feasible) / len(group),
            "mean_test_miss_rate_feasible": mean([r["test_missed_first_failure_rate"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["test_trajectory_burden"] for r in feasible]) if feasible else None,
            "mean_first_failure_coverage_feasible": mean([r["test_first_failure_coverage"] for r in feasible]) if feasible else None,
            "mean_pre_failure_coverage_feasible": mean([r["test_pre_failure_warning_coverage"] for r in feasible]) if feasible else None,
            "joint_success_rate_feasible": mean([1.0 if r["test_joint_success"] else 0.0 for r in feasible]) if feasible else None,
        })
        out.append(item)
    return out


def run() -> list[dict[str, Any]]:
    scores = load_scores()
    grids = load_grids()["grids"]
    by_key = defaultdict(list)
    for row in scores:
        by_key[(int(row["split_seed"]), row["score_family"])].append(row)
    outputs = []
    for grid in grids:
        seed = int(grid["split_seed"])
        family = grid["score_family"]
        protocol = grid["grid_protocol"]
        thresholds = [float(t) for t in grid["thresholds"]]
        rows = by_key[(seed, family)]
        cal_rows = split_rows_for_protocol(rows, protocol, "calibration")
        test_rows = split_rows_for_protocol(rows, protocol, "test")
        cal_table = build_threshold_table(cal_rows, thresholds)
        test_table = evaluate_threshold_table(test_rows, thresholds)
        test_by_threshold = {row["threshold"]: row for row in test_table}
        for correction in CORRECTIONS:
            for alpha in ALPHAS:
                for beta in BETAS:
                    for delta in DELTAS:
                        selected = option_c_select_threshold(cal_table, alpha, beta, delta, thresholds, correction=correction)
                        out = {
                            "split_seed": seed,
                            "score_family": family,
                            "grid_protocol": protocol,
                            "correction_name": correction,
                            "alpha": alpha,
                            "beta": beta,
                            "delta": delta,
                            "no_safe": selected["no_safe"],
                            "feasible_count": selected["feasible_count"],
                            "M": selected["M"],
                            "selection_split": "calibration",
                            "evaluation_split": "test",
                            "test_tuning": False,
                            "theorem_compatibility": grid["theorem_compatibility"],
                        }
                        if not selected["no_safe"]:
                            ev = test_by_threshold[selected["selected_threshold"]]
                            test_miss = ev["test_missed_first_failure_rate"]
                            test_burden = ev["test_trajectory_burden"]
                            out.update({
                                "selected_threshold": selected["selected_threshold"],
                                "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                                "calibration_burden": selected["selected_calibration_burden"],
                                "calibration_miss_upper": selected["selected_calibration_miss_upper"],
                                "calibration_burden_upper": selected["selected_calibration_burden_upper"],
                                "test_missed_first_failure_rate": test_miss,
                                "test_trajectory_burden": test_burden,
                                "test_first_failure_coverage": ev["test_first_failure_coverage"],
                                "test_pre_failure_warning_coverage": ev["test_pre_failure_warning_coverage"],
                                "test_false_alarm_trajectory_rate": ev["test_false_alarm_trajectory_rate"],
                                "test_row_deferral_rate": ev["test_row_deferral_rate"],
                                "test_alpha_success": test_miss <= alpha,
                                "test_beta_success": test_burden <= beta,
                                "test_joint_success": test_miss <= alpha and test_burden <= beta,
                            })
                        outputs.append(out)
    return outputs


def main() -> None:
    outputs = run()
    by_corr = aggregate(outputs, ["correction_name", "grid_protocol"])
    by_score = aggregate(outputs, ["correction_name", "grid_protocol", "score_family"])
    heatmap = aggregate([r for r in outputs if r["correction_name"] == "clopper_pearson_union"], ["grid_protocol", "alpha", "beta"])
    t5 = json.loads(T5.read_text())["key_numbers"] if T5.exists() else {}
    oracle = json.loads(ORACLE.read_text()) if ORACLE.exists() else {}
    default = [r for r in by_corr if r["correction_name"] == "clopper_pearson_union"]
    best = min(default, key=lambda r: (r["no_safe_rate"], r["mean_test_burden_feasible"] if r["mean_test_burden_feasible"] is not None else 9.0))
    feasible_cells = sum(1 for r in heatmap if r["feasible_rate"] > 0)
    realistic_cells = sum(1 for r in heatmap if r["feasible_rate"] > 0.05 and (r["joint_success_rate_feasible"] or 0) >= 0.9)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "row-level score artifacts; clean-grid evaluation; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "result_rows": len(outputs),
        "summary_by_correction_grid": by_corr,
        "best_default": best,
        "feasible_alpha_beta_cells": feasible_cells,
        "realistic_feasible_cells": realistic_cells,
        "oracle_analytic_feasible_cells": oracle.get("analytic_feasible_cells"),
        "t5_reference": t5,
        "no_safe_reduction_vs_T5": (t5.get("real_best_no_safe_rate") - best["no_safe_rate"]) if t5 else None,
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, outputs)
    write_csv(HEATMAP, heatmap)
    write_csv(BY_SCORE, by_score)
    OUT_MD.write_text("\n".join([
        "# Batch T-7 Option C Clean-Grid Results",
        "",
        report["claim_boundary"],
        "",
        f"- Result rows: `{len(outputs)}`",
        f"- Best default correction/grid: `{best['correction_name']} / {best['grid_protocol']}`",
        f"- No-safe rate: `{best['no_safe_rate']}`",
        f"- Feasible alpha/beta cells: `{feasible_cells}`",
        f"- Realistic feasible cells: `{realistic_cells}`",
        f"- Joint success feasible: `{best['joint_success_rate_feasible']}`",
    ]) + "\n")
    print(json.dumps({"rows": len(outputs), "best": best, "feasible_cells": feasible_cells}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
