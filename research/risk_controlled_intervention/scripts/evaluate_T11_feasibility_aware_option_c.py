#!/usr/bin/env python3
"""Batch T-11 Part D: feasibility-aware Option C no-safe classification."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from statistics import mean

from t11_feasibility_utils import REPORTS, fbool, ffloat, read_csv, write_csv, write_json

OUT_JSON = REPORTS / "batch_T11_feasibility_aware_option_c.json"
OUT_MD = REPORTS / "batch_T11_feasibility_aware_option_c.md"
OUT_CSV = REPORTS / "batch_T11_feasibility_aware_option_c.csv"
OUT_REASONS = REPORTS / "batch_T11_no_safe_reason_breakdown.csv"


def main() -> None:
    optc = read_csv(REPORTS / "batch_T10_option_C_trajectory_score_policy.csv")
    structural = read_csv(REPORTS / "batch_T11_structural_feasibility_map.csv")
    taxonomy = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    s_by = {(r["split_seed"], float(r["alpha"]), float(r["beta"])): r for r in structural}
    tax_by = {(float(r["alpha"]), float(r["beta"])): r for r in taxonomy}
    rows = []
    for row in optc:
        if row["correction"] != "clopper_pearson_union":
            continue
        alpha = float(row["alpha"])
        beta = float(row["beta"])
        s = s_by.get((row["split_seed"], alpha, beta))
        tax = tax_by[(alpha, beta)]
        structurally_feasible = fbool(s["structurally_feasible_calibration"]) if s else True
        if not structurally_feasible:
            no_safe = True
            reason = "structurally_infeasible_by_prevalence_bound"
        elif not fbool(row["no_safe"]):
            no_safe = False
            reason = "selected_corrected_feasible_policy"
        elif tax["classification"] == "learned_empirical_feasible_but_correction_blocked":
            no_safe = True
            reason = "empirical_feasible_but_correction_blocked"
        elif tax["classification"] == "oracle_feasible_but_learned_uncorrected_infeasible":
            no_safe = True
            reason = "oracle_feasible_but_score_or_policy_limited"
        elif tax["classification"] == "structurally_possible_but_oracle_infeasible":
            no_safe = True
            reason = "structurally_possible_but_oracle_infeasible"
        else:
            no_safe = True
            reason = "no_empirical_feasible_policy"
        rows.append({
            **row,
            "feasibility_aware_no_safe": no_safe,
            "no_safe_reason": reason,
            "structurally_feasible_calibration": structurally_feasible,
            "B_min_calibration": s.get("B_min_calibration") if s else None,
            "excess_burden_allowance_calibration": s.get("excess_burden_allowance_calibration") if s else None,
        })
    reasons = Counter(r["no_safe_reason"] for r in rows)
    selected = [r for r in rows if not r["feasibility_aware_no_safe"]]
    no_safe = [r for r in rows if r["feasibility_aware_no_safe"]]
    reason_rows = [{"no_safe_reason": k, "count": v, "rate": v / len(rows)} for k, v in sorted(reasons.items())]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-11",
        "rows": len(rows),
        "no_safe_rate": len(no_safe) / len(rows) if rows else 0.0,
        "selected_policy_count": len(selected),
        "no_safe_reason_distribution": dict(reasons),
        "interpretability_rate": sum(1 for r in no_safe if r["no_safe_reason"] != "unknown") / len(no_safe) if no_safe else 1.0,
        "mean_selected_test_miss_rate": mean(ffloat(r["selected_test_missed_first_failure_rate"]) for r in selected) if selected else None,
        "mean_selected_test_burden": mean(ffloat(r["selected_test_trajectory_burden"]) for r in selected) if selected else None,
        "joint_success_among_selected": sum(fbool(r["joint_alpha_beta_success"]) for r in selected) / len(selected) if selected else None,
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    write_csv(OUT_REASONS, reason_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-11 Feasibility-Aware Option C",
        "",
        "This feasibility-aware Option C layer classifies no_safe_recommendation outcomes using the structural lower bound, oracle feasible region, learned feasible region, and finite-grid correction status. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Rows: `{len(rows)}`",
        f"- no_safe rate: `{payload['no_safe_rate']:.4f}`",
        f"- Selected policy count: `{len(selected)}`",
        f"- Interpretability rate among no_safe rows: `{payload['interpretability_rate']:.4f}`",
        "",
        "## Reason Breakdown",
        "",
        *[f"- {r['no_safe_reason']}: `{r['count']}` (`{r['rate']:.4f}`)" for r in reason_rows],
    ]) + "\n")
    print(json.dumps({"rows": len(rows), "no_safe_rate": payload["no_safe_rate"], "reasons": dict(reasons)}, indent=2))


if __name__ == "__main__":
    main()
