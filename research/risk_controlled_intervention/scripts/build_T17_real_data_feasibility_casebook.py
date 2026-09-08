#!/usr/bin/env python3
"""Build Batch T-17 real-data feasibility casebook from existing outputs."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from t16_evaluation_utils import REPORTS, claim_boundary, fbool, ffloat, read_csv, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T17_real_data_casebook.json"
OUT_MD = REPORTS / "batch_T17_real_data_casebook.md"
OUT_CSV = REPORTS / "batch_T17_real_data_casebook.csv"


def _base_case(row: dict[str, str], case_type: str, case_id: str) -> dict[str, object]:
    alpha = ffloat(row.get("alpha"), 0.0) or 0.0
    beta = ffloat(row.get("beta"), 0.0) or 0.0
    p_hat = ffloat(row.get("p_hat"), 0.0) or 0.0
    p_lcb = ffloat(row.get("p_lcb"), 0.0) or 0.0
    return {
        "case_id": case_id,
        "case_type": case_type,
        "split_seed": row.get("split_seed", ""),
        "alpha": alpha,
        "beta": beta,
        "delta": row.get("delta", ""),
        "p_hat_F": p_hat,
        "p_lcb": p_lcb,
        "alpha_plus_beta": alpha + beta,
        "empirical_required_burden": max(0.0, p_hat - alpha),
        "certified_required_burden": max(0.0, p_lcb - alpha),
        "excess_burden_empirical": beta - max(0.0, p_hat - alpha),
        "excess_burden_certified": beta - max(0.0, p_lcb - alpha),
        "method_variant": row.get("policy_source", "batch_T12_feasibility_aware"),
        "score_family": row.get("trajectory_score_family", ""),
        "policy_family": row.get("timing_rule", ""),
        "correction_rule": "clopper_pearson_union",
        "grid_protocol": row.get("lambda_grid_protocol", ""),
        "calibration_miss": "not exported in T-12 aggregate row",
        "calibration_burden": "not exported in T-12 aggregate row",
        "miss_upper": "not exported in T-12 aggregate row",
        "burden_upper": "not exported in T-12 aggregate row",
        "test_miss": row.get("selected_test_miss", ""),
        "test_burden": row.get("selected_test_burden", ""),
        "joint_test_success": row.get("selected_test_joint_success", ""),
        "no_safe_reason": row.get("no_safe_reason", ""),
        "benchmark_only_diagnostic_reason": "",
        "recommended_action": "",
        "reviewer_takeaway": "",
    }


def _pick(rows: list[dict[str, str]], predicate, limit: int = 3) -> list[dict[str, str]]:
    out = []
    seen = set()
    for row in rows:
        if not predicate(row):
            continue
        key = (row.get("alpha"), row.get("beta"), row.get("split_seed"), row.get("no_safe_reason"))
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= limit:
            break
    return out


def main() -> None:
    rows = read_csv(REPORTS / "batch_T12_feasibility_aware_real_data.csv")
    taxonomy = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    tax_by_cell = {(r["alpha"], r["beta"]): r for r in taxonomy}

    specs = [
        (
            "structurally_certified_impossible",
            lambda r: r["no_safe_reason"] == "structurally_infeasible_by_first_failure_prevalence" and ffloat(r["alpha"], 1) in {0.05, 0.1},
            "relax alpha or beta",
            "The structural lower bound alone can rule out requested low-burden targets.",
        ),
        (
            "empirically_structural_warning_not_certified",
            lambda r: fbool(r["empirical_structurally_infeasible"]) and not fbool(r["certified_structurally_infeasible"]),
            "collect more calibration data or interpret cautiously",
            "p_hat suggests structural tension, but the LCB does not certify impossibility.",
        ),
        (
            "structurally_possible_but_empirically_infeasible",
            lambda r: not fbool(r["empirical_structurally_infeasible"]) and r["no_safe_reason"] == "empirical_infeasible",
            "improve score/policy family or relax targets",
            "The prevalence bound does not rule out the request, but learned policies did not empirically satisfy both constraints.",
        ),
        (
            "learned_empirical_feasible_but_correction_blocked",
            lambda r: r["no_safe_reason"] == "correction_blocked",
            "increase calibration support, use a tighter valid correction, or shrink the grid",
            "A candidate appears empirically feasible, but finite-grid correction prevents certification.",
        ),
        (
            "learned_corrected_feasible_and_test_successful",
            lambda r: r["no_safe"] == "False" and r.get("selected_test_joint_success") == "True",
            "proceed only under finite-grid assumptions and benchmark-level caveats",
            "Corrected feasible-set selection can return successful policies, but such cases are rare.",
        ),
    ]

    case_rows: list[dict[str, object]] = []
    absence_notes: list[dict[str, str]] = []
    for case_type, pred, action, takeaway in specs:
        picked = _pick(rows, pred, 3)
        if not picked:
            absence_notes.append({"case_type": case_type, "note": "No representative row available in T-12 outputs."})
            continue
        for idx, row in enumerate(picked, 1):
            case = _base_case(row, case_type, f"T17_{case_type}_{idx}")
            case["recommended_action"] = action
            case["reviewer_takeaway"] = takeaway
            tax = tax_by_cell.get((str(case["alpha"]), str(case["beta"])))
            if tax:
                case["benchmark_only_diagnostic_reason"] = tax.get("classification", "")
            case_rows.append(case)

    # Oracle-feasible but learned-limited comes from T-11 taxonomy, with a matching T-12 row where possible.
    oracle_cells = [r for r in taxonomy if r["classification"] == "oracle_feasible_but_learned_uncorrected_infeasible"]
    for idx, tax in enumerate(oracle_cells[:3], 1):
        match = next((r for r in rows if r["alpha"] == tax["alpha"] and r["beta"] == tax["beta"] and r["no_safe_reason"] in {"empirical_infeasible", "correction_blocked"}), None)
        if not match:
            absence_notes.append({"case_type": "oracle_feasible_but_learned_limited", "note": f"No T-12 row matched alpha={tax['alpha']} beta={tax['beta']}."})
            continue
        case = _base_case(match, "oracle_feasible_but_learned_limited", f"T17_oracle_feasible_but_learned_limited_{idx}")
        case["benchmark_only_diagnostic_reason"] = tax["classification"]
        case["recommended_action"] = "improve score/policy family; oracle diagnostics suggest the alpha/beta cell is not structurally impossible"
        case["reviewer_takeaway"] = "The remaining gap is learned score/policy limitation rather than prevalence-bound impossibility."
        case_rows.append(case)

    by_type = defaultdict(int)
    for row in case_rows:
        by_type[str(row["case_type"])] += 1
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-17",
        "rows": len(case_rows),
        "case_type_counts": dict(sorted(by_type.items())),
        "absence_notes": absence_notes,
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
        "cases": case_rows,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, case_rows)
    write_md(
        OUT_MD,
        "Batch T-17 Real-Data Feasibility Casebook",
        [
            "This real-data casebook uses structured CodeTraceBench-derived operating-point behavior only.",
            "It exposes no raw action text, observation text, code, file contents, or trajectory content.",
            "It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
            "",
            "The casebook shows how NO_SAFE_RECOMMENDATION reasons map to concrete alpha/beta operating points.",
            f"- Case rows: `{len(case_rows)}`",
            f"- Absence notes: `{len(absence_notes)}`",
        ],
        case_rows,
        ["case_id", "case_type", "alpha", "beta", "p_hat_F", "p_lcb", "no_safe_reason", "benchmark_only_diagnostic_reason", "recommended_action", "reviewer_takeaway"],
    )
    print({"cases": len(case_rows), "case_types": dict(by_type)})


if __name__ == "__main__":
    main()
