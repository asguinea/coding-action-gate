#!/usr/bin/env python3
"""Generate Batch T-17 real-data casebook visual data."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from t16_evaluation_utils import FIGURES, REPORTS, claim_boundary, read_json, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T17_casebook_visual_data_summary.json"
OUT_MD = REPORTS / "batch_T17_casebook_visual_data_summary.md"


def main() -> None:
    casebook = read_json(REPORTS / "batch_T17_real_data_casebook.json")
    cases = casebook["cases"]

    point_rows = []
    flow = []
    counts: dict[str, list[str]] = defaultdict(list)
    for case in cases:
        case_id = case["case_id"]
        counts[case["case_type"]].append(case_id)
        point_rows.append({
            "case_id": case_id,
            "case_type": case["case_type"],
            "alpha": case["alpha"],
            "beta": case["beta"],
            "p_hat_F": case["p_hat_F"],
            "p_lcb": case["p_lcb"],
            "structural_boundary_empirical": case["p_hat_F"] - case["alpha"],
            "structural_boundary_certified": case["p_lcb"] - case["alpha"],
            "status": case["no_safe_reason"] or "selected",
        })
        flow.append({
            "case_id": case_id,
            "requested_alpha_beta": {"alpha": case["alpha"], "beta": case["beta"]},
            "structural_check_result": case["case_type"],
            "corrected_feasible_set_result": "selected" if case["joint_test_success"] else case["no_safe_reason"],
            "selected_or_no_safe_output": "selected_policy" if case["joint_test_success"] else "NO_SAFE_RECOMMENDATION",
            "reason": case["no_safe_reason"] or "selected_corrected_feasible_policy",
            "recommended_action": case["recommended_action"],
        })
    taxonomy_rows = [
        {
            "case_type": case_type,
            "count": len(ids),
            "available_in_real_data": True,
            "representative_case_ids": ";".join(ids),
        }
        for case_type, ids in sorted(counts.items())
    ]

    write_csv(FIGURES / "fig_T17_casebook_alpha_beta_points.csv", point_rows)
    write_json(FIGURES / "fig_T17_casebook_no_safe_flow.json", {"cases": flow, "claim_boundary": claim_boundary()})
    write_csv(FIGURES / "fig_T17_casebook_taxonomy_counts.csv", taxonomy_rows)

    outputs = [
        {"name": "fig_T17_casebook_alpha_beta_points.csv", "rows": len(point_rows)},
        {"name": "fig_T17_casebook_no_safe_flow.json", "rows": len(flow)},
        {"name": "fig_T17_casebook_taxonomy_counts.csv", "rows": len(taxonomy_rows)},
    ]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-17",
        "outputs": outputs,
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
    }
    write_json(OUT_JSON, payload)
    write_md(
        OUT_MD,
        "Batch T-17 Casebook Visual Data Summary",
        [
            "Generated figure-ready data for the real-data casebook.",
            "These are benchmark-level offline proxy artifacts, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        ],
        outputs,
        ["name", "rows"],
    )
    print({"outputs": len(outputs), "cases": len(cases)})


if __name__ == "__main__":
    main()
