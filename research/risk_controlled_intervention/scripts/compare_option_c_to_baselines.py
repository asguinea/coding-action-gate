#!/usr/bin/env python3
"""Compare Option C with available prior baseline summaries."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

REPORTS = Path(__file__).resolve().parents[1] / "reports"
T5_REAL = REPORTS / "batch_T5_option_C_real_data_results.json"
T5_CSV = REPORTS / "batch_T5_option_C_real_data_results.csv"
T4_REAL = REPORTS / "batch_T4_option_A_correction_real_data.json"
NINE_N = REPORTS / "batch_9n_first_event_calibration_selectors.json"
NINE_M = REPORTS / "batch_9m_hybrid_failure_onset_intervention.json"
OUT_JSON = REPORTS / "batch_T5_option_C_baseline_comparison.json"
OUT_MD = REPORTS / "batch_T5_option_C_baseline_comparison.md"
OUT_CSV = REPORTS / "batch_T5_option_C_baseline_comparison.csv"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def load(path: Path) -> dict[str, Any]:
    return json.loads(require(path).read_text())


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str) -> float:
    value = row.get(key)
    return float(value) if value not in (None, "") else 0.0


def option_c_band_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    out = []
    for beta in [0.20, 0.30, 0.40, 0.50, 0.80]:
        subset = [
            r for r in rows
            if r["correction_name"] == "clopper_pearson_union"
            and r["grid_protocol"] == "calibration_score_quantiles"
            and r["no_safe"] == "False"
            and abs(float(r["beta"]) - beta) < 1e-9
        ]
        if subset:
            out.append({
                "method": "Option C clopper_pearson_union",
                "matched_beta": beta,
                "rows": len(subset),
                "no_safe_rate": None,
                "missed_first_failure_rate": mean([f(r, "test_missed_first_failure_rate") for r in subset]),
                "trajectory_burden": mean([f(r, "test_trajectory_burden") for r in subset]),
                "joint_constraint_success": mean([1.0 if r["test_joint_success"] == "True" else 0.0 for r in subset]),
                "first_failure_coverage": mean([f(r, "test_first_failure_coverage") for r in subset]),
                "pre_failure_coverage": mean([f(r, "test_pre_failure_warning_coverage") for r in subset]),
                "false_alarm_rate": mean([f(r, "test_false_alarm_trajectory_rate") for r in subset]),
                "lead_time": mean([f(r, "test_mean_lead_time") for r in subset if r.get("test_mean_lead_time") not in (None, "")]) if any(r.get("test_mean_lead_time") not in (None, "") for r in subset) else None,
                "row_deferral": mean([f(r, "test_row_deferral_rate") for r in subset]),
                "interpretation": "dual-constraint feasible selections only",
            })
    return out


def main() -> None:
    t5 = load(T5_REAL)
    t4 = load(T4_REAL)
    rows = read_csv(T5_CSV)
    comparison = option_c_band_rows(rows)
    best = t5["best_default_correction_grid"]
    comparison.append({
        "method": "Option C aggregate default",
        "matched_beta": "all",
        "rows": best["rows"],
        "no_safe_rate": best["no_safe_rate"],
        "missed_first_failure_rate": best["mean_test_miss_rate_feasible"],
        "trajectory_burden": best["mean_test_burden_feasible"],
        "joint_constraint_success": best["joint_success_rate_feasible"],
        "first_failure_coverage": best["mean_first_failure_coverage_feasible"],
        "pre_failure_coverage": best["mean_pre_failure_coverage_feasible"],
        "false_alarm_rate": None,
        "lead_time": None,
        "row_deferral": None,
        "interpretation": "default correction/grid aggregate",
    })
    option_a = t4["best_uniform_correction_grid"]
    comparison.append({
        "method": "Option A refined clopper_pearson_union",
        "matched_beta": "none",
        "rows": option_a["rows"],
        "no_safe_rate": option_a["no_safe_rate"],
        "missed_first_failure_rate": option_a["mean_test_miss_rate_feasible"],
        "trajectory_burden": option_a["mean_test_burden_feasible"],
        "joint_constraint_success": None,
        "first_failure_coverage": None,
        "pre_failure_coverage": None,
        "false_alarm_rate": None,
        "lead_time": None,
        "row_deferral": None,
        "interpretation": "miss-risk control only; burden optimized but not constrained",
    })
    optional_inputs = {}
    if NINE_N.exists():
        optional_inputs["batch_9n_first_event_selectors"] = load(NINE_N).get("aggregate_results", [])
    if NINE_M.exists():
        optional_inputs["batch_9m_hybrid_intervention"] = load(NINE_M).get("summary", {})
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "dual-constraint feasible set; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "comparison_rows": len(comparison),
        "comparison": comparison,
        "optional_prior_baseline_summaries_loaded": sorted(optional_inputs),
        "fair_interpretation": "Option C primarily adds corrected burden feasibility and no_safe_recommendation behavior; it does not automatically improve raw first-failure coverage.",
        "guard_results": {"test_tuning": False, "raw_text_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    fields = sorted({k for row in comparison for k in row})
    with OUT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(comparison)
    OUT_MD.write_text("\n".join([
        "# Batch T-5 Option C Baseline Comparison",
        "",
        report["claim_boundary"],
        "",
        f"- Comparison rows: `{len(comparison)}`",
        f"- Interpretation: {report['fair_interpretation']}",
        "",
        "Option C reduces high-burden feasible selections by returning no_safe_recommendation under many beta settings. This is a feasibility characterization rather than a claim that low-burden intervention is solved.",
    ]) + "\n")
    print(json.dumps({"comparison_rows": len(comparison)}, indent=2))


if __name__ == "__main__":
    main()
