#!/usr/bin/env python3
"""Batch T-9 Part C: trajectory-score nested warning policies."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean, median
from typing import Any

from option_a_first_event_calibration import option_a_select_threshold
from option_c_dual_constraint_calibration import option_c_select_threshold
from t9_trajectory_scoring_utils import (
    ALPHAS,
    BETAS,
    REPORTS,
    ROW_SCORE_PATH,
    TRAJ_SCORE_PATH,
    TRAJ_FEATURE_PATH,
    quantile,
    read_jsonl,
    safe_float,
    safe_int,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T9_trajectory_score_warning_policies.json"
OUT_MD = REPORTS / "batch_T9_trajectory_score_warning_policies.md"
OUT_CSV = REPORTS / "batch_T9_trajectory_score_warning_policies.csv"
OUT_HEATMAP = REPORTS / "batch_T9_trajectory_score_warning_policy_heatmap.csv"

TIMING_RULES = [
    "earliest_row_above_q90",
    "earliest_row_above_q95",
    "max_row_score_position",
    "earliest_top3_row_score_position",
    "cumulative_hazard_crossing_q80",
]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]


def _ranking_ap(scores: list[float], labels: list[int]) -> float:
    positives = sum(labels)
    if not positives:
        return 0.0
    ranked = sorted(zip(scores, labels), key=lambda x: x[0], reverse=True)
    hits = 0
    total = 0.0
    for rank, (_, label) in enumerate(ranked, start=1):
        if label:
            hits += 1
            total += hits / rank
    return total / positives


def _candidate_trajectory_families(score_rows: list[dict[str, Any]], keep: int = 12) -> list[str]:
    by_family: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for row in score_rows:
        if row["split_role"] == "calibration":
            by_family[str(row["trajectory_score_family"])].append((safe_float(row["score_value"]), safe_int(row["trajectory_has_first_failure"])))
    ranked = []
    for family, vals in by_family.items():
        scores = [v[0] for v in vals]
        labels = [v[1] for v in vals]
        ranked.append((family, _ranking_ap(scores, labels)))
    return [family for family, _ in sorted(ranked, key=lambda x: (x[1], x[0]), reverse=True)[:keep]]


def _row_score_maps(row_rows: list[dict[str, Any]]) -> tuple[dict[tuple[int, str, str, str], list[dict[str, Any]]], dict[tuple[int, str, str], dict[str, float]]]:
    grouped: dict[tuple[int, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    train_values: dict[tuple[int, str], list[float]] = defaultdict(list)
    train_cummax: dict[tuple[int, str], list[float]] = defaultdict(list)
    temp_train_traj: dict[tuple[int, str, str], list[float]] = defaultdict(list)
    for row in row_rows:
        key = (safe_int(row["split_seed"]), str(row["score_family"]), str(row["split_role"]), str(row["trajectory_id"]))
        grouped[key].append(row)
        if row["split_role"] == "train":
            train_values[(safe_int(row["split_seed"]), str(row["score_family"]))].append(safe_float(row["score_value"]))
            temp_train_traj[(safe_int(row["split_seed"]), str(row["score_family"]), str(row["trajectory_id"]))].append(safe_float(row["score_value"]))
    for (seed, family, _tid), vals in temp_train_traj.items():
        running = 0.0
        max_running = 0.0
        for score in vals:
            running += score
            max_running = max(max_running, running)
        train_cummax[(seed, family)].append(max_running)
    thresholds = {}
    for key, vals in train_values.items():
        thresholds[(key[0], key[1], "row")] = {
            "q90": quantile(vals, 0.90),
            "q95": quantile(vals, 0.95),
            "cum_q80": quantile(train_cummax.get(key, []), 0.80),
        }
    for key, vals in grouped.items():
        vals.sort(key=lambda r: safe_int(r["prefix_row_index"]))
    return grouped, thresholds


def _warning_time(rows: list[dict[str, Any]], rule: str, thresholds: dict[str, float]) -> int | None:
    if not rows:
        return None
    if rule == "earliest_row_above_q90":
        for row in rows:
            if safe_float(row["score_value"]) >= thresholds.get("q90", math.inf):
                return safe_int(row["prefix_row_index"])
        return None
    if rule == "earliest_row_above_q95":
        for row in rows:
            if safe_float(row["score_value"]) >= thresholds.get("q95", math.inf):
                return safe_int(row["prefix_row_index"])
        return None
    if rule == "max_row_score_position":
        return safe_int(max(rows, key=lambda r: (safe_float(r["score_value"]), -safe_int(r["prefix_row_index"])))["prefix_row_index"])
    if rule == "earliest_top3_row_score_position":
        top = sorted(rows, key=lambda r: (safe_float(r["score_value"]), -safe_int(r["prefix_row_index"])), reverse=True)[: min(3, len(rows))]
        return min(safe_int(r["prefix_row_index"]) for r in top)
    if rule == "cumulative_hazard_crossing_q80":
        running = 0.0
        for row in rows:
            running += safe_float(row["score_value"])
            if running >= thresholds.get("cum_q80", math.inf):
                return safe_int(row["prefix_row_index"])
        return None
    raise ValueError(rule)


def _policy_metrics(
    traj_rows: list[dict[str, Any]],
    row_grouped: dict[tuple[int, str, str, str], list[dict[str, Any]]],
    row_thresholds: dict[tuple[int, str, str], dict[str, float]],
    *,
    threshold: float,
    row_score_family: str,
    timing_rule: str,
) -> dict[str, Any]:
    bad_total = sum(safe_int(r["trajectory_has_first_failure"]) for r in traj_rows)
    clean_total = len(traj_rows) - bad_total
    warned = covered = pre = late = false = 0
    leads = []
    for row in traj_rows:
        selected = safe_float(row["score_value"]) >= threshold
        warning = None
        if selected:
            rows = row_grouped.get((safe_int(row["split_seed"]), row_score_family, str(row["split_role"]), str(row["trajectory_id"])), [])
            warning = _warning_time(rows, timing_rule, row_thresholds.get((safe_int(row["split_seed"]), row_score_family, "row"), {}))
            if warning is None:
                # A selected trajectory still counts as touched; warn at max row as a conservative offline proxy fallback.
                warning = max((safe_int(r["prefix_row_index"]) for r in rows), default=None)
        if warning is not None:
            warned += 1
        if safe_int(row["trajectory_has_first_failure"]):
            first_bad = safe_int(row["first_bad_row_index"], -1)
            if warning is not None and warning <= first_bad:
                covered += 1
                if warning < first_bad:
                    pre += 1
                leads.append(first_bad - warning)
            elif warning is not None and warning > first_bad:
                late += 1
        elif warning is not None:
            false += 1
    total_rows = sum(safe_int(r["trajectory_length"]) for r in traj_rows)
    return {
        "trajectory_count": len(traj_rows),
        "bad_trajectory_count": bad_total,
        "clean_trajectory_count": clean_total,
        "n_miss": bad_total,
        "n_burden": len(traj_rows),
        "empirical_miss_rate": 1.0 - (covered / bad_total if bad_total else 0.0),
        "empirical_burden": warned / len(traj_rows) if traj_rows else 0.0,
        "empirical_false_alarm_rate": false / clean_total if clean_total else 0.0,
        "empirical_pre_failure_coverage": pre / bad_total if bad_total else 0.0,
        "first_failure_coverage": covered / bad_total if bad_total else 0.0,
        "late_warning_rate": late / bad_total if bad_total else 0.0,
        "row_deferral_rate": warned / total_rows if total_rows else 0.0,
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
    }


def _threshold_table(
    traj_rows: list[dict[str, Any]],
    row_grouped: dict,
    row_thresholds: dict,
    thresholds: list[float],
    row_score_family: str,
    timing_rule: str,
) -> list[dict[str, Any]]:
    rows = []
    for order, threshold in enumerate(thresholds):
        metrics = _policy_metrics(
            traj_rows,
            row_grouped,
            row_thresholds,
            threshold=threshold,
            row_score_family=row_score_family,
            timing_rule=timing_rule,
        )
        rows.append({"threshold": threshold, "threshold_order": order, **metrics})
    return rows


def main() -> None:
    if not TRAJ_SCORE_PATH.exists():
        raise FileNotFoundError(TRAJ_SCORE_PATH)
    score_rows = read_jsonl(TRAJ_SCORE_PATH)
    row_score_rows = read_jsonl(ROW_SCORE_PATH)
    candidate_families = _candidate_trajectory_families(score_rows)
    row_families = sorted({str(row["score_family"]) for row in row_score_rows})
    row_grouped, row_thresholds = _row_score_maps(row_score_rows)
    by_key: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        family = str(row["trajectory_score_family"])
        if family in candidate_families:
            by_key[(safe_int(row["split_seed"]), family, str(row["split_role"]))].append(row)

    threshold_rows = []
    heatmap_rows = []
    for (seed, family, role), rows_for_role in sorted(by_key.items()):
        if role != "train":
            continue
        train_scores = [safe_float(row["score_value"]) for row in rows_for_role]
        thresholds = sorted({float(quantile(train_scores, q)) for q in QUANTILES})
        for row_family in row_families:
            for timing_rule in TIMING_RULES:
                cal_rows = by_key.get((seed, family, "calibration"), [])
                test_rows = by_key.get((seed, family, "test"), [])
                cal_table = _threshold_table(cal_rows, row_grouped, row_thresholds, thresholds, row_family, timing_rule)
                test_table = _threshold_table(test_rows, row_grouped, row_thresholds, thresholds, row_family, timing_rule)
                previous = None
                nested = True
                for threshold in sorted(thresholds):
                    selected = {r["trajectory_id"] for r in cal_rows if safe_float(r["score_value"]) >= threshold}
                    if previous is not None and not selected.issubset(previous):
                        nested = False
                    previous = selected
                for row in cal_table:
                    threshold_rows.append({
                        "split_seed": seed,
                        "trajectory_score_family": family,
                        "row_score_family": row_family,
                        "timing_rule": timing_rule,
                        "nestedness_pass": nested,
                        "split_role": "calibration",
                        **row,
                    })
                for alpha in ALPHAS:
                    a_sel = option_a_select_threshold(
                        cal_table,
                        alpha=alpha,
                        delta=0.10,
                        threshold_grid=thresholds,
                        correction_name="clopper_pearson_union",
                    )
                    a_test = next((r for r in test_table if r["threshold"] == a_sel.get("selected_threshold")), None)
                    heatmap_rows.append({
                        "method": "OptionA_CP_union",
                        "split_seed": seed,
                        "trajectory_score_family": family,
                        "row_score_family": row_family,
                        "timing_rule": timing_rule,
                        "alpha": alpha,
                        "beta": None,
                        "delta": 0.10,
                        "nestedness_pass": nested,
                        "no_safe": bool(a_sel.get("no_safe")),
                        "feasible_count": a_sel.get("feasible_count", 0),
                        "test_miss_rate": a_test.get("empirical_miss_rate") if a_test else None,
                        "test_burden": a_test.get("empirical_burden") if a_test else None,
                        "test_first_failure_coverage": a_test.get("first_failure_coverage") if a_test else None,
                        "test_pre_failure_coverage": a_test.get("empirical_pre_failure_coverage") if a_test else None,
                        "test_false_alarm_rate": a_test.get("empirical_false_alarm_rate") if a_test else None,
                        "test_row_deferral_rate": a_test.get("row_deferral_rate") if a_test else None,
                        "test_mean_lead_time": a_test.get("mean_lead_time") if a_test else None,
                        "alpha_success": bool(a_test and a_test["empirical_miss_rate"] <= alpha),
                        "joint_success": None,
                    })
                    for beta in BETAS:
                        c_sel = option_c_select_threshold(
                            cal_table,
                            alpha=alpha,
                            beta=beta,
                            delta=0.10,
                            threshold_grid=thresholds,
                            correction="clopper_pearson_union",
                        )
                        c_test = next((r for r in test_table if r["threshold"] == c_sel.get("selected_threshold")), None)
                        heatmap_rows.append({
                            "method": "OptionC_CP_union",
                            "split_seed": seed,
                            "trajectory_score_family": family,
                            "row_score_family": row_family,
                            "timing_rule": timing_rule,
                            "alpha": alpha,
                            "beta": beta,
                            "delta": 0.10,
                            "nestedness_pass": nested,
                            "no_safe": bool(c_sel.get("no_safe")),
                            "feasible_count": c_sel.get("feasible_count", 0),
                            "test_miss_rate": c_test.get("empirical_miss_rate") if c_test else None,
                            "test_burden": c_test.get("empirical_burden") if c_test else None,
                            "test_first_failure_coverage": c_test.get("first_failure_coverage") if c_test else None,
                            "test_pre_failure_coverage": c_test.get("empirical_pre_failure_coverage") if c_test else None,
                            "test_false_alarm_rate": c_test.get("empirical_false_alarm_rate") if c_test else None,
                            "test_row_deferral_rate": c_test.get("row_deferral_rate") if c_test else None,
                            "test_mean_lead_time": c_test.get("mean_lead_time") if c_test else None,
                            "alpha_success": bool(c_test and c_test["empirical_miss_rate"] <= alpha),
                            "joint_success": bool(c_test and c_test["empirical_miss_rate"] <= alpha and c_test["empirical_burden"] <= beta),
                        })

    option_a = [r for r in heatmap_rows if r["method"] == "OptionA_CP_union"]
    option_c = [r for r in heatmap_rows if r["method"] == "OptionC_CP_union"]
    selected_a = [r for r in option_a if not r["no_safe"]]
    selected_c = [r for r in option_c if not r["no_safe"]]
    t7_path = REPORTS / "batch_T7_option_C_clean_grid_results.json"
    t7_no_safe = None
    if t7_path.exists():
        t7_obj = json.loads(t7_path.read_text())
        t7_no_safe = t7_obj.get("best_default", {}).get("no_safe_rate", t7_obj.get("no_safe_rate"))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-9",
        "purpose": "trajectory-score threshold then fixed timing warning policy evaluation",
        "candidate_trajectory_score_families": candidate_families,
        "row_score_families": row_families,
        "timing_rules": TIMING_RULES,
        "threshold_rows": len(threshold_rows),
        "heatmap_rows": len(heatmap_rows),
        "nestedness_all_passed": all(r["nestedness_pass"] for r in threshold_rows),
        "option_a_no_safe_rate": sum(1 for r in option_a if r["no_safe"]) / len(option_a) if option_a else None,
        "option_a_mean_selected_test_burden": mean(r["test_burden"] for r in selected_a if r["test_burden"] is not None) if selected_a else None,
        "option_a_mean_selected_test_miss": mean(r["test_miss_rate"] for r in selected_a if r["test_miss_rate"] is not None) if selected_a else None,
        "option_c_no_safe_rate": sum(1 for r in option_c if r["no_safe"]) / len(option_c) if option_c else None,
        "option_c_selected_rows": len(selected_c),
        "option_c_joint_success": sum(1 for r in selected_c if r["joint_success"]) / len(selected_c) if selected_c else None,
        "option_c_feasible_alpha_beta_cells": len({(r["alpha"], r["beta"]) for r in selected_c}),
        "t7_option_c_no_safe_reference": t7_no_safe,
        "guard_results": {
            "raw_text_used": False,
            "metadata_used_as_model_features": False,
            "test_tuning": False,
            "mock_data_used": False,
        },
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "offline_proxy": True,
        },
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, threshold_rows)
    write_csv(OUT_HEATMAP, heatmap_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-9 Trajectory-Score Warning Policies",
        "",
        "This evaluates trajectory-level scoring inside nested first-event warning policies for trajectory-level loss. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Candidate trajectory score families: `{len(candidate_families)}`",
        f"- Threshold rows: `{len(threshold_rows)}`",
        f"- Heatmap rows: `{len(heatmap_rows)}`",
        f"- Nestedness all passed: `{payload['nestedness_all_passed']}`",
        f"- Option A no_safe rate: `{payload['option_a_no_safe_rate']}`",
        f"- Option C no_safe rate: `{payload['option_c_no_safe_rate']}`",
        f"- Option C selected rows: `{len(selected_c)}`",
        f"- T-7 Option C no_safe reference: `{t7_no_safe}`",
        "",
        "The selected trajectory set is thresholded on a trajectory-level score, while warning timing is fixed independently of the trajectory threshold. That preserves nestedness for the evaluated threshold family.",
    ]) + "\n")
    print(json.dumps({"threshold_rows": len(threshold_rows), "option_c_no_safe": payload["option_c_no_safe_rate"]}, indent=2))


if __name__ == "__main__":
    main()
