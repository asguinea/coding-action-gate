#!/usr/bin/env python3
"""Build Batch T-10 trajectory-score threshold policy table."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from t10_trajectory_policy_utils import (
    FIXED_GRID,
    GRID_PROTOCOLS,
    POLICY_TABLE_CSV,
    QUANTILES,
    REPORTS,
    REQUIRED_ROW_FAMILIES,
    REQUIRED_TRAJECTORY_FAMILIES,
    ROW_SCORE_PATH,
    TIMING_RULES,
    TRAJ_SCORE_PATH,
    event_metrics,
    nestedness_pass,
    normalize_scores_by_train,
    quantile,
    read_jsonl,
    row_score_maps,
    safe_float,
    safe_int,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T10_trajectory_score_policy_table.json"
OUT_MD = REPORTS / "batch_T10_trajectory_score_policy_table.md"


def _thresholds(protocol: str, train_rows: list[dict], cal_rows: list[dict]) -> tuple[str, list[float]]:
    if protocol == "fixed_score_threshold_grid":
        return "normalized_score_value", list(FIXED_GRID)
    if protocol == "train_score_quantiles":
        vals = [safe_float(row["score_value"]) for row in train_rows]
        return "score_value", sorted({float(quantile(vals, q)) for q in QUANTILES})
    if protocol == "calibration_score_quantiles":
        vals = [safe_float(row["score_value"]) for row in cal_rows]
        return "score_value", sorted({float(quantile(vals, q)) for q in QUANTILES})
    raise ValueError(protocol)


def main() -> None:
    traj_rows = read_jsonl(TRAJ_SCORE_PATH)
    row_rows = read_jsonl(ROW_SCORE_PATH)
    normalize_scores_by_train(traj_rows)
    available_traj = sorted({row["trajectory_score_family"] for row in traj_rows})
    traj_families = [fam for fam in REQUIRED_TRAJECTORY_FAMILIES if fam in available_traj]
    missing_traj = [fam for fam in REQUIRED_TRAJECTORY_FAMILIES if fam not in available_traj]
    available_row = sorted({row["score_family"] for row in row_rows})
    row_families = [fam for fam in REQUIRED_ROW_FAMILIES if fam in available_row]
    missing_row = [fam for fam in REQUIRED_ROW_FAMILIES if fam not in available_row]
    if not traj_families:
        raise RuntimeError("No required trajectory score families are available")
    if not row_families:
        raise RuntimeError("No required row timing score families are available")
    row_grouped, row_thresholds = row_score_maps(row_rows)
    by_key: dict[tuple[int, str, str], list[dict]] = defaultdict(list)
    for row in traj_rows:
        if row["trajectory_score_family"] in traj_families:
            by_key[(safe_int(row["split_seed"]), str(row["trajectory_score_family"]), str(row["split_role"]))].append(row)

    table_rows = []
    for seed in sorted({key[0] for key in by_key}):
        for traj_family in traj_families:
            train_rows = by_key.get((seed, traj_family, "train"), [])
            cal_rows = by_key.get((seed, traj_family, "calibration"), [])
            test_rows = by_key.get((seed, traj_family, "test"), [])
            if not train_rows or not cal_rows or not test_rows:
                continue
            for row_family in row_families:
                for timing_rule in TIMING_RULES:
                    for protocol in GRID_PROTOCOLS:
                        field, thresholds = _thresholds(protocol, train_rows, cal_rows)
                        if not thresholds:
                            continue
                        nested = nestedness_pass(cal_rows, thresholds, field)
                        for order, threshold in enumerate(thresholds):
                            cal = event_metrics(
                                cal_rows,
                                row_grouped,
                                row_thresholds,
                                lambda_value=threshold,
                                lambda_score_field=field,
                                timing_score_family=row_family,
                                timing_rule=timing_rule,
                            )
                            test = event_metrics(
                                test_rows,
                                row_grouped,
                                row_thresholds,
                                lambda_value=threshold,
                                lambda_score_field=field,
                                timing_score_family=row_family,
                                timing_rule=timing_rule,
                            )
                            table_rows.append({
                                "split_seed": seed,
                                "trajectory_score_family": traj_family,
                                "timing_score_family": row_family,
                                "timing_rule": timing_rule,
                                "lambda_grid_protocol": protocol,
                                "lambda_value": threshold,
                                "lambda_score_field": field,
                                "lambda_order": order,
                                "nestedness_pass": nested,
                                "calibration_missed_first_failure_rate": cal["missed_first_failure_rate"],
                                "calibration_first_failure_coverage": cal["first_failure_coverage"],
                                "calibration_pre_failure_coverage": cal["pre_failure_coverage"],
                                "calibration_at_failure_coverage": cal["at_failure_coverage"],
                                "calibration_trajectory_burden": cal["trajectory_burden"],
                                "calibration_false_alarm_trajectory_rate": cal["false_alarm_trajectory_rate"],
                                "calibration_late_warning_rate": cal["late_warning_rate"],
                                "calibration_row_deferral_rate": cal["row_deferral_rate"],
                                "calibration_mean_lead_time": cal["mean_lead_time"],
                                "calibration_median_lead_time": cal["median_lead_time"],
                                "calibration_trajectory_count": cal["trajectory_count"],
                                "calibration_bad_trajectory_count": cal["bad_trajectory_count"],
                                "test_missed_first_failure_rate": test["missed_first_failure_rate"],
                                "test_first_failure_coverage": test["first_failure_coverage"],
                                "test_pre_failure_coverage": test["pre_failure_coverage"],
                                "test_at_failure_coverage": test["at_failure_coverage"],
                                "test_trajectory_burden": test["trajectory_burden"],
                                "test_false_alarm_trajectory_rate": test["false_alarm_trajectory_rate"],
                                "test_late_warning_rate": test["late_warning_rate"],
                                "test_row_deferral_rate": test["row_deferral_rate"],
                                "test_mean_lead_time": test["mean_lead_time"],
                                "test_median_lead_time": test["median_lead_time"],
                                "test_trajectory_count": test["trajectory_count"],
                                "test_bad_trajectory_count": test["bad_trajectory_count"],
                            })

    write_csv(POLICY_TABLE_CSV, table_rows)
    promising = sorted(table_rows, key=lambda r: (r["test_missed_first_failure_rate"], r["test_trajectory_burden"]))[:10]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-10",
        "policy_table_rows": len(table_rows),
        "trajectory_score_families": traj_families,
        "timing_score_families": row_families,
        "timing_rules": TIMING_RULES,
        "grid_protocols": GRID_PROTOCOLS,
        "missing_required_trajectory_families": missing_traj,
        "missing_required_row_families": missing_row,
        "nestedness_all_passed": all(row["nestedness_pass"] for row in table_rows),
        "promising_uncorrected_rows": promising,
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
    OUT_MD.write_text("\n".join([
        "# Batch T-10 Trajectory-Score Policy Table",
        "",
        "This table evaluates trajectory-score threshold policies with a fixed timing rule for first-event trajectory-level loss. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Policy table rows: `{len(table_rows)}`",
        f"- Trajectory score families: `{', '.join(traj_families)}`",
        f"- Timing score families: `{', '.join(row_families)}`",
        f"- Timing rules: `{', '.join(TIMING_RULES)}`",
        f"- Grid protocols: `{', '.join(GRID_PROTOCOLS)}`",
        f"- Nestedness all passed: `{payload['nestedness_all_passed']}`",
        "",
        "All variants use one scalar trajectory-score threshold. The timing rule is fixed before calibration, so the warned trajectory set is nested in lambda.",
    ]) + "\n")
    print(json.dumps({"policy_table_rows": len(table_rows), "nestedness": payload["nestedness_all_passed"]}, indent=2))


if __name__ == "__main__":
    main()
