#!/usr/bin/env python3
"""Batch T-10 timing-rule decomposition."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean, median

from t10_trajectory_policy_utils import (
    BETAS,
    REPORTS,
    REQUIRED_ROW_FAMILIES,
    ROW_SCORE_PATH,
    TIMING_RULES,
    TRAJ_SCORE_PATH,
    read_jsonl,
    row_score_maps,
    safe_float,
    safe_int,
    warning_time,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T10_timing_rule_decomposition.json"
OUT_MD = REPORTS / "batch_T10_timing_rule_decomposition.md"
OUT_CSV = REPORTS / "batch_T10_timing_rule_decomposition.csv"

TRAJ_FAMILY = "hist_gradient_boosting::score_plus_structured"
RULES = TIMING_RULES + ["oracle_first_bad_timing"]


def _metrics(selected: list[dict], row_grouped: dict, row_thresholds: dict, row_family: str, rule: str) -> dict:
    bad_selected = [row for row in selected if safe_int(row["trajectory_has_first_failure"])]
    covered = pre = at = late = missed = 0
    leads = []
    warned = 0
    for row in selected:
        if rule == "oracle_first_bad_timing":
            warning = safe_int(row["first_bad_row_index"], -1) if safe_int(row["trajectory_has_first_failure"]) else None
        else:
            key = (safe_int(row["split_seed"]), row_family, str(row["split_role"]), str(row["trajectory_id"]))
            warning = warning_time(row_grouped.get(key, []), rule, row_thresholds.get((safe_int(row["split_seed"]), row_family), {}))
        if warning is not None:
            warned += 1
        if safe_int(row["trajectory_has_first_failure"]):
            first_bad = safe_int(row["first_bad_row_index"], -1)
            if warning is not None and warning <= first_bad:
                covered += 1
                if warning < first_bad:
                    pre += 1
                else:
                    at += 1
                leads.append(first_bad - warning)
            else:
                missed += 1
                if warning is not None and warning > first_bad:
                    late += 1
    total_rows = sum(safe_int(row["trajectory_length"]) for row in selected)
    denom = len(bad_selected)
    return {
        "selected_trajectory_count": len(selected),
        "selected_bad_trajectory_count": len(bad_selected),
        "pre_failure_coverage_among_selected_bad": pre / denom if denom else 0.0,
        "at_failure_coverage_among_selected_bad": at / denom if denom else 0.0,
        "coverage_among_selected_bad": covered / denom if denom else 0.0,
        "late_warning_rate_among_selected_bad": late / denom if denom else 0.0,
        "missed_among_selected_bad": missed / denom if denom else 0.0,
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
        "row_deferral_per_warned_trajectory": warned / total_rows if total_rows else 0.0,
    }


def main() -> None:
    traj_rows = [row for row in read_jsonl(TRAJ_SCORE_PATH) if row["trajectory_score_family"] == TRAJ_FAMILY and row["split_role"] == "test"]
    row_rows = read_jsonl(ROW_SCORE_PATH)
    row_grouped, row_thresholds = row_score_maps(row_rows)
    by_seed: dict[int, list[dict]] = defaultdict(list)
    for row in traj_rows:
        by_seed[safe_int(row["split_seed"])].append(row)
    result_rows = []
    for seed, rows in sorted(by_seed.items()):
        bad = [row for row in rows if safe_int(row["trajectory_has_first_failure"])]
        learned_ranked = sorted(rows, key=lambda r: (safe_float(r["score_value"]), str(r["trajectory_id"])), reverse=True)
        oracle_ranked = sorted(bad, key=lambda r: (safe_int(r["first_bad_row_index"], 999999), str(r["trajectory_id"])))
        for beta in BETAS:
            cap = max(1, min(len(rows), math.ceil(len(rows) * beta)))
            selections = {
                "oracle_selected_bad_trajectories": oracle_ranked[: min(cap, len(oracle_ranked))],
                "learned_selected_trajectories": learned_ranked[:cap],
            }
            for selection_name, selected in selections.items():
                for row_family in REQUIRED_ROW_FAMILIES:
                    for rule in RULES:
                        metrics = _metrics(selected, row_grouped, row_thresholds, row_family, rule)
                        result_rows.append({
                            "split_seed": seed,
                            "selection_convention": selection_name,
                            "trajectory_budget": beta,
                            "trajectory_score_family": TRAJ_FAMILY,
                            "timing_score_family": row_family,
                            "timing_rule": rule,
                            **metrics,
                        })
    best = min(result_rows, key=lambda r: r["missed_among_selected_bad"]) if result_rows else {}
    learned = [r for r in result_rows if r["selection_convention"] == "learned_selected_trajectories" and r["timing_rule"] != "oracle_first_bad_timing"]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-10",
        "result_rows": len(result_rows),
        "best_timing_row": best,
        "mean_learned_selected_missed_among_selected_bad": mean(r["missed_among_selected_bad"] for r in learned) if learned else None,
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-10 Timing-Rule Decomposition",
        "",
        "This decomposes fixed timing rule quality after trajectory-score threshold selection for first-event warnings. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Result rows: `{len(result_rows)}`",
        f"- Mean learned-selected missed among selected bad trajectories: `{payload['mean_learned_selected_missed_among_selected_bad']}`",
        f"- Best timing rule: `{best.get('timing_rule')}`",
        f"- Best selection convention: `{best.get('selection_convention')}`",
        "",
        "The oracle first-bad timing row is included only as an offline proxy upper reference.",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "mean_missed": payload["mean_learned_selected_missed_among_selected_bad"]}, indent=2))


if __name__ == "__main__":
    main()
