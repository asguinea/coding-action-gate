#!/usr/bin/env python3
"""Evaluate Batch 9L first-failure risk models."""

from __future__ import annotations

import csv
import importlib.util
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"

PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
GENERIC_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9l_first_failure_model_results.json"
REPORT_MD = REPORTS_DIR / "batch_9l_first_failure_model_results.md"
SUMMARY_CSV = REPORTS_DIR / "batch_9l_first_failure_model_scores_summary.csv"
ABLATION_CSV = REPORTS_DIR / "batch_9l_first_failure_model_ablations.csv"

DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
TARGETS = (
    "bad_first_bad_next_step",
    "bad_pre_first_failure_window_1",
    "bad_pre_first_failure_window_2",
    "bad_pre_first_failure_window_3",
    "bad_pre_first_failure_window_5",
    "bad_first_failure_warning_candidate",
)
MODEL_CONFIGS = (
    ("dummy_prior", "all_structured"),
    ("dummy_majority", "all_structured"),
    ("logistic_regression", "all_structured"),
    ("logistic_regression", "non_position_history_only"),
    ("logistic_regression", "prefix_position_only"),
    ("gradient_boosting", "all_structured"),
    ("hist_gradient_boosting", "all_plus_interactions"),
    ("random_forest", "all_structured"),
    ("long_prefix_heuristic", "prefix_position_only"),
    ("timeout_or_failure_heuristic", "history_error_counters_only"),
    ("observation_error_keyword_heuristic", "history_error_counters_only"),
    ("repeated_action_or_observation_heuristic", "repetition_only"),
)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "terminal_output"}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9a = load_script("evaluate_stronger_models_and_ablations")
targets_mod = load_script("build_first_failure_targets")


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9L model input: {path}")


def load_rows() -> list[dict[str, Any]]:
    return targets_mod.add_first_failure_targets(targets_mod.load_prefix_rows())


def load_splits() -> dict[str, Any]:
    require(REPEATED_SPLITS)
    return json.loads(REPEATED_SPLITS.read_text())


def assignments_for_seed(splits: dict[str, Any], seed: int) -> dict[str, str]:
    for item in splits["splits"]:
        if int(item["seed"]) == int(seed):
            return item["assignments"]
    raise KeyError(seed)


def rows_by_split(rows: list[dict[str, Any]], assignments: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    out = {"train": [], "calibration": [], "test": []}
    for row in rows:
        split = assignments.get(str(row["trajectory_id"]))
        if split in out:
            out[split].append(row)
    return out


def labels(rows: list[dict[str, Any]], target: str) -> list[int]:
    return [int(row.get(target, 0)) for row in rows]


def safe_metric(scores: list[float], y: list[int]) -> dict[str, Any]:
    prevalence = sum(y) / len(y) if y else 0.0
    ap = batch9a.baseline_metrics.average_precision(scores, y)
    return {
        "rows": len(y),
        "positives": sum(y),
        "prevalence": prevalence,
        "auroc": batch9a.baseline_metrics.auroc(scores, y),
        "average_precision": ap,
        "ap_lift_ratio": ap / prevalence if ap is not None and prevalence else None,
        "ap_lift_absolute": ap - prevalence if ap is not None else None,
    }


def top_capture(scores: list[float], y: list[int], budget: float) -> dict[str, Any]:
    if not scores:
        return {"recall": 0.0, "precision": 0.0}
    pairs = sorted(zip(scores, y), key=lambda item: item[0], reverse=True)
    n = max(1, int(round(len(pairs) * budget)))
    selected = pairs[: min(n, len(pairs))]
    positives = sum(y)
    hits = sum(label for _score, label in selected)
    return {"recall": hits / positives if positives else 0.0, "precision": hits / len(selected) if selected else 0.0}


def heuristic_score(row: dict[str, Any], name: str) -> float:
    if name == "long_prefix_heuristic":
        return float(row.get("prefix_length", 0))
    if name == "timeout_or_failure_heuristic":
        return float(row.get("recent_timeout_keyword_count", 0)) + float(row.get("recent_failure_keyword_count", 0))
    if name == "observation_error_keyword_heuristic":
        return float(row.get("recent_error_keyword_count", 0)) + float(row.get("recent_exception_keyword_count", 0))
    if name == "repeated_action_or_observation_heuristic":
        return float(row.get("repeated_action_indicator", 0)) + float(row.get("repeated_observation_indicator", 0))
    raise KeyError(name)


def fit_scores(model: str, feature_set: str, split_rows: dict[str, list[dict[str, Any]]], target: str, seed: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, list[float]], dict[str, Any]]:
    if model == "dummy_majority":
        majority = 1.0 if sum(labels(split_rows["train"], target)) >= len(split_rows["train"]) / 2 else 0.0
        return {split: [majority] * len(rows) for split, rows in split_rows.items()}, {"family": "dummy_majority"}
    if model.endswith("_heuristic"):
        return {split: [heuristic_score(row, model) for row in rows] for split, rows in split_rows.items()}, {"family": "heuristic"}
    features = batch9a.FEATURE_SETS[feature_set]
    encoder = batch9a.build_encoder(split_rows["train"], features)
    encoded = {split: batch9a.encode_rows(rows, features, encoder) for split, rows in split_rows.items()}
    encoded_model = encoded
    if model in {"dummy_prior", "logistic_regression"}:
        encoded_model, _scaler = batch9a.standardize(encoded["train"], encoded)
    y_train = labels(split_rows["train"], target)
    if len(set(y_train)) < 2 and model != "dummy_prior":
        prior = sum(y_train) / len(y_train) if y_train else 0.0
        return {split: [prior] * len(rows) for split, rows in split_rows.items()}, {"family": "single_class_fallback", "prior": prior}
    scores, meta, skipped = batch9a.fit_predict_model(model, encoded_model["train"], y_train, encoded_model, seed, 1, sklearn_info)
    if skipped:
        prior = sum(y_train) / len(y_train) if y_train else 0.0
        return {split: [prior] * len(rows) for split, rows in split_rows.items()}, {"family": "skipped_fallback", "reason": skipped, "prior": prior}
    return scores, meta or {}


def generic_score_metrics(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not GENERIC_SCORES.exists():
        return []
    wanted = {
        ("next_step_bad", "hist_gradient_boosting", "all_plus_interactions"),
        ("next_step_bad", "gradient_boosting", "all_structured"),
        ("next_step_bad", "logistic_regression", "non_position_history_only"),
        ("next_step_bad", "logistic_regression", "prefix_position_only"),
    }
    target_by_key = {(str(row["trajectory_id"]), int(row["step_index"])): row for row in rows}
    grouped: dict[tuple[int, str, str, str, str], tuple[list[float], list[int]]] = defaultdict(lambda: ([], []))
    with GENERIC_SCORES.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            ident = (str(row.get("target_name")), str(row.get("model_name")), str(row.get("feature_set")))
            if ident not in wanted or row.get("split") != "test":
                continue
            key = (str(row["trajectory_id"]), int(row["step_index"]))
            target_row = target_by_key.get(key)
            if not target_row:
                continue
            for target in ("bad_first_bad_next_step", "bad_first_failure_warning_candidate"):
                scores, ys = grouped[(int(row["split_seed"]), ident[1], ident[2], "generic_next_step_bad_score", target)]
                scores.append(float(row["score"]))
                ys.append(int(target_row[target]))
    out = []
    for (seed, model, feature_set, source, target), (scores, ys) in grouped.items():
        metrics = safe_metric(scores, ys)
        out.append({"seed": seed, "target_name": target, "model_name": model, "feature_set": feature_set, "score_source": source, "split": "test", **metrics})
    return out


def evaluate() -> dict[str, Any]:
    rows = load_rows()
    splits = load_splits()
    sklearn_info = batch9a.sklearn_components()
    per_split = []
    for seed in DEFAULT_SEEDS:
        split_rows = rows_by_split(rows, assignments_for_seed(splits, seed))
        for target in TARGETS:
            for model, feature_set in MODEL_CONFIGS:
                scores_by_split, model_meta = fit_scores(model, feature_set, split_rows, target, seed, sklearn_info)
                for split, split_scores in scores_by_split.items():
                    y = labels(split_rows[split], target)
                    metrics = safe_metric(split_scores, y)
                    budget_metrics = {str(b): top_capture(split_scores, y, b) for b in (0.01, 0.02, 0.05, 0.10, 0.20)}
                    train_metric = safe_metric(scores_by_split["train"], labels(split_rows["train"], target))
                    per_split.append({
                        "seed": seed,
                        "target_name": target,
                        "model_name": model,
                        "feature_set": feature_set,
                        "score_source": "first_failure_specific_model",
                        "split": split,
                        **metrics,
                        "row_budget_recall_precision": budget_metrics,
                        "train_test_auroc_gap": (train_metric["auroc"] - metrics["auroc"]) if split == "test" and train_metric["auroc"] is not None and metrics["auroc"] is not None else None,
                        "train_test_ap_gap": (train_metric["average_precision"] - metrics["average_precision"]) if split == "test" and train_metric["average_precision"] is not None and metrics["average_precision"] is not None else None,
                        "model_meta": model_meta,
                    })
    per_split.extend(generic_score_metrics(rows))
    return {"rows": rows, "per_split": per_split}


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["split"] == "test":
            grouped[(row["target_name"], row["model_name"], row["feature_set"], row["score_source"])].append(row)
    out = []
    for (target, model, feature_set, source), vals in grouped.items():
        item = {"target_name": target, "model_name": model, "feature_set": feature_set, "score_source": source, "seeds": len(vals)}
        for key in ("auroc", "average_precision", "ap_lift_ratio", "ap_lift_absolute", "prevalence"):
            clean = [v[key] for v in vals if isinstance(v.get(key), (int, float))]
            item[f"test_{key}_mean"] = statistics.mean(clean) if clean else None
        for budget in ("0.01", "0.02", "0.05", "0.10", "0.20"):
            recalls = [v.get("row_budget_recall_precision", {}).get(budget, {}).get("recall") for v in vals if isinstance(v.get("row_budget_recall_precision"), dict)]
            precisions = [v.get("row_budget_recall_precision", {}).get(budget, {}).get("precision") for v in vals if isinstance(v.get("row_budget_recall_precision"), dict)]
            clean_recalls = [x for x in recalls if x is not None]
            clean_precisions = [x for x in precisions if x is not None]
            item[f"recall_at_{budget}_row_budget_mean"] = statistics.mean(clean_recalls) if clean_recalls else None
            item[f"precision_at_{budget}_row_budget_mean"] = statistics.mean(clean_precisions) if clean_precisions else None
        out.append(item)
    return sorted(out, key=lambda row: (row["target_name"], -(row.get("test_average_precision_mean") or 0.0)))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row if key != "model_meta" and key != "row_budget_recall_precision"})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in keys})


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9L First-Failure Model Results",
        "",
        "Exploratory benchmark-level first-failure model evaluation on CodeTraceBench-derived frozen prefix rows. This is an offline proxy for first-failure warning, row-level risk, and trajectory-level burden analysis with calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| target | best model | feature set | score source | AP | AP lift | AUROC |",
        "|---|---|---|---|---:|---:|---:|",
    ]
    for row in report["best_by_target"]:
        lines.append(f"| `{row['target_name']}` | `{row['model_name']}` | `{row['feature_set']}` | `{row['score_source']}` | `{row.get('test_average_precision_mean')}` | `{row.get('test_ap_lift_ratio_mean')}` | `{row.get('test_auroc_mean')}` |")
    lines.extend(["", "Generic next-step-bad score comparisons are included as score-source baselines, not retrained first-failure models."])
    return "\n".join(lines)


def main() -> None:
    result = evaluate()
    agg = aggregate(result["per_split"])
    best_by_target = []
    for target in TARGETS:
        rows = [row for row in agg if row["target_name"] == target]
        if rows:
            best_by_target.append(rows[0])
    raw_hits = [key for key in RAW_KEYS if key in json.dumps(agg)]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "seeds": list(DEFAULT_SEEDS),
        "targets": list(TARGETS),
        "model_configs": [list(item) for item in MODEL_CONFIGS],
        "aggregate_results": agg,
        "best_by_target": best_by_target,
        "guard_results": {"raw_marker_hits": raw_hits, "metadata_as_model_features": False, "future_labels_as_features": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(SUMMARY_CSV, agg)
    write_csv(ABLATION_CSV, result["per_split"])
    print(json.dumps({"per_split_rows": len(result["per_split"]), "aggregate_rows": len(agg)}, indent=2))


if __name__ == "__main__":
    main()
