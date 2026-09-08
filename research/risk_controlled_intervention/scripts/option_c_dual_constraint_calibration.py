#!/usr/bin/env python3
"""Reusable Option C dual-constraint first-event calibration utilities."""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Iterable

from option_a_first_event_calibration import clopper_pearson_upper_bound


@lru_cache(maxsize=200000)
def _cp_cached(k: int, n: int, alpha: float) -> float:
    return clopper_pearson_upper_bound(k, n, alpha)


def _count_from_rate(rate: float, n: int) -> int:
    return max(0, min(n, int(round(float(rate) * n))))


def _hoeffding(empirical_risk: float, n: int, comparisons: int, delta: float) -> float:
    if n <= 0:
        return 1.0
    return min(1.0, empirical_risk + math.sqrt(math.log(comparisons / delta) / (2.0 * n)))


def clopper_pearson_dual_union_bounds(
    k_miss: int,
    k_burden: int,
    n: int,
    M: int,
    delta: float,
    n_burden: int | None = None,
) -> dict[str, Any]:
    """Return dual-loss CP bounds with delta split over thresholds and losses.

    The required `n` argument is the miss-risk denominator for compatibility
    with the T-5 test target. `n_burden` can be provided when burden is measured
    over all trajectories rather than positive first-failure trajectories.
    """
    n_miss = n
    n_b = n if n_burden is None else n_burden
    per_comparison = delta / (2.0 * M)
    return {
        "miss_upper": _cp_cached(k_miss, n_miss, per_comparison) if n_miss > 0 else 1.0,
        "burden_upper": _cp_cached(k_burden, n_b, per_comparison) if n_b > 0 else 1.0,
        "k_miss": k_miss,
        "k_burden": k_burden,
        "n_miss": n_miss,
        "n_burden": n_b,
        "M": M,
        "delta": delta,
        "per_comparison_delta": per_comparison,
        "is_uniform_over_grid_and_losses": True,
        "is_empirical_proxy_only": False,
    }


def compute_dual_loss_bounds(
    calibration_losses: dict[str, float],
    thresholds: Iterable[float],
    correction: str,
    delta: float,
) -> dict[str, Any]:
    """Compute corrected miss and burden upper bounds for one threshold row."""
    M = len(list(thresholds))
    n_miss = int(calibration_losses.get("n_miss") or calibration_losses.get("n_risk") or 0)
    n_burden = int(calibration_losses.get("n_burden") or calibration_losses.get("n_calibration") or calibration_losses.get("trajectory_count") or 0)
    miss_rate = float(calibration_losses.get("miss_rate", calibration_losses.get("empirical_miss_rate", 0.0)))
    burden_rate = float(calibration_losses.get("burden_rate", calibration_losses.get("empirical_burden", 0.0)))
    k_miss = _count_from_rate(miss_rate, n_miss)
    k_burden = _count_from_rate(burden_rate, n_burden)
    if correction == "clopper_pearson_union":
        bounds = clopper_pearson_dual_union_bounds(k_miss, k_burden, n_miss, M, delta, n_burden=n_burden)
        miss_upper = bounds["miss_upper"]
        burden_upper = bounds["burden_upper"]
        uniform = True
        proxy = False
        caveat = "Uniform finite-grid correction over thresholds and both losses using delta/(2M)."
    elif correction == "hoeffding_union_bound":
        comparisons = 2 * M
        miss_upper = _hoeffding(miss_rate, n_miss, comparisons, delta)
        burden_upper = _hoeffding(burden_rate, n_burden, comparisons, delta)
        uniform = True
        proxy = False
        caveat = "Uniform finite-grid Hoeffding correction over thresholds and both losses."
    elif correction == "plus_one_empirical_proxy":
        miss_upper = (k_miss + 1) / (n_miss + 1) if n_miss > 0 else 1.0
        burden_upper = (k_burden + 1) / (n_burden + 1) if n_burden > 0 else 1.0
        uniform = False
        proxy = True
        caveat = "Empirical proxy only; not a uniform dual-constraint theory candidate."
    elif correction == "pointwise_clopper_pearson_no_union":
        miss_upper = _cp_cached(k_miss, n_miss, delta) if n_miss > 0 else 1.0
        burden_upper = _cp_cached(k_burden, n_burden, delta) if n_burden > 0 else 1.0
        uniform = False
        proxy = True
        caveat = "Pointwise diagnostic only; not valid for data-dependent grid selection."
    else:
        raise ValueError(f"unknown correction: {correction}")
    return {
        "correction_name": correction,
        "miss_upper": min(1.0, miss_upper),
        "burden_upper": min(1.0, burden_upper),
        "miss_rate": miss_rate,
        "burden_rate": burden_rate,
        "k_miss": k_miss,
        "k_burden": k_burden,
        "n_miss": n_miss,
        "n_burden": n_burden,
        "M": M,
        "delta": delta,
        "is_default_theory_candidate": correction == "clopper_pearson_union",
        "is_uniform_over_grid_and_losses": uniform,
        "is_empirical_proxy_only": proxy,
        "caveat": caveat,
    }


def option_c_select_threshold(
    calibration_table: list[dict[str, Any]],
    alpha: float,
    beta: float,
    delta: float,
    threshold_grid: Iterable[float] | None = None,
    correction: str = "clopper_pearson_union",
) -> dict[str, Any]:
    """Select a threshold satisfying corrected miss and burden constraints."""
    if not calibration_table:
        raise ValueError("calibration_table must be non-empty")
    grid = list(threshold_grid) if threshold_grid is not None else [row.get("threshold", row.get("threshold_quantile")) for row in calibration_table]
    enriched = []
    for order, row in enumerate(calibration_table):
        bounds = compute_dual_loss_bounds(
            {
                "n_miss": row.get("n_miss", row.get("n_risk", row.get("bad_trajectory_count", 0))),
                "n_burden": row.get("n_burden", row.get("n_calibration", row.get("trajectory_count", 0))),
                "miss_rate": row.get("empirical_miss_rate", row.get("calibration_missed_first_failure_rate", row.get("miss_rate", 0.0))),
                "burden_rate": row.get("empirical_burden", row.get("calibration_trajectory_burden", row.get("trajectory_burden", 0.0))),
            },
            grid,
            correction,
            delta,
        )
        enriched.append({
            **row,
            "threshold_order": int(row.get("threshold_order", order)),
            "miss_upper": bounds["miss_upper"],
            "burden_upper": bounds["burden_upper"],
            "dual_bounds": bounds,
        })
    feasible = [row for row in enriched if float(row["miss_upper"]) <= alpha and float(row["burden_upper"]) <= beta]
    if not feasible:
        return {
            "selected_threshold": None,
            "no_safe": True,
            "alpha": alpha,
            "beta": beta,
            "delta": delta,
            "correction_name": correction,
            "M": len(grid),
            "n_calibration": int(enriched[0].get("n_burden", enriched[0].get("n_calibration", 0))),
            "n_calibration_positive_trajectories": int(enriched[0].get("n_miss", enriched[0].get("n_risk", 0))),
            "feasible_count": 0,
            "calibration_table": enriched,
            "notes": ["NO_SAFE_RECOMMENDATION: no threshold satisfies corrected miss and burden constraints"],
        }
    selected = sorted(
        feasible,
        key=lambda row: (
            -float(row.get("empirical_pre_failure_coverage", row.get("calibration_pre_failure_warning_coverage", 0.0))),
            float(row.get("empirical_false_alarm_rate", row.get("calibration_false_alarm_trajectory_rate", 1.0))),
            -float(row.get("empirical_mean_lead_time", row.get("calibration_mean_lead_time", 0.0)) or 0.0),
            -float(row.get("threshold", row.get("threshold_quantile", 0.0))),
            int(row.get("threshold_order", 0)),
        ),
    )[0]
    return {
        "selected_threshold": selected.get("threshold", selected.get("threshold_quantile")),
        "no_safe": False,
        "alpha": alpha,
        "beta": beta,
        "delta": delta,
        "correction_name": correction,
        "M": len(grid),
        "n_calibration": int(selected.get("n_burden", selected.get("n_calibration", 0))),
        "n_calibration_positive_trajectories": int(selected.get("n_miss", selected.get("n_risk", 0))),
        "feasible_count": len(feasible),
        "selected_calibration_miss_rate": float(selected.get("empirical_miss_rate", selected.get("calibration_missed_first_failure_rate", 0.0))),
        "selected_calibration_burden": float(selected.get("empirical_burden", selected.get("calibration_trajectory_burden", 0.0))),
        "selected_calibration_miss_upper": float(selected["miss_upper"]),
        "selected_calibration_burden_upper": float(selected["burden_upper"]),
        "selected_calibration_false_alarm_rate": float(selected.get("empirical_false_alarm_rate", selected.get("calibration_false_alarm_trajectory_rate", 0.0))),
        "selected_calibration_pre_failure_coverage": float(selected.get("empirical_pre_failure_coverage", selected.get("calibration_pre_failure_warning_coverage", 0.0))),
        "selected_calibration_lead_time": selected.get("empirical_mean_lead_time", selected.get("calibration_mean_lead_time")),
        "selected_row": selected,
        "calibration_table": enriched,
        "notes": ["Selected feasible threshold using calibration metrics only"],
    }


def evaluate_option_c_threshold(test_table: list[dict[str, Any]], selected_threshold: Any) -> dict[str, Any]:
    for row in test_table:
        if row.get("threshold") == selected_threshold or row.get("threshold_quantile") == selected_threshold:
            return {
                "selected_test_miss_rate": float(row.get("test_missed_first_failure_rate", row.get("miss_rate", 0.0))),
                "selected_test_burden": float(row.get("test_trajectory_burden", row.get("trajectory_burden", 0.0))),
                "selected_test_first_failure_coverage": float(row.get("test_first_failure_coverage", row.get("first_failure_coverage", 0.0))),
                "selected_test_false_alarm_rate": float(row.get("test_false_alarm_trajectory_rate", row.get("false_alarm_rate", 0.0))),
                "selected_test_pre_failure_coverage": float(row.get("test_pre_failure_warning_coverage", row.get("pre_failure_coverage", 0.0))),
                "selected_test_lead_time": row.get("test_mean_lead_time", row.get("mean_lead_time")),
            }
    raise ValueError(f"selected threshold not found in test table: {selected_threshold}")
