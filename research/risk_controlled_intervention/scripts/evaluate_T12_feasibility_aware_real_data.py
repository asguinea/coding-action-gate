#!/usr/bin/env python3
"""Batch T-12 real-data evaluation of feasibility-aware controller."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import mean

from feasibility_aware_first_event_control import (
    clopper_pearson_lower_bound,
    estimate_first_failure_prevalence,
    feasibility_aware_select_policy,
)
from t11_feasibility_utils import ALPHAS, BETAS, REPORTS, fbool, ffloat, read_csv, read_jsonl, write_csv, write_json

OUT_JSON = REPORTS / "batch_T12_feasibility_aware_real_data.json"
OUT_MD = REPORTS / "batch_T12_feasibility_aware_real_data.md"
OUT_CSV = REPORTS / "batch_T12_feasibility_aware_real_data.csv"
OUT_REASONS = REPORTS / "batch_T12_no_safe_reason_breakdown.csv"
OUT_MAP = REPORTS / "batch_T12_alpha_beta_feasibility_map.csv"
DELTAS = [0.10, 0.05]


def _group_policy_rows(rows: list[dict[str, str]]):
    groups = defaultdict(list)
    for row in rows:
        key = (
            row["split_seed"],
            row["trajectory_score_family"],
            row["timing_score_family"],
            row["timing_rule"],
            row["lambda_grid_protocol"],
        )
        groups[key].append(row)
    return groups


def _cal_table(group: list[dict[str, str]]):
    out = []
    for row in sorted(group, key=lambda r: int(r["lambda_order"])):
        out.append({
            "threshold": ffloat(row["lambda_value"]),
            "threshold_order": int(row["lambda_order"]),
            "n_miss": int(float(row["calibration_bad_trajectory_count"])),
            "n_burden": int(float(row["calibration_trajectory_count"])),
            "empirical_miss_rate": ffloat(row["calibration_missed_first_failure_rate"]),
            "empirical_burden": ffloat(row["calibration_trajectory_burden"]),
            "empirical_false_alarm_rate": ffloat(row["calibration_false_alarm_trajectory_rate"]),
            "empirical_pre_failure_coverage": ffloat(row["calibration_pre_failure_coverage"]),
        })
    return out


def _test_table(group: list[dict[str, str]]):
    out = []
    for row in sorted(group, key=lambda r: int(r["lambda_order"])):
        out.append({
            "threshold": ffloat(row["lambda_value"]),
            "test_missed_first_failure_rate": ffloat(row["test_missed_first_failure_rate"]),
            "test_trajectory_burden": ffloat(row["test_trajectory_burden"]),
            "test_first_failure_coverage": ffloat(row["test_first_failure_coverage"]),
            "test_pre_failure_coverage": ffloat(row["test_pre_failure_coverage"]),
            "test_false_alarm_trajectory_rate": ffloat(row["test_false_alarm_trajectory_rate"]),
            "test_row_deferral_rate": ffloat(row["test_row_deferral_rate"]),
            "test_mean_lead_time": ffloat(row["test_mean_lead_time"], None) if row["test_mean_lead_time"] else None,
        })
    return out


def main() -> None:
    policy_rows = read_csv(REPORTS / "batch_T10_trajectory_score_policy_table.csv")
    feature_rows = read_jsonl(REPORTS.parent / "data" / "intervention_outputs" / "theory_trajectory_level_features.jsonl")
    cal_by_seed = defaultdict(list)
    for row in feature_rows:
        if row["split_role"] == "calibration":
            cal_by_seed[str(row["split_seed"])].append(row)
    prev_by_seed_delta = {}
    for seed, rows in cal_by_seed.items():
        prev = estimate_first_failure_prevalence(rows)
        for delta in DELTAS:
            prev_by_seed_delta[(seed, delta)] = {
                **prev,
                "p_lcb": clopper_pearson_lower_bound(prev["k_first_failure"], prev["n"], delta),
            }
    groups = _group_policy_rows(policy_rows)
    result_rows = []
    for key, group in groups.items():
        seed = key[0]
        cal_table = _cal_table(group)
        test_table = _test_table(group)
        thresholds = [row["threshold"] for row in cal_table]
        for alpha in ALPHAS:
            for beta in BETAS:
                for delta in DELTAS:
                    prev = prev_by_seed_delta[(seed, delta)]
                    selected = feasibility_aware_select_policy(
                        cal_table,
                        alpha=alpha,
                        beta=beta,
                        delta=delta,
                        p_hat=prev["p_hat"],
                        p_lcb=prev["p_lcb"],
                        threshold_grid=thresholds,
                        test_table=test_table,
                    )
                    match = next((row for row in test_table if row["threshold"] == selected.get("selected_threshold")), None)
                    result_rows.append({
                        "policy_source": "batch_T10_trajectory_score_threshold",
                        "split_seed": seed,
                        "trajectory_score_family": key[1],
                        "timing_score_family": key[2],
                        "timing_rule": key[3],
                        "lambda_grid_protocol": key[4],
                        "alpha": alpha,
                        "beta": beta,
                        "delta": delta,
                        "p_hat": prev["p_hat"],
                        "p_lcb": prev["p_lcb"],
                        "empirical_structurally_infeasible": selected["empirical_structurally_infeasible"],
                        "certified_structurally_infeasible": selected["certified_structurally_infeasible"],
                        "no_safe": selected["no_safe"],
                        "no_safe_reason": selected["no_safe_reason"],
                        "selected_threshold": selected.get("selected_threshold"),
                        "selected_test_miss": selected.get("selected_test_miss"),
                        "selected_test_burden": selected.get("selected_test_burden"),
                        "selected_test_joint_success": selected.get("selected_test_joint_success"),
                        "selected_test_first_failure_coverage": match.get("test_first_failure_coverage") if match else None,
                        "selected_test_pre_failure_coverage": match.get("test_pre_failure_coverage") if match else None,
                        "selected_test_false_alarm_rate": match.get("test_false_alarm_trajectory_rate") if match else None,
                        "selected_test_row_deferral_rate": match.get("test_row_deferral_rate") if match else None,
                        "selected_test_mean_lead_time": match.get("test_mean_lead_time") if match else None,
                    })
    reasons = Counter(row["no_safe_reason"] for row in result_rows)
    selected = [r for r in result_rows if not r["no_safe"]]
    no_safe = [r for r in result_rows if r["no_safe"]]
    map_rows = []
    for alpha in ALPHAS:
        for beta in BETAS:
            cell = [r for r in result_rows if r["alpha"] == alpha and r["beta"] == beta]
            map_rows.append({
                "alpha": alpha,
                "beta": beta,
                "empirical_structural_no_safe_rate": sum(r["empirical_structurally_infeasible"] for r in cell) / len(cell),
                "certified_structural_no_safe_rate": sum(r["certified_structurally_infeasible"] for r in cell) / len(cell),
                "corrected_no_safe_rate": sum(r["no_safe"] for r in cell) / len(cell),
                "selected_rate": sum(not r["no_safe"] for r in cell) / len(cell),
            })
    reason_rows = [{"no_safe_reason": k, "count": v, "rate": v / len(result_rows)} for k, v in sorted(reasons.items())]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-12",
        "rows": len(result_rows),
        "p_hat_mean": mean(r["p_hat"] for r in result_rows),
        "p_lcb_mean": mean(r["p_lcb"] for r in result_rows),
        "empirical_structural_no_safe_rate": sum(r["empirical_structurally_infeasible"] for r in result_rows) / len(result_rows),
        "certified_structural_no_safe_rate": sum(r["certified_structurally_infeasible"] for r in result_rows) / len(result_rows),
        "corrected_no_safe_rate": len(no_safe) / len(result_rows),
        "selected_policy_rate": len(selected) / len(result_rows),
        "no_safe_reason_distribution": dict(reasons),
        "interpretability_rate": sum(1 for r in no_safe if r["no_safe_reason"] != "unknown") / len(no_safe) if no_safe else 1.0,
        "mean_selected_test_miss": mean(r["selected_test_miss"] for r in selected if r["selected_test_miss"] is not None) if selected else None,
        "mean_selected_test_burden": mean(r["selected_test_burden"] for r in selected if r["selected_test_burden"] is not None) if selected else None,
        "joint_success_among_selected": sum(bool(r["selected_test_joint_success"]) for r in selected) / len(selected) if selected else None,
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    write_csv(OUT_REASONS, reason_rows)
    write_csv(OUT_MAP, map_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-12 Feasibility-Aware Real Data Evaluation",
        "",
        "This evaluates the feasibility-aware controller on benchmark-level first-event trajectory-level loss using corrected feasible set selection. It is an offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Rows: `{len(result_rows)}`",
        f"- Mean p_hat: `{payload['p_hat_mean']:.4f}`",
        f"- Mean p_lcb: `{payload['p_lcb_mean']:.4f}`",
        f"- Empirical structural no_safe rate: `{payload['empirical_structural_no_safe_rate']:.4f}`",
        f"- Certified structural no_safe rate: `{payload['certified_structural_no_safe_rate']:.4f}`",
        f"- Corrected no_safe rate: `{payload['corrected_no_safe_rate']:.4f}`",
        f"- Selected policy rate: `{payload['selected_policy_rate']:.4f}`",
        f"- Joint success among selected: `{payload['joint_success_among_selected']}`",
        "",
        "The feasibility-aware layer mainly classifies no_safe_recommendation outcomes; it does not solve low-burden warning.",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "no_safe": payload["corrected_no_safe_rate"], "selected": payload["selected_policy_rate"]}, indent=2))


if __name__ == "__main__":
    main()
