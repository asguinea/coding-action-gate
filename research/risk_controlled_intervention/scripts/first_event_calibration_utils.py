#!/usr/bin/env python3
"""Shared utilities for Batch 9N first-event calibration."""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as hybrid_utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"

SEEDS = hybrid_utils.SEEDS
QUANTILES = (0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99)
BETAS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)
PHIS = (0.05, 0.10, 0.20, 0.30)
ALPHAS = (0.10, 0.20, 0.30, 0.40)
DESIRED_LEADS = (1, 2, 3, 5)


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9N input: {path}")


def quantile_threshold(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil(q * len(ordered)) - 1))
    return ordered[idx]


def top_k_mean(values: list[float], k: int = 3) -> float:
    if not values:
        return 0.0
    return statistics.mean(sorted(values, reverse=True)[: min(k, len(values))])


def trajectory_groups(rows: list[dict[str, Any]]) -> dict[str, list[int]]:
    groups: dict[str, list[int]] = defaultdict(list)
    for idx, row in enumerate(rows):
        groups[str(row["trajectory_id"])].append(idx)
    for idxs in groups.values():
        idxs.sort(key=lambda i: int(rows[i]["trajectory_row_ordinal"]))
    return groups


def cumulative_scores(rows: list[dict[str, Any]], scores: list[float]) -> list[float]:
    out = [0.0] * len(rows)
    for idxs in trajectory_groups(rows).values():
        total = 0.0
        for idx in idxs:
            total += max(float(scores[idx]), 0.0)
            out[idx] = total
    return out


def early_weight(row: dict[str, Any]) -> float:
    total = max(int(row.get("trajectory_decision_row_count", 0) or 0), int(row.get("trajectory_row_ordinal", 0) or 0), 1)
    pos = int(row.get("trajectory_row_ordinal", 0) or 0)
    return 1.0 + 0.5 * max(0.0, 1.0 - (pos / total))


def single_threshold_first_crossing(rows: list[dict[str, Any]], scores: list[float], threshold: float) -> list[bool]:
    return hybrid_utils.first_crossing(rows, scores, threshold)


def top_k_trajectory_first_warning(rows: list[dict[str, Any]], scores: list[float], trajectory_threshold: float, row_threshold: float) -> list[bool]:
    selected = set()
    for idxs in trajectory_groups(rows).values():
        if top_k_mean([scores[idx] for idx in idxs], 3) < trajectory_threshold:
            continue
        crossing = [idx for idx in idxs if scores[idx] >= row_threshold]
        selected.add(crossing[0] if crossing else idxs[0])
    return [idx in selected for idx in range(len(rows))]


def cumulative_hazard_threshold(rows: list[dict[str, Any]], scores: list[float], threshold: float) -> list[bool]:
    cumulative = cumulative_scores(rows, scores)
    selected = set()
    for idxs in trajectory_groups(rows).values():
        for idx in idxs:
            if cumulative[idx] >= threshold:
                selected.add(idx)
                break
    return [idx in selected for idx in range(len(rows))]


def peak_then_confirm(rows: list[dict[str, Any]], primary: list[float], confirm: list[float], primary_threshold: float, confirm_threshold: float) -> list[bool]:
    selected = set()
    for idxs in trajectory_groups(rows).values():
        for idx in idxs:
            local = [j for j in idxs if abs(int(rows[j]["trajectory_row_ordinal"]) - int(rows[idx]["trajectory_row_ordinal"])) <= 1]
            if primary[idx] >= primary_threshold and max(confirm[j] for j in local) >= confirm_threshold:
                selected.add(idx)
                break
    return [idx in selected for idx in range(len(rows))]


def event_metrics(rows: list[dict[str, Any]], decisions: list[bool], desired_lead: int = 1) -> dict[str, Any]:
    groups = trajectory_groups(rows)
    touched = positive = covered = precovered = atcovered = late = missed = false_alarm = clean_no_warning = 0
    row_warnings = sum(1 for d in decisions if d)
    lead_times = []
    negative_leads = []
    warning_positions = []
    bad_total = sum(int(row["next_step_bad"]) for row in rows)
    bad_deferred = sum(1 for row, decision in zip(rows, decisions) if decision and int(row["next_step_bad"]) == 1)
    for idxs in groups.values():
        bad = [idx for idx in idxs if int(rows[idx]["next_step_bad"]) == 1]
        warn = [idx for idx in idxs if decisions[idx]]
        if warn:
            touched += 1
            first_warn = warn[0]
            warning_positions.append(int(rows[first_warn]["trajectory_row_ordinal"]))
        if bad:
            positive += 1
            first_bad = bad[0]
            if warn and warn[0] <= first_bad:
                covered += 1
                lead = int(rows[first_bad]["trajectory_row_ordinal"]) - int(rows[warn[0]]["trajectory_row_ordinal"])
                lead_times.append(lead)
                negative_leads.append(max(0, desired_lead - lead))
                if warn[0] < first_bad:
                    precovered += 1
                else:
                    atcovered += 1
            else:
                missed += 1
                if warn:
                    late += 1
        elif warn:
            false_alarm += 1
        else:
            clean_no_warning += 1
    clean = max(len(groups) - positive, 0)
    allowed_rows = max(len(rows) - row_warnings, 1)
    trajectory_burden = touched / len(groups) if groups else 0.0
    first_cov = covered / positive if positive else None
    pre_cov = precovered / positive if positive else None
    false_alarm_rate = false_alarm / clean if clean else None
    late_rate = late / positive if positive else None
    missed_rate = missed / positive if positive else None
    precision = covered / touched if touched else None
    event_utility = (
        (first_cov or 0.0)
        + (pre_cov or 0.0)
        + 0.02 * (statistics.mean(lead_times) if lead_times else 0.0)
        - 0.5 * (false_alarm_rate or 0.0)
        - 0.5 * trajectory_burden
        - 0.25 * (late_rate or 0.0)
    )
    return {
        "rows": len(rows),
        "trajectory_count": len(groups),
        "positive_trajectories": positive,
        "trajectory_warned_count": touched,
        "row_warning_count": row_warnings,
        "row_deferral_rate": row_warnings / len(rows) if rows else 0.0,
        "trajectory_burden": trajectory_burden,
        "first_failure_coverage": first_cov,
        "pre_failure_warning_coverage": pre_cov,
        "at_failure_warning_rate": atcovered / positive if positive else None,
        "missed_first_failure_rate": missed_rate,
        "late_warning_rate": late_rate,
        "false_alarm_trajectory_rate": false_alarm_rate,
        "clean_trajectory_specificity": clean_no_warning / clean if clean else None,
        "mean_lead_time": statistics.mean(lead_times) if lead_times else None,
        "median_lead_time": statistics.median(lead_times) if lead_times else None,
        "mean_negative_lead_loss": statistics.mean(negative_leads) if negative_leads else None,
        "warning_precision_trajectory_level": precision,
        "event_level_utility": event_utility,
        "bad_row_capture": bad_deferred / bad_total if bad_total else None,
        "allowed_bad_rate": (bad_total - bad_deferred) / allowed_rows,
        "mean_first_warning_position": statistics.mean(warning_positions) if warning_positions else None,
    }


def source_group(row: dict[str, Any]) -> str:
    return hybrid_utils.source_group(row)


def length_buckets(rows: list[dict[str, Any]]) -> dict[str, str]:
    counts = {tid: len(idxs) for tid, idxs in trajectory_groups(rows).items()}
    ordered = sorted(counts.values())
    q1 = ordered[len(ordered) // 3] if ordered else 0
    q2 = ordered[(2 * len(ordered)) // 3] if ordered else 0
    return {tid: "short" if n <= q1 else "medium" if n <= q2 else "long" for tid, n in counts.items()}


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def aggregate(rows: list[dict[str, Any]], group_keys: list[str], metric_keys: list[str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row.get(key) for key in group_keys)].append(row)
    out = []
    for key_tuple, vals in grouped.items():
        item = {name: value for name, value in zip(group_keys, key_tuple)}
        item["count"] = len(vals)
        for metric in metric_keys:
            clean = [row.get(metric) for row in vals if isinstance(row.get(metric), (int, float))]
            item[f"{metric}_mean"] = statistics.mean(clean) if clean else None
        out.append(item)
    return out


def build_score_bundles(split_rows: dict[str, list[dict[str, Any]]], seed: int) -> dict[str, dict[str, Any]]:
    ff_bundles = hybrid_utils.build_ff_bundles(split_rows, seed)
    gen_bundles = hybrid_utils.build_generic_bundles(split_rows, seed)
    forms = dict(hybrid_utils.HYBRID_FORMS)
    out: dict[str, dict[str, Any]] = {}
    for name in ("ff_exact_hgb_interactions", "ff_warning_rf_structured", "ff_warning_gb_structured"):
        bundle = ff_bundles[name]
        out[name] = {"score_family": name, "rows": bundle["rows"], "scores": bundle["scores"], "score_type": "first_failure"}
    for name in ("generic_bad_logistic_history", "generic_bad_hgb_interactions"):
        bundle = gen_bundles[name]
        out[name] = {"score_family": name, "rows": bundle["rows"], "scores": bundle["scores"], "score_type": "generic_next_step_bad"}
    hybrid_specs = (
        ("hybrid_exact_logistic_product", "ff_exact_hgb_interactions", "generic_bad_logistic_history", "product"),
        ("hybrid_exact_logistic_linear_w0.50", "ff_exact_hgb_interactions", "generic_bad_logistic_history", "linear_w0.50"),
        ("hybrid_warning_rf_hgb_linear_w0.75", "ff_warning_rf_structured", "generic_bad_hgb_interactions", "linear_w0.75"),
        ("hybrid_warning_rf_logistic_max", "ff_warning_rf_structured", "generic_bad_logistic_history", "max"),
        ("hybrid_warning_rf_logistic_rank_fusion", "ff_warning_rf_structured", "generic_bad_logistic_history", "rank_fusion"),
    )
    for name, ff_name, gen_name, form_name in hybrid_specs:
        bundle = hybrid_utils.build_hybrid_bundle(ff_bundles[ff_name], gen_bundles[gen_name], form_name, forms[form_name])
        out[name] = {"score_family": name, "rows": bundle["rows"], "scores": bundle["scores"], "score_type": "hybrid_failure_onset"}
    return out
