"""Shared helpers for Batch 8.75 repeated split experiments."""

from __future__ import annotations

import importlib.util
import json
import math
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
REPEATED_SPLITS_PATH = PROCESSED_DIR / "repeated_verified_splits.json"
REPEATED_SCORES_PATH = MODEL_OUTPUT_DIR / "repeated_model_scores.jsonl"
FEATURE_SCHEMA_PATH = REPORTS_DIR / "verified_prefix_feature_schema.json"

SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
SPLIT_NAMES = ("train", "calibration", "test")
MAIN_BASELINES = (
    "always_allow",
    "always_review",
    "long_prefix_heuristic",
    "observation_error_keyword_heuristic",
    "stage_transition_or_retry_heuristic",
    "logistic_regression",
    "class_weighted_logistic_regression",
    "dummy_prior",
    "dummy_majority",
)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code"}


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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_prefix_rows(prefix_path: Path = PREFIX_PATH, shard_dir: Path = SHARD_DIR) -> list[dict[str, Any]]:
    return model_features.load_rows(prefix_path, shard_dir)


def group_rows_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["trajectory_id"])].append(row)
    return dict(grouped)


def trajectory_metadata(trajectory_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    first = rows[0]
    return {
        "trajectory_id": trajectory_id,
        "row_count": len(rows),
        "positive_count": sum(int(row["next_step_bad"]) for row in rows),
        "has_any_next_step_bad": any(int(row["next_step_bad"]) for row in rows),
        "source_bucket": str(first.get("source_bucket", "unknown")),
        "agent": str(first.get("agent", "unknown")),
        "layout_family": str(first.get("layout_family", "unknown")),
        "category": str(first.get("category", "unknown")),
        "difficulty": str(first.get("difficulty", "unknown")),
    }


def stratum_key(meta: dict[str, Any]) -> str:
    target = "bad" if meta["has_any_next_step_bad"] else "clean"
    return "|".join([target, str(meta["source_bucket"]), str(meta["agent"] or meta["layout_family"])])


def make_assignments(
    trajectory_meta: dict[str, dict[str, Any]],
    seed: int,
    ratios: tuple[float, float, float] = (0.60, 0.20, 0.20),
) -> dict[str, str]:
    strata: dict[str, list[str]] = defaultdict(list)
    for trajectory_id, meta in trajectory_meta.items():
        strata[stratum_key(meta)].append(trajectory_id)
    rng = random.Random(seed)
    assignments: dict[str, str] = {}
    for ids in strata.values():
        ids = list(ids)
        rng.shuffle(ids)
        n = len(ids)
        train_n = int(round(n * ratios[0]))
        cal_n = int(round(n * ratios[1]))
        if n >= 3:
            train_n = min(max(1, train_n), n - 2)
            cal_n = min(max(1, cal_n), n - train_n - 1)
        elif n == 2:
            train_n, cal_n = 1, 0
        elif n == 1:
            train_n, cal_n = 1, 0
        for index, trajectory_id in enumerate(ids):
            if index < train_n:
                assignments[trajectory_id] = "train"
            elif index < train_n + cal_n:
                assignments[trajectory_id] = "calibration"
            else:
                assignments[trajectory_id] = "test"
    return rebalance_empty_splits(assignments, trajectory_meta, seed)


def rebalance_empty_splits(assignments: dict[str, str], trajectory_meta: dict[str, dict[str, Any]], seed: int) -> dict[str, str]:
    rng = random.Random(seed + 911)
    for split in ("calibration", "test"):
        positives = [tid for tid, assigned in assignments.items() if assigned == split and trajectory_meta[tid]["positive_count"] > 0]
        if positives:
            continue
        donors = [tid for tid, assigned in assignments.items() if assigned == "train" and trajectory_meta[tid]["positive_count"] > 0]
        if donors:
            assignments[rng.choice(donors)] = split
    return assignments


def rows_by_split(rows: list[dict[str, Any]], assignments: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    by_split = {split: [] for split in SPLIT_NAMES}
    for row in rows:
        split = assignments.get(str(row["trajectory_id"]))
        if split in by_split:
            by_split[split].append(row)
    return by_split


def split_audit(rows: list[dict[str, Any]], assignments: dict[str, str], trajectory_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    by_split = rows_by_split(rows, assignments)
    trajectory_counts = Counter(assignments.values())
    result = {
        "trajectory_counts": {split: trajectory_counts.get(split, 0) for split in SPLIT_NAMES},
        "row_counts": {},
        "positive_counts": {},
        "positive_rates": {},
        "distributions": {},
        "trajectory_leakage": trajectory_leakage(assignments),
    }
    for split, split_rows in by_split.items():
        positives = sum(int(row["next_step_bad"]) for row in split_rows)
        result["row_counts"][split] = len(split_rows)
        result["positive_counts"][split] = positives
        result["positive_rates"][split] = positives / len(split_rows) if split_rows else 0.0
    result["calibration_test_base_risk_gap"] = result["positive_rates"]["test"] - result["positive_rates"]["calibration"]
    for field in ("source_bucket", "agent", "layout_family", "category", "difficulty"):
        result["distributions"][field] = {}
        for split in SPLIT_NAMES:
            ids = [tid for tid, assigned in assignments.items() if assigned == split]
            counter = Counter(str(trajectory_meta[tid].get(field, "unknown")) for tid in ids)
            total = sum(counter.values())
            result["distributions"][field][split] = {key: {"count": value, "share": value / total if total else 0.0} for key, value in sorted(counter.items())}
    result["enough_positives"] = {
        split: result["positive_counts"][split] >= 25 for split in ("calibration", "test")
    }
    return result


def trajectory_leakage(assignments: dict[str, str]) -> bool:
    return len(assignments) != len(set(assignments))


def split_dict(assignments: dict[str, str]) -> dict[str, Any]:
    by_split = {split: sorted([tid for tid, assigned in assignments.items() if assigned == split]) for split in SPLIT_NAMES}
    return {"assignments": assignments, "split_trajectories": by_split}


def prepare_for_assignments(rows: list[dict[str, Any]], schema: dict[str, Any], assignments: dict[str, str]) -> dict[str, Any]:
    return model_features.prepare_matrices(rows=rows, schema=schema, splits=split_dict(assignments))


def score_record(seed: int, split: str, name: str, family: str, row: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "seed": seed,
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "split": split,
        "baseline_name": name,
        "model_family": family,
        "score": float(score),
        "target": int(row["next_step_bad"]),
        "next_step_bad": int(row["next_step_bad"]),
        "higher_means_riskier": True,
        "source_bucket": row.get("source_bucket"),
        "agent": row.get("agent"),
        "layout_family": row.get("layout_family"),
        "difficulty": row.get("difficulty"),
        "category": row.get("category"),
    }


def score_heuristics(seed: int, split_rows: dict[str, list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    funcs = heuristics.heuristic_functions(split_rows["train"])
    records = []
    reports = {}
    for name in ("always_allow", "always_review", "long_prefix_heuristic", "observation_error_keyword_heuristic", "stage_transition_or_retry_heuristic"):
        fn, threshold, description = funcs[name]
        reports[name] = {"description": description, "splits": {}}
        for split, rows in split_rows.items():
            scores = [float(fn(row)) for row in rows]
            labels = [int(row["next_step_bad"]) for row in rows]
            reports[name]["splits"][split] = split_metric_summary(scores, labels)
            records.extend(score_record(seed, split, name, "heuristic", row, score) for row, score in zip(rows, scores))
    return records, reports


def score_lightweight(seed: int, prepared: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    train_x_raw = prepared["splits"]["train"]["X"]
    train_y = prepared["splits"]["train"]["y"]
    means, stds = lightweight.standardizer(train_x_raw)
    x_scaled = {split: lightweight.transform(data["X"], means, stds) for split, data in prepared["splits"].items()}
    reports: dict[str, Any] = {}
    records: list[dict[str, Any]] = []
    model_scores: dict[str, dict[str, list[float]]] = {}
    for name, class_weighted in (("logistic_regression", False), ("class_weighted_logistic_regression", True)):
        weights = lightweight.fit_logistic(x_scaled["train"], train_y, class_weighted=class_weighted, seed=seed)
        scores_by_split = {split: lightweight.predict_logistic(weights, x_values) for split, x_values in x_scaled.items()}
        model_scores[name] = scores_by_split
    for name, score_fn in (("dummy_prior", lightweight.prior_scores), ("dummy_majority", lightweight.majority_scores)):
        model_scores[name] = {split: score_fn(train_y, len(data["y"])) for split, data in prepared["splits"].items()}
    for name, scores_by_split in model_scores.items():
        reports[name] = {"splits": {}}
        for split, scores in scores_by_split.items():
            rows = prepared["splits"][split]["rows"]
            labels = prepared["splits"][split]["y"]
            reports[name]["splits"][split] = split_metric_summary(scores, labels)
            records.extend(score_record(seed, split, name, "lightweight_supervised", row, score) for row, score in zip(rows, scores))
    return records, reports


def split_metric_summary(scores: list[float], labels: list[int]) -> dict[str, Any]:
    return {
        "rows": len(labels),
        "positives": sum(labels),
        "positive_rate": sum(labels) / len(labels) if labels else 0.0,
        "auroc": baseline_metrics.auroc(scores, labels),
        "average_precision": baseline_metrics.average_precision(scores, labels),
        "brier_score": baseline_metrics.brier_score(scores, labels),
        "decile_top_bottom_ratio": decile_top_bottom_ratio(scores, labels),
    }


def decile_top_bottom_ratio(scores: list[float], labels: list[int]) -> dict[str, Any]:
    if not scores or len(set(scores)) < 2:
        return {"top_decile_bad_rate": None, "bottom_decile_bad_rate": None, "ratio": None}
    paired = sorted(zip(scores, labels), key=lambda item: item[0])
    n = max(1, math.ceil(len(paired) * 0.10))
    bottom = paired[:n]
    top = paired[-n:]
    bottom_rate = sum(label for _score, label in bottom) / len(bottom)
    top_rate = sum(label for _score, label in top) / len(top)
    return {"top_decile_bad_rate": top_rate, "bottom_decile_bad_rate": bottom_rate, "ratio": (top_rate / bottom_rate) if bottom_rate else None}


def load_repeated_scores(path: Path = REPEATED_SCORES_PATH) -> list[dict[str, Any]]:
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def group_scores(rows: Iterable[dict[str, Any]]) -> dict[int, dict[str, dict[str, list[dict[str, Any]]]]]:
    grouped: dict[int, dict[str, dict[str, list[dict[str, Any]]]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for row in rows:
        grouped[int(row["seed"])][str(row["baseline_name"])][str(row["split"])].append(row)
    return grouped


def rows_to_scores_labels(rows: list[dict[str, Any]]) -> tuple[list[float], list[int], list[str]]:
    return [float(row["score"]) for row in rows], [int(row["target"]) for row in rows], [str(row["trajectory_id"]) for row in rows]


def fixed_policy_threshold(baseline_name: str, scores: list[float]) -> float | None:
    return risk_utils.fixed_policy_threshold(baseline_name, scores)


def select_threshold(baseline_name: str, calibration_rows: list[dict[str, Any]], alpha: float, conservative: bool = False) -> dict[str, Any]:
    scores, labels, _ = rows_to_scores_labels(calibration_rows)
    fixed = fixed_policy_threshold(baseline_name, scores)
    if fixed is not None:
        return {"tau": fixed, "selected_on": "policy_definition", "fixed_policy": baseline_name, "conservative": conservative}
    return select_threshold_fast(scores, labels, alpha, conservative=conservative)


def select_threshold_fast(scores: list[float], labels: list[int], alpha: float, conservative: bool = False) -> dict[str, Any]:
    pairs = sorted((float(score), int(label)) for score, label in zip(scores, labels))
    if not pairs:
        return {"tau": float("-inf"), "allowed_count": 0, "allowed_bad_rate": None, "calibration_upper_bound": 0.0, "defer_everything": True, "no_nontrivial_feasible_threshold": True}
    eps = max(1e-12, max(abs(pairs[0][0]), abs(pairs[-1][0]), 1.0) * 1e-12)
    candidates = [(pairs[0][0] - eps, 0, 0)]
    allowed = bad = 0
    index = 0
    while index < len(pairs):
        score = pairs[index][0]
        while index < len(pairs) and pairs[index][0] == score:
            allowed += 1
            bad += pairs[index][1]
            index += 1
        candidates.append((score, allowed, bad))
    best = None
    for tau, allowed_count, bad_allowed in candidates:
        risk = bad_allowed / allowed_count if allowed_count else None
        upper = risk_metrics.wilson_upper_bound(bad_allowed, allowed_count) if conservative else risk
        feasible = True if allowed_count == 0 else (upper is not None and upper <= alpha)
        if not feasible:
            continue
        candidate = {
            "tau": tau,
            "allowed_count": allowed_count,
            "allowed_bad_rate": risk,
            "calibration_upper_bound": upper,
            "defer_everything": allowed_count == 0,
            "no_nontrivial_feasible_threshold": allowed_count == 0,
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
        best = {"tau": pairs[0][0] - eps, "allowed_count": 0, "allowed_bad_rate": None, "calibration_upper_bound": 0.0, "defer_everything": True, "no_nontrivial_feasible_threshold": True}
    return best


def evaluate_threshold(rows: list[dict[str, Any]], tau: float, alpha: float = 0.0) -> dict[str, Any]:
    scores, labels, trajectories = rows_to_scores_labels(rows)
    metrics = risk_metrics.decision_metrics(scores, labels, tau, alpha, trajectories)
    metrics["fraction_of_bad_steps_deferred"] = metrics["true_deferral_rate"]
    metrics["bad_step_capture_rate"] = metrics["defer_precision"]
    base = sum(labels) / len(labels) if labels else 0.0
    if metrics["allowed_bad_rate"] is None:
        metrics["relative_risk_reduction_vs_always_allow"] = None
    else:
        metrics["relative_risk_reduction_vs_always_allow"] = (base - metrics["allowed_bad_rate"]) / base if base else None
    return metrics


def threshold_for_budget(scores: list[float], budget: float) -> float:
    return risk_utils.threshold_for_deferral_budget(scores, budget)


def summary_stats(values: list[float]) -> dict[str, Any]:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "median": None, "min": None, "max": None}
    return {
        "count": len(clean),
        "mean": sum(clean) / len(clean),
        "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0,
        "median": statistics.median(clean),
        "min": min(clean),
        "max": max(clean),
    }


def raw_key_hits_in_jsonl(path: Path) -> int:
    hits = 0
    with path.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if RAW_KEYS & set(row):
                hits += 1
    return hits
