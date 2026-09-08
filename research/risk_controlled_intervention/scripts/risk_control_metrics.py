#!/usr/bin/env python3
"""Pure metric helpers for later risk-control evaluation scaffolding."""

from __future__ import annotations

import random
import math
from collections import defaultdict
from typing import Any, Callable, Iterable, Sequence


def _as_list(values: Iterable[Any]) -> list[Any]:
    return list(values)


def _is_allow(decision: Any) -> bool:
    if isinstance(decision, str):
        return decision.strip().lower() == "allow"
    return bool(decision)


def _validate_equal_length(decisions: Sequence[Any], labels: Sequence[int]) -> None:
    if len(decisions) != len(labels):
        raise ValueError("decisions and labels must have the same length.")


def allowed_bad_rate(decisions: Iterable[Any], labels: Iterable[int]) -> float:
    """Return bad-label rate among allowed examples."""
    decision_list = _as_list(decisions)
    label_list = [int(label) for label in labels]
    _validate_equal_length(decision_list, label_list)
    allowed = [(decision, label) for decision, label in zip(decision_list, label_list) if _is_allow(decision)]
    if not allowed:
        return 0.0
    return sum(label for _decision, label in allowed) / len(allowed)


def allowed_bad_rate_or_none(decisions: Iterable[Any], labels: Iterable[int]) -> float | None:
    """Return bad-label rate among allowed examples, or None if nothing is allowed."""
    decision_list = _as_list(decisions)
    label_list = [int(label) for label in labels]
    _validate_equal_length(decision_list, label_list)
    allowed = [(decision, label) for decision, label in zip(decision_list, label_list) if _is_allow(decision)]
    if not allowed:
        return None
    return sum(label for _decision, label in allowed) / len(allowed)


def deferral_rate(decisions: Iterable[Any]) -> float:
    """Return fraction of examples deferred."""
    decision_list = _as_list(decisions)
    if not decision_list:
        return 0.0
    return sum(1 for decision in decision_list if not _is_allow(decision)) / len(decision_list)


def false_deferral_rate(decisions: Iterable[Any], labels: Iterable[int]) -> float:
    """Return deferral rate among non-bad examples."""
    decision_list = _as_list(decisions)
    label_list = [int(label) for label in labels]
    _validate_equal_length(decision_list, label_list)
    good = [(decision, label) for decision, label in zip(decision_list, label_list) if label == 0]
    if not good:
        return 0.0
    return sum(1 for decision, _label in good if not _is_allow(decision)) / len(good)


def risk_gap(empirical_risk: float, alpha: float) -> float:
    """Return empirical risk minus target risk alpha."""
    return float(empirical_risk) - float(alpha)


def risk_gap_or_none(empirical_risk: float | None, alpha: float) -> float | None:
    if empirical_risk is None:
        return None
    return float(empirical_risk) - float(alpha)


def bootstrap_ci(
    values: Iterable[Any],
    seed: int = 0,
    iterations: int = 1000,
    confidence: float = 0.95,
    statistic: Callable[[list[Any]], float] | None = None,
) -> tuple[float, float]:
    """Return a percentile bootstrap confidence interval for a statistic."""
    value_list = _as_list(values)
    if not value_list:
        raise ValueError("values must be non-empty.")
    if iterations <= 0:
        raise ValueError("iterations must be positive.")
    if not 0.0 < confidence < 1.0:
        raise ValueError("confidence must be between 0 and 1.")
    stat = statistic or (lambda sample: sum(float(value) for value in sample) / len(sample))
    rng = random.Random(seed)
    estimates = []
    for _ in range(iterations):
        sample = [value_list[rng.randrange(len(value_list))] for _item in value_list]
        estimates.append(float(stat(sample)))
    estimates.sort()
    lower_q = (1.0 - confidence) / 2.0
    upper_q = 1.0 - lower_q
    lower_index = min(len(estimates) - 1, max(0, int(lower_q * (len(estimates) - 1))))
    upper_index = min(len(estimates) - 1, max(0, int(upper_q * (len(estimates) - 1))))
    return estimates[lower_index], estimates[upper_index]


def decision_metrics(
    scores: Sequence[float],
    labels: Sequence[int],
    threshold: float,
    alpha: float,
    trajectory_ids: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Compute ALLOW/DEFER metrics for score <= threshold."""
    labels = [int(label) for label in labels]
    decisions_allow = [float(score) <= threshold for score in scores]
    total = len(labels)
    allowed_count = sum(decisions_allow)
    deferred_count = total - allowed_count
    positives = sum(labels)
    negatives = total - positives
    bad_allowed = sum(1 for allow, label in zip(decisions_allow, labels) if allow and label)
    bad_deferred = sum(1 for allow, label in zip(decisions_allow, labels) if not allow and label)
    useful_allowed = sum(1 for allow, label in zip(decisions_allow, labels) if allow and not label)
    false_deferred = sum(1 for allow, label in zip(decisions_allow, labels) if not allow and not label)
    allowed_risk = bad_allowed / allowed_count if allowed_count else None
    precision = bad_deferred / deferred_count if deferred_count else 0.0
    recall = bad_deferred / positives if positives else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    trajectory_metrics = {}
    if trajectory_ids is not None:
        by_traj: dict[str, int] = defaultdict(int)
        for allow, trajectory_id in zip(decisions_allow, trajectory_ids):
            if not allow:
                by_traj[str(trajectory_id)] += 1
        trajectory_metrics = {
            "trajectories_with_at_least_one_defer": sum(1 for count in by_traj.values() if count > 0),
            "average_deferrals_per_trajectory": (sum(by_traj.values()) / len(set(map(str, trajectory_ids)))) if trajectory_ids else 0.0,
        }
    return {
        "tau": threshold,
        "total_rows": total,
        "positives": positives,
        "allowed_count": allowed_count,
        "deferred_count": deferred_count,
        "allowed_rate": allowed_count / total if total else 0.0,
        "deferral_rate": deferred_count / total if total else 0.0,
        "bad_allowed": bad_allowed,
        "allowed_bad_rate": allowed_risk,
        "risk_gap": risk_gap_or_none(allowed_risk, alpha),
        "risk_violation": bool(allowed_risk is not None and allowed_risk > alpha),
        "false_deferral_count": false_deferred,
        "false_deferral_rate": false_deferred / negatives if negatives else 0.0,
        "true_deferral_count": bad_deferred,
        "true_deferral_rate": bad_deferred / positives if positives else 0.0,
        "useful_allowed_count": useful_allowed,
        "useful_allowed_rate": useful_allowed / negatives if negatives else 0.0,
        "defer_precision": precision,
        "defer_recall": recall,
        "defer_f1": f1,
        **trajectory_metrics,
    }


def candidate_thresholds(scores: Sequence[float]) -> list[float]:
    unique = sorted(set(float(score) for score in scores))
    if not unique:
        return []
    eps = max(1e-12, max(abs(unique[0]), abs(unique[-1]), 1.0) * 1e-12)
    return [unique[0] - eps, *unique, unique[-1] + eps]


def wilson_upper_bound(bad: int, total: int, z: float = 1.959963984540054) -> float:
    if total <= 0:
        return 0.0
    phat = bad / total
    denom = 1 + z * z / total
    center = phat + z * z / (2 * total)
    margin = z * math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)
    return min(1.0, (center + margin) / denom)


def select_threshold(
    scores: Sequence[float],
    labels: Sequence[int],
    alpha: float,
    conservative: bool = False,
) -> dict[str, Any]:
    """Select threshold on calibration data only.

    Maximizes allowed count subject to empirical or conservative allowed-bad
    constraint. Tie-breaks by lower risk, higher allowed count, then lower tau.
    """
    labels = [int(label) for label in labels]
    best: dict[str, Any] | None = None
    for tau in candidate_thresholds(scores):
        metrics = decision_metrics(scores, labels, tau, alpha)
        risk = metrics["allowed_bad_rate"]
        upper = wilson_upper_bound(metrics["bad_allowed"], metrics["allowed_count"]) if conservative else risk
        feasible = (upper is not None and upper <= alpha) if metrics["allowed_count"] else True
        if not feasible:
            continue
        candidate = {
            "tau": tau,
            "allowed_count": metrics["allowed_count"],
            "allowed_bad_rate": risk,
            "calibration_upper_bound": upper,
            "defer_everything": metrics["allowed_count"] == 0,
            "no_nontrivial_feasible_threshold": False,
        }
        if best is None:
            best = candidate
            continue
        candidate_key = (
            candidate["allowed_count"],
            -(candidate["allowed_bad_rate"] if candidate["allowed_bad_rate"] is not None else -1.0),
            -candidate["tau"],
        )
        best_key = (
            best["allowed_count"],
            -(best["allowed_bad_rate"] if best["allowed_bad_rate"] is not None else -1.0),
            -best["tau"],
        )
        if candidate_key > best_key:
            best = candidate
    if best is None:
        thresholds = candidate_thresholds(scores)
        tau = thresholds[0] if thresholds else float("-inf")
        best = {
            "tau": tau,
            "allowed_count": 0,
            "allowed_bad_rate": None,
            "calibration_upper_bound": 0.0,
            "defer_everything": True,
            "no_nontrivial_feasible_threshold": True,
        }
    if best["allowed_count"] == 0:
        best["no_nontrivial_feasible_threshold"] = True
    return best


def bootstrap_metric_ci(
    rows: Sequence[dict[str, Any]],
    metric_name: str,
    seed: int = 20250617,
    iterations: int = 100,
    confidence: float = 0.95,
) -> dict[str, Any]:
    """Bootstrap a decision metric over trajectories when identifiers exist."""
    if not rows:
        return {"lower": None, "upper": None, "unit": "none"}
    base_scores = [float(row["score"]) for row in rows]
    base_labels = [int(row["target"]) for row in rows]
    base_tau = float(rows[0]["tau"])
    base_alpha = float(rows[0].get("alpha", 0.0))
    base_value = decision_metrics(base_scores, base_labels, base_tau, base_alpha).get(metric_name)
    if base_value is None:
        return {"lower": None, "upper": None, "unit": "undefined", "iterations": iterations, "confidence": confidence}
    has_traj = all(row.get("trajectory_id") is not None for row in rows)
    if has_traj:
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[str(row["trajectory_id"])].append(row)
        units = list(grouped.values())
        unit_name = "trajectory"
    else:
        units = [[row] for row in rows]
        unit_name = "row"

    def stat(sample_units: list[list[dict[str, Any]]]) -> float:
        flat = [row for unit in sample_units for row in unit]
        scores = [float(row["score"]) for row in flat]
        labels = [int(row["target"]) for row in flat]
        tau = float(flat[0]["tau"])
        alpha = float(flat[0].get("alpha", 0.0))
        value = decision_metrics(scores, labels, tau, alpha).get(metric_name)
        return 0.0 if value is None else float(value)

    lower, upper = bootstrap_ci(units, seed=seed, iterations=iterations, confidence=confidence, statistic=stat)
    return {"lower": lower, "upper": upper, "unit": unit_name, "iterations": iterations, "confidence": confidence}


def choose_threshold_for_alpha(
    calibration_scores: Iterable[float],
    calibration_labels: Iterable[int],
    alpha: float,
) -> float:
    """Choose the largest allow threshold whose empirical allowed-bad rate is at most alpha.

    Scores are interpreted as risk scores where lower is safer. A later evaluator can
    allow an example when `score <= threshold` and defer otherwise.
    """
    scores = [float(score) for score in calibration_scores]
    labels = [int(label) for label in calibration_labels]
    if len(scores) != len(labels):
        raise ValueError("calibration_scores and calibration_labels must have the same length.")
    if not scores:
        raise ValueError("calibration_scores must be non-empty.")
    if not 0.0 <= alpha <= 1.0:
        raise ValueError("alpha must be between 0 and 1.")

    unique_scores = sorted(set(scores))
    epsilon = max(1e-12, abs(unique_scores[0]) * 1e-12)
    candidates = [unique_scores[0] - epsilon, *unique_scores]
    chosen = candidates[0]
    for threshold in candidates:
        decisions = [score <= threshold for score in scores]
        risk = allowed_bad_rate(decisions, labels)
        if risk <= alpha:
            chosen = threshold
    return chosen
