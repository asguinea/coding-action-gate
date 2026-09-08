#!/usr/bin/env python3
"""Shared utilities for Batch T-9 trajectory-level first-event scoring."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median, pstdev
from typing import Any

from t8_oracle_gap_utils import ALPHAS, BETAS, average_precision, auroc, oracle_upper_bound

WORKSPACE = Path(__file__).resolve().parents[1]
DATA = WORKSPACE / "data" / "intervention_outputs"
PROCESSED = WORKSPACE / "data" / "processed"
REPORTS = WORKSPACE / "reports"
ROW_SCORE_PATH = DATA / "theory_row_level_scores.jsonl"
TRAJ_FEATURE_PATH = DATA / "theory_trajectory_level_features.jsonl"
TRAJ_SCORE_PATH = DATA / "theory_trajectory_level_scores.jsonl"
PREFIX_VERIFIED_PATH = PROCESSED / "prefix_verified.jsonl"

SCORE_AGGS = [
    "max_score",
    "top_3_mean_score",
    "top_5_mean_score",
    "sum_top_3_score",
    "sum_top_5_score",
    "mean_score",
    "score_std",
    "score_slope_simple",
    "first_quartile_max_score",
    "first_half_max_score",
    "early_weighted_max_score",
    "early_weighted_sum_score",
    "cumulative_score_sum",
    "fraction_rows_above_train_q80",
    "fraction_rows_above_train_q90",
    "fraction_rows_above_train_q95",
]

STRUCTURED_FEATURES = [
    "trajectory_length",
    "max_action_length_chars",
    "max_observation_length_chars",
    "mean_action_length_chars",
    "mean_observation_length_chars",
    "max_recent_error_keyword_count",
    "max_recent_failure_keyword_count",
    "max_recent_timeout_keyword_count",
    "max_recent_exception_keyword_count",
    "total_stage_transitions",
    "max_stage_index",
    "repeated_action_count",
    "repeated_observation_count",
    "fraction_repeated_actions",
    "fraction_repeated_observations",
]

METADATA_FIELDS = {"source_bucket", "layout_family"}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row}) if rows else ["empty"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def quantile(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, int(round(q * (len(ordered) - 1)))))]


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def score_aggregates(scores: list[float], prefix_indices: list[int], train_thresholds: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {name: 0.0 for name in SCORE_AGGS}
    ordered = sorted(scores, reverse=True)
    n = len(scores)
    xs = list(range(n))
    xbar = mean(xs)
    ybar = mean(scores)
    denom = sum((x - xbar) ** 2 for x in xs)
    slope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, scores)) / denom if denom else 0.0
    early_weighted = [score / (1.0 + 0.03 * idx) for score, idx in zip(scores, prefix_indices)]
    q1 = max(1, math.ceil(n * 0.25))
    q2 = max(1, math.ceil(n * 0.50))
    return {
        "max_score": max(scores),
        "top_3_mean_score": mean(ordered[: min(3, n)]),
        "top_5_mean_score": mean(ordered[: min(5, n)]),
        "sum_top_3_score": sum(ordered[: min(3, n)]),
        "sum_top_5_score": sum(ordered[: min(5, n)]),
        "mean_score": mean(scores),
        "score_std": pstdev(scores) if n > 1 else 0.0,
        "score_slope_simple": slope,
        "first_quartile_max_score": max(scores[:q1]),
        "first_half_max_score": max(scores[:q2]),
        "early_weighted_max_score": max(early_weighted),
        "early_weighted_sum_score": sum(early_weighted),
        "cumulative_score_sum": sum(scores),
        "fraction_rows_above_train_q80": sum(1 for s in scores if s >= train_thresholds.get("q80", math.inf)) / n,
        "fraction_rows_above_train_q90": sum(1 for s in scores if s >= train_thresholds.get("q90", math.inf)) / n,
        "fraction_rows_above_train_q95": sum(1 for s in scores if s >= train_thresholds.get("q95", math.inf)) / n,
    }


def load_feature_rows() -> list[dict[str, Any]]:
    return read_jsonl(TRAJ_FEATURE_PATH)


def feature_columns(rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    sample_keys = set().union(*(row.keys() for row in rows))
    score_cols = sorted(k for k in sample_keys if k.startswith("score__"))
    structured = sorted(k for k in STRUCTURED_FEATURES if k in sample_keys)
    early = sorted(k for k in score_cols if any(part in k for part in ["first_quartile", "first_half", "early_weighted"]))
    topk = sorted(k for k in score_cols if any(part in k for part in ["top_3", "top_5", "sum_top"]))
    length = ["trajectory_length"] if "trajectory_length" in sample_keys else []
    all_numeric = score_cols + structured
    return {
        "score_aggregates_only": score_cols,
        "structured_aggregates_only": structured,
        "score_plus_structured": all_numeric,
        "early_window_aggregates_only": early,
        "topk_score_mass_only": topk,
        "all_minus_length": [c for c in all_numeric if c != "trajectory_length"],
        "length_only": length,
    }


def matrix(rows: list[dict[str, Any]], columns: list[str]) -> tuple[list[list[float]], list[int]]:
    return [[safe_float(row.get(col)) for col in columns] for row in rows], [safe_int(row["trajectory_has_first_failure"]) for row in rows]


def ranking_metrics(values: list[float], labels: list[int]) -> dict[str, float]:
    prevalence = sum(labels) / len(labels) if labels else 0.0
    ap = average_precision(values, labels)
    return {
        "auroc": auroc(values, labels),
        "ap": ap,
        "prevalence": prevalence,
        "ap_lift": ap / prevalence if prevalence else 0.0,
    }


def budget_curve(values: list[float], labels: list[int], betas: list[float] = BETAS) -> list[dict[str, Any]]:
    n = len(values)
    positives = sum(labels)
    clean = n - positives
    prevalence = positives / n if n else 0.0
    ranked = sorted(range(n), key=lambda i: (values[i], -i), reverse=True)
    rows = []
    for beta in betas:
        count = max(1, min(n, math.ceil(n * beta))) if n else 0
        selected = set(ranked[:count])
        selected_pos = sum(labels[i] for i in selected)
        selected_clean = count - selected_pos
        coverage = selected_pos / positives if positives else 0.0
        upper = oracle_upper_bound(beta, prevalence)
        rows.append({
            "trajectory_budget": beta,
            "selected_trajectory_count": count,
            "first_failure_coverage": coverage,
            "missed_first_failure_rate": 1.0 - coverage if positives else 0.0,
            "false_alarm_trajectory_rate": selected_clean / clean if clean else 0.0,
            "false_alarm_among_selected": selected_clean / count if count else 0.0,
            "oracle_trajectory_selection_upper_bound": upper,
            "gap_to_oracle_upper_bound": upper - coverage,
        })
    return rows


def split_by_seed_role(rows: list[dict[str, Any]]) -> dict[tuple[int, str], list[dict[str, Any]]]:
    out: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        out[(safe_int(row["split_seed"]), str(row["split_role"]))].append(row)
    return out


def mean_or_none(values: list[float]) -> float | None:
    return mean(values) if values else None


def median_or_none(values: list[float]) -> float | None:
    return median(values) if values else None
