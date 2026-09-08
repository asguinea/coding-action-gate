#!/usr/bin/env python3
"""Batch T-12 oracle gap analysis with structural bound."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

from t11_feasibility_utils import REPORTS, fbool, ffloat, read_csv, write_csv, write_json

OUT_JSON = REPORTS / "batch_T12_oracle_gap_structural_analysis.json"
OUT_MD = REPORTS / "batch_T12_oracle_gap_structural_analysis.md"
OUT_CSV = REPORTS / "batch_T12_oracle_gap_structural_analysis.csv"


def main() -> None:
    structural = read_csv(REPORTS / "batch_T12_alpha_beta_feasibility_map.csv")
    taxonomy = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    t_by = {(float(r["alpha"]), float(r["beta"])): r for r in taxonomy}
    rows = []
    for row in structural:
        alpha = float(row["alpha"])
        beta = float(row["beta"])
        tax = t_by[(alpha, beta)]
        empirical_struct = ffloat(row["empirical_structural_no_safe_rate"]) > 0.5
        certified_struct = ffloat(row["certified_structural_no_safe_rate"]) > 0.5
        if certified_struct:
            cls = "structurally_certified_impossible"
        elif empirical_struct:
            cls = "structurally_likely_impossible"
        elif tax["classification"] == "structurally_possible_but_oracle_infeasible":
            cls = "structurally_possible_but_oracle_infeasible"
        elif tax["classification"] == "oracle_feasible_but_learned_uncorrected_infeasible":
            cls = "oracle_feasible_but_learned_score_or_policy_limited"
        elif tax["classification"] == "learned_empirical_feasible_but_correction_blocked":
            cls = "learned_empirical_feasible_but_correction_blocked"
        elif tax["classification"].startswith("learned_corrected_feasible"):
            cls = "learned_corrected_feasible"
        else:
            cls = tax["classification"]
        rows.append({
            "alpha": alpha,
            "beta": beta,
            "classification": cls,
            "empirical_structural_no_safe_rate": row["empirical_structural_no_safe_rate"],
            "certified_structural_no_safe_rate": row["certified_structural_no_safe_rate"],
            "t11_taxonomy_classification": tax["classification"],
            "oracle_feasible": tax["oracle_feasible"],
            "learned_empirical_feasible_rate": tax["learned_empirical_feasible_rate"],
            "learned_corrected_feasible_rate": tax["learned_corrected_feasible_rate"],
        })
    counts = Counter(r["classification"] for r in rows)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-12",
        "rows": len(rows),
        "classification_counts": dict(counts),
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-12 Oracle Gap Structural Analysis",
        "",
        "This analysis compares the structural lower bound, oracle feasible region, learned feasible region, and corrected feasible set for first-event trajectory-level loss. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        *[f"- {k}: `{v}`" for k, v in sorted(counts.items())],
    ]) + "\n")
    print(json.dumps(dict(counts), indent=2))


if __name__ == "__main__":
    main()
