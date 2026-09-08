#!/usr/bin/env python3
"""Run lightweight supervised uncalibrated baseline models."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import baseline_metrics as metrics
import model_features

WORKSPACE = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPORTS_DIR = WORKSPACE / "reports"
SCORES_PATH = OUTPUT_DIR / "lightweight_model_scores.jsonl"
METRICS_JSON = REPORTS_DIR / "lightweight_baseline_metrics.json"
METRICS_MD = REPORTS_DIR / "lightweight_baseline_metrics.md"
SEED = 20250617


def parse_args() -> argparse.Namespace:
    return argparse.ArgumentParser(description="Run Batch 7 lightweight supervised baselines.").parse_args()


def standardizer(train_x: list[list[float]]) -> tuple[list[float], list[float]]:
    if not train_x:
        return [], []
    cols = len(train_x[0])
    means = []
    stds = []
    for col in range(cols):
        values = [row[col] for row in train_x]
        mean = sum(values) / len(values)
        var = sum((value - mean) ** 2 for value in values) / len(values)
        std = math.sqrt(var) or 1.0
        means.append(mean)
        stds.append(std)
    return means, stds


def transform(x: list[list[float]], means: list[float], stds: list[float]) -> list[list[float]]:
    return [[(value - means[index]) / stds[index] for index, value in enumerate(row)] for row in x]


def dot(weights: list[float], row: list[float]) -> float:
    return weights[0] + sum(weight * value for weight, value in zip(weights[1:], row))


def fit_logistic(
    x: list[list[float]],
    y: list[int],
    *,
    class_weighted: bool,
    seed: int = SEED,
    epochs: int = 12,
    learning_rate: float = 0.05,
    l2: float = 0.0005,
) -> list[float]:
    if not x:
        return [0.0]
    weights = [0.0] * (len(x[0]) + 1)
    pos = sum(y)
    neg = len(y) - pos
    pos_weight = (len(y) / (2 * pos)) if class_weighted and pos else 1.0
    neg_weight = (len(y) / (2 * neg)) if class_weighted and neg else 1.0
    for _epoch in range(epochs):
        for index in metrics.seed_shuffle_indices(len(x), seed + _epoch):
            row = x[index]
            label = y[index]
            pred = metrics.sigmoid(dot(weights, row))
            sample_weight = pos_weight if label else neg_weight
            error = (pred - label) * sample_weight
            weights[0] -= learning_rate * error
            for col, value in enumerate(row, start=1):
                weights[col] -= learning_rate * (error * value + l2 * weights[col])
    return weights


def predict_logistic(weights: list[float], x: list[list[float]]) -> list[float]:
    return [metrics.sigmoid(dot(weights, row)) for row in x]


def prior_scores(train_y: list[int], count: int) -> list[float]:
    prior = (sum(train_y) / len(train_y)) if train_y else 0.0
    return [prior] * count


def majority_scores(train_y: list[int], count: int) -> list[float]:
    prior = (sum(train_y) / len(train_y)) if train_y else 0.0
    return [1.0 if prior >= 0.5 else 0.0] * count


def sklearn_available() -> bool:
    try:
        import sklearn  # noqa: F401
        return True
    except Exception:
        return False


def score_record(split: str, name: str, row: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "split": split,
        "baseline_name": name,
        "model_family": "lightweight_supervised",
        "score": score,
        "target": int(row["next_step_bad"]),
        "next_step_bad": int(row["next_step_bad"]),
        "higher_means_riskier": True,
        "source_bucket": row.get("source_bucket"),
        "agent": row.get("agent"),
        "layout_family": row.get("layout_family"),
        "difficulty": row.get("difficulty"),
        "category": row.get("category"),
    }


def evaluate_model(name: str, scores_by_split: dict[str, list[float]], prepared: dict[str, Any], threshold: float) -> dict[str, Any]:
    report = {"default_threshold": threshold, "splits": {}}
    for split, scores in scores_by_split.items():
        data = prepared["splits"][split]
        labels = data["y"]
        report["splits"][split] = metrics.split_metrics(scores, labels, threshold)
        if split in {"calibration", "test"}:
            report["splits"][split]["subgroups"] = metrics.subgroup_metrics(scores, labels, data["metadata"], threshold)
    return report


def run() -> dict[str, Any]:
    prepared = model_features.prepare_matrices()
    train_x_raw = prepared["splits"]["train"]["X"]
    train_y = prepared["splits"]["train"]["y"]
    means, stds = standardizer(train_x_raw)
    x_scaled = {split: transform(data["X"], means, stds) for split, data in prepared["splits"].items()}
    model_reports: dict[str, Any] = {}
    all_score_records = []

    model_scores: dict[str, dict[str, list[float]]] = {}
    for name, class_weighted in (("logistic_regression", False), ("class_weighted_logistic_regression", True)):
        weights = fit_logistic(x_scaled["train"], train_y, class_weighted=class_weighted)
        scores_by_split = {split: predict_logistic(weights, x_values) for split, x_values in x_scaled.items()}
        threshold = metrics.threshold_from_train(scores_by_split["train"], train_y)
        model_scores[name] = scores_by_split
        model_reports[name] = evaluate_model(name, scores_by_split, prepared, threshold)
        model_reports[name]["fit_split"] = "train"
        model_reports[name]["model_notes"] = "Pure-Python SGD logistic regression; no calibration split used for fitting."

    for name, score_fn in (("dummy_prior", prior_scores), ("dummy_majority", majority_scores)):
        scores_by_split = {split: score_fn(train_y, len(data["y"])) for split, data in prepared["splits"].items()}
        threshold = metrics.threshold_from_train(scores_by_split["train"], train_y)
        model_scores[name] = scores_by_split
        model_reports[name] = evaluate_model(name, scores_by_split, prepared, threshold)
        model_reports[name]["fit_split"] = "train"
        model_reports[name]["model_notes"] = "Dummy baseline fit from train split target prevalence only."

    if sklearn_available():
        model_reports["random_forest"] = {
            "skipped": True,
            "reason": "sklearn is available but this repository implementation keeps Batch 7 deterministic without optional dependency behavior.",
        }
    else:
        model_reports["random_forest"] = {"skipped": True, "reason": "sklearn is not installed in this environment."}

    for name, scores_by_split in model_scores.items():
        for split, scores in scores_by_split.items():
            rows = prepared["splits"][split]["rows"]
            all_score_records.extend(score_record(split, name, row, score) for row, score in zip(rows, scores))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SCORES_PATH.write_text("".join(json.dumps(record, sort_keys=True) + "\n" for record in all_score_records))
    report = {
        "schema_version": "risk-controlled-intervention-lightweight-baselines.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 7 uncalibrated lightweight model scores only; not production CodingActionGate validation, "
            "not conformal calibration, and not a production statistical guarantee."
        ),
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "seed": SEED,
        "score_file": str(SCORES_PATH.relative_to(WORKSPACE)),
        "feature_count": len(prepared["encoder"]["encoded_feature_names"]),
        "feature_names": prepared["encoder"]["encoded_feature_names"],
        "models": model_reports,
        "no_calibration_or_test_fitting": True,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    METRICS_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    METRICS_MD.write_text(markdown(report) + "\n")
    return report


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Lightweight Baseline Metrics",
        "",
        "Uncalibrated lightweight supervised baselines only. Train split is the only fitting split.",
        "",
        "| model | split | AUROC | AP | Brier | deferral rate | allowed-bad rate |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for name, model in report["models"].items():
        if model.get("skipped"):
            lines.append(f"| `{name}` | `skipped` |  |  |  |  |  |")
            continue
        for split in ("train", "calibration", "test"):
            item = model["splits"][split]
            lines.append(
                f"| `{name}` | `{split}` | `{item['auroc']}` | `{item['average_precision']}` | `{item['brier_score']}` | "
                f"`{item['deferral_rate']}` | `{item['allowed_bad_rate']}` |"
            )
    lines.extend(["", "Results apply only to the v0.4 extraction-supported verified subset."])
    return "\n".join(lines)


def main() -> int:
    report = run()
    print(json.dumps({"models": list(report["models"]), "score_file": report["score_file"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
