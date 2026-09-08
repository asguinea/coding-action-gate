#!/usr/bin/env python3
"""Reusable Option A first-event miss-risk calibration utilities."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Iterable

INF = float("inf")


def compute_first_crossing_warning_times(score_rows: Iterable[dict[str, Any]], threshold: float) -> dict[str, float]:
    """Return earliest row index whose score crosses threshold for each trajectory."""
    times: dict[str, float] = {}
    seen = set()
    for row in sorted(score_rows, key=lambda r: (str(r["trajectory_id"]), int(r["row_index"]))):
        tid = str(row["trajectory_id"])
        seen.add(tid)
        if tid not in times and float(row["score"]) >= threshold:
            times[tid] = int(row["row_index"])
    for tid in seen:
        times.setdefault(tid, INF)
    return times


def compute_trajectory_event_losses(
    warning_times: dict[str, float],
    first_failure_times: dict[str, float],
) -> dict[str, Any]:
    """Compute trajectory-level first-event metrics.

    Miss rate is reported over bad trajectories because it is the operational
    first-failure coverage complement used in the empirical first-event reports.
    The all-trajectory miss rate is also included for theory diagnostics.
    """
    all_tids = set(warning_times) | set(first_failure_times)
    bad_tids = {tid for tid in all_tids if first_failure_times.get(tid, INF) < INF}
    clean_tids = all_tids - bad_tids
    warned_tids = {tid for tid in all_tids if warning_times.get(tid, INF) < INF}
    missed = 0
    covered = 0
    pre = 0
    late = 0
    false = 0
    lead_values = []
    for tid in all_tids:
        w = warning_times.get(tid, INF)
        f = first_failure_times.get(tid, INF)
        if f < INF:
            if w <= f:
                covered += 1
                if w < f:
                    pre += 1
                lead_values.append(f - w)
            else:
                missed += 1
                if w < INF:
                    late += 1
        elif w < INF:
            false += 1
    n_all = len(all_tids)
    n_bad = len(bad_tids)
    n_clean = len(clean_tids)
    return {
        "trajectory_count": n_all,
        "bad_trajectory_count": n_bad,
        "clean_trajectory_count": n_clean,
        "miss_count": missed,
        "miss_rate": missed / n_bad if n_bad else 0.0,
        "all_trajectory_miss_rate": missed / n_all if n_all else 0.0,
        "first_failure_coverage": covered / n_bad if n_bad else 0.0,
        "pre_failure_coverage": pre / n_bad if n_bad else 0.0,
        "trajectory_burden": len(warned_tids) / n_all if n_all else 0.0,
        "false_alarm_rate": false / n_clean if n_clean else 0.0,
        "late_warning_rate": late / n_bad if n_bad else 0.0,
        "mean_lead_time": sum(lead_values) / len(lead_values) if lead_values else None,
        "median_lead_time": sorted(lead_values)[len(lead_values) // 2] if lead_values else None,
    }


def hoeffding_union_upper_bound(empirical_risk: float, n: int, m: int, delta: float) -> float:
    if n <= 0:
        raise ValueError("n must be positive")
    if m <= 0:
        raise ValueError("m must be positive")
    if not 0 < delta < 1:
        raise ValueError("delta must be in (0,1)")
    return min(1.0, empirical_risk + math.sqrt(math.log(m / delta) / (2.0 * n)))


def _binom_cdf(k: int, n: int, p: float) -> float:
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if k >= n else 0.0
    total = 0.0
    for x in range(k + 1):
        total += math.comb(n, x) * (p ** x) * ((1.0 - p) ** (n - x))
    return min(1.0, max(0.0, total))


def clopper_pearson_upper_bound(k: int, n: int, alpha: float) -> float:
    """One-sided exact binomial upper confidence bound via binary search.

    Solves for p such that P[Bin(n,p) <= k] = alpha. For k=n, the
    one-sided upper bound is 1.
    """
    if n <= 0:
        raise ValueError("n must be positive")
    if not 0 < alpha < 1:
        raise ValueError("alpha must be in (0,1)")
    if k < 0 or k > n:
        raise ValueError("k must be in [0,n]")
    if k == n:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if _binom_cdf(k, n, mid) > alpha:
            lo = mid
        else:
            hi = mid
    return min(1.0, max(0.0, hi))


def correction_upper_bound(
    correction_name: str,
    empirical_risk: float,
    n: int,
    m: int,
    delta: float,
) -> dict[str, Any]:
    """Return correction metadata and upper bound for a Bernoulli miss loss."""
    if n <= 0:
        upper = 1.0
        k = 0
    else:
        k = int(round(empirical_risk * n))
        k = max(0, min(n, k))
        if correction_name == "hoeffding_union_bound":
            upper = hoeffding_union_upper_bound(empirical_risk, n, m, delta)
        elif correction_name == "clopper_pearson_union":
            upper = clopper_pearson_upper_bound(k, n, delta / m)
        elif correction_name == "plus_one_empirical_proxy":
            upper = (k + 1) / (n + 1)
        elif correction_name == "pointwise_clopper_pearson_no_union":
            upper = clopper_pearson_upper_bound(k, n, delta)
        elif correction_name == "empirical_bernstein_union":
            raise NotImplementedError("empirical_bernstein_union is not implemented in Batch T-4")
        else:
            raise ValueError(f"unknown correction: {correction_name}")
    return {
        "correction_name": correction_name,
        "empirical_risk": empirical_risk,
        "upper_bound": min(1.0, upper),
        "k": k,
        "n": n,
        "M": m,
        "delta": delta,
        "is_default_theory_candidate": correction_name == "clopper_pearson_union",
        "is_uniform_over_grid": correction_name in {"hoeffding_union_bound", "clopper_pearson_union"},
        "is_empirical_proxy_only": correction_name in {"plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"},
        "caveats": {
            "hoeffding_union_bound": "Uniform finite-grid correction; conservative baseline.",
            "clopper_pearson_union": "Uniform finite-grid exact-binomial correction using delta/M per threshold.",
            "plus_one_empirical_proxy": "Empirical proxy only; not used as a uniform finite-grid theory candidate here.",
            "pointwise_clopper_pearson_no_union": "Pointwise diagnostic only; not valid for data-dependent grid selection without correction.",
        }.get(correction_name, "Candidate or skipped correction."),
    }


def build_threshold_grid(scores: Iterable[float], quantiles: Iterable[float]) -> list[float]:
    values = sorted(float(score) for score in scores)
    if not values:
        raise ValueError("cannot build threshold grid from empty scores")
    grid = []
    n = len(values)
    for q in quantiles:
        if not 0 <= float(q) <= 1:
            raise ValueError("quantiles must be in [0,1]")
        idx = min(n - 1, max(0, int(round(float(q) * (n - 1)))))
        grid.append(values[idx])
    return sorted(set(grid))


def build_calibration_table(
    score_rows: Iterable[dict[str, Any]],
    first_failure_times: dict[str, float],
    threshold_grid: Iterable[float],
) -> list[dict[str, Any]]:
    rows = list(score_rows)
    table = []
    m = len(list(threshold_grid))
    for order, threshold in enumerate(threshold_grid):
        warning_times = compute_first_crossing_warning_times(rows, float(threshold))
        metrics = compute_trajectory_event_losses(warning_times, first_failure_times)
        table.append({
            "threshold": float(threshold),
            "threshold_order": order,
            "m": m,
            "n_risk": metrics["bad_trajectory_count"],
            "empirical_miss_rate": metrics["miss_rate"],
            "empirical_burden": metrics["trajectory_burden"],
            "empirical_false_alarm_rate": metrics["false_alarm_rate"],
            "empirical_pre_failure_coverage": metrics["pre_failure_coverage"],
            **metrics,
        })
    return table


def option_a_select_threshold(
    calibration_table: list[dict[str, Any]],
    alpha: float,
    delta: float,
    threshold_grid: Iterable[float] | None = None,
    secondary_objective: str = "empirical_burden",
    correction_name: str = "hoeffding_union_bound",
) -> dict[str, Any]:
    if not calibration_table:
        raise ValueError("calibration_table must be non-empty")
    m = len(list(threshold_grid)) if threshold_grid is not None else len(calibration_table)
    enriched = []
    for order, row in enumerate(calibration_table):
        n = int(row.get("n_risk") or row.get("bad_trajectory_count") or row.get("n_calibration") or row.get("trajectory_count") or 0)
        risk = float(row.get("empirical_miss_rate", row.get("calibration_missed_first_failure_rate", row.get("miss_rate", 0.0))))
        correction = correction_upper_bound(correction_name, risk, n, m, delta)
        upper = correction["upper_bound"]
        enriched.append({**row, "threshold_order": int(row.get("threshold_order", order)), "n_risk": n, "upper_miss_bound": upper, "correction": correction})
    feasible = [row for row in enriched if float(row["upper_miss_bound"]) <= alpha]
    if not feasible:
        return {
            "selected_threshold": None,
            "no_safe": True,
            "alpha": alpha,
            "delta": delta,
            "M": m,
            "n_calibration": int(enriched[0].get("n_risk", 0)),
            "feasible_count": 0,
            "correction_name": correction_name,
            "calibration_table": enriched,
            "notes": [f"NO_SAFE_RECOMMENDATION: no threshold satisfies {correction_name} miss-risk target"],
        }
    selected = sorted(
        feasible,
        key=lambda row: (
            float(row.get(secondary_objective, row.get("empirical_burden", 1.0))),
            float(row.get("empirical_false_alarm_rate", row.get("calibration_false_alarm_trajectory_rate", 1.0))),
            -float(row.get("empirical_pre_failure_coverage", row.get("calibration_pre_failure_warning_coverage", 0.0))),
            -float(row.get("threshold", row.get("threshold_quantile", 0.0))),
            int(row.get("threshold_order", 0)),
        ),
    )[0]
    return {
        "selected_threshold": selected.get("threshold", selected.get("threshold_quantile")),
        "no_safe": False,
        "alpha": alpha,
        "delta": delta,
        "M": m,
        "n_calibration": int(selected.get("n_risk", 0)),
        "feasible_count": len(feasible),
        "correction_name": correction_name,
        "selected_calibration_miss_rate": float(selected.get("empirical_miss_rate", selected.get("calibration_missed_first_failure_rate", 0.0))),
        "selected_calibration_upper_bound": float(selected["upper_miss_bound"]),
        "selected_calibration_burden": float(selected.get("empirical_burden", selected.get("calibration_trajectory_burden", 0.0))),
        "selected_calibration_false_alarm_rate": float(selected.get("empirical_false_alarm_rate", selected.get("calibration_false_alarm_trajectory_rate", 0.0))),
        "selected_calibration_pre_failure_coverage": float(selected.get("empirical_pre_failure_coverage", selected.get("calibration_pre_failure_warning_coverage", 0.0))),
        "selected_row": selected,
        "calibration_table": enriched,
        "notes": ["Selected least-burden feasible threshold using calibration metrics only"],
    }


def evaluate_selected_threshold(test_table: list[dict[str, Any]], selected_threshold: Any) -> dict[str, Any]:
    for row in test_table:
        if row.get("threshold") == selected_threshold or row.get("threshold_quantile") == selected_threshold:
            return {
                "selected_test_miss_rate": float(row.get("test_missed_first_failure_rate", row.get("miss_rate", 0.0))),
                "selected_test_first_failure_coverage": float(row.get("test_first_failure_coverage", row.get("first_failure_coverage", 0.0))),
                "selected_test_burden": float(row.get("test_trajectory_burden", row.get("trajectory_burden", 0.0))),
                "selected_test_false_alarm_rate": float(row.get("test_false_alarm_trajectory_rate", row.get("false_alarm_rate", 0.0))),
                "selected_test_pre_failure_coverage": float(row.get("test_pre_failure_warning_coverage", row.get("pre_failure_coverage", 0.0))),
            }
    raise ValueError(f"selected threshold not found in test table: {selected_threshold}")


def aggregate_mean(rows: list[dict[str, Any]], keys: list[str]) -> dict[str, float]:
    out = {}
    for key in keys:
        vals = [float(row[key]) for row in rows if row.get(key) not in (None, "")]
        out[f"{key}_mean"] = sum(vals) / len(vals) if vals else None
    return out
