#!/usr/bin/env python3
"""Batch T-8 Part D: richer score-based policy upper-bound diagnostics."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean, median
from typing import Any

from option_c_dual_constraint_calibration import option_c_select_threshold
from t8_oracle_gap_utils import (
    ALPHAS,
    BETAS,
    REPORTS,
    aggregate_score,
    load_score_rows,
    trajectory_summaries,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T8_score_policy_upper_bounds.json"
OUT_MD = REPORTS / "batch_T8_score_policy_upper_bounds.md"
OUT_CSV = REPORTS / "batch_T8_score_policy_upper_bounds.csv"
OUT_REGION = REPORTS / "batch_T8_score_policy_feasible_region.csv"

POLICIES = [
    "trajectory_score_threshold_then_first_warning",
    "cumulative_hazard_threshold",
    "risk_mass_budgeted_warning",
    "two_stage_scalarized_policy",
]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]


def _quantile(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, int(round(q * (len(ordered) - 1)))))]


def _scalar(summary: dict[str, Any], policy: str) -> float:
    if policy == "trajectory_score_threshold_then_first_warning":
        return aggregate_score(summary, "max_score")
    if policy == "cumulative_hazard_threshold":
        return sum(summary["scores"])
    if policy == "risk_mass_budgeted_warning":
        return aggregate_score(summary, "sum_top_5_score")
    if policy == "two_stage_scalarized_policy":
        return aggregate_score(summary, "top_3_mean_score")
    raise ValueError(policy)


def _warning(summary: dict[str, Any], policy: str, threshold: float, row_q80: float) -> int | None:
    scalar = _scalar(summary, policy)
    if scalar < threshold:
        return None
    scores = list(summary["scores"])
    idxs = list(summary["prefix_indices"])
    if not scores:
        return None
    if policy == "trajectory_score_threshold_then_first_warning":
        for idx, score in zip(idxs, scores):
            if score >= row_q80:
                return int(idx)
        return min(idxs)
    if policy == "cumulative_hazard_threshold":
        running = 0.0
        for idx, score in zip(idxs, scores):
            running += score
            if running >= threshold:
                return int(idx)
        return None
    if policy == "risk_mass_budgeted_warning":
        ranked = sorted(zip(idxs, scores), key=lambda x: (x[1], -x[0]), reverse=True)
        top = ranked[: min(5, len(ranked))]
        return min(int(idx) for idx, _ in top)
    if policy == "two_stage_scalarized_policy":
        ranked = sorted(zip(idxs, scores), key=lambda x: (x[1], -x[0]), reverse=True)
        top = ranked[: min(3, len(ranked))]
        return min(int(idx) for idx, _ in top)
    raise ValueError(policy)


def _metrics(group: list[dict[str, Any]], policy: str, threshold: float, row_q80: float) -> dict[str, Any]:
    bad_total = sum(int(s["trajectory_has_first_failure"]) for s in group)
    clean_total = len(group) - bad_total
    warned = covered = pre = late = false = 0
    leads = []
    for summary in group:
        warning = _warning(summary, policy, threshold, row_q80)
        has_bad = int(summary["trajectory_has_first_failure"])
        if warning is not None:
            warned += 1
        if has_bad:
            first_bad = int(summary["first_bad_row_index"])
            if warning is not None and warning <= first_bad:
                covered += 1
                if warning < first_bad:
                    pre += 1
                leads.append(first_bad - warning)
            elif warning is not None and warning > first_bad:
                late += 1
        elif warning is not None:
            false += 1
    total_rows = sum(s["trajectory_length"] for s in group)
    return {
        "trajectory_count": len(group),
        "bad_trajectory_count": bad_total,
        "clean_trajectory_count": clean_total,
        "n_miss": bad_total,
        "n_burden": len(group),
        "empirical_miss_rate": 1.0 - (covered / bad_total if bad_total else 0.0),
        "empirical_burden": warned / len(group) if group else 0.0,
        "empirical_false_alarm_rate": false / clean_total if clean_total else 0.0,
        "empirical_pre_failure_coverage": pre / bad_total if bad_total else 0.0,
        "first_failure_coverage": covered / bad_total if bad_total else 0.0,
        "late_warning_rate": late / bad_total if bad_total else 0.0,
        "row_deferral_rate": warned / total_rows if total_rows else 0.0,
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
    }


def _nestedness_pass(group: list[dict[str, Any]], policy: str, thresholds: list[float], row_q80: float) -> bool:
    previous: set[str] | None = None
    for threshold in sorted(thresholds):
        warned = {s["trajectory_id"] for s in group if _warning(s, policy, threshold, row_q80) is not None}
        if previous is not None and not warned.issubset(previous):
            return False
        previous = warned
    return True


def main() -> None:
    rows = load_score_rows()
    train = trajectory_summaries(rows, split_role="train")
    calibration = trajectory_summaries(rows, split_role="calibration")
    test = trajectory_summaries(rows, split_role="test")
    train_by_key: dict[tuple[int, str], list[dict]] = defaultdict(list)
    cal_by_key: dict[tuple[int, str], list[dict]] = defaultdict(list)
    test_by_key: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for row in train:
        train_by_key[(row["split_seed"], row["score_family"])].append(row)
    for row in calibration:
        cal_by_key[(row["split_seed"], row["score_family"])].append(row)
    for row in test:
        test_by_key[(row["split_seed"], row["score_family"])].append(row)

    threshold_rows = []
    feasible_rows = []
    for key, cal_group in sorted(cal_by_key.items()):
        seed, family = key
        train_group = train_by_key.get(key, [])
        test_group = test_by_key.get(key, [])
        row_q80 = _quantile([score for s in train_group for score in s["scores"]], 0.80)
        for policy in POLICIES:
            scalars = [_scalar(s, policy) for s in train_group]
            thresholds = sorted({float(_quantile(scalars, q)) for q in QUANTILES})
            if not thresholds:
                continue
            nested = _nestedness_pass(cal_group, policy, thresholds, row_q80)
            cal_table = []
            test_table = []
            for order, threshold in enumerate(thresholds):
                cal_metrics = _metrics(cal_group, policy, threshold, row_q80)
                test_metrics = _metrics(test_group, policy, threshold, row_q80)
                cal_row = {
                    "split_seed": seed,
                    "score_family": family,
                    "policy_family": policy,
                    "threshold": threshold,
                    "threshold_order": order,
                    "nestedness_pass": nested,
                    "theory_candidate_if_nested": bool(nested and policy != "risk_mass_budgeted_warning"),
                    **cal_metrics,
                }
                threshold_rows.append(cal_row)
                cal_table.append(cal_row)
                test_table.append({
                    "threshold": threshold,
                    "test_missed_first_failure_rate": test_metrics["empirical_miss_rate"],
                    "test_trajectory_burden": test_metrics["empirical_burden"],
                    "test_first_failure_coverage": test_metrics["first_failure_coverage"],
                    "test_pre_failure_warning_coverage": test_metrics["empirical_pre_failure_coverage"],
                    "test_false_alarm_trajectory_rate": test_metrics["empirical_false_alarm_rate"],
                    "test_late_warning_rate": test_metrics["late_warning_rate"],
                    "test_row_deferral_rate": test_metrics["row_deferral_rate"],
                    "test_mean_lead_time": test_metrics["mean_lead_time"],
                })
            for alpha in ALPHAS:
                for beta in BETAS:
                    empirical_feasible = [r for r in cal_table if r["empirical_miss_rate"] <= alpha and r["empirical_burden"] <= beta]
                    selection = option_c_select_threshold(
                        cal_table,
                        alpha=alpha,
                        beta=beta,
                        delta=0.10,
                        threshold_grid=thresholds,
                        correction="clopper_pearson_union",
                    ) if nested and policy != "risk_mass_budgeted_warning" else {"no_safe": True, "feasible_count": 0, "selected_threshold": None}
                    test_match = next((r for r in test_table if r["threshold"] == selection.get("selected_threshold")), None)
                    feasible_rows.append({
                        "split_seed": seed,
                        "score_family": family,
                        "policy_family": policy,
                        "alpha": alpha,
                        "beta": beta,
                        "nestedness_pass": nested,
                        "theory_candidate_if_nested": bool(nested and policy != "risk_mass_budgeted_warning"),
                        "empirical_feasible_count": len(empirical_feasible),
                        "corrected_feasible_count": selection.get("feasible_count", 0),
                        "corrected_no_safe": bool(selection.get("no_safe", True)),
                        "selected_threshold": selection.get("selected_threshold"),
                        "test_miss_rate": test_match.get("test_missed_first_failure_rate") if test_match else None,
                        "test_burden": test_match.get("test_trajectory_burden") if test_match else None,
                        "test_first_failure_coverage": test_match.get("test_first_failure_coverage") if test_match else None,
                        "test_pre_failure_coverage": test_match.get("test_pre_failure_warning_coverage") if test_match else None,
                        "joint_alpha_beta_success": bool(test_match and test_match["test_missed_first_failure_rate"] <= alpha and test_match["test_trajectory_burden"] <= beta),
                        "diagnostic_only": bool(policy == "risk_mass_budgeted_warning"),
                    })

    corrected = [r for r in feasible_rows if r["theory_candidate_if_nested"]]
    feasible_rate = sum(1 for r in corrected if not r["corrected_no_safe"]) / len(corrected) if corrected else 0.0
    joint_success = [
        r for r in corrected
        if not r["corrected_no_safe"] and r["joint_alpha_beta_success"]
    ]
    selected = [r for r in corrected if not r["corrected_no_safe"]]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-8",
        "purpose": "score-based richer one-dimensional policy-family upper-bound diagnostic",
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "offline_proxy": True,
        },
        "guard_results": {
            "raw_text_used": False,
            "metadata_used_as_model_features": False,
            "test_tuning": False,
            "mock_data_used": False,
        },
        "threshold_rows": len(threshold_rows),
        "feasible_region_rows": len(feasible_rows),
        "corrected_feasible_rate_for_nested_candidates": feasible_rate,
        "corrected_selected_rows": len(selected),
        "joint_success_among_corrected_selected": len(joint_success) / len(selected) if selected else None,
        "mean_selected_test_miss_rate": mean(r["test_miss_rate"] for r in selected if r["test_miss_rate"] is not None) if selected else None,
        "mean_selected_test_burden": mean(r["test_burden"] for r in selected if r["test_burden"] is not None) if selected else None,
        "policy_families": POLICIES,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, threshold_rows)
    write_csv(OUT_REGION, feasible_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-8 Score-Based Policy Upper Bounds",
        "",
        "This oracle gap diagnostic tests richer one-dimensional score-based policy families. It remains a theory candidate diagnostic and benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Threshold rows: `{len(threshold_rows)}`",
        f"- Feasible-region rows: `{len(feasible_rows)}`",
        f"- Corrected feasible rate among nested candidates: `{feasible_rate:.4f}`",
        f"- Corrected selected rows: `{len(selected)}`",
        f"- Joint alpha/beta success among corrected selected rows: `{payload['joint_success_among_corrected_selected']}`",
        "",
        "## Interpretation",
        "",
        "If richer nested policies substantially expand corrected feasible regions, policy-family limitation explains a meaningful part of the oracle gap. If they do not, score weakness and structural limits remain the stronger explanations.",
    ]) + "\n")
    print(json.dumps({"threshold_rows": len(threshold_rows), "feasible_rows": len(feasible_rows), "feasible_rate": feasible_rate}, indent=2))


if __name__ == "__main__":
    main()
