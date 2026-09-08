#!/usr/bin/env python3
"""Generate Batch T-16 figure data from existing evaluation artifacts."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from t16_evaluation_utils import FIGURES, REPORTS, claim_boundary, ffloat, read_csv, read_json, write_csv, write_json, write_md

SUMMARY_JSON = REPORTS / "batch_T16_finalized_figures_summary.json"
SUMMARY_MD = REPORTS / "batch_T16_finalized_figures_summary.md"


def main() -> None:
    t12 = read_json(REPORTS / "batch_T12_feasibility_aware_real_data.json")
    t12_map = read_csv(REPORTS / "batch_T12_alpha_beta_feasibility_map.csv")
    t12_reasons = read_csv(REPORTS / "batch_T12_no_safe_reason_breakdown.csv")
    t11_tax = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    t10a = read_csv(REPORTS / "batch_T10_option_A_trajectory_score_policy.csv")
    t10c = read_csv(REPORTS / "batch_T10_option_C_trajectory_score_policy.csv")

    outputs = []

    heatmap_rows = []
    taxonomy_by_cell = {(r["alpha"], r["beta"]): r for r in t11_tax}
    for row in t12_map:
        tax = taxonomy_by_cell.get((row["alpha"], row["beta"]), {})
        heatmap_rows.append({
            "alpha": row["alpha"],
            "beta": row["beta"],
            "structural_status": "structural_no_safe" if ffloat(row["empirical_structural_no_safe_rate"], 0) else "structurally_possible",
            "oracle_status": tax.get("oracle_feasible", ""),
            "learned_empirical_status": tax.get("learned_empirical_feasible_rate", ""),
            "correction_status": tax.get("classification", ""),
            "learned_corrected_feasible_status": tax.get("learned_corrected_feasible_rate", ""),
        })
    write_csv(FIGURES / "fig_T16_alpha_beta_feasibility_heatmap.csv", heatmap_rows)
    outputs.append({"name": "fig_T16_alpha_beta_feasibility_heatmap.csv", "rows": len(heatmap_rows)})

    write_csv(FIGURES / "fig_T16_no_safe_reason_distribution.csv", t12_reasons)
    outputs.append({"name": "fig_T16_no_safe_reason_distribution.csv", "rows": len(t12_reasons)})

    alphas = sorted({ffloat(r["alpha"], 0.0) for r in t12_map})
    p_hat = t12.get("p_hat_mean") or 0.0
    p_lcb = t12.get("p_lcb_mean") or 0.0
    structural_curve = [{
        "alpha": a,
        "required_minimum_burden": max(0.0, p_hat - a),
        "certified_required_minimum_burden": max(0.0, p_lcb - a),
    } for a in alphas]
    write_csv(FIGURES / "fig_T16_structural_bound_curve.csv", structural_curve)
    outputs.append({"name": "fig_T16_structural_bound_curve.csv", "rows": len(structural_curve)})

    flow = {
        "requested_alpha_beta": "user-specified missed first failure alpha and trajectory burden beta",
        "structural_check": "if alpha + beta < LCB(p_F), return structural NO_SAFE_RECOMMENDATION",
        "corrected_feasible_set": "otherwise find lambda with U_miss(lambda) <= alpha and U_burden(lambda) <= beta",
        "policy_or_no_safe": "select feasible policy or return diagnostic NO_SAFE_RECOMMENDATION",
        "claim_boundary": claim_boundary(),
    }
    write_json(FIGURES / "fig_T16_method_flow.json", flow)
    outputs.append({"name": "fig_T16_method_flow.json", "rows": 1})

    counts = Counter(r["classification"] for r in t11_tax)
    stack_rows = [{"category": k, "count": v} for k, v in sorted(counts.items())]
    write_csv(FIGURES / "fig_T16_oracle_gap_stack.csv", stack_rows)
    outputs.append({"name": "fig_T16_oracle_gap_stack.csv", "rows": len(stack_rows)})

    tradeoff_rows = []
    for row in t10a:
        if row.get("correction") == "clopper_pearson_union" and row.get("delta") == "0.1":
            tradeoff_rows.append({
                "method": "Option A",
                "alpha": row.get("alpha"),
                "beta": "",
                "miss": row.get("selected_test_missed_first_failure_rate"),
                "burden": row.get("selected_test_trajectory_burden"),
                "no_safe": row.get("no_safe"),
                "selected_rate": "row-level selected/not-selected",
            })
    for row in t10c:
        if row.get("correction") == "clopper_pearson_union" and row.get("delta") == "0.1":
            tradeoff_rows.append({
                "method": "Option C",
                "alpha": row.get("alpha"),
                "beta": row.get("beta"),
                "miss": row.get("selected_test_missed_first_failure_rate"),
                "burden": row.get("selected_test_trajectory_burden"),
                "no_safe": row.get("no_safe"),
                "selected_rate": "row-level selected/not-selected",
            })
    write_csv(FIGURES / "fig_T16_option_A_C_tradeoff.csv", tradeoff_rows)
    outputs.append({"name": "fig_T16_option_A_C_tradeoff.csv", "rows": len(tradeoff_rows)})

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-16",
        "figure_data": outputs,
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
    }
    write_json(SUMMARY_JSON, payload)
    write_md(
        SUMMARY_MD,
        "Batch T-16 Finalized Figures Summary",
        [
            "Generated figure data for the empirical evaluation package.",
            "These are benchmark-level offline proxy artifacts, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        ],
        outputs,
        ["name", "rows"],
    )
    print({"figure_data": len(outputs), "output": str(SUMMARY_JSON)})


if __name__ == "__main__":
    main()
