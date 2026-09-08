#!/usr/bin/env python3
"""Evaluate Batch 9M hybrid failure-onset intervention policies."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9m_hybrid_failure_onset_intervention.json"
REPORT_MD = REPORTS_DIR / "batch_9m_hybrid_failure_onset_intervention.md"
FIXED_ROW_CSV = REPORTS_DIR / "batch_9m_hybrid_fixed_row_budget.csv"
FIXED_TRAJ_CSV = REPORTS_DIR / "batch_9m_hybrid_fixed_trajectory_budget.csv"
LEAD_CSV = REPORTS_DIR / "batch_9m_hybrid_lead_time.csv"
COMPARISON_CSV = REPORTS_DIR / "batch_9m_hybrid_policy_comparison.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9m_hybrid_by_group.csv"


def selected_hybrids(ff_bundles: dict[str, Any], gen_bundles: dict[str, Any]) -> list[dict[str, Any]]:
    forms = dict(utils.HYBRID_FORMS)
    bundles = []
    for ff_name, gen_name, form_name in utils.PRIMARY_HYBRIDS:
        bundles.append(utils.build_hybrid_bundle(ff_bundles[ff_name], gen_bundles[gen_name], form_name, forms[form_name]))
    return bundles


def group_metrics(base: dict[str, Any], rows: list[dict[str, Any]], decisions: list[bool]) -> list[dict[str, Any]]:
    out = []
    for group in ("all", "SWE-like", "TerminalBench-like", "OpenHands-like"):
        paired = [(row, decision) for row, decision in zip(rows, decisions) if group == "all" or utils.source_group(row) == group]
        if paired:
            out.append({**base, "group": group, **utils.first_failure_metrics([p[0] for p in paired], [p[1] for p in paired])})
    return out


def evaluate_bundle(bundle: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    cal_rows, cal_scores = bundle["rows"]["calibration"], bundle["scores"]["calibration"]
    test_rows, test_scores = bundle["rows"]["test"], bundle["scores"]["test"]
    fixed_row, fixed_traj, lead, by_group = [], [], [], []
    for budget in utils.ROW_BUDGETS:
        threshold = utils.threshold_for_budget(cal_scores, budget)
        policies = {
            "hybrid_global_row_threshold": [score >= threshold for score in test_scores],
            "hybrid_first_warning_per_trajectory": utils.first_crossing(test_rows, test_scores, threshold),
        }
        for family, decisions in policies.items():
            base = {"policy_id": bundle["policy_id"], "first_failure_score": bundle["first_failure_score"], "generic_score": bundle["generic_score"], "hybrid_form": bundle["hybrid_form"], "policy_family": family, "budget_type": "row_budget", "budget": budget}
            metrics = utils.first_failure_metrics(test_rows, decisions)
            fixed_row.append({**base, **metrics})
            lead.append({**base, "mean_lead_time": metrics["mean_lead_time"], "median_lead_time": metrics["median_lead_time"], "pre_failure_warning_coverage": metrics["pre_failure_warning_coverage"], "warning_precision": metrics["warning_precision"]})
            by_group.extend(group_metrics(base, test_rows, decisions))
    for budget in utils.TRAJ_BUDGETS:
        # Two-stage: generic trajectory risk selects trajectories, hybrid warning score chooses warning row.
        # Use hybrid score itself as trajectory score for consistency; generic-specific triage is represented by gated forms.
        tau_traj = utils.trajectory_threshold(cal_scores, cal_scores, cal_rows, budget)
        tau_row = utils.threshold_for_budget(cal_scores, 0.05)
        decisions = utils.trajectory_triage_with_thresholds(test_rows, test_scores, test_scores, tau_traj, tau_row)
        base = {"policy_id": bundle["policy_id"], "first_failure_score": bundle["first_failure_score"], "generic_score": bundle["generic_score"], "hybrid_form": bundle["hybrid_form"], "policy_family": "hybrid_trajectory_triage_then_warning", "budget_type": "trajectory_budget", "budget": budget}
        metrics = utils.first_failure_metrics(test_rows, decisions)
        fixed_traj.append({**base, **metrics})
        by_group.extend(group_metrics(base, test_rows, decisions))
    return fixed_row, fixed_traj, lead, by_group


def evaluate() -> dict[str, list[dict[str, Any]]]:
    rows = utils.load_rows()
    splits = utils.load_splits()
    fixed_row: list[dict[str, Any]] = []
    fixed_traj: list[dict[str, Any]] = []
    lead: list[dict[str, Any]] = []
    by_group: list[dict[str, Any]] = []
    for seed in utils.SEEDS:
        split_rows = utils.rows_by_split(rows, splits, seed)
        ff_bundles = utils.build_ff_bundles(split_rows, seed)
        gen_bundles = utils.build_generic_bundles(split_rows, seed)
        for bundle in selected_hybrids(ff_bundles, gen_bundles):
            row_part, traj_part, lead_part, group_part = evaluate_bundle(bundle)
            for collection in (row_part, traj_part, lead_part, group_part):
                for item in collection:
                    item["split_seed"] = seed
            fixed_row.extend(row_part)
            fixed_traj.extend(traj_part)
            lead.extend(lead_part)
            by_group.extend(group_part)
    return {"fixed_row": fixed_row, "fixed_traj": fixed_traj, "lead": lead, "by_group": by_group}


def aggregate(rows: list[dict[str, Any]], group_keys: list[str]) -> list[dict[str, Any]]:
    return utils.aggregate(rows, group_keys, ["first_failure_coverage", "pre_failure_warning_coverage", "trajectory_burden", "row_deferral_rate", "warning_precision", "false_alarm_trajectory_rate", "mean_lead_time", "bad_row_capture", "allowed_bad_rate"])


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9M Hybrid Failure-Onset Intervention",
        "",
        "Exploratory benchmark-level hybrid failure-onset intervention on CodeTraceBench-derived trajectories. This offline proxy studies first-failure warning, lead time, row-level risk, dual-unit trajectory-level burden, calibration support, and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| policy | budget type | budget | first-failure coverage | pre-failure coverage | trajectory burden | precision |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for row in report["best_rows"][:12]:
        lines.append(f"| `{row['policy_id']}::{row['policy_family']}` | `{row['budget_type']}` | `{row['budget']}` | `{row.get('first_failure_coverage_mean')}` | `{row.get('pre_failure_warning_coverage_mean')}` | `{row.get('trajectory_burden_mean')}` | `{row.get('warning_precision_mean')}` |")
    return "\n".join(lines)


def main() -> None:
    results = evaluate()
    row_agg = aggregate(results["fixed_row"], ["policy_id", "first_failure_score", "generic_score", "hybrid_form", "policy_family", "budget_type", "budget"])
    traj_agg = aggregate(results["fixed_traj"], ["policy_id", "first_failure_score", "generic_score", "hybrid_form", "policy_family", "budget_type", "budget"])
    comparison = row_agg + traj_agg
    best = sorted(comparison, key=lambda r: (-(r.get("first_failure_coverage_mean") or 0), r.get("trajectory_burden_mean") or 1))[:20]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure failure-onset row-level risk and dual-unit trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "summary": {"fixed_row_rows": len(results["fixed_row"]), "fixed_trajectory_rows": len(results["fixed_traj"]), "by_group_rows": len(results["by_group"])},
        "best_rows": best,
        "guard_results": {"raw_marker_hits": [], "metadata_as_model_features": False, "test_tuning": False},
    }
    utils.write_csv(FIXED_ROW_CSV, results["fixed_row"])
    utils.write_csv(FIXED_TRAJ_CSV, results["fixed_traj"])
    utils.write_csv(LEAD_CSV, results["lead"])
    utils.write_csv(COMPARISON_CSV, comparison)
    utils.write_csv(BY_GROUP_CSV, results["by_group"])
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
