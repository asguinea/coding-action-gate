#!/usr/bin/env python3
"""Batch T-11 Part B: empirical structural feasibility map."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from statistics import mean

from t11_feasibility_utils import (
    ALPHAS,
    BETAS,
    REPORTS,
    feature_prevalence_by_split,
    is_structurally_feasible,
    structural_bound,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T11_structural_feasibility_map.json"
OUT_MD = REPORTS / "batch_T11_structural_feasibility_map.md"
OUT_CSV = REPORTS / "batch_T11_structural_feasibility_map.csv"
OUT_HEAT = REPORTS / "batch_T11_structural_feasibility_heatmap.csv"


def main() -> None:
    prev = feature_prevalence_by_split()
    seeds = sorted({seed for seed, _ in prev})
    rows = []
    for seed in seeds:
        cal = prev[(seed, "calibration")]
        test = prev[(seed, "test")]
        for alpha in ALPHAS:
            b_min_cal = structural_bound(cal["p_F"], alpha)
            b_min_test = structural_bound(test["p_F"], alpha)
            for beta in BETAS:
                rows.append({
                    "split_seed": seed,
                    "alpha": alpha,
                    "beta": beta,
                    "p_F_calibration": cal["p_F"],
                    "p_F_test": test["p_F"],
                    "p_F_gap_test_minus_calibration": test["p_F"] - cal["p_F"],
                    "B_min_calibration": b_min_cal,
                    "B_min_test": b_min_test,
                    "structurally_feasible_calibration": is_structurally_feasible(cal["p_F"], alpha, beta),
                    "structurally_feasible_test": is_structurally_feasible(test["p_F"], alpha, beta),
                    "excess_burden_allowance_calibration": beta - b_min_cal,
                    "excess_burden_allowance_test": beta - b_min_test,
                })
    heat = []
    for alpha in ALPHAS:
        for beta in BETAS:
            cell = [r for r in rows if r["alpha"] == alpha and r["beta"] == beta]
            heat.append({
                "alpha": alpha,
                "beta": beta,
                "calibration_structural_infeasible_rate": sum(not r["structurally_feasible_calibration"] for r in cell) / len(cell),
                "test_structural_infeasible_rate": sum(not r["structurally_feasible_test"] for r in cell) / len(cell),
                "mean_excess_burden_allowance_calibration": mean(r["excess_burden_allowance_calibration"] for r in cell),
                "mean_p_F_calibration": mean(r["p_F_calibration"] for r in cell),
                "mean_p_F_test": mean(r["p_F_test"] for r in cell),
            })
    impossible_rate = sum(not r["structurally_feasible_calibration"] for r in rows) / len(rows)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-11",
        "row_count": len(rows),
        "heatmap_rows": len(heat),
        "mean_p_F_calibration": mean(r["p_F_calibration"] for r in rows),
        "mean_p_F_test": mean(r["p_F_test"] for r in rows),
        "mean_abs_p_F_gap": mean(abs(r["p_F_gap_test_minus_calibration"]) for r in rows),
        "structural_infeasible_rate_calibration": impossible_rate,
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    write_csv(OUT_HEAT, heat)
    OUT_MD.write_text("\n".join([
        "# Batch T-11 Structural Feasibility Map",
        "",
        "This feasibility-aware map applies the structural lower bound for first-event trajectory-level loss: beta must be at least max(0, p_F - alpha). It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Rows: `{len(rows)}`",
        f"- Mean calibration p_F: `{payload['mean_p_F_calibration']:.4f}`",
        f"- Mean test p_F: `{payload['mean_p_F_test']:.4f}`",
        f"- Mean absolute p_F gap: `{payload['mean_abs_p_F_gap']:.4f}`",
        f"- Calibration structural infeasible rate: `{impossible_rate:.4f}`",
        "",
        "Cells with alpha + beta below p_F are structurally impossible for any policy that must warn or touch a trajectory to cover a missed first failure.",
    ]) + "\n")
    print(json.dumps({"rows": len(rows), "structural_infeasible_rate": impossible_rate}, indent=2))


if __name__ == "__main__":
    main()
