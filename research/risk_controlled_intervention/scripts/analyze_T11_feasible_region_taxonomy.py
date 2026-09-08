#!/usr/bin/env python3
"""Batch T-11 Part C: feasible-region taxonomy."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from t11_feasibility_utils import ALPHAS, BETAS, REPORTS, fbool, ffloat, read_csv, write_csv, write_json

OUT_JSON = REPORTS / "batch_T11_feasible_region_taxonomy.json"
OUT_MD = REPORTS / "batch_T11_feasible_region_taxonomy.md"
OUT_CSV = REPORTS / "batch_T11_feasible_region_taxonomy.csv"
OUT_HEAT = REPORTS / "batch_T11_feasible_region_taxonomy_heatmap.csv"


def main() -> None:
    structural = read_csv(REPORTS / "batch_T11_structural_feasibility_map.csv")
    oracle = read_csv(REPORTS / "batch_T6_option_C_oracle_heatmap.csv")
    policy = read_csv(REPORTS / "batch_T10_trajectory_score_policy_table.csv")
    corrected = read_csv(REPORTS / "batch_T10_option_C_trajectory_score_policy.csv")
    structural_by = defaultdict(list)
    for row in structural:
        structural_by[(float(row["alpha"]), float(row["beta"]))].append(row)
    oracle_by = {
        (float(row["alpha"]), float(row["beta"])): fbool(row["analytic_oracle_feasible"])
        for row in oracle
    }
    empirical_by = defaultdict(list)
    for row in policy:
        for alpha in ALPHAS:
            for beta in BETAS:
                feasible = ffloat(row["calibration_missed_first_failure_rate"]) <= alpha and ffloat(row["calibration_trajectory_burden"]) <= beta
                empirical_by[(alpha, beta)].append(feasible)
    corrected_by = defaultdict(list)
    test_success_by = defaultdict(list)
    for row in corrected:
        if row["correction"] != "clopper_pearson_union":
            continue
        key = (float(row["alpha"]), float(row["beta"]))
        corrected_by[key].append(not fbool(row["no_safe"]))
        if not fbool(row["no_safe"]):
            test_success_by[key].append(fbool(row["joint_alpha_beta_success"]))
    rows = []
    for alpha in ALPHAS:
        for beta in BETAS:
            key = (alpha, beta)
            svals = structural_by[key]
            structural_impossible_rate = sum(not fbool(r["structurally_feasible_calibration"]) for r in svals) / len(svals)
            structural_impossible = structural_impossible_rate >= 0.5
            oracle_feasible = oracle_by.get(key, False)
            empirical_rate = sum(empirical_by[key]) / len(empirical_by[key]) if empirical_by[key] else 0.0
            corrected_rate = sum(corrected_by[key]) / len(corrected_by[key]) if corrected_by[key] else 0.0
            test_success_rate = sum(test_success_by[key]) / len(test_success_by[key]) if test_success_by[key] else 0.0
            if structural_impossible:
                classification = "structurally_impossible"
            elif not oracle_feasible:
                classification = "structurally_possible_but_oracle_infeasible"
            elif empirical_rate <= 0:
                classification = "oracle_feasible_but_learned_uncorrected_infeasible"
            elif corrected_rate <= 0:
                classification = "learned_empirical_feasible_but_correction_blocked"
            elif test_success_rate > 0:
                classification = "learned_corrected_feasible_and_test_successful"
            else:
                classification = "learned_corrected_feasible"
            rows.append({
                "alpha": alpha,
                "beta": beta,
                "classification": classification,
                "structural_impossible_rate": structural_impossible_rate,
                "oracle_feasible": oracle_feasible,
                "learned_empirical_feasible_rate": empirical_rate,
                "learned_corrected_feasible_rate": corrected_rate,
                "test_joint_success_rate_among_corrected": test_success_rate,
            })
    counts = defaultdict(int)
    for row in rows:
        counts[row["classification"]] += 1
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-11",
        "taxonomy_rows": len(rows),
        "classification_counts": dict(counts),
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    write_csv(OUT_HEAT, rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-11 Feasible Region Taxonomy",
        "",
        "This feasibility-aware taxonomy separates structural lower bound failures, oracle feasible region gaps, learned feasible region gaps, and finite-grid correction blocking. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        *[f"- {k}: `{v}`" for k, v in sorted(counts.items())],
        "",
        "The taxonomy shows where no_safe_recommendation reflects impossible requests versus learned score/policy limitations or correction/sample-size limits.",
    ]) + "\n")
    print(json.dumps(dict(counts), indent=2))


if __name__ == "__main__":
    main()
