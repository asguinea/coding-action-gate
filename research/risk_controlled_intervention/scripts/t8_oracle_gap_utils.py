#!/usr/bin/env python3
"""Shared helpers for Batch T-8 oracle-gap diagnostics."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any

from theory_clean_grid_utils import SCORES_PATH

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
BETAS = [0.10, 0.20, 0.25, 0.30, 0.40, 0.50, 0.80]
ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]

AGGREGATORS = [
    "max_score",
    "top_3_mean_score",
    "top_5_mean_score",
    "sum_top_3_score",
    "sum_top_5_score",
    "mean_score",
    "cumulative_score_sum",
    "early_weighted_max_score",
    "early_weighted_sum_score",
    "first_quartile_max_score",
    "first_half_max_score",
]


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row}) if rows else ["empty"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def load_score_rows() -> list[dict[str, Any]]:
    if not SCORES_PATH.exists():
        raise FileNotFoundError(SCORES_PATH)
    rows = []
    with SCORES_PATH.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    if not rows:
        raise ValueError(f"empty score artifact: {SCORES_PATH}")
    return rows


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def trajectory_summaries(
    rows: list[dict[str, Any]],
    *,
    split_role: str | None = None,
    split_seed: int | None = None,
    score_family: str | None = None,
) -> list[dict[str, Any]]:
    """Collapse row-level scores into trajectory units without raw text."""
    grouped: dict[tuple[int, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if split_role is not None and row.get("split_role") != split_role:
            continue
        if split_seed is not None and _as_int(row.get("split_seed")) != int(split_seed):
            continue
        if score_family is not None and row.get("score_family") != score_family:
            continue
        key = (
            _as_int(row.get("split_seed")),
            str(row.get("score_family")),
            str(row.get("split_role")),
            str(row.get("trajectory_id")),
        )
        grouped[key].append(row)
    out = []
    for (seed, family, role, tid), vals in grouped.items():
        ordered = sorted(vals, key=lambda r: _as_int(r.get("prefix_row_index")))
        first = ordered[0]
        scores = [_as_float(row.get("score_value")) for row in ordered]
        prefix_indices = [_as_int(row.get("prefix_row_index")) for row in ordered]
        has_failure = bool(_as_int(first.get("trajectory_has_first_failure")))
        first_bad = _as_int(first.get("first_bad_row_index"), -1)
        bad_rows = sum(_as_int(row.get("target_next_step_bad")) for row in ordered)
        length = len(ordered)
        denom = max(1, length - 1)
        norm_first = first_bad / denom if has_failure and first_bad >= 0 else None
        out.append({
            "split_seed": seed,
            "score_family": family,
            "split_role": role,
            "trajectory_id": tid,
            "scores": scores,
            "prefix_indices": prefix_indices,
            "trajectory_length": length,
            "trajectory_has_first_failure": int(has_failure),
            "trajectory_has_repeated_bad": int(bad_rows > 1),
            "first_bad_row_index": first_bad,
            "early_first_failure": int(bool(norm_first is not None and norm_first <= 0.33)),
            "late_first_failure": int(bool(norm_first is not None and norm_first >= 0.67)),
            "source_bucket": first.get("source_bucket", "unknown"),
            "layout_family": first.get("layout_family", "unknown"),
        })
    return out


def aggregate_score(summary: dict[str, Any], name: str) -> float:
    scores = list(summary["scores"])
    if not scores:
        return 0.0
    ordered = sorted(scores, reverse=True)
    if name == "max_score":
        return max(scores)
    if name == "top_3_mean_score":
        return mean(ordered[: min(3, len(ordered))])
    if name == "top_5_mean_score":
        return mean(ordered[: min(5, len(ordered))])
    if name == "sum_top_3_score":
        return sum(ordered[: min(3, len(ordered))])
    if name == "sum_top_5_score":
        return sum(ordered[: min(5, len(ordered))])
    if name == "mean_score":
        return mean(scores)
    if name == "cumulative_score_sum":
        return sum(scores)
    if name in {"early_weighted_max_score", "early_weighted_sum_score"}:
        weighted = [score / (1.0 + 0.03 * idx) for score, idx in zip(scores, summary["prefix_indices"])]
        return max(weighted) if name.endswith("max_score") else sum(weighted)
    if name == "first_quartile_max_score":
        cutoff = max(1, math.ceil(len(scores) * 0.25))
        return max(scores[:cutoff])
    if name == "first_half_max_score":
        cutoff = max(1, math.ceil(len(scores) * 0.50))
        return max(scores[:cutoff])
    raise ValueError(f"unknown aggregator: {name}")


def average_precision(scores: list[float], labels: list[int]) -> float:
    positives = sum(labels)
    if positives == 0:
        return 0.0
    ranked = sorted(zip(scores, labels), key=lambda x: x[0], reverse=True)
    hits = 0
    total = 0.0
    for rank, (_, label) in enumerate(ranked, start=1):
        if label:
            hits += 1
            total += hits / rank
    return total / positives


def auroc(scores: list[float], labels: list[int]) -> float:
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        return 0.5
    ranked = sorted(enumerate(scores), key=lambda x: x[1])
    rank_sum = 0.0
    i = 0
    while i < len(ranked):
        j = i
        while j + 1 < len(ranked) and ranked[j + 1][1] == ranked[i][1]:
            j += 1
        avg_rank = (i + 1 + j + 1) / 2.0
        for k in range(i, j + 1):
            if labels[ranked[k][0]]:
                rank_sum += avg_rank
        i = j + 1
    return (rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def binary_ranking_metrics(values: list[float], labels: list[int]) -> dict[str, float]:
    prevalence = sum(labels) / len(labels) if labels else 0.0
    ap = average_precision(values, labels)
    return {
        "auroc": auroc(values, labels),
        "ap": ap,
        "prevalence": prevalence,
        "ap_lift": ap / prevalence if prevalence else 0.0,
    }


def select_top_by_budget(summaries: list[dict[str, Any]], values: list[float], beta: float) -> set[str]:
    n_select = max(1, min(len(summaries), math.ceil(len(summaries) * beta))) if summaries else 0
    ranked = sorted(zip(summaries, values), key=lambda x: (x[1], x[0]["trajectory_id"]), reverse=True)
    return {row["trajectory_id"] for row, _ in ranked[:n_select]}


def trajectory_selection_metrics(
    summaries: list[dict[str, Any]],
    selected: set[str],
) -> dict[str, Any]:
    total = len(summaries)
    bad_total = sum(int(s["trajectory_has_first_failure"]) for s in summaries)
    clean_total = total - bad_total
    selected_rows = [s for s in summaries if s["trajectory_id"] in selected]
    selected_bad = sum(int(s["trajectory_has_first_failure"]) for s in selected_rows)
    selected_clean = len(selected_rows) - selected_bad
    coverage = selected_bad / bad_total if bad_total else 0.0
    burden = len(selected_rows) / total if total else 0.0
    return {
        "trajectory_count": total,
        "bad_trajectory_count": bad_total,
        "clean_trajectory_count": clean_total,
        "selected_trajectory_count": len(selected_rows),
        "selected_bad_trajectory_count": selected_bad,
        "selected_clean_trajectory_count": selected_clean,
        "first_failure_coverage": coverage,
        "missed_first_failure_rate": 1.0 - coverage if bad_total else 0.0,
        "trajectory_burden": burden,
        "false_alarm_trajectory_rate": selected_clean / clean_total if clean_total else 0.0,
        "false_alarm_among_selected": selected_clean / len(selected_rows) if selected_rows else 0.0,
        "row_deferral_rate": len(selected_rows) / sum(s["trajectory_length"] for s in summaries) if summaries else 0.0,
    }


def oracle_upper_bound(beta: float, bad_prevalence: float) -> float:
    if bad_prevalence <= 0:
        return 0.0
    return min(1.0, beta / bad_prevalence)


def summarize_numeric(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    vals = [float(row[key]) for row in rows if row.get(key) is not None]
    if not vals:
        return {"mean": None, "median": None, "min": None, "max": None}
    return {"mean": mean(vals), "median": median(vals), "min": min(vals), "max": max(vals)}


def lead_summary(leads: list[int]) -> dict[str, Any]:
    if not leads:
        return {"mean_lead_time": None, "median_lead_time": None}
    return {"mean_lead_time": mean(leads), "median_lead_time": median(leads)}
