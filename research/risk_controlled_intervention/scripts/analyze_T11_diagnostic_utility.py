#!/usr/bin/env python3
"""Batch T-11 Part E: diagnostic utility of feasibility-aware taxonomy."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

from t11_feasibility_utils import REPORTS, read_csv, write_csv, write_json

OUT_JSON = REPORTS / "batch_T11_diagnostic_utility.json"
OUT_MD = REPORTS / "batch_T11_diagnostic_utility.md"
OUT_CSV = REPORTS / "batch_T11_diagnostic_recommendations.csv"


ACTION = {
    "structurally_impossible": "relax alpha, relax beta, or accept that the request is impossible by prevalence lower bound",
    "structurally_possible_but_oracle_infeasible": "review timing convention and oracle assumptions before model work",
    "oracle_feasible_but_learned_uncorrected_infeasible": "improve score/model or policy family",
    "learned_empirical_feasible_but_correction_blocked": "collect more calibration trajectories, tighten correction, or shrink grid",
    "learned_corrected_feasible": "proceed only as calibrated policy under stated assumptions",
    "learned_corrected_feasible_and_test_successful": "candidate calibrated policy under assumptions; still benchmark-level offline proxy",
}


def main() -> None:
    taxonomy = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    rows = []
    for row in taxonomy:
        classification = row["classification"]
        rows.append({
            "alpha": row["alpha"],
            "beta": row["beta"],
            "classification": classification,
            "recommended_action": ACTION[classification],
            "distinguishes_impossible_from_model_work": classification == "structurally_impossible",
            "distinguishes_correction_from_policy_limit": classification == "learned_empirical_feasible_but_correction_blocked",
        })
    counts = Counter(row["recommended_action"] for row in rows)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-11",
        "recommendation_rows": len(rows),
        "action_counts": dict(counts),
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-11 Diagnostic Utility",
        "",
        "This feasibility-aware diagnostic utility maps alpha/beta cells to recommended actions. It distinguishes structural lower bound failures from score/policy limits and finite-grid correction limits. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        *[f"- {action}: `{count}`" for action, count in sorted(counts.items())],
    ]) + "\n")
    print(json.dumps(dict(counts), indent=2))


if __name__ == "__main__":
    main()
