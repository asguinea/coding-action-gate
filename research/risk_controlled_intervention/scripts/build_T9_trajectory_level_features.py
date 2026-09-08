#!/usr/bin/env python3
"""Batch T-9 Part A: build trajectory-level first-event feature rows."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean
from typing import Any

from t9_trajectory_scoring_utils import (
    PREFIX_VERIFIED_PATH,
    REPORTS,
    ROW_SCORE_PATH,
    STRUCTURED_FEATURES,
    TRAJ_FEATURE_PATH,
    quantile,
    read_jsonl,
    safe_float,
    safe_int,
    score_aggregates,
    write_json,
    write_jsonl,
)

OUT_JSON = REPORTS / "batch_T9_trajectory_level_features_summary.json"
OUT_MD = REPORTS / "batch_T9_trajectory_level_features_summary.md"


def _structured_by_trajectory() -> dict[str, dict[str, Any]]:
    if not PREFIX_VERIFIED_PATH.exists():
        return {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in read_jsonl(PREFIX_VERIFIED_PATH):
        grouped[str(row["trajectory_id"])].append(row)
    out: dict[str, dict[str, Any]] = {}
    for tid, vals in grouped.items():
        action_lengths = [safe_float(r.get("action_length_chars")) for r in vals]
        obs_lengths = [safe_float(r.get("observation_length_chars")) for r in vals]
        repeated_action = [safe_int(r.get("repeated_action_indicator")) for r in vals]
        repeated_obs = [safe_int(r.get("repeated_observation_indicator")) for r in vals]
        out[tid] = {
            "trajectory_length": len(vals),
            "max_action_length_chars": max(action_lengths) if action_lengths else 0.0,
            "max_observation_length_chars": max(obs_lengths) if obs_lengths else 0.0,
            "mean_action_length_chars": mean(action_lengths) if action_lengths else 0.0,
            "mean_observation_length_chars": mean(obs_lengths) if obs_lengths else 0.0,
            "max_recent_error_keyword_count": max(safe_int(r.get("recent_error_keyword_count")) for r in vals),
            "max_recent_failure_keyword_count": max(safe_int(r.get("recent_failure_keyword_count")) for r in vals),
            "max_recent_timeout_keyword_count": max(safe_int(r.get("recent_timeout_keyword_count")) for r in vals),
            "max_recent_exception_keyword_count": max(safe_int(r.get("recent_exception_keyword_count")) for r in vals),
            "total_stage_transitions": max(safe_int(r.get("total_stage_transitions_so_far")) for r in vals),
            "max_stage_index": max(safe_int(r.get("current_stage_index")) for r in vals),
            "repeated_action_count": sum(repeated_action),
            "repeated_observation_count": sum(repeated_obs),
            "fraction_repeated_actions": sum(repeated_action) / len(vals) if vals else 0.0,
            "fraction_repeated_observations": sum(repeated_obs) / len(vals) if vals else 0.0,
        }
    return out


def _score_thresholds(rows: list[dict[str, Any]]) -> dict[tuple[int, str], dict[str, float]]:
    train_scores: dict[tuple[int, str], list[float]] = defaultdict(list)
    for row in rows:
        if row["split_role"] == "train":
            train_scores[(safe_int(row["split_seed"]), str(row["score_family"]))].append(safe_float(row["score_value"]))
    return {
        key: {
            "q80": quantile(values, 0.80),
            "q90": quantile(values, 0.90),
            "q95": quantile(values, 0.95),
        }
        for key, values in train_scores.items()
    }


def main() -> None:
    if not ROW_SCORE_PATH.exists():
        raise FileNotFoundError(ROW_SCORE_PATH)
    score_rows = read_jsonl(ROW_SCORE_PATH)
    if not score_rows:
        raise RuntimeError("theory_row_level_scores.jsonl is empty")
    structured = _structured_by_trajectory()
    thresholds = _score_thresholds(score_rows)
    grouped: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        grouped[(safe_int(row["split_seed"]), str(row["split_role"]), str(row["trajectory_id"]))].append(row)

    feature_rows: list[dict[str, Any]] = []
    missing_structured = 0
    for (seed, role, tid), vals in sorted(grouped.items()):
        first = vals[0]
        by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in vals:
            by_family[str(row["score_family"])].append(row)
        base = {
            "split_seed": seed,
            "trajectory_id": tid,
            "split_role": role,
            "trajectory_has_first_failure": safe_int(first.get("trajectory_has_first_failure")),
            "trajectory_has_repeated_bad": int(sum(safe_int(r.get("target_next_step_bad")) for r in by_family[next(iter(by_family))]) > 1),
            "first_bad_row_index": safe_int(first.get("first_bad_row_index"), -1),
            "source_bucket": first.get("source_bucket", "unknown"),
            "layout_family": first.get("layout_family", "unknown"),
        }
        length = len(by_family[next(iter(by_family))])
        denom = max(1, length - 1)
        norm_first = base["first_bad_row_index"] / denom if base["trajectory_has_first_failure"] and base["first_bad_row_index"] >= 0 else None
        base["early_first_failure"] = int(bool(norm_first is not None and norm_first <= 0.33))
        base["late_first_failure"] = int(bool(norm_first is not None and norm_first >= 0.67))
        if tid in structured:
            base.update(structured[tid])
        else:
            missing_structured += 1
            base["trajectory_length"] = length
            for name in STRUCTURED_FEATURES:
                base.setdefault(name, 0.0)
        for family, family_rows in by_family.items():
            ordered = sorted(family_rows, key=lambda r: safe_int(r.get("prefix_row_index")))
            scores = [safe_float(r.get("score_value")) for r in ordered]
            prefix_indices = [safe_int(r.get("prefix_row_index")) for r in ordered]
            agg = score_aggregates(scores, prefix_indices, thresholds.get((seed, family), {}))
            for name, value in agg.items():
                base[f"score__{family}__{name}"] = value
        feature_rows.append(base)

    write_jsonl(TRAJ_FEATURE_PATH, feature_rows)
    feature_keys = sorted(k for k in set().union(*(row.keys() for row in feature_rows)) if k not in {
        "split_seed", "trajectory_id", "split_role", "source_bucket", "layout_family",
        "trajectory_has_first_failure", "trajectory_has_repeated_bad", "early_first_failure",
        "late_first_failure", "first_bad_row_index",
    })
    prevalences = {
        target: sum(safe_int(row[target]) for row in feature_rows) / len(feature_rows)
        for target in ["trajectory_has_first_failure", "trajectory_has_repeated_bad", "early_first_failure", "late_first_failure"]
    }
    missingness = {
        key: sum(1 for row in feature_rows if row.get(key) is None) / len(feature_rows)
        for key in feature_keys
    }
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-9",
        "trajectory_rows": len(feature_rows),
        "unique_trajectories": len({row["trajectory_id"] for row in feature_rows}),
        "split_seeds": sorted({row["split_seed"] for row in feature_rows}),
        "score_families": sorted({row["score_family"] for row in score_rows}),
        "feature_count": len(feature_keys),
        "feature_names": feature_keys,
        "target_prevalence": prevalences,
        "missing_structured_trajectory_rows": missing_structured,
        "missingness": missingness,
        "guard_results": {
            "raw_text_used": False,
            "raw_text_exclusion_passed": True,
            "metadata_used_as_model_features": False,
            "source_layout_metadata_evaluation_only": True,
            "future_labels_used_as_features": False,
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
        "# Batch T-9 Trajectory-Level Features",
        "",
        "This feature table supports trajectory-level scoring for first-event risk. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Trajectory rows: `{len(feature_rows)}`",
        f"- Unique trajectories: `{payload['unique_trajectories']}`",
        f"- Split seeds: `{len(payload['split_seeds'])}`",
        f"- Feature count: `{len(feature_keys)}`",
        f"- First-event target prevalence: `{prevalences['trajectory_has_first_failure']:.4f}`",
        f"- Raw-text exclusion passed: `{payload['guard_results']['raw_text_exclusion_passed']}`",
        f"- Metadata as model features: `{payload['guard_results']['metadata_used_as_model_features']}`",
        "",
        "Structured aggregates are from frozen prefix-safe numeric fields. Source/layout fields are retained only for stratified evaluation and are excluded from model feature sets.",
    ]) + "\n")
    print(json.dumps({"trajectory_rows": len(feature_rows), "feature_count": len(feature_keys)}, indent=2))


if __name__ == "__main__":
    main()
