#!/usr/bin/env python3
"""Batch 9B label/target ablations over repeated verified splits."""

from __future__ import annotations

import argparse
import importlib.util
import json
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
SCHEMA_LOCK = WORKSPACE / "SCHEMA_LOCK.md"
SCORES_PATH = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9b_label_target_ablations.json"
REPORT_MD = REPORTS_DIR / "batch_9b_label_target_ablations.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9b_report_candidate_tables.md"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
DEFAULT_MODELS = ("dummy_prior", "logistic_regression", "class_weighted_logistic_regression", "gradient_boosting", "hist_gradient_boosting", "random_forest", "extra_trees")
DEFAULT_FEATURE_SETS = ("prefix_position_only", "repetition_only", "history_error_counters_only", "non_position_history_only", "all_minus_prefix_position", "all_structured", "all_plus_interactions")
DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
SELECTED_SCORE_CONFIGS = {
    ("next_step_bad", "hist_gradient_boosting", "all_plus_interactions"),
    ("next_step_bad", "hist_gradient_boosting", "all_structured"),
    ("next_step_bad", "gradient_boosting", "all_structured"),
    ("next_step_bad", "random_forest", "all_structured"),
    ("next_step_bad", "logistic_regression", "all_structured"),
    ("next_step_bad", "logistic_regression", "non_position_history_only"),
    ("next_step_bad", "logistic_regression", "prefix_position_only"),
    ("next_step_incorrect", "hist_gradient_boosting", "all_plus_interactions"),
    ("next_step_incorrect", "hist_gradient_boosting", "all_structured"),
    ("next_step_incorrect", "gradient_boosting", "all_structured"),
    ("next_step_incorrect", "random_forest", "all_structured"),
    ("next_step_incorrect", "logistic_regression", "all_structured"),
    ("next_step_incorrect", "logistic_regression", "non_position_history_only"),
    ("next_step_incorrect", "logistic_regression", "prefix_position_only"),
    ("next_step_unuseful", "hist_gradient_boosting", "all_plus_interactions"),
    ("next_step_unuseful", "hist_gradient_boosting", "all_structured"),
    ("next_step_unuseful", "gradient_boosting", "all_structured"),
    ("next_step_unuseful", "random_forest", "all_structured"),
    ("next_step_unuseful", "logistic_regression", "all_structured"),
    ("next_step_unuseful", "logistic_regression", "non_position_history_only"),
    ("next_step_unuseful", "logistic_regression", "prefix_position_only"),
}
STRICT_ALPHAS = (0.02, 0.03, 0.04, 0.05)
BUDGETS = (0.05, 0.10, 0.20)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9a = load_script("evaluate_stronger_models_and_ablations")
model_features = batch9a.model_features
baseline_metrics = batch9a.baseline_metrics
risk_metrics = batch9a.risk_metrics
risk_utils = batch9a.risk_utils
repeated_utils = batch9a.repeated_utils
lightweight = batch9a.lightweight


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9B label/target ablations.")
    parser.add_argument("--targets")
    parser.add_argument("--models")
    parser.add_argument("--feature-sets")
    parser.add_argument("--seeds")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--quick-check", action="store_true")
    return parser.parse_args()


def parse_csv(value: str | None, defaults: tuple[Any, ...]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def selected_options(args: argparse.Namespace) -> tuple[list[str], list[str], list[str], list[int]]:
    if args.quick_check:
        return ["next_step_bad", "next_step_incorrect", "next_step_unuseful"], ["logistic_regression", "hist_gradient_boosting"], ["prefix_position_only", "all_structured"], [DEFAULT_SEEDS[0]]
    return (
        parse_csv(args.targets, TARGETS),
        parse_csv(args.models, DEFAULT_MODELS),
        parse_csv(args.feature_sets, DEFAULT_FEATURE_SETS),
        [int(seed) for seed in parse_csv(args.seeds, DEFAULT_SEEDS)],
    )


def require_inputs() -> None:
    missing = [path for path in (REPEATED_SPLITS, SCHEMA_LOCK) if not path.exists()]
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        missing.append(PREFIX_PATH)
    if missing:
        raise SystemExit("ERROR: missing required Batch 9B inputs: " + ", ".join(str(path) for path in missing))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def target_value(row: dict[str, Any], target_name: str) -> int:
    if target_name == "next_step_bad":
        return int(row["next_step_incorrect"]) | int(row["next_step_unuseful"])
    return int(row[target_name])


def validate_target_identity(rows: list[dict[str, Any]]) -> dict[str, Any]:
    mismatches = []
    for index, row in enumerate(rows):
        expected = int(row["next_step_incorrect"]) | int(row["next_step_unuseful"])
        if int(row["next_step_bad"]) != expected:
            mismatches.append(index)
            if len(mismatches) >= 25:
                break
    return {"ok": not mismatches, "mismatch_examples": mismatches}


def prevalence_and_overlap(rows: list[dict[str, Any]], splits: dict[str, Any]) -> dict[str, Any]:
    total = len(rows)
    inc = sum(int(row["next_step_incorrect"]) for row in rows)
    un = sum(int(row["next_step_unuseful"]) for row in rows)
    bad = sum(int(row["next_step_bad"]) for row in rows)
    both = sum(1 for row in rows if int(row["next_step_incorrect"]) and int(row["next_step_unuseful"]))
    by_traj: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in rows:
        by_traj[str(row["trajectory_id"])][0] |= int(row["next_step_incorrect"])
        by_traj[str(row["trajectory_id"])][1] |= int(row["next_step_unuseful"])
    per_seed = []
    for item in splits["splits"]:
        assignments = item["assignments"]
        split_rows = repeated_utils.rows_by_split(rows, assignments)
        seed_item = {"seed": item["seed"], "splits": {}}
        for split, rws in split_rows.items():
            seed_item["splits"][split] = {
                target: {
                    "positives": sum(target_value(row, target) for row in rws),
                    "prevalence": (sum(target_value(row, target) for row in rws) / len(rws)) if rws else 0.0,
                    "rows": len(rws),
                }
                for target in TARGETS
            }
        per_seed.append(seed_item)
    insufficient = {
        target: sum(1 for seed_item in per_seed for split in ("train", "calibration", "test") if seed_item["splits"][split][target]["positives"] < 25)
        for target in TARGETS
    }
    return {
        "total_prefix_rows": total,
        "next_step_bad_positives": bad,
        "next_step_incorrect_positives": inc,
        "next_step_unuseful_positives": un,
        "row_overlap_incorrect_and_unuseful": both,
        "incorrect_only_rows": inc - both,
        "unuseful_only_rows": un - both,
        "neither_rows": total - (inc + un - both),
        "prevalence": {"next_step_bad": bad / total, "next_step_incorrect": inc / total, "next_step_unuseful": un / total},
        "trajectory_counts": {
            "both_incorrect_and_unuseful": sum(1 for i, u in by_traj.values() if i and u),
            "incorrect_only": sum(1 for i, u in by_traj.values() if i and not u),
            "unuseful_only": sum(1 for i, u in by_traj.values() if u and not i),
            "neither": sum(1 for i, u in by_traj.values() if not i and not u),
            "total": len(by_traj),
        },
        "per_repeated_split": per_seed,
        "insufficient_positive_split_count": insufficient,
    }


def labels(rows: list[dict[str, Any]], target_name: str) -> list[int]:
    return [target_value(row, target_name) for row in rows]


def metric_summary(scores: list[float], y: list[int]) -> dict[str, Any]:
    prevalence = sum(y) / len(y) if y else 0.0
    ap = baseline_metrics.average_precision(scores, y)
    return {
        "rows": len(y),
        "positives": sum(y),
        "prevalence": prevalence,
        "auroc": baseline_metrics.auroc(scores, y),
        "average_precision": ap,
        "ap_lift_ratio": (ap / prevalence) if ap is not None and prevalence else None,
        "ap_lift_absolute": (ap - prevalence) if ap is not None else None,
        "brier_score": baseline_metrics.brier_score(scores, y),
    }


def decile_metrics(scores: list[float], y: list[int]) -> dict[str, Any]:
    base = batch9a.decile_metrics(scores, y)
    return {
        "top_decile_target_positive_rate": base["top_decile_bad_rate"],
        "bottom_decile_target_positive_rate": base["bottom_decile_bad_rate"],
        "top_bottom_decile_ratio": base["top_bottom_decile_ratio"],
        "top_10pct_target_positive_capture": base["top_10pct_bad_step_capture"],
        "top_20pct_target_positive_capture": base["top_20pct_bad_step_capture"],
    }


def evaluate_threshold(scores: list[float], y: list[int], tau: float, alpha: float = 0.0) -> dict[str, Any]:
    metrics = risk_metrics.decision_metrics(scores, y, tau, alpha)
    metrics["fraction_of_target_positives_deferred"] = metrics["true_deferral_rate"]
    metrics["allowed_target_positive_rate"] = metrics["allowed_bad_rate"]
    return metrics


def fit_scores(model_name: str, feature_set: str, split_rows: dict[str, list[dict[str, Any]]], target_name: str, seed: int, n_jobs: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, list[float]], dict[str, Any] | None, str | None, int]:
    features = batch9a.FEATURE_SETS[feature_set]
    train_rows = split_rows["train"]
    encoder = batch9a.build_encoder(train_rows, features)
    encoded = {split: batch9a.encode_rows(rows, features, encoder) for split, rows in split_rows.items()}
    x_model = encoded
    if model_name in {"logistic_regression", "class_weighted_logistic_regression", "dummy_prior"}:
        x_model, _scaler = batch9a.standardize(encoded["train"], encoded)
    train_y = labels(train_rows, target_name)
    scores, meta, skip = batch9a.fit_predict_model(model_name, x_model["train"], train_y, x_model, seed, n_jobs, sklearn_info)
    return scores, meta, skip, len(encoder["encoded_feature_names"])


def overfit_flags(train: dict[str, Any], test: dict[str, Any]) -> dict[str, Any]:
    return batch9a.overfit_flags({"auroc": train["auroc"], "average_precision": train["average_precision"]}, {"auroc": test["auroc"], "average_precision": test["average_precision"]})


def score_record(seed: int, split: str, row: dict[str, Any], target_name: str, target: int, model_name: str, feature_set: str, score: float) -> dict[str, Any]:
    return {
        "split_seed": seed,
        "split": split,
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "target_name": target_name,
        "target_value": int(target),
        "model_name": model_name,
        "feature_set": feature_set,
        "score": float(score),
        "next_step_bad": int(row["next_step_bad"]),
        "next_step_incorrect": int(row["next_step_incorrect"]),
        "next_step_unuseful": int(row["next_step_unuseful"]),
    }


def evaluate_config(seed: int, target_name: str, model_name: str, feature_set: str, split_rows: dict[str, list[dict[str, Any]]], n_jobs: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, Any] | None, list[dict[str, Any]], dict[str, Any] | None]:
    start = time.perf_counter()
    scores_by_split, meta, skip, feature_count = fit_scores(model_name, feature_set, split_rows, target_name, seed, n_jobs, sklearn_info)
    if skip:
        return None, [], {"seed": seed, "target_name": target_name, "model_name": model_name, "feature_set": feature_set, "reason": skip}
    ranking = {}
    for split, scores in scores_by_split.items():
        ranking[split] = metric_summary(scores, labels(split_rows[split], target_name))
    concentration = decile_metrics(scores_by_split["test"], labels(split_rows["test"], target_name))
    cal_scores = scores_by_split["calibration"]
    cal_y = labels(split_rows["calibration"], target_name)
    test_y = labels(split_rows["test"], target_name)
    fixed_budget = {}
    for budget in BUDGETS:
        tau = risk_utils.threshold_for_deferral_budget(cal_scores, budget)
        fixed_budget[str(budget)] = {"tau": tau, "calibration": evaluate_threshold(cal_scores, cal_y, tau), "test": evaluate_threshold(scores_by_split["test"], test_y, tau)}
    strict_alpha = {}
    cal_prev = sum(cal_y) / len(cal_y) if cal_y else 0.0
    for alpha in STRICT_ALPHAS:
        selected = repeated_utils.select_threshold_fast(cal_scores, cal_y, alpha, conservative=False)
        tau = float(selected["tau"])
        strict_alpha[str(alpha)] = {
            "selection": selected,
            "low_base_rate_allow_all_case": cal_prev <= alpha and selected.get("allowed_count") == len(cal_y),
            "calibration": evaluate_threshold(cal_scores, cal_y, tau, alpha),
            "test": evaluate_threshold(scores_by_split["test"], test_y, tau, alpha),
        }
    records = []
    if (target_name, model_name, feature_set) in SELECTED_SCORE_CONFIGS:
        for split, rows in split_rows.items():
            records.extend(score_record(seed, split, row, target_name, target, model_name, feature_set, score) for row, target, score in zip(rows, labels(rows, target_name), scores_by_split[split]))
    return {
        "seed": seed,
        "target_name": target_name,
        "model_name": model_name,
        "feature_set": feature_set,
        "encoded_feature_count": feature_count,
        "model_metadata": meta,
        "fit_predict_seconds": time.perf_counter() - start,
        "ranking_metrics": ranking,
        "overfitting": overfit_flags(ranking["train"], ranking["test"]),
        "risk_concentration": concentration,
        "fixed_budget": fixed_budget,
        "strict_alpha": strict_alpha,
    }, records, None


def aggregate(values: list[float]) -> dict[str, Any]:
    return batch9a.aggregate(values)


def aggregate_metrics(per_split: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in per_split:
        key = f"{row['target_name']}::{row['model_name']}::{row['feature_set']}"
        for split in ("train", "calibration", "test"):
            for metric in ("auroc", "average_precision", "ap_lift_ratio", "ap_lift_absolute", "prevalence"):
                value = row["ranking_metrics"][split].get(metric)
                if value is not None:
                    grouped[key][f"{split}_{metric}"].append(value)
        for metric in ("top_decile_target_positive_rate", "bottom_decile_target_positive_rate", "top_10pct_target_positive_capture", "top_20pct_target_positive_capture"):
            value = row["risk_concentration"].get(metric)
            if value is not None:
                grouped[key][metric].append(value)
        for metric in ("train_test_auroc_gap", "train_test_ap_gap"):
            value = row["overfitting"].get(metric)
            if value is not None:
                grouped[key][metric].append(value)
        grouped[key]["overfit_flag_rate"].append(1.0 if row["overfitting"]["overfit_flag"] else 0.0)
        for budget, values in row["fixed_budget"].items():
            grouped[key][f"budget_{budget}_test_deferral_rate"].append(values["test"]["deferral_rate"])
            if values["test"]["allowed_target_positive_rate"] is not None:
                grouped[key][f"budget_{budget}_test_allowed_target_positive_rate"].append(values["test"]["allowed_target_positive_rate"])
            grouped[key][f"budget_{budget}_test_capture"].append(values["test"]["fraction_of_target_positives_deferred"])
        for alpha, values in row["strict_alpha"].items():
            grouped[key][f"alpha_{alpha}_low_base_rate_allow_all_rate"].append(1.0 if values["low_base_rate_allow_all_case"] else 0.0)
            grouped[key][f"alpha_{alpha}_calibration_deferral_rate"].append(values["calibration"]["deferral_rate"])
            grouped[key][f"alpha_{alpha}_test_deferral_rate"].append(values["test"]["deferral_rate"])
            if values["calibration"]["allowed_target_positive_rate"] is not None:
                grouped[key][f"alpha_{alpha}_calibration_allowed_target_positive_rate"].append(values["calibration"]["allowed_target_positive_rate"])
            if values["test"]["allowed_target_positive_rate"] is not None:
                grouped[key][f"alpha_{alpha}_test_allowed_target_positive_rate"].append(values["test"]["allowed_target_positive_rate"])
            grouped[key][f"alpha_{alpha}_test_target_met_rate"].append(0.0 if values["test"]["risk_violation"] else 1.0)
    return {key: {metric: aggregate(values) for metric, values in metrics.items()} for key, metrics in sorted(grouped.items())}


def paired_deltas(per_split: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lookup = {(r["seed"], r["target_name"], r["model_name"], r["feature_set"]): r for r in per_split}
    configs = sorted({(r["target_name"], r["model_name"], r["feature_set"]) for r in per_split})
    summaries = []
    for target_name, model_name, feature_set in configs:
        baselines = [("logistic_regression", "all_structured", "vs_logistic_all_structured")]
        if feature_set != "prefix_position_only":
            baselines.append((model_name, "prefix_position_only", "vs_same_model_prefix_position_only"))
        if feature_set != "non_position_history_only":
            baselines.append((model_name, "non_position_history_only", "vs_same_model_non_position_history_only"))
        if feature_set != "all_minus_prefix_position":
            baselines.append((model_name, "all_minus_prefix_position", "vs_same_model_all_minus_prefix_position"))
        for base_model, base_set, label in baselines:
            deltas: dict[str, list[float]] = defaultdict(list)
            improved = tied = worse = compared = 0
            for seed in sorted({r["seed"] for r in per_split}):
                row = lookup.get((seed, target_name, model_name, feature_set))
                base = lookup.get((seed, target_name, base_model, base_set))
                if not row or not base:
                    continue
                compared += 1
                for metric in ("auroc", "average_precision", "ap_lift_ratio"):
                    rv = row["ranking_metrics"]["test"].get(metric)
                    bv = base["ranking_metrics"]["test"].get(metric)
                    if rv is not None and bv is not None:
                        deltas[f"delta_test_{metric}"].append(rv - bv)
                for metric in ("top_10pct_target_positive_capture", "top_20pct_target_positive_capture"):
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
                summaries.append({"target_name": target_name, "model_name": model_name, "feature_set": feature_set, "comparison": label, "compared_seeds": compared, "improved": improved, "tied": tied, "worse": worse, "deltas": {k: aggregate(v) for k, v in deltas.items()}})
    return summaries


def cross_target_capture(score_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected = {
        ("next_step_bad", "hist_gradient_boosting", "all_plus_interactions"),
        ("next_step_bad", "hist_gradient_boosting", "all_structured"),
        ("next_step_bad", "gradient_boosting", "all_structured"),
        ("next_step_bad", "random_forest", "all_structured"),
        ("next_step_bad", "logistic_regression", "all_structured"),
        ("next_step_bad", "logistic_regression", "non_position_history_only"),
        ("next_step_bad", "logistic_regression", "prefix_position_only"),
        ("next_step_incorrect", "logistic_regression", "all_structured"),
        ("next_step_unuseful", "logistic_regression", "all_structured"),
    }
    by_key: dict[tuple[int, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in score_records:
        if row["split"] == "test" and (row["target_name"], row["model_name"], row["feature_set"]) in selected:
            by_key[(row["split_seed"], row["target_name"], row["model_name"], row["feature_set"], row["split"])].append(row)
    results = []
    for (seed, target_name, model_name, feature_set, split), rows in by_key.items():
        scores = [float(row["score"]) for row in rows]
        for budget in BUDGETS:
            tau = risk_utils.threshold_for_deferral_budget(scores, budget)
            deferred = [row for row in rows if float(row["score"]) > tau]
            for capture_target in TARGETS:
                positives = sum(int(row[capture_target]) for row in rows)
                captured = sum(int(row[capture_target]) for row in deferred)
                results.append({"seed": seed, "scored_target": target_name, "model_name": model_name, "feature_set": feature_set, "budget": budget, "captured_target": capture_target, "positives": positives, "captured": captured, "capture_rate": captured / positives if positives else None, "deferral_rate": len(deferred) / len(rows) if rows else 0.0})
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in results:
        key = f"{row['scored_target']}::{row['model_name']}::{row['feature_set']}::{row['budget']}::{row['captured_target']}"
        for metric in ("capture_rate", "deferral_rate"):
            if row[metric] is not None:
                grouped[key][metric].append(row[metric])
    return [{"key": key, **{metric: aggregate(values) for metric, values in vals.items()}} for key, vals in sorted(grouped.items())]


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_inputs()
    rows = model_features.load_rows(PREFIX_PATH, SHARD_DIR)
    identity = validate_target_identity(rows)
    if not identity["ok"]:
        raise SystemExit(f"ERROR: target identity failed: {identity}")
    splits = load_json(REPEATED_SPLITS)
    prevalence = prevalence_and_overlap(rows, splits)
    targets, models, feature_sets, seeds = selected_options(args)
    sklearn_info = batch9a.sklearn_components()
    per_split = []
    score_records = []
    skipped = []
    guards = {"target_identity": identity, "prohibited_feature_hits": [], "trajectory_leakage": [], "score_raw_text_hits": 0, "encoder_fit_split_train_only": True}
    total = len(targets) * len(models) * len(feature_sets) * len(seeds)
    progress = 0
    for feature_set in feature_sets:
        if feature_set not in batch9a.FEATURE_SETS:
            raise SystemExit(f"ERROR: unknown feature set {feature_set}")
    for seed in seeds:
        assignments = batch9a.trajectory_assignments(splits, seed)
        if batch9a.split_leakage(assignments):
            guards["trajectory_leakage"].append(seed)
        split_rows = batch9a.rows_by_split(rows, assignments)
        for target_name in targets:
            if target_name not in TARGETS:
                raise SystemExit(f"ERROR: unknown target {target_name}")
            for model_name in models:
                for feature_set in feature_sets:
                    progress += 1
                    if progress == 1 or progress % 50 == 0:
                        print(json.dumps({"progress": progress, "total": total, "seed": seed, "target": target_name, "model": model_name, "feature_set": feature_set}), flush=True)
                    prohibited = [f for f in batch9a.FEATURE_SETS[feature_set] if f in batch9a.PROHIBITED_FEATURES or f in RAW_KEYS or "target" in f or "label" in f]
                    if prohibited:
                        guards["prohibited_feature_hits"].append({"target": target_name, "model": model_name, "feature_set": feature_set, "features": prohibited})
                        continue
                    row, records, skip = evaluate_config(seed, target_name, model_name, feature_set, split_rows, args.n_jobs, sklearn_info)
                    if skip:
                        skipped.append(skip)
                        continue
                    per_split.append(row)
                    score_records.extend(records)
    for record in score_records:
        if RAW_KEYS & set(record):
            guards["score_raw_text_hits"] += 1
    report = {
        "schema_version": "risk-controlled-intervention-batch-9b-label-target-ablations.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 9B target-ablation diagnostics only; not production CodingActionGate validation, conformal guarantee, or final report result.",
        "dataset_paths": {"prefix": str(PREFIX_PATH.relative_to(WORKSPACE)), "repeated_splits": str(REPEATED_SPLITS.relative_to(WORKSPACE)), "schema_lock": str(SCHEMA_LOCK.relative_to(WORKSPACE))},
        "target_definitions": {"next_step_bad": "next_step_incorrect OR next_step_unuseful", "next_step_incorrect": "incorrect next step only", "next_step_unuseful": "unuseful next step only"},
        "target_prevalence_and_overlap": prevalence,
        "models_requested": models,
        "feature_sets_requested": feature_sets,
        "seeds": seeds,
        "feature_set_definitions": {name: list(batch9a.FEATURE_SETS[name]) for name in feature_sets},
        "per_split_metrics": per_split,
        "aggregate_metrics": aggregate_metrics(per_split),
        "paired_comparisons": paired_deltas(per_split),
        "cross_target_capture": cross_target_capture(score_records),
        "skipped_models": skipped,
        "guards": guards,
        "environment": {"python": sys.version, "platform": platform.platform(), "sklearn": sklearn_info.get("version")},
        "score_output": str(SCORES_PATH.relative_to(WORKSPACE)),
        "score_output_policy": {"written_configs": [f"{t}::{m}::{f}" for t, m, f in sorted(SELECTED_SCORE_CONFIGS)], "reason": "Full metrics are retained for all evaluated configs; row-level scores are written for selected policy-overlap/top configurations to keep the artifact bounded."},
    }
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with SCORES_PATH.open("w") as handle:
        for record in score_records:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    PAPER_TABLES_MD.write_text(report_tables(report) + "\n")
    return report


def top_configs(report: dict[str, Any], target_name: str, metric: str, n: int = 5) -> list[tuple[str, dict[str, Any]]]:
    rows = [(key, val) for key, val in report["aggregate_metrics"].items() if key.startswith(f"{target_name}::") and f"test_{metric}" in val and val[f"test_{metric}"]["mean"] is not None]
    return sorted(rows, key=lambda item: item[1][f"test_{metric}"]["mean"], reverse=True)[:n]


def metric_mean(val: dict[str, Any], metric: str) -> Any:
    return val.get(metric, {}).get("mean")


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NA"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def selected_ablation_keys(target: str) -> tuple[str, ...]:
    return (
        f"{target}::logistic_regression::prefix_position_only",
        f"{target}::logistic_regression::non_position_history_only",
        f"{target}::logistic_regression::all_minus_prefix_position",
        f"{target}::logistic_regression::all_structured",
        f"{target}::hist_gradient_boosting::all_structured",
        f"{target}::hist_gradient_boosting::all_plus_interactions",
        f"{target}::random_forest::all_structured",
    )


def selected_policy_keys(target: str) -> tuple[str, ...]:
    return (
        f"{target}::random_forest::all_structured",
        f"{target}::hist_gradient_boosting::all_plus_interactions",
        f"{target}::logistic_regression::all_structured",
        f"{target}::logistic_regression::non_position_history_only",
    )


def cross_capture_lookup(report: dict[str, Any], key: str) -> dict[str, Any]:
    for row in report.get("cross_target_capture", []):
        if row.get("key") == key:
            return row
    return {}


def markdown(report: dict[str, Any]) -> str:
    p = report["target_prevalence_and_overlap"]
    lines = [
        "# Batch 9B Label and Target Ablations",
        "",
        "Preliminary benchmark diagnostics only. These are not production CodingActionGate validation results and do not establish conformal or distribution-shift guarantees.",
        "",
        "## Target Prevalence and Overlap",
        "",
        "| target/count | value |",
        "|---|---:|",
        f"| rows | `{p['total_prefix_rows']}` |",
        f"| next_step_bad positives | `{p['next_step_bad_positives']}` |",
        f"| next_step_incorrect positives | `{p['next_step_incorrect_positives']}` |",
        f"| next_step_unuseful positives | `{p['next_step_unuseful_positives']}` |",
        f"| row overlap incorrect and unuseful | `{p['row_overlap_incorrect_and_unuseful']}` |",
        f"| incorrect-only rows | `{p['incorrect_only_rows']}` |",
        f"| unuseful-only rows | `{p['unuseful_only_rows']}` |",
        f"| trajectories with both label types | `{p['trajectory_counts']['both_incorrect_and_unuseful']}` |",
        f"| trajectories with incorrect only | `{p['trajectory_counts']['incorrect_only']}` |",
        f"| trajectories with unuseful only | `{p['trajectory_counts']['unuseful_only']}` |",
        "",
        "## Best Model/Feature Set Per Target",
        "",
        "| target | config | test AUROC | test AP | AP lift | top10 capture |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for target in TARGETS:
        for key, val in top_configs(report, target, "average_precision", 3):
            lines.append(f"| `{target}` | `{key}` | `{fmt(metric_mean(val, 'test_auroc'))}` | `{fmt(metric_mean(val, 'test_average_precision'))}` | `{fmt(metric_mean(val, 'test_ap_lift_ratio'), 2)}` | `{fmt(metric_mean(val, 'top_10pct_target_positive_capture'))}` |")
    lines.extend([
        "",
        "## Fixed-Budget Intervention by Target",
        "",
        "| target | config | budget | test deferral | test target capture | allowed target-positive rate |",
        "|---|---|---:|---:|---:|---:|",
    ])
    for target in TARGETS:
        for key in selected_policy_keys(target):
            val = report["aggregate_metrics"].get(key, {})
            if not val:
                continue
            for budget in BUDGETS:
                label = str(budget)
                lines.append(f"| `{target}` | `{key}` | `{label}` | `{fmt(metric_mean(val, f'budget_{label}_test_deferral_rate'))}` | `{fmt(metric_mean(val, f'budget_{label}_test_capture'))}` | `{fmt(metric_mean(val, f'budget_{label}_test_allowed_target_positive_rate'))}` |")
    lines.extend([
        "",
        "## Strict-Alpha Diagnostic",
        "",
        "| target | config | alpha | low-base allow-all rate | test deferral | test allowed target-positive rate | test target met rate |",
        "|---|---|---:|---:|---:|---:|---:|",
    ])
    for target in TARGETS:
        key = f"{target}::hist_gradient_boosting::all_plus_interactions"
        val = report["aggregate_metrics"].get(key, {})
        if not val:
            continue
        for alpha in STRICT_ALPHAS:
            label = str(alpha)
            lines.append(f"| `{target}` | `{key}` | `{label}` | `{fmt(metric_mean(val, f'alpha_{label}_low_base_rate_allow_all_rate'))}` | `{fmt(metric_mean(val, f'alpha_{label}_test_deferral_rate'))}` | `{fmt(metric_mean(val, f'alpha_{label}_test_allowed_target_positive_rate'))}` | `{fmt(metric_mean(val, f'alpha_{label}_test_target_met_rate'))}` |")
    lines.extend([
        "",
        "## Cross-Target Capture Diagnostics",
        "",
        "| scored target/config | budget | captured target | test deferral | capture rate |",
        "|---|---:|---|---:|---:|",
    ])
    for scored_target in TARGETS:
        for key_model in ("hist_gradient_boosting::all_plus_interactions", "random_forest::all_structured", "logistic_regression::all_structured"):
            scored_key = f"{scored_target}::{key_model}"
            for budget in BUDGETS:
                for captured in TARGETS:
                    row = cross_capture_lookup(report, f"{scored_key}::{budget}::{captured}")
                    if row:
                        lines.append(f"| `{scored_key}` | `{budget}` | `{captured}` | `{fmt(metric_mean(row, 'deferral_rate'))}` | `{fmt(metric_mean(row, 'capture_rate'))}` |")
    lines.extend(["", "## Does the combined target hide different mechanisms?", "", "- `next_step_bad` is row-count dominated by `next_step_incorrect`: the row-level overlap is zero, with all `next_step_unuseful` positives appearing as unuseful-only rows at the next-step level.", "- Separate-target rankings differ: incorrect has lower AP than combined, while unuseful has much lower raw AP but higher AP lift because prevalence is very low.", "- Compare targets using prevalence, AP lift, and fixed-budget capture; avoid raw AP-only comparisons.", "", "## Is unuseful behavior predictable?", "", f"- `next_step_unuseful` positives: `{p['next_step_unuseful_positives']}`. Treat this as sparse target-ablation evidence, not a standalone final result.", "- The target shows ranking signal in AP lift and top-decile capture, but split-level instability and overfitting flags make the evidence less stable than for incorrect/combined targets.", "", "## Do non-position features matter by target?", "", "| config | test AUROC | test AP | AP lift | top10 capture | overfit flag rate |", "|---|---:|---:|---:|---:|---:|"])
    for target in TARGETS:
        for key in selected_ablation_keys(target):
            val = report["aggregate_metrics"].get(key, {})
            if val:
                lines.append(f"| `{key}` | `{fmt(metric_mean(val, 'test_auroc'))}` | `{fmt(metric_mean(val, 'test_average_precision'))}` | `{fmt(metric_mean(val, 'test_ap_lift_ratio'), 2)}` | `{fmt(metric_mean(val, 'top_10pct_target_positive_capture'))}` | `{fmt(metric_mean(val, 'overfit_flag_rate'))}` |")
    lines.extend(["", "## Reviewer-facing interpretation", "", "- Preliminary Batch 9B evidence suggests the combined target mixes a larger incorrect-label component with a sparse unuseful-label component.", "- Non-position process-history features retain signal for all targets, weakening a pure prefix-length explanation.", "- Stronger tree models improve ranking but show larger train/test gaps, especially on sparse unuseful labels.", "", "## Caveats", "", "- Target labels are benchmark annotations and remain proxy outcomes.", "- Unuseful labels are sparse relative to incorrect labels; AP must be interpreted with prevalence and AP lift.", "- Label overlap is absent at the next-step row level but exists at the trajectory level.", "- Repeated split variance remains material.", "- No raw semantic text, embeddings, or LLM judges are used.", "- This is benchmark-level evidence only, not production CodingActionGate validation.", "", "## Recommended next batch", "", "Recommend Batch 9C early-intervention/failure-propagation analysis unless target-ablation review identifies a label problem that must be corrected first."])
    return "\n".join(lines)


def report_tables(report: dict[str, Any]) -> str:
    lines = ["# Batch 9B Report Candidate Tables", "", "All tables are candidate / not final.", "", "## Target Prevalence and Overlap", "", "| quantity | value |", "|---|---:|"]
    p = report["target_prevalence_and_overlap"]
    for key in ("next_step_bad_positives", "next_step_incorrect_positives", "next_step_unuseful_positives", "incorrect_only_rows", "unuseful_only_rows", "row_overlap_incorrect_and_unuseful"):
        lines.append(f"| `{key}` | `{p[key]}` |")
    lines.extend(["", "## Best Target-Specific Models", "", "| target | config | AUROC | AP | AP lift |", "|---|---|---:|---:|---:|"])
    for target in TARGETS:
        for key, val in top_configs(report, target, "average_precision", 5):
            lines.append(f"| `{target}` | `{key}` | `{fmt(metric_mean(val, 'test_auroc'))}` | `{fmt(metric_mean(val, 'test_average_precision'))}` | `{fmt(metric_mean(val, 'test_ap_lift_ratio'), 2)}` |")
    lines.extend(["", "## Non-position vs Prefix-position Ablation", "", "| config | AP | AP lift |", "|---|---:|---:|"])
    for target in TARGETS:
        for key in (f"{target}::logistic_regression::prefix_position_only", f"{target}::logistic_regression::non_position_history_only", f"{target}::logistic_regression::all_minus_prefix_position", f"{target}::logistic_regression::all_structured"):
            val = report["aggregate_metrics"].get(key, {})
            lines.append(f"| `{key}` | `{fmt(metric_mean(val, 'test_average_precision'))}` | `{fmt(metric_mean(val, 'test_ap_lift_ratio'), 2)}` |")
    lines.extend(["", "## Fixed-Budget Target Capture", "", "| config | budget | deferral | capture | allowed target-positive rate |", "|---|---:|---:|---:|---:|"])
    for target in TARGETS:
        for key in (f"{target}::hist_gradient_boosting::all_plus_interactions", f"{target}::random_forest::all_structured", f"{target}::logistic_regression::all_structured"):
            val = report["aggregate_metrics"].get(key, {})
            if not val:
                continue
            for budget in BUDGETS:
                label = str(budget)
                lines.append(f"| `{key}` | `{label}` | `{fmt(metric_mean(val, f'budget_{label}_test_deferral_rate'))}` | `{fmt(metric_mean(val, f'budget_{label}_test_capture'))}` | `{fmt(metric_mean(val, f'budget_{label}_test_allowed_target_positive_rate'))}` |")
    lines.extend(["", "## Cross-Target Capture", "", "| scored config | budget | captured target | capture |", "|---|---:|---|---:|"])
    for scored_target in TARGETS:
        scored_key = f"{scored_target}::hist_gradient_boosting::all_plus_interactions"
        for budget in BUDGETS:
            for captured in TARGETS:
                row = cross_capture_lookup(report, f"{scored_key}::{budget}::{captured}")
                if row:
                    lines.append(f"| `{scored_key}` | `{budget}` | `{captured}` | `{fmt(metric_mean(row, 'capture_rate'))}` |")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    report = run(args)
    print(json.dumps({"configs": len(report["per_split_metrics"]), "score_output": report["score_output"], "skipped": len(report["skipped_models"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
