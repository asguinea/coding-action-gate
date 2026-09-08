#!/usr/bin/env python3
"""Evaluate Option A for Batch T-10 trajectory-score threshold policies."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean

from option_a_first_event_calibration import option_a_select_threshold
from t10_trajectory_policy_utils import (
    ALPHAS,
    DELTAS,
    GRID_PROTOCOLS,
    POLICY_TABLE_CSV,
    REPORTS,
    group_rows,
    load_policy_table,
    safe_float,
    safe_int,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T10_option_A_trajectory_score_policy.json"
OUT_MD = REPORTS / "batch_T10_option_A_trajectory_score_policy.md"
OUT_CSV = REPORTS / "batch_T10_option_A_trajectory_score_policy.csv"
OUT_BY_TIMING = REPORTS / "batch_T10_option_A_by_timing_rule.csv"
CORRECTIONS = ["clopper_pearson_union", "hoeffding_union_bound", "plus_one_empirical_proxy"]


def _calibration_table(rows: list[dict]) -> list[dict]:
    out = []
    for row in sorted(rows, key=lambda r: safe_int(r["lambda_order"])):
        out.append({
            "threshold": safe_float(row["lambda_value"]),
            "threshold_order": safe_int(row["lambda_order"]),
            "n_risk": safe_int(row["calibration_bad_trajectory_count"]),
            "empirical_miss_rate": safe_float(row["calibration_missed_first_failure_rate"]),
            "empirical_burden": safe_float(row["calibration_trajectory_burden"]),
            "empirical_false_alarm_rate": safe_float(row["calibration_false_alarm_trajectory_rate"]),
            "empirical_pre_failure_coverage": safe_float(row["calibration_pre_failure_coverage"]),
        })
    return out


def main() -> None:
    rows = load_policy_table()
    groups = group_rows(rows, ["split_seed", "trajectory_score_family", "timing_score_family", "timing_rule", "lambda_grid_protocol"])
    result_rows = []
    for key, group in groups.items():
        thresholds = [safe_float(row["lambda_value"]) for row in sorted(group, key=lambda r: safe_int(r["lambda_order"]))]
        cal_table = _calibration_table(group)
        for correction in CORRECTIONS:
            for delta in DELTAS:
                for alpha in ALPHAS:
                    selection = option_a_select_threshold(
                        cal_table,
                        alpha=alpha,
                        delta=delta,
                        threshold_grid=thresholds,
                        correction_name=correction,
                    )
                    test = next((row for row in group if safe_float(row["lambda_value"]) == selection.get("selected_threshold")), None)
                    result_rows.append({
                        "split_seed": key[0],
                        "trajectory_score_family": key[1],
                        "timing_score_family": key[2],
                        "timing_rule": key[3],
                        "lambda_grid_protocol": key[4],
                        "correction": correction,
                        "delta": delta,
                        "alpha": alpha,
                        "no_safe": bool(selection.get("no_safe")),
                        "feasible_count": selection.get("feasible_count", 0),
                        "selected_lambda": selection.get("selected_threshold"),
                        "selected_test_missed_first_failure_rate": safe_float(test["test_missed_first_failure_rate"]) if test else None,
                        "alpha_success": bool(test and safe_float(test["test_missed_first_failure_rate"]) <= alpha),
                        "selected_test_trajectory_burden": safe_float(test["test_trajectory_burden"]) if test else None,
                        "selected_test_false_alarm_trajectory_rate": safe_float(test["test_false_alarm_trajectory_rate"]) if test else None,
                        "selected_test_first_failure_coverage": safe_float(test["test_first_failure_coverage"]) if test else None,
                        "selected_test_pre_failure_coverage": safe_float(test["test_pre_failure_coverage"]) if test else None,
                        "selected_test_row_deferral_rate": safe_float(test["test_row_deferral_rate"]) if test else None,
                        "selected_test_mean_lead_time": safe_float(test["test_mean_lead_time"], None) if test and test["test_mean_lead_time"] not in {"", None} else None,
                        "diagnostic_only": correction == "plus_one_empirical_proxy",
                    })
    default = [r for r in result_rows if r["correction"] == "clopper_pearson_union"]
    selected = [r for r in default if not r["no_safe"]]
    by_timing = []
    timing_groups: dict[str, list[dict]] = defaultdict(list)
    for row in default:
        timing_groups[row["timing_rule"]].append(row)
    for timing, vals in sorted(timing_groups.items()):
        sel = [v for v in vals if not v["no_safe"]]
        by_timing.append({
            "timing_rule": timing,
            "no_safe_rate": sum(1 for v in vals if v["no_safe"]) / len(vals),
            "selected_count": len(sel),
            "mean_selected_test_burden": mean(v["selected_test_trajectory_burden"] for v in sel if v["selected_test_trajectory_burden"] is not None) if sel else None,
            "mean_selected_test_miss": mean(v["selected_test_missed_first_failure_rate"] for v in sel if v["selected_test_missed_first_failure_rate"] is not None) if sel else None,
            "alpha_success": sum(1 for v in sel if v["alpha_success"]) / len(sel) if sel else None,
        })
    t9_path = REPORTS / "batch_T9_trajectory_score_warning_policies.json"
    t9_ref = json.loads(t9_path.read_text()) if t9_path.exists() else {}
    t7_path = REPORTS / "batch_T7_option_A_clean_grid_results.json"
    t7_ref = json.loads(t7_path.read_text()) if t7_path.exists() else {}
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-10",
        "result_rows": len(result_rows),
        "default_no_safe_rate": sum(1 for r in default if r["no_safe"]) / len(default) if default else None,
        "default_selected_rows": len(selected),
        "default_alpha_success": sum(1 for r in selected if r["alpha_success"]) / len(selected) if selected else None,
        "default_mean_selected_test_miss": mean(r["selected_test_missed_first_failure_rate"] for r in selected if r["selected_test_missed_first_failure_rate"] is not None) if selected else None,
        "default_mean_selected_test_burden": mean(r["selected_test_trajectory_burden"] for r in selected if r["selected_test_trajectory_burden"] is not None) if selected else None,
        "t9_option_a_no_safe_reference": t9_ref.get("option_a_no_safe_rate"),
        "t9_option_a_burden_reference": t9_ref.get("option_a_mean_selected_test_burden"),
        "t7_option_a_reference": t7_ref.get("best_default", t7_ref),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    write_csv(OUT_BY_TIMING, by_timing)
    OUT_MD.write_text("\n".join([
        "# Batch T-10 Option A Trajectory-Score Policy",
        "",
        "This evaluates Option A for trajectory-score threshold policies with fixed timing rule and finite-grid correction. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Result rows: `{len(result_rows)}`",
        f"- Default no_safe_recommendation rate: `{payload['default_no_safe_rate']}`",
        f"- Default alpha success: `{payload['default_alpha_success']}`",
        f"- Default mean selected missed first failure: `{payload['default_mean_selected_test_miss']}`",
        f"- Default mean selected trajectory burden: `{payload['default_mean_selected_test_burden']}`",
        f"- T-9 burden reference: `{payload['t9_option_a_burden_reference']}`",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "no_safe": payload["default_no_safe_rate"], "burden": payload["default_mean_selected_test_burden"]}, indent=2))


if __name__ == "__main__":
    main()
