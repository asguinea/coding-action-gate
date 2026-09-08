#!/usr/bin/env python3
"""Generate Batch T-17 synthetic theorem-demonstration figure data."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from t16_evaluation_utils import FIGURES, REPORTS, claim_boundary, fbool, ffloat, read_csv, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T17_synthetic_figure_data_summary.json"
OUT_MD = REPORTS / "batch_T17_synthetic_figure_data_summary.md"


def main() -> None:
    rows = read_csv(REPORTS / "batch_T17_synthetic_theorem_demo.csv")
    boundary = []
    reason_rows = []
    selected_rows = []
    shift_rows = []

    for row in rows:
        true_p = ffloat(row["true_p_F"], 0.0) or 0.0
        p_hat = ffloat(row["p_hat_F"], 0.0) or 0.0
        p_lcb = ffloat(row["p_lcb"], 0.0) or 0.0
        alpha = ffloat(row["alpha"], 0.0) or 0.0
        beta = ffloat(row["beta"], 0.0) or 0.0
        boundary.append({
            "scenario": row["scenario"],
            "alpha": alpha,
            "true_p_F": true_p,
            "p_hat_F": p_hat,
            "p_lcb": p_lcb,
            "minimum_burden_true": max(0.0, true_p - alpha),
            "minimum_burden_lcb": max(0.0, p_lcb - alpha),
            "beta": beta,
            "structural_status": "true_impossible" if alpha + beta < true_p else "true_possible",
        })

    by_scenario_reason = defaultdict(Counter)
    by_scenario_cell = defaultdict(list)
    shift_by_scenario = defaultdict(list)
    for row in rows:
        by_scenario_reason[row["scenario"]][row["no_safe_reason"]] += 1
        key = (row["scenario"], row["alpha"], row["beta"])
        by_scenario_cell[key].append(row)
        if ffloat(row["shift_level"], 0.0):
            shift_by_scenario[row["scenario"]].append(row)
    for scenario, counter in by_scenario_reason.items():
        total = sum(counter.values())
        for reason, count in sorted(counter.items()):
            reason_rows.append({"scenario": scenario, "no_safe_reason": reason, "count": count, "rate": count / total if total else 0.0})
    for (scenario, alpha, beta), cell in by_scenario_cell.items():
        selected = [r for r in cell if not fbool(r["no_safe"])]
        selected_rows.append({
            "scenario": scenario,
            "alpha": alpha,
            "beta": beta,
            "selected_rate": len(selected) / len(cell),
            "joint_success_rate": sum(fbool(r["joint_test_success"]) for r in selected) / len(selected) if selected else "",
            "mean_test_miss": sum(ffloat(r["selected_test_miss"], 0.0) or 0.0 for r in selected) / len(selected) if selected else "",
            "mean_test_burden": sum(ffloat(r["selected_test_burden"], 0.0) or 0.0 for r in selected) / len(selected) if selected else "",
        })
    for scenario, srows in shift_by_scenario.items():
        selected = [r for r in srows if not fbool(r["no_safe"])]
        shift_rows.append({
            "scenario": scenario,
            "shift_level": srows[0]["shift_level"],
            "alpha_success": sum((ffloat(r["selected_test_miss"], 1.0) or 1.0) <= (ffloat(r["alpha"], 0.0) or 0.0) for r in selected) / len(selected) if selected else "",
            "beta_success": sum((ffloat(r["selected_test_burden"], 1.0) or 1.0) <= (ffloat(r["beta"], 0.0) or 0.0) for r in selected) / len(selected) if selected else "",
            "joint_success": sum(fbool(r["joint_test_success"]) for r in selected) / len(selected) if selected else "",
            "calibration_test_gap": "assumption_violation_scenario",
        })

    outputs = [
        ("fig_T17_synthetic_structural_boundary.csv", boundary),
        ("fig_T17_synthetic_no_safe_reasons.csv", reason_rows),
        ("fig_T17_synthetic_selected_policy_success.csv", selected_rows),
        ("fig_T17_synthetic_shift_failure.csv", shift_rows),
    ]
    for name, data in outputs:
        write_csv(FIGURES / name, data)
    summary = [{"name": name, "rows": len(data)} for name, data in outputs]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-17",
        "outputs": summary,
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
    }
    write_json(OUT_JSON, payload)
    write_md(
        OUT_MD,
        "Batch T-17 Synthetic Figure Data Summary",
        [
            "Generated figure-ready data for synthetic theorem demonstration.",
            "These are synthetic offline proxy artifacts, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        ],
        summary,
        ["name", "rows"],
    )
    print({"outputs": len(outputs)})


if __name__ == "__main__":
    main()
