#!/usr/bin/env python3
"""Reusable feasibility-aware first-event dual-unit controller."""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Iterable

from option_c_dual_constraint_calibration import option_c_select_threshold


def estimate_first_failure_prevalence(trajectories: Iterable[Any]) -> dict[str, Any]:
    vals = []
    for item in trajectories:
        if isinstance(item, dict):
            vals.append(int(bool(item.get("trajectory_has_first_failure", item.get("has_first_failure", 0)))))
        else:
            vals.append(int(bool(item)))
    n = len(vals)
    k = sum(vals)
    return {"p_hat": k / n if n else 0.0, "n": n, "k_first_failure": k}


def _binom_cdf(k: int, n: int, p: float) -> float:
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if k >= n else 0.0
    total = 0.0
    for x in range(k + 1):
        total += math.comb(n, x) * (p ** x) * ((1.0 - p) ** (n - x))
    return min(1.0, max(0.0, total))


@lru_cache(maxsize=200000)
def clopper_pearson_lower_bound(k: int, n: int, delta: float) -> float:
    """One-sided lower exact binomial confidence bound for prevalence."""
    if n <= 0:
        raise ValueError("n must be positive")
    if not 0 < delta < 1:
        raise ValueError("delta must be in (0,1)")
    if k <= 0:
        return 0.0
    if k > n:
        raise ValueError("k must be in [0,n]")
    # Solve P_p[X >= k] = delta, equivalently CDF(k-1; n, p) = 1-delta.
    target = 1.0 - delta
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        cdf = _binom_cdf(k - 1, n, mid)
        if cdf > target:
            lo = mid
        else:
            hi = mid
    return min(1.0, max(0.0, hi))


def structural_burden_lower_bound(alpha: float, p_value: float) -> float:
    return max(0.0, float(p_value) - float(alpha))


def structural_feasibility_check(
    alpha: float,
    beta: float,
    p_hat: float,
    p_lcb: float | None = None,
) -> dict[str, Any]:
    empirical_required = structural_burden_lower_bound(alpha, p_hat)
    certified_required = structural_burden_lower_bound(alpha, p_lcb) if p_lcb is not None else None
    empirical_infeasible = beta + 1e-12 < empirical_required
    certified_infeasible = bool(p_lcb is not None and beta + 1e-12 < certified_required)
    if certified_infeasible:
        reason = "structurally_infeasible_by_first_failure_prevalence"
    elif empirical_infeasible:
        reason = "empirically_structurally_infeasible_by_first_failure_prevalence"
    else:
        reason = "structurally_feasible_by_prevalence_bound"
    return {
        "empirical_structurally_infeasible": empirical_infeasible,
        "certified_structurally_infeasible": certified_infeasible,
        "empirical_required_burden": empirical_required,
        "certified_required_burden": certified_required,
        "excess_burden_empirical": beta - empirical_required,
        "excess_burden_certified": (beta - certified_required) if certified_required is not None else None,
        "reason": reason,
    }


def corrected_feasible_set_option_c(
    calibration_losses: list[dict[str, Any]],
    alpha: float,
    beta: float,
    delta: float,
    correction: str = "clopper_pearson_union",
    threshold_grid: Iterable[float] | None = None,
) -> dict[str, Any]:
    grid = list(threshold_grid) if threshold_grid is not None else [row.get("threshold") for row in calibration_losses]
    selection = option_c_select_threshold(
        calibration_losses,
        alpha=alpha,
        beta=beta,
        delta=delta,
        threshold_grid=grid,
        correction=correction,
    )
    empirical_feasible = [
        row for row in calibration_losses
        if float(row.get("empirical_miss_rate", row.get("miss_rate", 1.0))) <= alpha
        and float(row.get("empirical_burden", row.get("burden_rate", 1.0))) <= beta
    ]
    return {
        "selection": selection,
        "feasible_thresholds": [] if selection.get("no_safe") else [selection.get("selected_threshold")],
        "empirical_feasible_count": len(empirical_feasible),
        "corrected_feasible_count": selection.get("feasible_count", 0),
        "corrected_bounds_table": selection.get("calibration_table", []),
        "empirical_feasibility_table": empirical_feasible,
    }


def _diagnostic_reason(feasible: dict[str, Any], support_n: int) -> str:
    if support_n <= 0:
        return "insufficient_support"
    if feasible["empirical_feasible_count"] <= 0:
        return "empirical_infeasible"
    if feasible["corrected_feasible_count"] <= 0:
        return "correction_blocked"
    return "unknown"


def feasibility_aware_select_policy(
    calibration_losses: list[dict[str, Any]],
    alpha: float,
    beta: float,
    delta: float,
    p_hat: float,
    p_lcb: float | None = None,
    correction: str = "clopper_pearson_union",
    threshold_grid: Iterable[float] | None = None,
    test_table: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    structural = structural_feasibility_check(alpha, beta, p_hat, p_lcb)
    base = {
        "alpha": alpha,
        "beta": beta,
        "delta": delta,
        "p_hat": p_hat,
        "p_lcb": p_lcb,
        **structural,
    }
    if structural["certified_structurally_infeasible"]:
        return {
            **base,
            "selected_threshold": None,
            "no_safe": True,
            "no_safe_reason": "structurally_infeasible_by_first_failure_prevalence",
            "feasible_count": 0,
            "notes": ["Certified structural no_safe_recommendation from first-failure prevalence lower bound"],
        }
    feasible = corrected_feasible_set_option_c(
        calibration_losses,
        alpha=alpha,
        beta=beta,
        delta=delta,
        correction=correction,
        threshold_grid=threshold_grid,
    )
    selection = feasible["selection"]
    if selection.get("no_safe"):
        support_n = int(calibration_losses[0].get("n_burden", calibration_losses[0].get("trajectory_count", 0))) if calibration_losses else 0
        reason = _diagnostic_reason(feasible, support_n)
        return {
            **base,
            "selected_threshold": None,
            "no_safe": True,
            "no_safe_reason": reason,
            "feasible_count": 0,
            "empirical_feasible_count": feasible["empirical_feasible_count"],
            "corrected_feasible_count": feasible["corrected_feasible_count"],
            "notes": ["No corrected feasible threshold after structural pre-check"],
        }
    selected_threshold = selection.get("selected_threshold")
    test_match = None
    if test_table is not None:
        test_match = next((row for row in test_table if row.get("threshold") == selected_threshold), None)
    out = {
        **base,
        "selected_threshold": selected_threshold,
        "no_safe": False,
        "no_safe_reason": "selected_corrected_feasible_policy",
        "feasible_count": selection.get("feasible_count", 0),
        "selected_calibration_miss": selection.get("selected_calibration_miss_rate"),
        "selected_calibration_burden": selection.get("selected_calibration_burden"),
        "selected_miss_upper": selection.get("selected_calibration_miss_upper"),
        "selected_burden_upper": selection.get("selected_calibration_burden_upper"),
        "notes": ["Selected corrected feasible threshold"],
    }
    if test_match is not None:
        miss = float(test_match.get("test_missed_first_failure_rate", test_match.get("empirical_miss_rate", 0.0)))
        burden = float(test_match.get("test_trajectory_burden", test_match.get("empirical_burden", 0.0)))
        out.update({
            "selected_test_miss": miss,
            "selected_test_burden": burden,
            "selected_test_joint_success": miss <= alpha and burden <= beta,
        })
    return out
