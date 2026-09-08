#!/usr/bin/env python3
"""Batch 9A stronger non-raw models and feature ablations."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import platform
import statistics
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
FEATURE_SCHEMA = REPORTS_DIR / "verified_prefix_feature_schema.json"
SCHEMA_LOCK = WORKSPACE / "SCHEMA_LOCK.md"
SCORES_PATH = MODEL_OUTPUT_DIR / "batch_9a_stronger_model_scores.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9a_stronger_models_ablations.json"
REPORT_MD = REPORTS_DIR / "batch_9a_stronger_models_ablations.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9a_report_candidate_tables.md"

SEED_DEFAULTS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
TARGET = "next_step_bad"
RAW_TEXT_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
PROHIBITED_FEATURES = {
    "trajectory_id",
    "artifact_id",
    "artifact_path",
    "next_step_bad",
    "next_step_incorrect",
    "next_step_unuseful",
    "current_step_bad",
    "current_step_incorrect",
    "current_step_unuseful",
    "trajectory_has_any_bad_step",
    "layout_family",
    "parser_adapter",
    "action_text_hash",
    "observation_text_hash",
}

ALLOWED_FEATURES = (
    "action_length_chars",
    "current_stage_index",
    "current_stage_step_count_so_far",
    "observation_length_chars",
    "prefix_length",
    "recent_error_keyword_count",
    "recent_exception_keyword_count",
    "recent_failure_keyword_count",
    "recent_test_keyword_count",
    "recent_timeout_keyword_count",
    "repeated_action_indicator",
    "repeated_observation_indicator",
    "total_stage_transitions_so_far",
    "action_kind_guess",
    "observation_kind_guess",
)
CATEGORICAL_FEATURES = {"action_kind_guess", "observation_kind_guess"}
INTERACTIONS = {
    "prefix_x_error": ("prefix_length", "recent_error_keyword_count"),
    "prefix_x_failure": ("prefix_length", "recent_failure_keyword_count"),
    "prefix_x_timeout": ("prefix_length", "recent_timeout_keyword_count"),
    "repeated_action_x_error": ("repeated_action_indicator", "recent_error_keyword_count"),
    "repeated_observation_x_failure": ("repeated_observation_indicator", "recent_failure_keyword_count"),
    "stage_index_x_error": ("current_stage_index", "recent_error_keyword_count"),
    "stage_index_x_observation_length": ("current_stage_index", "observation_length_chars"),
}

FEATURE_SETS = {
    "prefix_position_only": ("prefix_length", "current_stage_index", "current_stage_step_count_so_far", "total_stage_transitions_so_far"),
    "length_only": ("prefix_length", "action_length_chars", "observation_length_chars"),
    "stage_dynamics_only": ("current_stage_index", "current_stage_step_count_so_far", "total_stage_transitions_so_far"),
    "action_kind_only": ("action_kind_guess", "action_length_chars"),
    "observation_kind_only": ("observation_kind_guess", "observation_length_chars"),
    "history_error_counters_only": ("recent_error_keyword_count", "recent_exception_keyword_count", "recent_failure_keyword_count", "recent_test_keyword_count", "recent_timeout_keyword_count"),
    "repetition_only": ("repeated_action_indicator", "repeated_observation_indicator"),
    "non_position_history_only": ("recent_error_keyword_count", "recent_exception_keyword_count", "recent_failure_keyword_count", "recent_test_keyword_count", "recent_timeout_keyword_count", "repeated_action_indicator", "repeated_observation_indicator", "action_kind_guess", "observation_kind_guess"),
    "all_structured": ALLOWED_FEATURES,
    "all_minus_prefix_position": tuple(feature for feature in ALLOWED_FEATURES if feature not in {"prefix_length", "current_stage_index", "current_stage_step_count_so_far", "total_stage_transitions_so_far"}),
    "all_plus_interactions": ALLOWED_FEATURES + tuple(INTERACTIONS),
}

STRICT_ALPHAS = (0.02, 0.03, 0.04, 0.05)
BUDGETS = (0.05, 0.10, 0.20)
OVERFIT_AUROC_GAP = 0.10
OVERFIT_AP_GAP = 0.10
REUSABLE_SCORE_CONFIGS = {
    ("logistic_regression", "all_structured"),
    ("logistic_regression", "all_minus_prefix_position"),
    ("logistic_regression", "non_position_history_only"),
    ("logistic_regression", "all_plus_interactions"),
    ("class_weighted_logistic_regression", "all_structured"),
    ("hist_gradient_boosting", "all_structured"),
    ("hist_gradient_boosting", "all_minus_prefix_position"),
    ("hist_gradient_boosting", "non_position_history_only"),
    ("hist_gradient_boosting", "all_plus_interactions"),
    ("gradient_boosting", "all_structured"),
    ("random_forest", "all_structured"),
    ("extra_trees", "all_structured"),
    ("long_prefix_heuristic", "prefix_position_only"),
}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


model_features = load_script("model_features")
baseline_metrics = load_script("baseline_metrics")
risk_metrics = load_script("risk_control_metrics")
risk_utils = load_script("risk_diagnostic_utils")
heuristics = load_script("run_heuristic_baselines")
lightweight = load_script("run_lightweight_baselines")
repeated_utils = load_script("repeated_split_utils")


def parse_csv(value: str | None, defaults: tuple[str, ...] | tuple[int, ...]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9A stronger models and feature ablations.")
    parser.add_argument("--models", help="Comma-separated model names to run.")
    parser.add_argument("--feature-sets", help="Comma-separated feature-set names to run.")
    parser.add_argument("--seeds", help="Comma-separated repeated split seeds to run.")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--quick-check", action="store_true", help="Run a one-seed smoke test with a small model/feature subset.")
    return parser.parse_args()


def require_inputs() -> None:
    missing = [path for path in (FEATURE_SCHEMA, SCHEMA_LOCK, REPEATED_SPLITS) if not path.exists()]
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        missing.append(PREFIX_PATH)
    if missing:
        raise SystemExit("ERROR: missing required frozen v0.4 inputs: " + ", ".join(str(path) for path in missing))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def sklearn_components() -> dict[str, Any]:
    components: dict[str, Any] = {"available": False, "version": None, "models": {}, "skipped": {}}
    try:
        import sklearn
        from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, HistGradientBoostingClassifier, RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
    except Exception as exc:
        components["skipped"]["sklearn"] = repr(exc)
        return components
    components.update({"available": True, "version": sklearn.__version__})
    components["models"] = {
        "sklearn_logistic_regression": LogisticRegression,
        "sklearn_class_weighted_logistic_regression": LogisticRegression,
        "hist_gradient_boosting": HistGradientBoostingClassifier,
        "gradient_boosting": GradientBoostingClassifier,
        "random_forest": RandomForestClassifier,
        "extra_trees": ExtraTreesClassifier,
    }
    return components


def optional_boosters() -> dict[str, Any]:
    skipped = {}
    models = {}
    try:
        from xgboost import XGBClassifier
        models["xgboost"] = XGBClassifier
    except Exception as exc:
        skipped["xgboost"] = repr(exc)
    try:
        from lightgbm import LGBMClassifier
        models["lightgbm"] = LGBMClassifier
    except Exception as exc:
        skipped["lightgbm"] = repr(exc)
    return {"models": models, "skipped": skipped}


def validate_feature_sets(feature_sets: dict[str, tuple[str, ...]] = FEATURE_SETS) -> dict[str, Any]:
    errors = []
    for name, features in feature_sets.items():
        if not features:
            errors.append(f"{name}: empty feature set")
        for feature in features:
            if feature in INTERACTIONS:
                continue
            if feature not in ALLOWED_FEATURES:
                errors.append(f"{name}: {feature} is not an allowed feature")
            if feature in PROHIBITED_FEATURES or "target" in feature or "label" in feature:
                errors.append(f"{name}: {feature} is prohibited")
    return {"ok": not errors, "errors": errors}


def trajectory_assignments(splits: dict[str, Any], seed: int) -> dict[str, str]:
    for item in splits["splits"]:
        if int(item["seed"]) == int(seed):
            return item["assignments"]
    raise KeyError(f"seed {seed} not found in repeated splits")


def rows_by_split(rows: list[dict[str, Any]], assignments: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    return repeated_utils.rows_by_split(rows, assignments)


def train_categories(rows: list[dict[str, Any]], features: tuple[str, ...]) -> dict[str, list[str]]:
    categories = {}
    for feature in features:
        if feature in CATEGORICAL_FEATURES:
            values = [str(row.get(feature)) if row.get(feature) is not None else "<MISSING>" for row in rows]
            categories[feature] = sorted(set(values))
    return categories


def train_numeric_impute(rows: list[dict[str, Any]], features: tuple[str, ...]) -> dict[str, float]:
    impute = {}
    base_features = [feature for feature in features if feature not in CATEGORICAL_FEATURES and feature not in INTERACTIONS]
    for feature in base_features:
        values = [float(row.get(feature)) for row in rows if isinstance(row.get(feature), (int, float, bool))]
        impute[feature] = statistics.median(values) if values else 0.0
    for interaction, (left, right) in INTERACTIONS.items():
        if interaction in features:
            for feature in (left, right):
                if feature not in impute:
                    values = [float(row.get(feature)) for row in rows if isinstance(row.get(feature), (int, float, bool))]
                    impute[feature] = statistics.median(values) if values else 0.0
    return impute


def numeric_value(row: dict[str, Any], feature: str, impute: dict[str, float]) -> float:
    raw = row.get(feature)
    return float(raw) if isinstance(raw, (int, float, bool)) else float(impute.get(feature, 0.0))


def encode_rows(rows: list[dict[str, Any]], features: tuple[str, ...], encoder: dict[str, Any]) -> list[list[float]]:
    encoded = []
    impute = encoder["numeric_impute"]
    categories = encoder["categories"]
    for row in rows:
        values: list[float] = []
        for feature in features:
            if feature in CATEGORICAL_FEATURES:
                raw = str(row.get(feature)) if row.get(feature) is not None else "<MISSING>"
                known = set(categories[feature])
                value = raw if raw in known else "<UNK>"
                values.extend(1.0 if value == category else 0.0 for category in categories[feature])
                values.append(1.0 if value == "<UNK>" else 0.0)
            elif feature in INTERACTIONS:
                left, right = INTERACTIONS[feature]
                values.append(numeric_value(row, left, impute) * numeric_value(row, right, impute))
            else:
                values.append(numeric_value(row, feature, impute))
        encoded.append(values)
    return encoded


def build_encoder(train_rows: list[dict[str, Any]], features: tuple[str, ...]) -> dict[str, Any]:
    categories = train_categories(train_rows, features)
    encoded_names = []
    for feature in features:
        if feature in CATEGORICAL_FEATURES:
            encoded_names.extend(f"{feature}={category}" for category in categories[feature])
            encoded_names.append(f"{feature}=<UNK>")
        else:
            encoded_names.append(feature)
    return {"categories": categories, "numeric_impute": train_numeric_impute(train_rows, features), "encoded_feature_names": encoded_names, "fit_split": "train"}


def standardize(train_x: list[list[float]], data: dict[str, list[list[float]]]) -> tuple[dict[str, list[list[float]]], dict[str, Any]]:
    means, stds = lightweight.standardizer(train_x)
    return {split: lightweight.transform(x, means, stds) for split, x in data.items()}, {"means": means, "stds": stds, "fit_split": "train"}


def labels(rows: list[dict[str, Any]]) -> list[int]:
    return [int(row[TARGET]) for row in rows]


def metric_summary(scores: list[float], y: list[int]) -> dict[str, Any]:
    return {
        "rows": len(y),
        "positives": sum(y),
        "base_risk": sum(y) / len(y) if y else 0.0,
        "auroc": baseline_metrics.auroc(scores, y),
        "average_precision": baseline_metrics.average_precision(scores, y),
        "brier_score": baseline_metrics.brier_score(scores, y),
    }


def decile_metrics(scores: list[float], y: list[int]) -> dict[str, Any]:
    if not scores or len(set(scores)) < 2:
        return {"top_decile_bad_rate": None, "bottom_decile_bad_rate": None, "top_bottom_decile_ratio": None, "top_10pct_bad_step_capture": 0.0, "top_20pct_bad_step_capture": 0.0}
    pairs = sorted(zip(scores, y), key=lambda item: item[0], reverse=True)
    total_pos = sum(y)
    n10 = max(1, math.ceil(len(pairs) * 0.10))
    n20 = max(1, math.ceil(len(pairs) * 0.20))
    top = pairs[:n10]
    bottom = pairs[-n10:]
    top_rate = sum(label for _score, label in top) / len(top)
    bottom_rate = sum(label for _score, label in bottom) / len(bottom)
    return {
        "top_decile_bad_rate": top_rate,
        "bottom_decile_bad_rate": bottom_rate,
        "top_bottom_decile_ratio": (top_rate / bottom_rate) if bottom_rate else None,
        "top_10pct_bad_step_capture": sum(label for _score, label in top) / total_pos if total_pos else 0.0,
        "top_20pct_bad_step_capture": sum(label for _score, label in pairs[:n20]) / total_pos if total_pos else 0.0,
    }


def threshold_for_budget(scores: list[float], budget: float) -> float:
    return risk_utils.threshold_for_deferral_budget(scores, budget)


def evaluate_threshold(scores: list[float], y: list[int], tau: float, alpha: float = 0.0) -> dict[str, Any]:
    metrics = risk_metrics.decision_metrics(scores, y, tau, alpha)
    metrics["fraction_of_bad_steps_deferred"] = metrics["true_deferral_rate"]
    return metrics


def strict_threshold(cal_scores: list[float], cal_y: list[int], alpha: float) -> dict[str, Any]:
    selected = repeated_utils.select_threshold_fast(cal_scores, cal_y, alpha, conservative=False)
    if selected.get("allowed_count", 0) == 0:
        selected["no_nontrivial_feasible_threshold"] = True
    return selected


def fit_predict_model(model_name: str, train_x: list[list[float]], train_y: list[int], x_by_split: dict[str, list[list[float]]], seed: int, n_jobs: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, list[float]], dict[str, Any] | None, str | None]:
    start = time.perf_counter()
    if model_name == "dummy_prior":
        prior = sum(train_y) / len(train_y) if train_y else 0.0
        return {split: [prior] * len(x) for split, x in x_by_split.items()}, {"family": "dummy", "hyperparameters": {"prior": prior}}, None
    if model_name in {"logistic_regression", "class_weighted_logistic_regression"} and sklearn_info["available"]:
        LogisticRegression = sklearn_info["models"]["sklearn_logistic_regression"]
        class_weight = "balanced" if model_name == "class_weighted_logistic_regression" else None
        clf = LogisticRegression(max_iter=250, solver="lbfgs", class_weight=class_weight, random_state=seed)
        clf.fit(train_x, train_y)
        scores = {split: [float(value) for value in clf.predict_proba(x)[:, 1]] for split, x in x_by_split.items()}
        return scores, {"family": "sklearn_logistic", "hyperparameters": clf.get_params(), "fit_seconds": time.perf_counter() - start}, None
    if model_name == "logistic_regression":
        weights = lightweight.fit_logistic(train_x, train_y, class_weighted=False, seed=seed, epochs=6)
        return {split: lightweight.predict_logistic(weights, x) for split, x in x_by_split.items()}, {"family": "pure_python_logistic_fallback", "hyperparameters": {"epochs": 6, "class_weighted": False}}, None
    if model_name == "class_weighted_logistic_regression":
        weights = lightweight.fit_logistic(train_x, train_y, class_weighted=True, seed=seed, epochs=6)
        return {split: lightweight.predict_logistic(weights, x) for split, x in x_by_split.items()}, {"family": "pure_python_logistic_fallback", "hyperparameters": {"epochs": 6, "class_weighted": True}}, None
    if not sklearn_info["available"]:
        return {}, None, "sklearn unavailable"
    models = sklearn_info["models"]
    try:
        if model_name == "hist_gradient_boosting":
            clf = models[model_name](max_iter=60, max_leaf_nodes=15, learning_rate=0.06, l2_regularization=0.01, random_state=seed)
        elif model_name == "gradient_boosting":
            clf = models[model_name](n_estimators=60, max_depth=2, learning_rate=0.06, random_state=seed)
        elif model_name == "random_forest":
            clf = models[model_name](n_estimators=60, max_depth=8, min_samples_leaf=10, class_weight="balanced_subsample", random_state=seed, n_jobs=n_jobs)
        elif model_name == "extra_trees":
            clf = models[model_name](n_estimators=60, max_depth=8, min_samples_leaf=10, class_weight="balanced", random_state=seed, n_jobs=n_jobs)
        else:
            return {}, None, "unknown model"
        clf.fit(train_x, train_y)
        scores = {split: [float(value) for value in clf.predict_proba(x)[:, 1]] for split, x in x_by_split.items()}
        return scores, {"family": "sklearn", "hyperparameters": clf.get_params(), "fit_seconds": time.perf_counter() - start}, None
    except Exception as exc:
        return {}, None, repr(exc)


def heuristic_scores(model_name: str, train_rows: list[dict[str, Any]], split_rows: dict[str, list[dict[str, Any]]]) -> tuple[dict[str, list[float]], dict[str, Any] | None]:
    funcs = heuristics.heuristic_functions(train_rows)
    if model_name == "long_prefix_heuristic":
        fn = funcs["long_prefix_heuristic"][0]
    else:
        return {}, None
    return {split: [float(fn(row)) for row in rows] for split, rows in split_rows.items()}, {"family": "heuristic", "hyperparameters": {"train_quantiles_only": True}}


def split_leakage(assignments: dict[str, str]) -> bool:
    sets = {split: {tid for tid, value in assignments.items() if value == split} for split in ("train", "calibration", "test")}
    return bool(sets["train"] & sets["calibration"] or sets["train"] & sets["test"] or sets["calibration"] & sets["test"])


def overfit_flags(train_metrics: dict[str, Any], test_metrics: dict[str, Any]) -> dict[str, Any]:
    auroc_gap = (train_metrics["auroc"] - test_metrics["auroc"]) if train_metrics["auroc"] is not None and test_metrics["auroc"] is not None else None
    ap_gap = (train_metrics["average_precision"] - test_metrics["average_precision"]) if train_metrics["average_precision"] is not None and test_metrics["average_precision"] is not None else None
    return {
        "train_test_auroc_gap": auroc_gap,
        "train_test_ap_gap": ap_gap,
        "overfit_flag": bool((auroc_gap is not None and auroc_gap > OVERFIT_AUROC_GAP) or (ap_gap is not None and ap_gap > OVERFIT_AP_GAP)),
        "thresholds": {"auroc_gap": OVERFIT_AUROC_GAP, "ap_gap": OVERFIT_AP_GAP},
    }


def score_output_record(seed: int, split: str, row: dict[str, Any], model_name: str, feature_set: str, score: float) -> dict[str, Any]:
    return {
        "split_seed": seed,
        "split": split,
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "target": int(row[TARGET]),
        "next_step_bad": int(row[TARGET]),
        "model_name": model_name,
        "feature_set": feature_set,
        "score": float(score),
    }


def aggregate(values: list[float]) -> dict[str, Any]:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "median": None, "min": None, "max": None}
    return {"count": len(clean), "mean": sum(clean) / len(clean), "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0, "median": statistics.median(clean), "min": min(clean), "max": max(clean)}


def aggregate_metrics(per_split: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in per_split:
        key = f"{row['model_name']}::{row['feature_set']}"
        for split in ("train", "calibration", "test"):
            for metric in ("auroc", "average_precision", "base_risk"):
                value = row["ranking_metrics"][split].get(metric)
                if value is not None:
                    grouped[key][f"{split}_{metric}"].append(value)
        for metric in ("top_decile_bad_rate", "bottom_decile_bad_rate", "top_10pct_bad_step_capture", "top_20pct_bad_step_capture"):
            value = row["risk_concentration"].get(metric)
            if value is not None:
                grouped[key][metric].append(value)
        for metric in ("train_test_auroc_gap", "train_test_ap_gap"):
            value = row["overfitting"].get(metric)
            if value is not None:
                grouped[key][metric].append(value)
        grouped[key]["overfit_flag_rate"].append(1.0 if row["overfitting"]["overfit_flag"] else 0.0)
    return {key: {metric: aggregate(values) for metric, values in metrics.items()} for key, metrics in sorted(grouped.items())}


def paired_deltas(per_split: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_seed_key = {(row["seed"], row["model_name"], row["feature_set"]): row for row in per_split}
    configs = sorted({(row["model_name"], row["feature_set"]) for row in per_split})
    baselines = [
        ("logistic_regression", "all_structured", "vs_logistic_regression_all_structured"),
        ("long_prefix_heuristic", "prefix_position_only", "vs_long_prefix_heuristic"),
    ]
    summaries = []
    for model_name, feature_set in configs:
        for base_model, base_set, label in baselines:
            deltas: dict[str, list[float]] = defaultdict(list)
            improved = tied = worse = compared = 0
            for seed in sorted({row["seed"] for row in per_split}):
                row = by_seed_key.get((seed, model_name, feature_set))
                base = by_seed_key.get((seed, base_model, base_set))
                if not row or not base:
                    continue
                compared += 1
                for metric in ("auroc", "average_precision"):
                    rv = row["ranking_metrics"]["test"].get(metric)
                    bv = base["ranking_metrics"]["test"].get(metric)
                    if rv is not None and bv is not None:
                        deltas[f"delta_test_{metric}"].append(rv - bv)
                for metric in ("top_10pct_bad_step_capture", "top_20pct_bad_step_capture"):
                    rv = row["risk_concentration"].get(metric)
                    bv = base["risk_concentration"].get(metric)
                    if rv is not None and bv is not None:
                        deltas[f"delta_{metric}"].append(rv - bv)
                rv = row["ranking_metrics"]["test"].get("average_precision")
                bv = base["ranking_metrics"]["test"].get("average_precision")
                if rv is None or bv is None:
                    continue
                if abs(rv - bv) < 1e-12:
                    tied += 1
                elif rv > bv:
                    improved += 1
                else:
                    worse += 1
            if compared:
                summaries.append({"model_name": model_name, "feature_set": feature_set, "comparison": label, "compared_seeds": compared, "improved": improved, "tied": tied, "worse": worse, "deltas": {metric: aggregate(values) for metric, values in deltas.items()}})
    return summaries


def evaluate_config(seed: int, model_name: str, feature_set: str, features: tuple[str, ...], rows_by_split_: dict[str, list[dict[str, Any]]], n_jobs: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, Any]], dict[str, Any] | None]:
    start = time.perf_counter()
    train_rows = rows_by_split_["train"]
    encoder = build_encoder(train_rows, features)
    encoded = {split: encode_rows(rows, features, encoder) for split, rows in rows_by_split_.items()}
    encoded_for_model = encoded
    preprocessing = {"encoder_fit_split": "train", "scaling": None}
    if model_name in {"logistic_regression", "class_weighted_logistic_regression", "dummy_prior"}:
        encoded_for_model, scaler = standardize(encoded["train"], encoded)
        preprocessing["scaling"] = scaler
    if model_name == "long_prefix_heuristic":
        scores_by_split, model_meta = heuristic_scores(model_name, train_rows, rows_by_split_)
        feature_count = 1
    else:
        scores_by_split, model_meta, skipped = fit_predict_model(model_name, encoded_for_model["train"], labels(train_rows), encoded_for_model, seed, n_jobs, sklearn_info)
        if skipped:
            return None, [], {"model_name": model_name, "feature_set": feature_set, "seed": seed, "reason": skipped}
        feature_count = len(encoder["encoded_feature_names"])
    ranking = {}
    for split, scores in scores_by_split.items():
        ranking[split] = metric_summary(scores, labels(rows_by_split_[split]))
    risk_concentration = decile_metrics(scores_by_split["test"], labels(rows_by_split_["test"]))
    fixed_budget = {}
    cal_scores = scores_by_split["calibration"]
    cal_y = labels(rows_by_split_["calibration"])
    test_y = labels(rows_by_split_["test"])
    for budget in BUDGETS:
        tau = threshold_for_budget(cal_scores, budget)
        cal_metrics = evaluate_threshold(cal_scores, cal_y, tau)
        test_metrics = evaluate_threshold(scores_by_split["test"], test_y, tau)
        fixed_budget[str(budget)] = {"tau": tau, "calibration": cal_metrics, "test": test_metrics}
    strict_alpha = {}
    for alpha in STRICT_ALPHAS:
        selected = strict_threshold(cal_scores, cal_y, alpha)
        tau = float(selected["tau"])
        strict_alpha[str(alpha)] = {"selection": selected, "calibration": evaluate_threshold(cal_scores, cal_y, tau, alpha), "test": evaluate_threshold(scores_by_split["test"], test_y, tau, alpha)}
    overfit = overfit_flags(ranking["train"], ranking["test"])
    score_records = []
    for split, scores in scores_by_split.items():
        score_records.extend(score_output_record(seed, split, row, model_name, feature_set, score) for row, score in zip(rows_by_split_[split], scores))
    row = {
        "seed": seed,
        "model_name": model_name,
        "feature_set": feature_set,
        "encoded_feature_count": feature_count,
        "model_metadata": model_meta,
        "preprocessing": preprocessing,
        "fit_predict_seconds": time.perf_counter() - start,
        "ranking_metrics": ranking,
        "overfitting": overfit,
        "risk_concentration": risk_concentration,
        "fixed_budget": fixed_budget,
        "strict_alpha": strict_alpha,
    }
    return row, score_records, None


def selected_options(args: argparse.Namespace) -> tuple[list[str], list[str], list[int]]:
    if args.quick_check:
        return ["logistic_regression", "hist_gradient_boosting", "long_prefix_heuristic"], ["prefix_position_only", "non_position_history_only", "all_structured"], [SEED_DEFAULTS[0]]
    default_models = ("dummy_prior", "logistic_regression", "class_weighted_logistic_regression", "hist_gradient_boosting", "gradient_boosting", "random_forest", "extra_trees", "long_prefix_heuristic")
    models = parse_csv(args.models, default_models)
    feature_sets = parse_csv(args.feature_sets, tuple(FEATURE_SETS))
    seeds = [int(seed) for seed in parse_csv(args.seeds, SEED_DEFAULTS)]
    return models, feature_sets, seeds


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_inputs()
    validation = validate_feature_sets()
    if not validation["ok"]:
        raise SystemExit("ERROR: invalid feature sets: " + json.dumps(validation, indent=2))
    rows = model_features.load_rows(PREFIX_PATH, SHARD_DIR)
    splits = load_json(REPEATED_SPLITS)
    sklearn_info = sklearn_components()
    optional_info = optional_boosters()
    models, feature_sets, seeds = selected_options(args)
    per_split_metrics = []
    skipped = []
    all_score_records = []
    guards = {"raw_text_feature_keys": [], "prohibited_feature_hits": [], "trajectory_leakage": [], "score_raw_text_hits": 0, "encoder_fit_split_train_only": True}
    total_configs = len(seeds) * len(models) * len(feature_sets)
    completed_configs = 0
    for feature_set in feature_sets:
        if feature_set not in FEATURE_SETS:
            raise SystemExit(f"ERROR: unknown feature set {feature_set}")
    for seed in seeds:
        assignments = trajectory_assignments(splits, seed)
        if split_leakage(assignments):
            guards["trajectory_leakage"].append(seed)
        split_rows = rows_by_split(rows, assignments)
        for model_name in models:
            for feature_set in feature_sets:
                completed_configs += 1
                if completed_configs == 1 or completed_configs % 25 == 0:
                    print(json.dumps({"progress": completed_configs, "total": total_configs, "seed": seed, "model": model_name, "feature_set": feature_set}), flush=True)
                features = FEATURE_SETS[feature_set]
                prohibited = [feature for feature in features if feature in PROHIBITED_FEATURES or feature in RAW_TEXT_KEYS or "target" in feature or "label" in feature]
                if prohibited:
                    guards["prohibited_feature_hits"].append({"model": model_name, "feature_set": feature_set, "features": prohibited})
                    continue
                row, scores, skip = evaluate_config(seed, model_name, feature_set, features, split_rows, args.n_jobs, sklearn_info)
                if skip:
                    skipped.append(skip)
                    continue
                assert row is not None
                per_split_metrics.append(row)
                if (model_name, feature_set) in REUSABLE_SCORE_CONFIGS:
                    all_score_records.extend(scores)
    for record in all_score_records:
        if RAW_TEXT_KEYS & set(record):
            guards["score_raw_text_hits"] += 1
    aggregates = aggregate_metrics(per_split_metrics)
    comparisons = paired_deltas(per_split_metrics)
    report = {
        "schema_version": "risk-controlled-intervention-batch-9a-stronger-models.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 9A benchmark modeling diagnostics only; not production StepHarbor validation, conformal guarantee, or final report result.",
        "dataset_paths": {"prefix": str(PREFIX_PATH.relative_to(WORKSPACE)), "repeated_splits": str(REPEATED_SPLITS.relative_to(WORKSPACE)), "schema_lock": str(SCHEMA_LOCK.relative_to(WORKSPACE))},
        "seeds": seeds,
        "models_requested": models,
        "feature_sets_requested": feature_sets,
        "model_definitions": model_definitions(sklearn_info),
        "feature_set_definitions": {name: list(features) for name, features in FEATURE_SETS.items()},
        "score_output_policy": {
            "written_configs": [f"{model}::{feature_set}" for model, feature_set in sorted(REUSABLE_SCORE_CONFIGS)],
            "reason": "Full-grid metrics are retained for all configurations; reusable row-level scores are written for top/report-relevant configurations to avoid an unnecessarily large all-configuration score file.",
        },
        "per_split_metrics": per_split_metrics,
        "aggregate_metrics": aggregates,
        "paired_comparisons": comparisons,
        "skipped_models": skipped + [{"model_name": name, "reason": reason} for name, reason in optional_info["skipped"].items()],
        "guards": guards,
        "environment": {"python": sys.version, "platform": platform.platform(), "sklearn": sklearn_info.get("version"), "optional_boosters": {"available": list(optional_info["models"]), "skipped": optional_info["skipped"]}},
        "score_output": str(SCORES_PATH.relative_to(WORKSPACE)),
    }
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with SCORES_PATH.open("w") as handle:
        for record in all_score_records:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    PAPER_TABLES_MD.write_text(report_tables(report) + "\n")
    return report


def model_definitions(sklearn_info: dict[str, Any]) -> dict[str, Any]:
    return {
        "dummy_prior": {"family": "dummy", "class_weight": False},
        "logistic_regression": {"family": "pure_python_logistic", "class_weight": False},
        "class_weighted_logistic_regression": {"family": "pure_python_logistic", "class_weight": True},
        "hist_gradient_boosting": {"family": "sklearn", "available": sklearn_info["available"], "hyperparameters": {"max_iter": 80, "max_leaf_nodes": 15}},
        "gradient_boosting": {"family": "sklearn", "available": sklearn_info["available"], "hyperparameters": {"n_estimators": 80, "max_depth": 2}},
        "random_forest": {"family": "sklearn", "available": sklearn_info["available"], "hyperparameters": {"n_estimators": 120, "max_depth": 8, "class_weight": "balanced_subsample"}},
        "extra_trees": {"family": "sklearn", "available": sklearn_info["available"], "hyperparameters": {"n_estimators": 120, "max_depth": 8, "class_weight": "balanced"}},
        "long_prefix_heuristic": {"family": "heuristic", "class_weight": False},
    }


def top_configs(report: dict[str, Any], metric: str, n: int = 10) -> list[tuple[str, dict[str, Any]]]:
    rows = [(key, value) for key, value in report["aggregate_metrics"].items() if f"test_{metric}" in value and value[f"test_{metric}"]["mean"] is not None]
    return sorted(rows, key=lambda item: item[1][f"test_{metric}"]["mean"], reverse=True)[:n]


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9A Stronger Models and Feature Ablations",
        "",
        "Preliminary benchmark diagnostics only. These are not production StepHarbor validation results and do not establish conformal or distribution-shift guarantees.",
        "",
        "## Executive Summary",
        "",
        f"- Seeds evaluated: `{len(report['seeds'])}`",
        f"- Score output: `{report['score_output']}`",
        f"- sklearn version: `{report['environment']['sklearn']}`",
        "",
        "## Model x Feature Set Aggregate AUROC/AP",
        "",
        "| config | test AUROC mean | test AP mean | top10 capture mean | overfit flag rate |",
        "|---|---:|---:|---:|---:|",
    ]
    for key, value in top_configs(report, "average_precision", 40):
        lines.append(f"| `{key}` | `{value.get('test_auroc', {}).get('mean')}` | `{value.get('test_average_precision', {}).get('mean')}` | `{value.get('top_10pct_bad_step_capture', {}).get('mean')}` | `{value.get('overfit_flag_rate', {}).get('mean')}` |")
    lines.extend(["", "## Does this reduce to prefix length?", ""])
    for key in ("logistic_regression::prefix_position_only", "logistic_regression::non_position_history_only", "logistic_regression::all_structured", "logistic_regression::all_minus_prefix_position", "logistic_regression::all_plus_interactions"):
        value = report["aggregate_metrics"].get(key, {})
        lines.append(f"- `{key}`: test AP `{value.get('test_average_precision', {}).get('mean')}`, top10 capture `{value.get('top_10pct_bad_step_capture', {}).get('mean')}`")
    lines.extend(["", "## Do stronger models generalize?", ""])
    for key, value in top_configs(report, "auroc", 10):
        lines.append(f"- `{key}`: AUROC `{value.get('test_auroc', {}).get('mean')}`, train/test AUROC gap `{value.get('train_test_auroc_gap', {}).get('mean')}`, overfit flag rate `{value.get('overfit_flag_rate', {}).get('mean')}`")
    lines.extend(["", "## Reviewer-facing interpretation", "", "Findings are preliminary Batch 9A evidence on the extraction-supported verified subset. Stronger models should be interpreted through repeated-split variance, feature ablations, and overfitting diagnostics.", "", "## Caveats", "", "- No raw semantic text, embeddings, or LLM-judge features are used.", "- The target is a benchmark proxy derived from CodeTraceBench annotations.", "- Unsupported layouts and missing artifact paths remain documented caveats.", "- This is benchmark-level evidence, not production StepHarbor validation.", "", "## Recommended next batch", "", recommendation(report)])
    return "\n".join(lines)


def report_tables(report: dict[str, Any]) -> str:
    lines = ["# Batch 9A Report Candidate Tables", "", "All tables are candidate / not final.", "", "## Best Configurations by Test AP", "", "| config | AUROC | AP | top10 capture | top20 capture |", "|---|---:|---:|---:|---:|"]
    for key, value in top_configs(report, "average_precision", 12):
        lines.append(f"| `{key}` | `{value.get('test_auroc', {}).get('mean')}` | `{value.get('test_average_precision', {}).get('mean')}` | `{value.get('top_10pct_bad_step_capture', {}).get('mean')}` | `{value.get('top_20pct_bad_step_capture', {}).get('mean')}` |")
    lines.extend(["", "## Prefix-Length / Non-Position Ablation", "", "| config | AUROC | AP |", "|---|---:|---:|"])
    for key in sorted(report["aggregate_metrics"]):
        if any(name in key for name in ("prefix_position_only", "non_position_history_only", "all_minus_prefix_position", "all_structured")):
            value = report["aggregate_metrics"][key]
            lines.append(f"| `{key}` | `{value.get('test_auroc', {}).get('mean')}` | `{value.get('test_average_precision', {}).get('mean')}` |")
    lines.extend(["", "## Paired Comparison Summary", "", "| config | comparison | delta AP mean | improved/tied/worse |", "|---|---|---:|---:|"])
    for row in report["paired_comparisons"][:80]:
        delta = row["deltas"].get("delta_test_average_precision", {}).get("mean")
        lines.append(f"| `{row['model_name']}::{row['feature_set']}` | `{row['comparison']}` | `{delta}` | `{row['improved']}/{row['tied']}/{row['worse']}` |")
    return "\n".join(lines)


def recommendation(report: dict[str, Any]) -> str:
    best = top_configs(report, "average_precision", 1)
    if not best:
        return "Batch 9B should resolve modeling blockers before report-table drafting."
    key, value = best[0]
    baseline = report["aggregate_metrics"].get("logistic_regression::all_structured", {}).get("test_average_precision", {}).get("mean")
    best_ap = value.get("test_average_precision", {}).get("mean")
    if baseline is not None and best_ap is not None and best_ap > baseline + 0.02:
        return "Batch 9B should convert the best Batch 9A configurations into report-facing robustness tables and risk-cost figures."
    return "Batch 9B should focus on report-facing ablation tables and consider whether additional non-raw process features are needed."


def main() -> int:
    args = parse_args()
    report = run(args)
    print(json.dumps({"configs": len(report["per_split_metrics"]), "score_output": report["score_output"], "skipped": len(report["skipped_models"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
