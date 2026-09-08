"""Shared helpers for Batch 8.5 risk-control diagnostics."""

from __future__ import annotations

import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
HEURISTIC_SCORES = MODEL_OUTPUT_DIR / "heuristic_scores.jsonl"
LIGHTWEIGHT_SCORES = MODEL_OUTPUT_DIR / "lightweight_model_scores.jsonl"
SCORE_SCHEMA = REPORTS_DIR / "model_score_schema.json"
PREFIX_VERIFIED = WORKSPACE / "data" / "processed" / "prefix_verified.jsonl"
METRICS_SCRIPT = Path(__file__).resolve().with_name("risk_control_metrics.py")

RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code"}
REQUIRED_SCORE_FIELDS = {"trajectory_id", "step_index", "split", "baseline_name", "score", "target", "next_step_bad", "higher_means_riskier"}


def _load_metrics():
    spec = importlib.util.spec_from_file_location("risk_control_metrics", METRICS_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


rcm = _load_metrics()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def load_score_rows(paths: tuple[Path, ...] = (HEURISTIC_SCORES, LIGHTWEIGHT_SCORES)) -> list[dict[str, Any]]:
    rows = []
    for path in paths:
        with path.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                row["_score_file"] = str(path.relative_to(WORKSPACE))
                rows.append(row)
    return rows


def validate_score_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    schema = load_json(SCORE_SCHEMA)
    errors = []
    raw_hits = []
    for index, row in enumerate(rows, start=1):
        missing = REQUIRED_SCORE_FIELDS - set(row)
        if missing:
            errors.append({"row": index, "reason": f"missing fields {sorted(missing)}"})
        raw = sorted(RAW_KEYS & set(row))
        if raw:
            raw_hits.append({"row": index, "keys": raw})
        if row.get("target") != row.get("next_step_bad"):
            errors.append({"row": index, "reason": "target does not equal next_step_bad"})
        if row.get("higher_means_riskier") is not True:
            errors.append({"row": index, "reason": "higher_means_riskier is not true"})
    return {
        "schema_ok": schema.get("raw_text_fields_allowed") is False and schema.get("higher_means_riskier") is True,
        "error_count": len(errors),
        "errors": errors[:50],
        "raw_text_key_hit_count": len(raw_hits),
        "raw_text_key_hits": raw_hits[:50],
    }


def group_by_baseline(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        grouped[str(row["baseline_name"])][str(row["split"])].append(row)
    return grouped


def rows_to_scores_labels(rows: list[dict[str, Any]]) -> tuple[list[float], list[int], list[str]]:
    return [float(row["score"]) for row in rows], [int(row["target"]) for row in rows], [str(row["trajectory_id"]) for row in rows]


def fixed_policy_threshold(baseline_name: str, scores: list[float]) -> float | None:
    if not scores:
        return None
    eps = max(1e-12, max(abs(min(scores)), abs(max(scores)), 1.0) * 1e-12)
    if baseline_name == "always_allow":
        return max(scores) + eps
    if baseline_name == "always_review":
        return min(scores) - eps
    return None


def select_threshold_for_alpha(baseline_name: str, calibration_rows: list[dict[str, Any]], alpha: float, conservative: bool) -> dict[str, Any]:
    scores, labels, _trajectories = rows_to_scores_labels(calibration_rows)
    fixed_tau = fixed_policy_threshold(baseline_name, scores)
    if fixed_tau is not None:
        return {"tau": fixed_tau, "fixed_policy": baseline_name, "selected_on": "policy_definition", "conservative": conservative}
    return rcm.select_threshold(scores, labels, alpha, conservative=conservative)


def threshold_for_deferral_budget(scores: list[float], budget: float) -> float:
    """Select tau so score > tau defers approximately the top budget fraction."""
    if not scores:
        return float("inf")
    ordered = sorted(float(score) for score in scores)
    defer_count = int(round(len(ordered) * float(budget)))
    defer_count = min(len(ordered), max(0, defer_count))
    eps = max(1e-12, max(abs(ordered[0]), abs(ordered[-1]), 1.0) * 1e-12)
    if defer_count <= 0:
        return ordered[-1] + eps
    if defer_count >= len(ordered):
        return ordered[0] - eps
    return ordered[len(ordered) - defer_count - 1]


def evaluate_rows(rows: list[dict[str, Any]], tau: float, alpha: float = 0.0, include_ci: bool = True) -> dict[str, Any]:
    scores, labels, trajectories = rows_to_scores_labels(rows)
    metrics = rcm.decision_metrics(scores, labels, tau, alpha, trajectories)
    metrics["bad_deferred"] = metrics["true_deferral_count"]
    metrics["fraction_of_bad_steps_deferred"] = metrics["true_deferral_rate"]
    metrics["bad_step_capture_rate_among_deferred_rows"] = metrics["defer_precision"]
    if include_ci:
        decision_rows = [{"score": float(row["score"]), "target": int(row["target"]), "tau": tau, "alpha": alpha, "trajectory_id": row.get("trajectory_id")} for row in rows]
        for metric_name in ("allowed_bad_rate", "deferral_rate", "false_deferral_rate", "useful_allowed_rate"):
            metrics[f"{metric_name}_ci"] = rcm.bootstrap_metric_ci(decision_rows, metric_name)
    return metrics


def base_risk(rows: list[dict[str, Any]]) -> float:
    return sum(int(row["target"]) for row in rows) / len(rows) if rows else 0.0


def add_reduction_metrics(metrics: dict[str, Any], split_base_risk: float) -> dict[str, Any]:
    risk = metrics.get("allowed_bad_rate")
    if risk is None:
        metrics["allowed_bad_rate_reduction_vs_always_allow"] = None
        metrics["relative_risk_reduction_vs_always_allow"] = None
    else:
        metrics["allowed_bad_rate_reduction_vs_always_allow"] = split_base_risk - risk
        metrics["relative_risk_reduction_vs_always_allow"] = ((split_base_risk - risk) / split_base_risk) if split_base_risk else None
    return metrics


def quantile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * q))))
    return ordered[index]


def decile_cutpoints(calibration_scores: list[float]) -> list[float]:
    return [quantile(calibration_scores, q / 10.0) for q in range(1, 10)]


def assign_decile(score: float, cutpoints: list[float]) -> int:
    """Return 1 for lowest-risk bin and 10 for highest-risk bin."""
    decile = 1
    for cutpoint in cutpoints:
        if float(score) > cutpoint:
            decile += 1
        else:
            break
    return min(10, decile)


def summarize_distribution(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"count": 0, "min": None, "median": None, "mean": None, "max": None}
    return {
        "count": len(values),
        "min": min(values),
        "median": quantile(values, 0.5),
        "mean": sum(values) / len(values),
        "max": max(values),
    }


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default
