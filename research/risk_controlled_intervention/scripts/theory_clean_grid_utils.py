#!/usr/bin/env python3
"""Shared utilities for Batch T-7 clean-grid first-event evaluations."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
SCORES_PATH = WORKSPACE / "data" / "intervention_outputs" / "theory_row_level_scores.jsonl"
GRIDS_PATH = WORKSPACE / "data" / "intervention_outputs" / "theory_threshold_grids.json"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row}) if rows else ["empty"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def load_scores() -> list[dict[str, Any]]:
    return read_jsonl(SCORES_PATH)


def load_grids() -> dict[str, Any]:
    if not GRIDS_PATH.exists():
        raise FileNotFoundError(GRIDS_PATH)
    return json.loads(GRIDS_PATH.read_text())


def grouped_scores(rows: list[dict[str, Any]], split_seed: int, score_family: str, split_role: str) -> list[dict[str, Any]]:
    return [
        r for r in rows
        if int(r["split_seed"]) == int(split_seed)
        and r["score_family"] == score_family
        and r["split_role"] == split_role
    ]


def stable_calibration_role(row: dict[str, Any]) -> str:
    tid = str(row["trajectory_id"])
    return "grid_calibration" if sum(ord(ch) for ch in tid) % 2 == 0 else "risk_calibration"


def transform_rows(rows: list[dict[str, Any]], family: str) -> list[dict[str, Any]]:
    if family == "single_score_first_crossing":
        return rows
    by_traj: dict[str, float] = defaultdict(float)
    out = []
    if family == "cumulative_hazard_first_crossing":
        for row in sorted(rows, key=lambda r: (str(r["trajectory_id"]), int(r["prefix_row_index"]))):
            tid = str(row["trajectory_id"])
            by_traj[tid] += float(row["score_value"])
            new = dict(row)
            new["score_value"] = by_traj[tid]
            out.append(new)
        return out
    if family == "early_weighted_first_crossing":
        for row in rows:
            new = dict(row)
            idx = int(row["prefix_row_index"])
            new["score_value"] = float(row["score_value"]) / (1.0 + 0.03 * idx)
            out.append(new)
        return out
    raise ValueError(f"unsupported nested family transform: {family}")


def split_rows_for_protocol(rows: list[dict[str, Any]], protocol: str, role: str) -> list[dict[str, Any]]:
    if protocol == "split_calibration_grid_then_risk" and role == "calibration":
        return [row for row in rows if row["split_role"] == "calibration" and stable_calibration_role(row) == "risk_calibration"]
    return [row for row in rows if row["split_role"] == role]


def first_crossing_metrics(rows: list[dict[str, Any]], threshold: float) -> dict[str, Any]:
    by_traj: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_traj[str(row["trajectory_id"])].append(row)
    bad_count = 0
    clean_count = 0
    covered = 0
    pre = 0
    late = 0
    false = 0
    warned = 0
    leads = []
    total_rows = len(rows)
    for tid, vals in by_traj.items():
        ordered = sorted(vals, key=lambda r: int(r["prefix_row_index"]))
        first = ordered[0]
        has_bad = bool(int(first["trajectory_has_first_failure"]))
        first_bad = int(first["first_bad_row_index"]) if has_bad else None
        warning = None
        for row in ordered:
            if float(row["score_value"]) >= threshold:
                warning = int(row["prefix_row_index"])
                break
        if warning is not None:
            warned += 1
        if has_bad:
            bad_count += 1
            assert first_bad is not None
            if warning is not None and warning <= first_bad:
                covered += 1
                if warning < first_bad:
                    pre += 1
                leads.append(first_bad - warning)
            elif warning is not None and warning > first_bad:
                late += 1
        else:
            clean_count += 1
            if warning is not None:
                false += 1
    traj_count = len(by_traj)
    return {
        "trajectory_count": traj_count,
        "bad_trajectory_count": bad_count,
        "clean_trajectory_count": clean_count,
        "empirical_miss_rate": 1.0 - (covered / bad_count if bad_count else 0.0),
        "empirical_burden": warned / traj_count if traj_count else 0.0,
        "empirical_false_alarm_rate": false / clean_count if clean_count else 0.0,
        "empirical_pre_failure_coverage": pre / bad_count if bad_count else 0.0,
        "first_failure_coverage": covered / bad_count if bad_count else 0.0,
        "late_warning_rate": late / bad_count if bad_count else 0.0,
        "row_deferral_rate": warned / total_rows if total_rows else 0.0,
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
    }


def build_threshold_table(rows: list[dict[str, Any]], thresholds: list[float]) -> list[dict[str, Any]]:
    table = []
    for order, threshold in enumerate(thresholds):
        metrics = first_crossing_metrics(rows, threshold)
        table.append({
            "threshold": float(threshold),
            "threshold_order": order,
            "n_risk": metrics["bad_trajectory_count"],
            "n_miss": metrics["bad_trajectory_count"],
            "n_burden": metrics["trajectory_count"],
            **metrics,
        })
    return table


def evaluate_threshold_table(test_rows: list[dict[str, Any]], thresholds: list[float]) -> list[dict[str, Any]]:
    out = []
    for row in build_threshold_table(test_rows, thresholds):
        out.append({
            **row,
            "test_missed_first_failure_rate": row["empirical_miss_rate"],
            "test_trajectory_burden": row["empirical_burden"],
            "test_first_failure_coverage": row["first_failure_coverage"],
            "test_pre_failure_warning_coverage": row["empirical_pre_failure_coverage"],
            "test_false_alarm_trajectory_rate": row["empirical_false_alarm_rate"],
            "test_late_warning_rate": row["late_warning_rate"],
            "test_row_deferral_rate": row["row_deferral_rate"],
            "test_mean_lead_time": row["mean_lead_time"],
            "test_median_lead_time": row["median_lead_time"],
        })
    return out


def quantile(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    vals = sorted(values)
    idx = min(len(vals) - 1, max(0, int(round(q * (len(vals) - 1)))))
    return vals[idx]
