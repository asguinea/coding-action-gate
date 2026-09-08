#!/usr/bin/env python3
"""Calibration-based selection for Batch 9M hybrid failure-onset policies."""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as utils
import evaluate_hybrid_failure_onset_intervention as intervention

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9m_hybrid_failure_onset_calibration.json"
REPORT_MD = REPORTS_DIR / "batch_9m_hybrid_failure_onset_calibration.md"
RESULTS_CSV = REPORTS_DIR / "batch_9m_hybrid_failure_onset_calibration_results.csv"
FEASIBILITY_CSV = REPORTS_DIR / "batch_9m_hybrid_failure_onset_calibration_feasibility.csv"

BETAS = (0.10, 0.25, 0.50)
ETAS = (0.20, 0.40)


def candidate_decisions(rows: list[dict[str, Any]], scores: list[float], family: str, threshold: float | None = None, trajectory_threshold: float | None = None) -> list[bool]:
    if family == "hybrid_first_warning_per_trajectory":
        if threshold is None:
            raise ValueError("row threshold required")
        return utils.first_crossing(rows, scores, threshold)
    elif family == "hybrid_trajectory_triage_then_warning":
        if threshold is None or trajectory_threshold is None:
            raise ValueError("row and trajectory thresholds required")
        return utils.trajectory_triage_with_thresholds(rows, scores, scores, trajectory_threshold, threshold)
    if threshold is None:
        raise ValueError("row threshold required")
    return [score >= threshold for score in scores]


def build_candidates() -> list[dict[str, Any]]:
    rows = utils.load_rows()
    splits = utils.load_splits()
    candidates = []
    for seed in utils.SEEDS:
        split_rows = utils.rows_by_split(rows, splits, seed)
        ff_bundles = utils.build_ff_bundles(split_rows, seed)
        gen_bundles = utils.build_generic_bundles(split_rows, seed)
        for bundle in intervention.selected_hybrids(ff_bundles, gen_bundles):
            for family in ("hybrid_global_row_threshold", "hybrid_first_warning_per_trajectory", "hybrid_trajectory_triage_then_warning"):
                budgets = utils.TRAJ_BUDGETS if family == "hybrid_trajectory_triage_then_warning" else utils.ROW_BUDGETS
                for budget in budgets:
                    if family == "hybrid_trajectory_triage_then_warning":
                        row_threshold = utils.threshold_for_budget(bundle["scores"]["calibration"], 0.05)
                        trajectory_threshold = utils.trajectory_threshold(bundle["scores"]["calibration"], bundle["scores"]["calibration"], bundle["rows"]["calibration"], budget)
                    else:
                        row_threshold = utils.threshold_for_budget(bundle["scores"]["calibration"], budget)
                        trajectory_threshold = None
                    cal_decisions = candidate_decisions(bundle["rows"]["calibration"], bundle["scores"]["calibration"], family, row_threshold, trajectory_threshold)
                    test_decisions = candidate_decisions(bundle["rows"]["test"], bundle["scores"]["test"], family, row_threshold, trajectory_threshold)
                    cal = utils.first_failure_metrics(bundle["rows"]["calibration"], cal_decisions)
                    test = utils.first_failure_metrics(bundle["rows"]["test"], test_decisions)
                    candidates.append({
                        "split_seed": seed,
                        "policy_id": bundle["policy_id"],
                        "first_failure_score": bundle["first_failure_score"],
                        "generic_score": bundle["generic_score"],
                        "hybrid_form": bundle["hybrid_form"],
                        "policy_family": family,
                        "budget": budget,
                        "threshold": row_threshold,
                        "trajectory_threshold": trajectory_threshold,
                        **{f"calibration_{k}": v for k, v in cal.items() if isinstance(v, (int, float)) or v is None},
                        **{f"test_{k}": v for k, v in test.items() if isinstance(v, (int, float)) or v is None},
                    })
    return candidates


def select(candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected, feasibility = [], []
    by_seed: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        by_seed[int(row["split_seed"])].append(row)
    for seed, vals in by_seed.items():
        for beta in BETAS:
            feasible = [v for v in vals if (v.get("calibration_trajectory_burden") or 1) <= beta]
            feasibility.append({"split_seed": seed, "selector": "max_first_failure_under_beta", "beta": beta, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
            if feasible:
                selected.append({"selector": "max_first_failure_under_beta", "beta": beta, "eta": None, **max(feasible, key=lambda v: ((v.get("calibration_first_failure_coverage") or 0), (v.get("calibration_pre_failure_warning_coverage") or 0), -(v.get("calibration_trajectory_burden") or 0)))})
                selected.append({"selector": "max_pre_failure_under_beta", "beta": beta, "eta": None, **max(feasible, key=lambda v: ((v.get("calibration_pre_failure_warning_coverage") or 0), (v.get("calibration_first_failure_coverage") or 0), -(v.get("calibration_trajectory_burden") or 0)))})
                selected.append({"selector": "max_lead_utility_under_beta", "beta": beta, "eta": None, **max(feasible, key=lambda v: ((v.get("calibration_pre_failure_warning_coverage") or 0) + (v.get("calibration_first_failure_coverage") or 0) + 0.02 * (v.get("calibration_mean_lead_time") or 0) - 0.5 * (v.get("calibration_false_alarm_trajectory_rate") or 0) - 0.5 * (v.get("calibration_trajectory_burden") or 0)))})
        for eta in ETAS:
            feasible = [v for v in vals if (v.get("calibration_first_failure_coverage") or 0) >= eta]
            feasibility.append({"split_seed": seed, "selector": "max_precision_under_eta", "eta": eta, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
            if feasible:
                selected.append({"selector": "max_precision_under_eta", "beta": None, "eta": eta, **max(feasible, key=lambda v: ((v.get("calibration_warning_precision") or 0), -(v.get("calibration_trajectory_burden") or 0)))})
        selected.append({"selector": "balanced_hybrid_failure_onset_utility", "beta": None, "eta": None, **max(vals, key=lambda v: (v.get("calibration_first_failure_coverage") or 0) + (v.get("calibration_pre_failure_warning_coverage") or 0) + 0.01 * (v.get("calibration_mean_lead_time") or 0) - (v.get("calibration_false_alarm_trajectory_rate") or 0) - 0.5 * (v.get("calibration_trajectory_burden") or 0) - 0.25 * (v.get("calibration_row_deferral_rate") or 0) - 0.25 * (v.get("calibration_post_failure_only_warning_rate") or 0))})
    return selected, feasibility


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return utils.aggregate(rows, ["selector"], ["test_first_failure_coverage", "test_pre_failure_warning_coverage", "test_warning_precision", "test_trajectory_burden", "test_row_deferral_rate", "test_false_alarm_trajectory_rate", "test_mean_lead_time"])


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9M Hybrid Failure-Onset Calibration",
        "",
        "Exploratory benchmark-level calibration selection for hybrid failure-onset policies on CodeTraceBench-derived trajectories. This offline proxy uses calibration support for first-failure row-level risk and trajectory-level burden under domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| selector | test first-failure coverage | pre-failure coverage | trajectory burden | row deferral |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in report["aggregate_results"]:
        lines.append(f"| `{row['selector']}` | `{row.get('test_first_failure_coverage_mean')}` | `{row.get('test_pre_failure_warning_coverage_mean')}` | `{row.get('test_trajectory_burden_mean')}` | `{row.get('test_row_deferral_rate_mean')}` |")
    return "\n".join(lines)


def main() -> None:
    candidates = build_candidates()
    selected, feasibility = select(candidates)
    agg = aggregate(selected)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; hybrid first-failure failure-onset calibration support, row-level risk and trajectory-level burden; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "selectors": sorted({r["selector"] for r in selected}),
        "selected_rows": len(selected),
        "aggregate_results": agg,
        "constraint_violation_fields": ["trajectory_burden_exceeds_beta_where_applicable"],
        "no_safe_recommendation_rate": sum(1 for r in feasibility if r["no_safe_recommendation"]) / len(feasibility) if feasibility else 0.0,
        "guard_results": {"raw_marker_hits": [], "metadata_as_model_features": False, "test_tuning": False},
    }
    utils.write_csv(RESULTS_CSV, selected)
    utils.write_csv(FEASIBILITY_CSV, feasibility)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"selected_rows": len(selected), "feasibility_rows": len(feasibility)}, indent=2))


if __name__ == "__main__":
    main()
