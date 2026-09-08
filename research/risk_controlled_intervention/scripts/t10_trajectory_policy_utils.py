#!/usr/bin/env python3
"""Shared helpers for Batch T-10 trajectory-score threshold policies."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
DATA = WORKSPACE / "data" / "intervention_outputs"
REPORTS = WORKSPACE / "reports"
THEORY = WORKSPACE / "theory"
TRAJ_SCORE_PATH = DATA / "theory_trajectory_level_scores.jsonl"
ROW_SCORE_PATH = DATA / "theory_row_level_scores.jsonl"
POLICY_TABLE_CSV = REPORTS / "batch_T10_trajectory_score_policy_table.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
DELTAS = [0.10, 0.05]
GRID_PROTOCOLS = ["fixed_score_threshold_grid", "train_score_quantiles", "calibration_score_quantiles"]
FIXED_GRID = [0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]
TIMING_RULES = [
    "earliest_q80",
    "earliest_q90",
    "earliest_q95",
    "max_score_position",
    "earliest_top3",
    "cumulative_hazard_q90",
    "first_prefix_baseline",
]
REQUIRED_TRAJECTORY_FAMILIES = [
    "hist_gradient_boosting::score_plus_structured",
    "logistic_regression::score_plus_structured",
    "score_baseline::generic_bad_logistic_history::top_5_mean_score",
    "dummy_prior::score_plus_structured",
]
REQUIRED_ROW_FAMILIES = ["hybrid_exact_product", "ff_exact_hgb_interactions", "generic_bad_logistic_history"]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row}) if rows else ["empty"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


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


def quantile(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    vals = sorted(values)
    return vals[min(len(vals) - 1, max(0, int(round(q * (len(vals) - 1)))))]


def load_policy_table() -> list[dict[str, Any]]:
    rows = []
    with POLICY_TABLE_CSV.open() as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(row)
    return rows


def group_rows(rows: list[dict[str, Any]], keys: list[str]) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    out: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        out[tuple(row[k] for k in keys)].append(row)
    return out


def row_score_maps(row_rows: list[dict[str, Any]]) -> tuple[dict[tuple[int, str, str, str], list[dict[str, Any]]], dict[tuple[int, str], dict[str, float]]]:
    grouped: dict[tuple[int, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    train_values: dict[tuple[int, str], list[float]] = defaultdict(list)
    train_cummax: dict[tuple[int, str], list[float]] = defaultdict(list)
    temp: dict[tuple[int, str, str], list[float]] = defaultdict(list)
    for row in row_rows:
        key = (safe_int(row["split_seed"]), str(row["score_family"]), str(row["split_role"]), str(row["trajectory_id"]))
        grouped[key].append(row)
        if row["split_role"] == "train":
            train_values[(safe_int(row["split_seed"]), str(row["score_family"]))].append(safe_float(row["score_value"]))
            temp[(safe_int(row["split_seed"]), str(row["score_family"]), str(row["trajectory_id"]))].append(safe_float(row["score_value"]))
    for key, vals in temp.items():
        running = 0.0
        max_running = 0.0
        for score in vals:
            running += score
            max_running = max(max_running, running)
        train_cummax[(key[0], key[1])].append(max_running)
    for vals in grouped.values():
        vals.sort(key=lambda r: safe_int(r["prefix_row_index"]))
    thresholds = {}
    for key, vals in train_values.items():
        thresholds[key] = {
            "q80": quantile(vals, 0.80),
            "q90": quantile(vals, 0.90),
            "q95": quantile(vals, 0.95),
            "cum_q90": quantile(train_cummax.get(key, []), 0.90),
        }
    return grouped, thresholds


def warning_time(rows: list[dict[str, Any]], rule: str, thresholds: dict[str, float]) -> int | None:
    if not rows:
        return None
    if rule in {"earliest_q80", "earliest_q90", "earliest_q95"}:
        q = rule.split("_")[-1]
        threshold = thresholds.get(q, math.inf)
        for row in rows:
            if safe_float(row["score_value"]) >= threshold:
                return safe_int(row["prefix_row_index"])
        return None
    if rule == "max_score_position":
        return safe_int(max(rows, key=lambda r: (safe_float(r["score_value"]), -safe_int(r["prefix_row_index"])))["prefix_row_index"])
    if rule == "earliest_top3":
        top = sorted(rows, key=lambda r: (safe_float(r["score_value"]), -safe_int(r["prefix_row_index"])), reverse=True)[: min(3, len(rows))]
        return min(safe_int(row["prefix_row_index"]) for row in top)
    if rule == "cumulative_hazard_q90":
        running = 0.0
        threshold = thresholds.get("cum_q90", math.inf)
        for row in rows:
            running += safe_float(row["score_value"])
            if running >= threshold:
                return safe_int(row["prefix_row_index"])
        return None
    if rule == "first_prefix_baseline":
        return min(safe_int(row["prefix_row_index"]) for row in rows)
    if rule == "oracle_first_bad_timing":
        return None
    raise ValueError(f"unknown timing rule: {rule}")


def event_metrics(
    traj_rows: list[dict[str, Any]],
    row_grouped: dict[tuple[int, str, str, str], list[dict[str, Any]]],
    row_thresholds: dict[tuple[int, str], dict[str, float]],
    *,
    lambda_value: float,
    lambda_score_field: str,
    timing_score_family: str,
    timing_rule: str,
) -> dict[str, Any]:
    bad_total = sum(safe_int(row["trajectory_has_first_failure"]) for row in traj_rows)
    clean_total = len(traj_rows) - bad_total
    warned = covered = pre = at = late = false = 0
    leads = []
    for row in traj_rows:
        selected = safe_float(row[lambda_score_field]) >= lambda_value
        warning = None
        if selected:
            if timing_rule == "oracle_first_bad_timing":
                warning = safe_int(row["first_bad_row_index"], -1) if safe_int(row["trajectory_has_first_failure"]) else None
            else:
                key = (safe_int(row["split_seed"]), timing_score_family, str(row["split_role"]), str(row["trajectory_id"]))
                warning = warning_time(row_grouped.get(key, []), timing_rule, row_thresholds.get((safe_int(row["split_seed"]), timing_score_family), {}))
        if warning is not None:
            warned += 1
        if safe_int(row["trajectory_has_first_failure"]):
            first_bad = safe_int(row["first_bad_row_index"], -1)
            if warning is not None and warning <= first_bad:
                covered += 1
                if warning < first_bad:
                    pre += 1
                elif warning == first_bad:
                    at += 1
                leads.append(first_bad - warning)
            elif warning is not None and warning > first_bad:
                late += 1
        elif warning is not None:
            false += 1
    total_rows = sum(safe_int(row["trajectory_length"]) for row in traj_rows)
    return {
        "trajectory_count": len(traj_rows),
        "bad_trajectory_count": bad_total,
        "clean_trajectory_count": clean_total,
        "n_miss": bad_total,
        "n_burden": len(traj_rows),
        "missed_first_failure_rate": 1.0 - (covered / bad_total if bad_total else 0.0),
        "first_failure_coverage": covered / bad_total if bad_total else 0.0,
        "pre_failure_coverage": pre / bad_total if bad_total else 0.0,
        "at_failure_coverage": at / bad_total if bad_total else 0.0,
        "trajectory_burden": warned / len(traj_rows) if traj_rows else 0.0,
        "false_alarm_trajectory_rate": false / clean_total if clean_total else 0.0,
        "late_warning_rate": late / bad_total if bad_total else 0.0,
        "row_deferral_rate": warned / total_rows if total_rows else 0.0,
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
    }


def nestedness_pass(rows: list[dict[str, Any]], thresholds: list[float], field: str) -> bool:
    previous: set[str] | None = None
    for threshold in sorted(thresholds):
        selected = {row["trajectory_id"] for row in rows if safe_float(row[field]) >= threshold}
        if previous is not None and not selected.issubset(previous):
            return False
        previous = selected
    return True


def normalize_scores_by_train(traj_rows: list[dict[str, Any]]) -> None:
    by_key: dict[tuple[int, str], list[float]] = defaultdict(list)
    for row in traj_rows:
        if row["split_role"] == "train":
            by_key[(safe_int(row["split_seed"]), str(row["trajectory_score_family"]))].append(safe_float(row["score_value"]))
    ranges = {}
    for key, vals in by_key.items():
        lo, hi = min(vals), max(vals)
        ranges[key] = (lo, hi)
    for row in traj_rows:
        lo, hi = ranges.get((safe_int(row["split_seed"]), str(row["trajectory_score_family"])), (0.0, 1.0))
        denom = hi - lo
        row["normalized_score_value"] = (safe_float(row["score_value"]) - lo) / denom if denom > 0 else 0.0
