#!/usr/bin/env python3
"""Build Batch T-16 finalized-method evidence ledger from existing reports."""

from __future__ import annotations

from datetime import datetime, timezone

from t16_evaluation_utils import DATASET_SUMMARY, REPORTS, claim_boundary, read_json, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T16_method_evidence_ledger.json"
OUT_MD = REPORTS / "batch_T16_method_evidence_ledger.md"
OUT_CSV = REPORTS / "batch_T16_method_evidence_ledger.csv"


def main() -> None:
    h = read_json(REPORTS / "batch_9h_row_to_trajectory_burden_audit.json")
    l = read_json(REPORTS / "batch_9l_first_failure_model_results.json")
    m = read_json(REPORTS / "batch_9m_hybrid_failure_onset_score_results.json")
    n = read_json(REPORTS / "batch_9n_first_event_calibration_selectors.json")
    o = read_json(REPORTS / "batch_9o_research_assessment.json")
    t7a = read_json(REPORTS / "batch_T7_option_A_clean_grid_results.json")
    t10a = read_json(REPORTS / "batch_T10_option_A_trajectory_score_policy.json")
    t10c = read_json(REPORTS / "batch_T10_option_C_trajectory_score_policy.json")
    t11 = read_json(REPORTS / "batch_T11_feasible_region_taxonomy.json")
    t12 = read_json(REPORTS / "batch_T12_feasibility_aware_real_data.json")
    t14 = read_json(REPORTS.parent / "theory" / "batch_T14_finite_grid_theorem.json")
    t15 = read_json(REPORTS.parent / "theory" / "batch_T15_positioning_assessment.json")

    rows = [
        {
            "evidence_id": "dataset_extraction",
            "source_group": "dataset/extraction evidence",
            "source_report": "local extraction context",
            "finding": f"{DATASET_SUMMARY['parsed_with_prefix_examples']} parsed trajectories, {DATASET_SUMMARY['prefix_examples']} prefix rows, {DATASET_SUMMARY['first_failure_trajectories']} first-failure trajectories",
            "supports": "benchmark-level evaluation substrate",
            "limitation": "CodeTraceBench-derived verified setting only",
        },
        {
            "evidence_id": "guardrails",
            "source_group": "dataset/extraction evidence",
            "source_report": "local extraction context",
            "finding": f"raw-text exclusion {DATASET_SUMMARY['raw_text_exclusion']}; no-future-leakage {DATASET_SUMMARY['no_future_leakage']}; split leakage {DATASET_SUMMARY['split_leakage']}",
            "supports": "leakage-safe offline proxy analysis",
            "limitation": "not production validation",
        },
        {
            "evidence_id": "row_trajectory_mismatch",
            "source_group": "empirical motivation",
            "source_report": "batch_9h_row_to_trajectory_burden_audit.json",
            "finding": f"mean learned 5pct trajectory burden {h['summary']['mean_learned_5pct_trajectory_burden']}; inflation {h['summary']['mean_learned_5pct_burden_inflation']}",
            "supports": "need for dual-unit trajectory burden analysis",
            "limitation": h["summary"].get("structural_vs_model_induced", "mixed"),
        },
        {
            "evidence_id": "oracle_random_burden",
            "source_group": "empirical motivation",
            "source_report": "batch_9h_row_to_trajectory_burden_audit.json",
            "finding": f"random expected 5pct burden {h['summary']['mean_random_expected_5pct_trajectory_burden']}; oracle bad-row 5pct burden {h['summary']['mean_oracle_bad_row_5pct_trajectory_burden']}",
            "supports": "burden inflation is partly structural",
            "limitation": "oracle/random diagnostics are benchmark-only",
        },
        {
            "evidence_id": "first_failure_specific_signal",
            "source_group": "empirical motivation",
            "source_report": "batch_9l_first_failure_model_results.json",
            "finding": f"best target entries {len(l.get('best_by_target', []))}",
            "supports": "first-failure-specific ranking signal exists",
            "limitation": "first-failure intervention remains burden-heavy",
        },
        {
            "evidence_id": "hybrid_first_event_signal",
            "source_group": "empirical motivation",
            "source_report": "batch_9m_hybrid_failure_onset_score_results.json",
            "finding": f"hybrid best target entries {len(m.get('best_by_target', []))}",
            "supports": "hybrid scoring modestly improves ranking",
            "limitation": "did not solve low-burden coverage",
        },
        {
            "evidence_id": "first_event_selector_limits",
            "source_group": "empirical motivation",
            "source_report": "batch_9n_first_event_calibration_selectors.json",
            "finding": f"no-safe rate {n.get('no_safe_recommendation_rate')}; selected rows {n.get('selected_rows')}",
            "supports": "trajectory-level first-event framing",
            "limitation": "low-burden warning remained limited",
        },
        {
            "evidence_id": "external_validation_feasibility",
            "source_group": "empirical motivation",
            "source_report": "batch_9o_research_assessment.json",
            "finding": f"resources scanned {o.get('resources_scanned')}; external validation succeeded {o.get('answers', {}).get('external_or_semi_external_validation_succeeded')}",
            "supports": "external generality remains untested",
            "limitation": "public-resource schema gap",
        },
        {
            "evidence_id": "finite_grid_theorem",
            "source_group": "theory-method evidence",
            "source_report": "batch_T14_finite_grid_theorem.json",
            "finding": t14.get("conclusion"),
            "supports": "correctness under finite-grid assumptions",
            "limitation": "not full formal conformal risk control",
        },
        {
            "evidence_id": "positioning_decision",
            "source_group": "theory-method evidence",
            "source_report": "batch_T15_positioning_assessment.json",
            "finding": t15.get("best_framing"),
            "supports": "CRC-inspired finite-grid positioning",
            "limitation": t15.get("biggest_reviewer_risk"),
        },
        {
            "evidence_id": "option_a_clean_grid",
            "source_group": "method performance evidence",
            "source_report": "batch_T7_option_A_clean_grid_results.json",
            "finding": f"best default no-safe {t7a['best_default'].get('no_safe_rate')}; burden {t7a['best_default'].get('mean_test_burden_feasible')}",
            "supports": "miss-risk control can select policies but burden remains high",
            "limitation": "Option A controls miss risk only",
        },
        {
            "evidence_id": "trajectory_score_option_a",
            "source_group": "method performance evidence",
            "source_report": "batch_T10_option_A_trajectory_score_policy.json",
            "finding": f"no-safe {t10a.get('default_no_safe_rate')}; mean miss {t10a.get('default_mean_selected_test_miss')}; burden {t10a.get('default_mean_selected_test_burden')}",
            "supports": "trajectory scores improve tradeoff but burden remains large",
            "limitation": "not low-burden first-event control",
        },
        {
            "evidence_id": "trajectory_score_option_c",
            "source_group": "method performance evidence",
            "source_report": "batch_T10_option_C_trajectory_score_policy.json",
            "finding": f"no-safe {t10c.get('default_no_safe_rate')}; selected rows {t10c.get('default_selected_rows')}; joint success {t10c.get('default_joint_success')}",
            "supports": "corrected feasible-set behavior when feasible",
            "limitation": "mostly no_safe_recommendation",
        },
        {
            "evidence_id": "taxonomy",
            "source_group": "method performance evidence",
            "source_report": "batch_T11_feasible_region_taxonomy.json",
            "finding": str(t11.get("classification_counts")),
            "supports": "feasible-region taxonomy",
            "limitation": "benchmark-only diagnostics use labels/oracles",
        },
        {
            "evidence_id": "feasibility_aware_controller",
            "source_group": "method performance evidence",
            "source_report": "batch_T12_feasibility_aware_real_data.json",
            "finding": f"selected policy rate {t12.get('selected_policy_rate')}; corrected no-safe {t12.get('corrected_no_safe_rate')}; joint success {t12.get('joint_success_among_selected')}",
            "supports": "diagnostic no_safe_recommendation and corrected feasible-set behavior",
            "limitation": "does not solve low-burden first-event warning",
        },
    ]

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-16",
        "rows": len(rows),
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
        "source_groups": sorted({r["source_group"] for r in rows}),
        "evidence_items": rows,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    write_md(
        OUT_MD,
        "Batch T-16 Method Evidence Ledger",
        [
            "This empirical evaluation package consolidates existing benchmark-level evidence for feasibility-aware dual-unit first-event control.",
            "It is an offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
            "",
            "The ledger answers four questions: why the method is needed, what supports correctness under assumptions, what supports diagnostic value, and what limitations remain.",
        ],
        rows,
        ["evidence_id", "source_group", "source_report", "finding", "supports", "limitation"],
    )
    print({"rows": len(rows), "output": str(OUT_JSON)})


if __name__ == "__main__":
    main()
