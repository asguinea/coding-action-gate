#!/usr/bin/env python3
"""Generate Batch T-16 finalized evaluation tables from existing artifacts."""

from __future__ import annotations

from datetime import datetime, timezone

from t16_evaluation_utils import (
    DATASET_SUMMARY,
    REPORTS,
    TABLES,
    claim_boundary,
    fbool,
    ffloat,
    md_table,
    read_csv,
    read_json,
    safe_mean,
    write_csv,
    write_json,
    write_md,
)

SUMMARY_JSON = REPORTS / "batch_T16_finalized_tables_summary.json"
SUMMARY_MD = REPORTS / "batch_T16_finalized_tables_summary.md"


def write_table(name: str, rows: list[dict], columns: list[str]) -> dict:
    csv_path = TABLES / f"{name}.csv"
    md_path = TABLES / f"{name}.md"
    write_csv(csv_path, rows, columns)
    write_md(md_path, name, ["Generated from existing T-16 source artifacts."], rows, columns)
    return {"name": name, "rows": len(rows), "csv": str(csv_path), "md": str(md_path)}


def main() -> None:
    t12 = read_json(REPORTS / "batch_T12_feasibility_aware_real_data.json")
    t12_map = read_csv(REPORTS / "batch_T12_alpha_beta_feasibility_map.csv")
    t12_reasons = read_csv(REPORTS / "batch_T12_no_safe_reason_breakdown.csv")
    t12_rows = read_csv(REPORTS / "batch_T12_feasibility_aware_real_data.csv")
    t11_tax = read_csv(REPORTS / "batch_T11_feasible_region_taxonomy.csv")
    t6_oracle = read_csv(REPORTS / "batch_T6_option_C_oracle_heatmap.csv")
    t5_base = read_csv(REPORTS / "batch_T5_option_C_baseline_comparison.csv", optional=True)
    t3_base = read_csv(REPORTS / "batch_T3_option_A_baseline_comparison.csv", optional=True)
    t9 = read_json(REPORTS / "batch_T9_trajectory_scoring_results.json")
    t10a = read_json(REPORTS / "batch_T10_option_A_trajectory_score_policy.json")
    t10c = read_json(REPORTS / "batch_T10_option_C_trajectory_score_policy.json")

    p_f = DATASET_SUMMARY["first_failure_trajectories"] / DATASET_SUMMARY["parsed_with_prefix_examples"]
    tables = []

    dataset_rows = [
        {"metric": "trajectories", "value": DATASET_SUMMARY["parsed_with_prefix_examples"], "caveat": "CodeTraceBench-derived verified setting"},
        {"metric": "prefix_rows", "value": DATASET_SUMMARY["prefix_examples"], "caveat": "frozen v0.4 prefix extraction"},
        {"metric": "bad_next_step_positives", "value": DATASET_SUMMARY["main_target_positives"], "caveat": "offline proxy target"},
        {"metric": "first_failure_trajectories", "value": DATASET_SUMMARY["first_failure_trajectories"], "caveat": "p_F computed over parsed trajectories"},
        {"metric": "repeated_bad_trajectories", "value": DATASET_SUMMARY["repeated_bad_trajectories"], "caveat": "diagnostic grouping"},
        {"metric": "first_failure_prevalence_p_F", "value": p_f, "caveat": "benchmark-level prevalence"},
        {"metric": "raw_text_exclusion", "value": DATASET_SUMMARY["raw_text_exclusion"], "caveat": "processed model features exclude raw text"},
        {"metric": "no_future_leakage", "value": DATASET_SUMMARY["no_future_leakage"], "caveat": "local extraction guard"},
    ]
    tables.append(write_table("table_T16_dataset_and_targets", dataset_rows, ["metric", "value", "caveat"]))

    structural_rows = []
    for row in t12_map:
        alpha = ffloat(row["alpha"], 0.0) or 0.0
        beta = ffloat(row["beta"], 0.0) or 0.0
        structural_rows.append({
            "alpha": alpha,
            "beta": beta,
            "p_F_estimate": t12.get("p_hat_mean"),
            "LCB_p_F_mean": t12.get("p_lcb_mean"),
            "structurally_impossible_rate": row["empirical_structural_no_safe_rate"],
            "certified_structural_no_safe_rate": row["certified_structural_no_safe_rate"],
            "excess_burden_allowance_empirical": beta - max(0.0, (t12.get("p_hat_mean") or p_f) - alpha),
        })
    tables.append(write_table("table_T16_structural_feasibility", structural_rows, list(structural_rows[0].keys())))

    reason_visibility = {
        "structurally_infeasible_by_first_failure_prevalence": ("deployment-visible", "relax alpha/beta or treat request as structurally unsupported"),
        "empirical_infeasible": ("deployment-visible", "improve policy family or loosen requested operating point"),
        "correction_blocked": ("deployment-visible", "increase calibration support, tighten correction, or reduce grid"),
        "selected_corrected_feasible_policy": ("deployment-visible", "candidate finite-grid policy under assumptions"),
    }
    reason_rows = []
    for row in t12_reasons:
        visibility, action = reason_visibility.get(row["no_safe_reason"], ("benchmark-only", "inspect diagnostics"))
        reason_rows.append({**row, "visibility": visibility, "recommended_action": action})
    tables.append(write_table("table_T16_no_safe_taxonomy", reason_rows, ["no_safe_reason", "count", "rate", "visibility", "recommended_action"]))

    selected = [r for r in t12_rows if not fbool(r["no_safe"])]
    feasible_row = {
        "method_variant": "feasibility-aware T-12 trajectory-score threshold",
        "correction": "clopper_pearson_union",
        "selected_policy_rate": t12.get("selected_policy_rate"),
        "no_safe_rate": t12.get("corrected_no_safe_rate"),
        "test_miss": t12.get("mean_selected_test_miss"),
        "test_burden": t12.get("mean_selected_test_burden"),
        "joint_alpha_beta_success": t12.get("joint_success_among_selected"),
        "first_failure_coverage": safe_mean([ffloat(r["selected_test_first_failure_coverage"]) for r in selected]),
        "false_alarm_rate": safe_mean([ffloat(r["selected_test_false_alarm_rate"]) for r in selected]),
    }
    tables.append(write_table("table_T16_corrected_feasible_set", [feasible_row], list(feasible_row.keys())))

    baseline_rows = []
    for row in t5_base[:]:
        baseline_rows.append({
            "method": row.get("method"),
            "miss_rate": row.get("missed_first_failure_rate"),
            "burden": row.get("trajectory_burden"),
            "false_alarm": row.get("false_alarm_rate"),
            "first_failure_coverage": row.get("first_failure_coverage"),
            "lead_time": row.get("lead_time"),
            "no_safe_behavior": row.get("no_safe_rate"),
            "claim_status_caveat": row.get("interpretation", "existing baseline row"),
        })
    for row in t3_base[:3]:
        baseline_rows.append({
            "method": row.get("baseline"),
            "miss_rate": row.get("missed_first_failure_rate"),
            "burden": row.get("trajectory_burden"),
            "false_alarm": row.get("false_alarm_rate"),
            "first_failure_coverage": row.get("first_failure_coverage"),
            "lead_time": row.get("lead_time"),
            "no_safe_behavior": row.get("no_safe_rate"),
            "claim_status_caveat": row.get("notes", "Option A baseline"),
        })
    baseline_rows.extend([
        {"method": "always no-warning", "miss_rate": "1.0 for bad trajectories", "burden": "0.0", "false_alarm": "0.0", "first_failure_coverage": "0.0", "lead_time": "", "no_safe_behavior": "baseline", "claim_status_caveat": "analytic reference"},
        {"method": "always warning", "miss_rate": "0.0 for bad trajectories", "burden": "1.0", "false_alarm": "1.0 for clean trajectories", "first_failure_coverage": "1.0", "lead_time": "maximal by convention", "no_safe_behavior": "baseline", "claim_status_caveat": "analytic reference; high burden"},
        {"method": "CORA-like step abstention adaptation", "miss_rate": "unavailable", "burden": "unavailable", "false_alarm": "unavailable", "first_failure_coverage": "unavailable", "lead_time": "", "no_safe_behavior": "not direct reproduction", "claim_status_caveat": "structural adaptation; requires human/literature verification"},
        {"method": "ToolChain-CRC-like trajectory aggregation adaptation", "miss_rate": "unavailable", "burden": "unavailable", "false_alarm": "unavailable", "first_failure_coverage": "unavailable", "lead_time": "", "no_safe_behavior": "not direct reproduction", "claim_status_caveat": "structural adaptation; requires human/literature verification"},
        {"method": "feasibility-aware method", "miss_rate": feasible_row["test_miss"], "burden": feasible_row["test_burden"], "false_alarm": feasible_row["false_alarm_rate"], "first_failure_coverage": feasible_row["first_failure_coverage"], "lead_time": safe_mean([ffloat(r["selected_test_mean_lead_time"]) for r in selected]), "no_safe_behavior": feasible_row["no_safe_rate"], "claim_status_caveat": "finite-grid high-probability risk control under assumptions; mostly no_safe"},
    ])
    tables.append(write_table("table_T16_baseline_comparison", baseline_rows, ["method", "miss_rate", "burden", "false_alarm", "first_failure_coverage", "lead_time", "no_safe_behavior", "claim_status_caveat"]))

    oracle_by_cell = {(r["alpha"], r["beta"]): r for r in t6_oracle}
    gap_rows = []
    for row in t11_tax:
        key = (row["alpha"], row["beta"])
        oracle = oracle_by_cell.get(key, {})
        gap_rows.append({
            "alpha": row["alpha"],
            "beta": row["beta"],
            "structural_region": row["classification"],
            "oracle_feasible": row["oracle_feasible"],
            "learned_empirical_feasible": row["learned_empirical_feasible_rate"],
            "correction_blocked_or_corrected": row["learned_corrected_feasible_rate"],
            "learned_corrected_feasible": row["learned_corrected_feasible_rate"],
            "oracle_max_coverage": oracle.get("analytic_oracle_max_coverage", ""),
            "gap_interpretation": row["classification"],
        })
    tables.append(write_table("table_T16_oracle_gap", gap_rows, list(gap_rows[0].keys())))

    limitation_rows = [
        {"limitation": "low-burden first-event control remains unsolved", "evidence": "T-12 corrected no-safe rate and selected burden", "consequence": "method mainly diagnoses feasibility", "mitigation_future_work": "better scores/policies"},
        {"limitation": "external generality remains untested", "evidence": "Batch 9O", "consequence": "benchmark-level claim only", "mitigation_future_work": "external/manual dataset validation"},
        {"limitation": "finite-grid correction can be conservative", "evidence": "T-3/T-4/T-12", "consequence": "correction_blocked cases", "mitigation_future_work": "tighter correction or more calibration data"},
        {"limitation": "CORA-like and ToolChain-CRC-like comparisons are structural adaptations", "evidence": "T-15 audit", "consequence": "no superiority claim", "mitigation_future_work": "human/literature verification"},
        {"limitation": "not full formal conformal risk control", "evidence": "T-14/T-15", "consequence": "CRC-inspired wording only", "mitigation_future_work": "CRC theorem mapping"},
    ]
    tables.append(write_table("table_T16_limitations", limitation_rows, ["limitation", "evidence", "consequence", "mitigation_future_work"]))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-16",
        "tables": tables,
        "table_count": len(tables),
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
        "best_trajectory_scoring_reference": t9.get("best_primary_test_result"),
        "option_a_reference": {"no_safe": t10a.get("default_no_safe_rate"), "burden": t10a.get("default_mean_selected_test_burden")},
        "option_c_reference": {"no_safe": t10c.get("default_no_safe_rate"), "burden": t10c.get("default_mean_selected_test_burden")},
    }
    write_json(SUMMARY_JSON, payload)
    write_md(
        SUMMARY_MD,
        "Batch T-16 Finalized Tables Summary",
        [
            "Generated finalized evaluation tables for the feasibility-aware dual-unit first-event control empirical evaluation package.",
            "These are benchmark-level offline proxy artifacts, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
            f"- Tables generated: `{len(tables)}`",
        ],
        tables,
        ["name", "rows", "csv", "md"],
    )
    print({"tables": len(tables), "output": str(SUMMARY_JSON)})


if __name__ == "__main__":
    main()
