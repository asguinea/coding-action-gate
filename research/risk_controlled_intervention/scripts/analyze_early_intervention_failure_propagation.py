#!/usr/bin/env python3
"""Batch 9C early-intervention and failure-propagation diagnostics."""

from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
INTERVENTION_DIR = WORKSPACE / "data" / "intervention_outputs"
PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
SCHEMA_LOCK = WORKSPACE / "SCHEMA_LOCK.md"
BATCH9B_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
BATCH9A_SCORES = MODEL_OUTPUT_DIR / "batch_9a_stronger_model_scores.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.json"
REPORT_MD = REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9c_report_candidate_tables.md"
CURVE_DATA_JSON = REPORTS_DIR / "batch_9c_curve_data.json"
EVENTS_JSONL = INTERVENTION_DIR / "batch_9c_trajectory_intervention_events.jsonl"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
DEFAULT_BUDGETS = (0.05, 0.10, 0.20)
DEFAULT_ALPHAS = (0.02, 0.03, 0.04, 0.05)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
EVENT_RAW_SUBSTRINGS = ("text", "content", "prompt", "response", "code", "terminal")

DEFAULT_POLICY_CONFIGS = (
    ("next_step_bad", "hist_gradient_boosting", "all_plus_interactions"),
    ("next_step_bad", "hist_gradient_boosting", "all_structured"),
    ("next_step_bad", "gradient_boosting", "all_structured"),
    ("next_step_bad", "random_forest", "all_structured"),
    ("next_step_bad", "logistic_regression", "all_structured"),
    ("next_step_bad", "logistic_regression", "non_position_history_only"),
    ("next_step_bad", "logistic_regression", "prefix_position_only"),
    ("next_step_bad", "long_prefix_heuristic", "prefix_position_only"),
    ("next_step_incorrect", "hist_gradient_boosting", "all_minus_prefix_position"),
    ("next_step_incorrect", "hist_gradient_boosting", "all_structured"),
    ("next_step_incorrect", "gradient_boosting", "all_structured"),
    ("next_step_incorrect", "logistic_regression", "all_structured"),
    ("next_step_incorrect", "logistic_regression", "non_position_history_only"),
    ("next_step_incorrect", "logistic_regression", "prefix_position_only"),
    ("next_step_unuseful", "random_forest", "all_structured"),
    ("next_step_unuseful", "extra_trees", "all_plus_interactions"),
    ("next_step_unuseful", "hist_gradient_boosting", "all_structured"),
    ("next_step_unuseful", "logistic_regression", "all_structured"),
    ("next_step_unuseful", "logistic_regression", "non_position_history_only"),
    ("next_step_unuseful", "logistic_regression", "prefix_position_only"),
)


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


model_features = load_script("model_features")
risk_utils = load_script("risk_diagnostic_utils")
repeated_utils = load_script("repeated_split_utils")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze Batch 9C early intervention and failure propagation.")
    parser.add_argument("--targets", help="Comma-separated evaluation targets.")
    parser.add_argument("--configs", help="Comma-separated policy configs target::model::feature_set.")
    parser.add_argument("--budgets", help="Comma-separated fixed row-level deferral budgets.")
    parser.add_argument("--alphas", help="Comma-separated strict-alpha diagnostics.")
    parser.add_argument("--seeds", help="Comma-separated repeated split seeds.")
    parser.add_argument("--quick-check", action="store_true")
    return parser.parse_args()


def parse_csv(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_config(value: str) -> tuple[str, str, str]:
    parts = value.split("::")
    if len(parts) != 3:
        raise SystemExit(f"ERROR: config must be target::model::feature_set, got {value!r}")
    return parts[0], parts[1], parts[2]


def selected_options(args: argparse.Namespace) -> tuple[list[str], list[tuple[str, str, str]], list[float], list[float], list[int]]:
    if args.quick_check:
        return (
            ["next_step_bad", "next_step_incorrect", "next_step_unuseful"],
            [
                ("next_step_bad", "hist_gradient_boosting", "all_plus_interactions"),
                ("next_step_bad", "logistic_regression", "all_structured"),
                ("next_step_bad", "logistic_regression", "prefix_position_only"),
            ],
            [0.05, 0.20],
            [0.03],
            [DEFAULT_SEEDS[0]],
        )
    targets = parse_csv(args.targets, TARGETS)
    configs = [parse_config(item) for item in parse_csv(args.configs, ("::".join(c) for c in DEFAULT_POLICY_CONFIGS))]
    budgets = [float(item) for item in parse_csv(args.budgets, DEFAULT_BUDGETS)]
    alphas = [float(item) for item in parse_csv(args.alphas, DEFAULT_ALPHAS)]
    seeds = [int(item) for item in parse_csv(args.seeds, DEFAULT_SEEDS)]
    return targets, configs, budgets, alphas, seeds


def require_inputs() -> None:
    missing = [path for path in (REPEATED_SPLITS, SCHEMA_LOCK, BATCH9B_SCORES) if not path.exists()]
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        missing.append(PREFIX_PATH)
    if missing:
        raise SystemExit("ERROR: missing required Batch 9C inputs: " + ", ".join(str(path) for path in missing))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def target_value(row: dict[str, Any], target_name: str) -> int:
    if target_name == "next_step_bad":
        return int(row.get("next_step_incorrect", 0)) | int(row.get("next_step_unuseful", 0))
    return int(row.get(target_name, 0))


def sort_key(row: dict[str, Any]) -> tuple[int, int]:
    step = row.get("step_index")
    try:
        step_int = int(step)
    except (TypeError, ValueError):
        step_int = 0
    return step_int, int(row.get("_order", 0))


def group_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, row in enumerate(rows):
        row.setdefault("_order", index)
        grouped[str(row["trajectory_id"])].append(row)
    for trajectory_rows in grouped.values():
        trajectory_rows.sort(key=sort_key)
    return dict(grouped)


def positive_ordinals(rows: list[dict[str, Any]], target_name: str) -> list[int]:
    return [idx for idx, row in enumerate(rows, start=1) if target_value(row, target_name)]


def run_lengths(ordinals: list[int]) -> list[int]:
    if not ordinals:
        return []
    runs = []
    current = 1
    for prev, cur in zip(ordinals, ordinals[1:]):
        if cur == prev + 1:
            current += 1
        else:
            runs.append(current)
            current = 1
    runs.append(current)
    return runs


def trajectory_target_event(rows: list[dict[str, Any]], target_name: str) -> dict[str, Any]:
    positives = positive_ordinals(rows, target_name)
    count = len(rows)
    first = positives[0] if positives else None
    second = positives[1] if len(positives) > 1 else None
    last = positives[-1] if positives else None
    incorrect = positive_ordinals(rows, "next_step_incorrect")
    unuseful = positive_ordinals(rows, "next_step_unuseful")
    runs = run_lengths(positives)
    return {
        "trajectory_decision_row_count": count,
        "target_positive_row_count": len(positives),
        "first_target_positive_row_ordinal": first,
        "second_target_positive_row_ordinal": second,
        "last_target_positive_row_ordinal": last,
        "target_positive_rows_after_first_positive": max(0, len(positives) - 1),
        "has_target_positive": bool(positives),
        "has_repeated_target_positive": len(positives) >= 2,
        "normalized_first_target_positive_position": (first / count) if first and count else None,
        "positive_run_count": len(runs),
        "positive_run_lengths": runs,
        "first_incorrect_positive_row_ordinal": incorrect[0] if incorrect else None,
        "first_unuseful_positive_row_ordinal": unuseful[0] if unuseful else None,
        "incorrect_before_unuseful": bool(incorrect and unuseful and incorrect[0] < unuseful[0]),
        "unuseful_before_incorrect": bool(incorrect and unuseful and unuseful[0] < incorrect[0]),
        "incorrect_same_time_as_unuseful": bool(incorrect and unuseful and unuseful[0] == incorrect[0]),
        "both_incorrect_and_unuseful": bool(incorrect and unuseful),
    }


def threshold_for_budget(scores: list[float], budget: float) -> float:
    return risk_utils.threshold_for_deferral_budget(scores, budget)


def select_alpha_threshold(scores: list[float], labels: list[int], alpha: float) -> dict[str, Any]:
    return repeated_utils.select_threshold_fast(scores, labels, alpha, conservative=False)


def row_threshold_metrics(rows: list[dict[str, Any]], target_name: str, tau: float, alpha: float = 0.0) -> dict[str, Any]:
    scores = [float(row["score"]) for row in rows]
    labels = [target_value(row, target_name) for row in rows]
    metrics = repeated_utils.risk_metrics.decision_metrics(scores, labels, tau, alpha, [str(row["trajectory_id"]) for row in rows])
    metrics["target_positive_capture_rate"] = metrics["true_deferral_rate"]
    metrics["allowed_target_positive_rate"] = metrics["allowed_bad_rate"]
    return metrics


def trajectory_policy_event(
    rows: list[dict[str, Any]],
    target_name: str,
    tau: float,
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_event = base or trajectory_target_event(rows, target_name)
    deferred_ordinals = [idx for idx, row in enumerate(rows, start=1) if float(row["score"]) > tau]
    positive_ord = positive_ordinals(rows, target_name)
    first_deferred = deferred_ordinals[0] if deferred_ordinals else None
    first_positive = base_event["first_target_positive_row_ordinal"]
    second_positive = base_event["second_target_positive_row_ordinal"]
    positives_deferred = sum(1 for ordinal in positive_ord if ordinal in set(deferred_ordinals))
    if first_deferred is None:
        allowed_before_first_defer = len(positive_ord)
        positives_after_first_defer = 0
    else:
        allowed_before_first_defer = sum(1 for ordinal in positive_ord if ordinal < first_deferred)
        positives_after_first_defer = sum(1 for ordinal in positive_ord if ordinal > first_deferred)
    return {
        **base_event,
        "first_deferred_row_ordinal": first_deferred,
        "normalized_first_deferred_position": (first_deferred / len(rows)) if first_deferred and rows else None,
        "deferred_row_count": len(deferred_ordinals),
        "trajectory_ever_deferred": bool(deferred_ordinals),
        "first_deferral_before_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred < first_positive),
        "first_deferral_at_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred == first_positive),
        "first_deferral_before_or_at_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive),
        "first_deferral_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred > first_positive),
        "distance_first_positive_to_first_deferral": (first_deferred - first_positive) if first_deferred is not None and first_positive is not None else None,
        "first_deferral_within_0_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive),
        "first_deferral_within_1_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive + 1),
        "first_deferral_within_2_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive + 2),
        "first_deferral_within_3_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive + 3),
        "first_deferral_within_5_after_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive + 5),
        "first_deferral_before_or_at_second_positive": bool(first_deferred is not None and second_positive is not None and first_deferred <= second_positive),
        "target_positive_rows_deferred": positives_deferred,
        "fraction_target_positive_rows_deferred": positives_deferred / len(positive_ord) if positive_ord else None,
        "target_positive_rows_allowed_before_first_deferral": allowed_before_first_defer,
        "fraction_target_positive_rows_allowed_before_first_deferral": allowed_before_first_defer / len(positive_ord) if positive_ord else None,
        "target_positive_rows_after_first_deferral": positives_after_first_defer,
    }


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * q))))
    return ordered[index]


def summarize(values: list[float]) -> dict[str, Any]:
    clean = [float(v) for v in values if v is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "min": None, "median": None, "max": None}
    return {
        "count": len(clean),
        "mean": sum(clean) / len(clean),
        "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0,
        "min": min(clean),
        "median": quantile(clean, 0.5),
        "max": max(clean),
    }


def aggregate_dicts(rows: list[dict[str, Any]], fields: Iterable[str]) -> dict[str, Any]:
    return {field: summarize([row[field] for row in rows if row.get(field) is not None]) for field in fields}


def summarize_boolean(rows: list[dict[str, Any]], field: str, denominator_filter: str | None = None) -> float | None:
    filtered = [row for row in rows if row.get(denominator_filter)] if denominator_filter else rows
    if not filtered:
        return None
    return sum(1 for row in filtered if row.get(field)) / len(filtered)


def aggregate_policy_events(events: list[dict[str, Any]], row_metrics: dict[str, Any]) -> dict[str, Any]:
    positive_events = [event for event in events if event["has_target_positive"]]
    repeated_events = [event for event in events if event["has_repeated_target_positive"]]
    total_positive_rows = sum(event["target_positive_row_count"] for event in events)
    total_deferred_positive_rows = sum(event["target_positive_rows_deferred"] for event in events)
    total_allowed_before = sum(event["target_positive_rows_allowed_before_first_deferral"] for event in events)
    return {
        "trajectory_count": len(events),
        "target_positive_trajectory_count": len(positive_events),
        "repeated_positive_trajectory_count": len(repeated_events),
        "row_level_deferral_rate": row_metrics.get("deferral_rate"),
        "row_level_allowed_target_positive_rate": row_metrics.get("allowed_target_positive_rate"),
        "row_level_target_positive_capture": row_metrics.get("target_positive_capture_rate"),
        "trajectory_level_deferral_rate": summarize_boolean(events, "trajectory_ever_deferred"),
        "trajectory_level_positive_coverage": summarize_boolean(events, "trajectory_ever_deferred", "has_target_positive"),
        "first_failure_coverage": summarize_boolean(events, "first_deferral_before_or_at_first_positive", "has_target_positive"),
        "first_deferral_before_first_positive_rate": summarize_boolean(events, "first_deferral_before_first_positive", "has_target_positive"),
        "first_deferral_at_first_positive_rate": summarize_boolean(events, "first_deferral_at_first_positive", "has_target_positive"),
        "repeated_failure_coverage": summarize_boolean(events, "first_deferral_before_or_at_second_positive", "has_repeated_target_positive"),
        "target_positive_rows_deferred": total_deferred_positive_rows,
        "target_positive_rows_deferred_rate": total_deferred_positive_rows / total_positive_rows if total_positive_rows else None,
        "target_positive_rows_allowed_before_first_deferral": total_allowed_before,
        "target_positive_rows_allowed_before_first_deferral_rate": total_allowed_before / total_positive_rows if total_positive_rows else None,
        "distance_first_positive_to_first_deferral": summarize([event["distance_first_positive_to_first_deferral"] for event in positive_events if event.get("distance_first_positive_to_first_deferral") is not None]),
        "deferred_rows_per_trajectory": summarize([event["deferred_row_count"] for event in events]),
    }


def failure_propagation_for_seed(rows: list[dict[str, Any]], target_name: str) -> dict[str, Any]:
    grouped = group_by_trajectory(rows)
    events = [trajectory_target_event(trajectory_rows, target_name) for trajectory_rows in grouped.values()]
    positive = [event for event in events if event["has_target_positive"]]
    repeated = [event for event in events if event["has_repeated_target_positive"]]
    buckets = Counter()
    for event in positive:
        count = event["target_positive_row_count"]
        if count == 1:
            buckets["exactly_1"] += 1
        elif count == 2:
            buckets["exactly_2"] += 1
        elif 3 <= count <= 5:
            buckets["3_to_5"] += 1
        else:
            buckets["gt_5"] += 1
    positive_run_lengths = [length for event in positive for length in event["positive_run_lengths"]]
    first_second_distances = [event["second_target_positive_row_ordinal"] - event["first_target_positive_row_ordinal"] for event in repeated]
    first_last_distances = [event["last_target_positive_row_ordinal"] - event["first_target_positive_row_ordinal"] for event in positive if event["last_target_positive_row_ordinal"] is not None and event["first_target_positive_row_ordinal"] is not None]
    both = [event for event in events if event["both_incorrect_and_unuseful"]]
    return {
        "target_name": target_name,
        "trajectory_count": len(events),
        "target_positive_trajectory_count": len(positive),
        "repeated_positive_trajectory_count": len(repeated),
        "positive_rows_per_positive_trajectory": summarize([event["target_positive_row_count"] for event in positive]),
        "positive_trajectory_count_buckets": dict(buckets),
        "fraction_positive_trajectories_repeated": len(repeated) / len(positive) if positive else None,
        "median_distance_first_to_second_positive": quantile(first_second_distances, 0.5),
        "median_distance_first_to_last_positive": quantile(first_last_distances, 0.5),
        "fraction_positive_trajectories_with_consecutive_runs": sum(1 for event in positive if any(length >= 2 for length in event["positive_run_lengths"])) / len(positive) if positive else None,
        "positive_run_length_summary": summarize(positive_run_lengths),
        "normalized_first_positive_position": summarize([event["normalized_first_target_positive_position"] for event in positive if event["normalized_first_target_positive_position"] is not None]),
        "both_incorrect_and_unuseful_trajectory_count": len(both),
        "incorrect_before_unuseful_rate": sum(1 for event in both if event["incorrect_before_unuseful"]) / len(both) if both else None,
        "unuseful_before_incorrect_rate": sum(1 for event in both if event["unuseful_before_incorrect"]) / len(both) if both else None,
        "same_first_incorrect_unuseful_rate": sum(1 for event in both if event["incorrect_same_time_as_unuseful"]) / len(both) if both else None,
    }


def aggregate_failure_propagation(per_seed: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in per_seed:
        grouped[row["target_name"]].append(row)
    result = {}
    for target, rows in grouped.items():
        result[target] = {
            "trajectory_count": summarize([row["trajectory_count"] for row in rows]),
            "target_positive_trajectory_count": summarize([row["target_positive_trajectory_count"] for row in rows]),
            "repeated_positive_trajectory_count": summarize([row["repeated_positive_trajectory_count"] for row in rows]),
            "fraction_positive_trajectories_repeated": summarize([row["fraction_positive_trajectories_repeated"] for row in rows if row["fraction_positive_trajectories_repeated"] is not None]),
            "median_distance_first_to_second_positive": summarize([row["median_distance_first_to_second_positive"] for row in rows if row["median_distance_first_to_second_positive"] is not None]),
            "median_distance_first_to_last_positive": summarize([row["median_distance_first_to_last_positive"] for row in rows if row["median_distance_first_to_last_positive"] is not None]),
            "fraction_positive_trajectories_with_consecutive_runs": summarize([row["fraction_positive_trajectories_with_consecutive_runs"] for row in rows if row["fraction_positive_trajectories_with_consecutive_runs"] is not None]),
            "normalized_first_positive_position_mean": summarize([row["normalized_first_positive_position"]["mean"] for row in rows if row["normalized_first_positive_position"]["mean"] is not None]),
            "incorrect_before_unuseful_rate": summarize([row["incorrect_before_unuseful_rate"] for row in rows if row["incorrect_before_unuseful_rate"] is not None]),
            "unuseful_before_incorrect_rate": summarize([row["unuseful_before_incorrect_rate"] for row in rows if row["unuseful_before_incorrect_rate"] is not None]),
        }
    return result


def load_prefix_label_lookup(rows: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, int]]:
    lookup = {}
    for row in rows:
        try:
            step = int(row["step_index"])
        except (TypeError, ValueError):
            continue
        lookup[(str(row["trajectory_id"]), step)] = {
            "next_step_bad": int(row["next_step_bad"]),
            "next_step_incorrect": int(row["next_step_incorrect"]),
            "next_step_unuseful": int(row["next_step_unuseful"]),
        }
    return lookup


def score_key(row: dict[str, Any]) -> tuple[int, str, str, str]:
    return int(row["split_seed"]), str(row["target_name"]), str(row["model_name"]), str(row["feature_set"])


def load_score_rows(
    configs: set[tuple[str, str, str]],
    seeds: set[int],
    label_lookup: dict[tuple[str, int], dict[str, int]],
    warnings: list[dict[str, Any]],
) -> tuple[dict[tuple[int, str, str, str], dict[str, list[dict[str, Any]]]], set[tuple[str, str, str]], dict[str, Any]]:
    wanted = {(seed, *config) for seed in seeds for config in configs}
    grouped: dict[tuple[int, str, str, str], dict[str, list[dict[str, Any]]]] = defaultdict(lambda: {"calibration": [], "test": []})
    available: set[tuple[str, str, str]] = set()
    raw_hits = 0
    for path in (BATCH9B_SCORES, BATCH9A_SCORES):
        if not path.exists():
            if path == BATCH9A_SCORES:
                warnings.append({"type": "missing_optional_score_file", "path": str(path.relative_to(WORKSPACE))})
                continue
            raise SystemExit(f"ERROR: required score output missing: {path}")
        with path.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                raw_hits += len(RAW_KEYS & set(row))
                split = str(row.get("split"))
                if split not in {"calibration", "test"}:
                    continue
                if "target_name" in row:
                    config = (str(row["target_name"]), str(row["model_name"]), str(row["feature_set"]))
                    seed = int(row["split_seed"])
                else:
                    config = ("next_step_bad", str(row["model_name"]), str(row["feature_set"]))
                    seed = int(row["split_seed"])
                    if config not in configs:
                        continue
                    try:
                        step = int(row["step_index"])
                    except (TypeError, ValueError):
                        continue
                    labels = label_lookup.get((str(row["trajectory_id"]), step))
                    if labels is None:
                        warnings.append({"type": "missing_label_lookup_for_batch9a_score", "trajectory_id": row.get("trajectory_id"), "step_index": row.get("step_index")})
                        continue
                    row.update(labels)
                    row["target_name"] = "next_step_bad"
                    row["target_value"] = int(labels["next_step_bad"])
                if seed not in seeds or config not in configs or (seed, *config) not in wanted:
                    continue
                available.add(config)
                grouped[(seed, *config)][split].append({
                    "split_seed": seed,
                    "split": split,
                    "trajectory_id": str(row["trajectory_id"]),
                    "step_index": int(row["step_index"]),
                    "target_name": config[0],
                    "model_name": config[1],
                    "feature_set": config[2],
                    "score": float(row["score"]),
                    "next_step_bad": int(row["next_step_bad"]),
                    "next_step_incorrect": int(row.get("next_step_incorrect", 0)),
                    "next_step_unuseful": int(row.get("next_step_unuseful", 0)),
                })
    for split_rows in grouped.values():
        for split in ("calibration", "test"):
            split_rows[split].sort(key=lambda row: (row["trajectory_id"], row["step_index"]))
    return grouped, available, {"score_raw_text_key_hits": raw_hits}


def policy_key(seed: int, policy_target: str, model: str, feature_set: str, policy_type: str, value: float, eval_target: str) -> str:
    return f"{seed}::{policy_target}::{model}::{feature_set}::{policy_type}::{value}::{eval_target}"


def event_output_record(
    seed: int,
    split: str,
    trajectory_id: str,
    target_name: str,
    policy_target: str,
    model: str,
    feature_set: str,
    policy_type: str,
    budget_or_alpha: float,
    threshold: float,
    event: dict[str, Any],
) -> dict[str, Any]:
    return {
        "split_seed": seed,
        "split": split,
        "trajectory_id": trajectory_id,
        "target_name": target_name,
        "policy_model_name": model,
        "policy_feature_set": feature_set,
        "policy_target_name": policy_target,
        "policy_type": policy_type,
        "budget_or_alpha": budget_or_alpha,
        "threshold": threshold,
        "trajectory_decision_row_count": event["trajectory_decision_row_count"],
        "target_positive_row_count": event["target_positive_row_count"],
        "first_target_positive_row_ordinal": event["first_target_positive_row_ordinal"],
        "second_target_positive_row_ordinal": event["second_target_positive_row_ordinal"],
        "first_deferred_row_ordinal": event["first_deferred_row_ordinal"],
        "deferred_row_count": event["deferred_row_count"],
        "first_deferral_before_first_positive": event["first_deferral_before_first_positive"],
        "first_deferral_at_first_positive": event["first_deferral_at_first_positive"],
        "first_deferral_before_or_at_first_positive": event["first_deferral_before_or_at_first_positive"],
        "first_deferral_before_or_at_second_positive": event["first_deferral_before_or_at_second_positive"],
        "distance_first_positive_to_first_deferral": event["distance_first_positive_to_first_deferral"],
        "target_positive_rows_deferred": event["target_positive_rows_deferred"],
        "target_positive_rows_allowed_before_first_deferral": event["target_positive_rows_allowed_before_first_deferral"],
    }


def analyze_policy(
    seed: int,
    policy_target: str,
    model: str,
    feature_set: str,
    split_rows: dict[str, list[dict[str, Any]]],
    eval_targets: list[str],
    budgets: list[float],
    alphas: list[float],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    cal_rows = split_rows["calibration"]
    test_rows = split_rows["test"]
    if not cal_rows or not test_rows:
        return [], [], [{"seed": seed, "config": f"{policy_target}::{model}::{feature_set}", "reason": "missing calibration or test rows"}]
    policy_results = []
    event_records = []
    curve_rows = []
    test_grouped = group_by_trajectory(test_rows)
    by_target_base = {target: {tid: trajectory_target_event(rows, target) for tid, rows in test_grouped.items()} for target in eval_targets}
    settings: list[tuple[str, float, float, dict[str, Any]]] = []
    cal_scores = [float(row["score"]) for row in cal_rows]
    for budget in budgets:
        settings.append(("fixed_budget", budget, threshold_for_budget(cal_scores, budget), {"budget": budget}))
    for alpha in alphas:
        cal_labels = [target_value(row, policy_target) for row in cal_rows]
        selected = select_alpha_threshold(cal_scores, cal_labels, alpha)
        cal_prev = sum(cal_labels) / len(cal_labels) if cal_labels else 0.0
        settings.append(("strict_alpha", alpha, float(selected["tau"]), {"alpha": alpha, "selection": selected, "low_base_rate_allow_all_case": bool(cal_prev <= alpha and selected.get("allowed_count") == len(cal_labels))}))
    for policy_type, setting_value, tau, selection in settings:
        for eval_target in eval_targets:
            row_metrics_cal = row_threshold_metrics(cal_rows, eval_target, tau, setting_value if policy_type == "strict_alpha" else 0.0)
            row_metrics_test = row_threshold_metrics(test_rows, eval_target, tau, setting_value if policy_type == "strict_alpha" else 0.0)
            trajectory_events = []
            for trajectory_id, rows in test_grouped.items():
                event = trajectory_policy_event(rows, eval_target, tau, by_target_base[eval_target][trajectory_id])
                trajectory_events.append(event)
                event_records.append(event_output_record(seed, "test", trajectory_id, eval_target, policy_target, model, feature_set, policy_type, setting_value, tau, event))
            aggregate = aggregate_policy_events(trajectory_events, row_metrics_test)
            result = {
                "seed": seed,
                "policy_target_name": policy_target,
                "policy_model_name": model,
                "policy_feature_set": feature_set,
                "evaluation_target_name": eval_target,
                "policy_type": policy_type,
                "budget_or_alpha": setting_value,
                "threshold": tau,
                "selection": selection,
                "calibration_row_metrics": row_metrics_cal,
                "test_row_metrics": row_metrics_test,
                "test_trajectory_metrics": aggregate,
            }
            policy_results.append(result)
            if policy_type == "fixed_budget":
                curve_rows.append({
                    "seed": seed,
                    "policy": f"{policy_target}::{model}::{feature_set}",
                    "evaluation_target_name": eval_target,
                    "budget": setting_value,
                    "row_level_deferral_rate": aggregate["row_level_deferral_rate"],
                    "trajectory_level_deferral_rate": aggregate["trajectory_level_deferral_rate"],
                    "first_failure_coverage": aggregate["first_failure_coverage"],
                    "repeated_failure_coverage": aggregate["repeated_failure_coverage"],
                    "target_positive_rows_deferred_rate": aggregate["target_positive_rows_deferred_rate"],
                })
    return policy_results, event_records, curve_rows


def aggregate_policy_results(per_seed: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in per_seed:
        key = "::".join([
            row["policy_target_name"],
            row["policy_model_name"],
            row["policy_feature_set"],
            row["policy_type"],
            str(row["budget_or_alpha"]),
            row["evaluation_target_name"],
        ])
        grouped[key].append(row)
    fields = (
        "row_level_deferral_rate",
        "row_level_allowed_target_positive_rate",
        "row_level_target_positive_capture",
        "trajectory_level_deferral_rate",
        "trajectory_level_positive_coverage",
        "first_failure_coverage",
        "first_deferral_before_first_positive_rate",
        "first_deferral_at_first_positive_rate",
        "repeated_failure_coverage",
        "target_positive_rows_deferred_rate",
        "target_positive_rows_allowed_before_first_deferral_rate",
    )
    result = {}
    for key, rows in grouped.items():
        metrics = [row["test_trajectory_metrics"] for row in rows]
        result[key] = {field: summarize([metric.get(field) for metric in metrics if metric.get(field) is not None]) for field in fields}
        result[key]["distance_first_positive_to_first_deferral_mean"] = summarize([metric["distance_first_positive_to_first_deferral"]["mean"] for metric in metrics if metric["distance_first_positive_to_first_deferral"]["mean"] is not None])
        result[key]["threshold"] = summarize([row["threshold"] for row in rows])
        low_base = [row["selection"].get("low_base_rate_allow_all_case") for row in rows if row["policy_type"] == "strict_alpha"]
        if low_base:
            result[key]["low_base_rate_allow_all_rate"] = sum(1 for value in low_base if value) / len(low_base)
    return result


def paired_deltas(per_seed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lookup = {
        (
            row["seed"],
            row["policy_target_name"],
            row["policy_model_name"],
            row["policy_feature_set"],
            row["policy_type"],
            row["budget_or_alpha"],
            row["evaluation_target_name"],
        ): row
        for row in per_seed
    }
    configs = sorted({(row["policy_target_name"], row["policy_model_name"], row["policy_feature_set"], row["policy_type"], row["budget_or_alpha"], row["evaluation_target_name"]) for row in per_seed})
    baselines = [
        ("logistic_regression", "all_structured", "vs_logistic_all_structured"),
        ("logistic_regression", "prefix_position_only", "vs_prefix_position_logistic"),
        ("logistic_regression", "non_position_history_only", "vs_non_position_logistic"),
    ]
    summaries = []
    for policy_target, model, feature_set, policy_type, value, eval_target in configs:
        for base_model, base_features, label in baselines:
            deltas: dict[str, list[float]] = defaultdict(list)
            compared = improved = tied = worse = 0
            for seed in sorted({row["seed"] for row in per_seed}):
                row = lookup.get((seed, policy_target, model, feature_set, policy_type, value, eval_target))
                base = lookup.get((seed, policy_target, base_model, base_features, policy_type, value, eval_target))
                if not row or not base:
                    continue
                compared += 1
                for metric in ("row_level_target_positive_capture", "trajectory_level_positive_coverage", "first_failure_coverage", "repeated_failure_coverage", "trajectory_level_deferral_rate"):
                    rv = row["test_trajectory_metrics"].get(metric)
                    bv = base["test_trajectory_metrics"].get(metric)
                    if rv is not None and bv is not None:
                        deltas[f"delta_{metric}"].append(rv - bv)
                rv = row["test_trajectory_metrics"].get("first_failure_coverage")
                bv = base["test_trajectory_metrics"].get("first_failure_coverage")
                if rv is None or bv is None:
                    continue
                if abs(rv - bv) < 1e-12:
                    tied += 1
                elif rv > bv:
                    improved += 1
                else:
                    worse += 1
            if compared:
                summaries.append({
                    "policy_target_name": policy_target,
                    "policy_model_name": model,
                    "policy_feature_set": feature_set,
                    "policy_type": policy_type,
                    "budget_or_alpha": value,
                    "evaluation_target_name": eval_target,
                    "comparison": label,
                    "compared_seeds": compared,
                    "improved": improved,
                    "tied": tied,
                    "worse": worse,
                    "deltas": {metric: summarize(values) for metric, values in deltas.items()},
                })
    return summaries


def ordering_warnings(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    warnings = []
    for trajectory_id, trajectory_rows in group_by_trajectory(rows).items():
        steps = [row.get("step_index") for row in trajectory_rows]
        if len(steps) != len(set(steps)):
            warnings.append({"type": "duplicate_step_index", "trajectory_id": trajectory_id})
            if len(warnings) >= 25:
                break
    return warnings


def raw_key_hits_in_records(records: Iterable[dict[str, Any]]) -> int:
    hits = 0
    for row in records:
        keys = set(row)
        hits += len(RAW_KEYS & keys)
        hits += sum(1 for key in keys for token in EVENT_RAW_SUBSTRINGS if token in key and key not in {"policy_type"})
    return hits


def forbidden_language_hits(text: str) -> list[str]:
    bad_phrases = ("provides a production guarantee", "provides safety guarantees", "causally prevents", "prevented bad steps", "establishes conformal guarantees")
    return [phrase for phrase in bad_phrases if phrase in text.lower()]


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def metric_mean(aggregate: dict[str, Any], key: str, field: str) -> Any:
    return aggregate.get(key, {}).get(field, {}).get("mean")


def markdown(report: dict[str, Any]) -> str:
    agg = report["aggregate_policy_metrics"]
    propagation = report["failure_propagation_aggregate"]
    selected_rows = [
        ("next_step_bad::hist_gradient_boosting::all_plus_interactions::fixed_budget::0.05::next_step_bad", "HGB interactions", "5%"),
        ("next_step_bad::hist_gradient_boosting::all_plus_interactions::fixed_budget::0.1::next_step_bad", "HGB interactions", "10%"),
        ("next_step_bad::hist_gradient_boosting::all_plus_interactions::fixed_budget::0.2::next_step_bad", "HGB interactions", "20%"),
        ("next_step_bad::random_forest::all_structured::fixed_budget::0.05::next_step_bad", "RF all structured", "5%"),
        ("next_step_bad::logistic_regression::all_structured::fixed_budget::0.05::next_step_bad", "Logistic all structured", "5%"),
        ("next_step_bad::logistic_regression::prefix_position_only::fixed_budget::0.05::next_step_bad", "Logistic prefix position", "5%"),
    ]
    lines = [
        "# Batch 9C Early-Intervention and Failure-Propagation Analysis",
        "",
        "Preliminary offline benchmark diagnostics only. Deferrals are treated as captured intervention opportunities, not causal prevention claims.",
        "",
        "## Failure-Propagation Descriptive Statistics",
        "",
        "| target | positive trajectories | repeated-positive trajectories | repeated fraction | median first-to-second distance | normalized first-positive position |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for target in TARGETS:
        row = propagation.get(target, {})
        lines.append(f"| `{target}` | `{fmt(row.get('target_positive_trajectory_count', {}).get('mean'))}` | `{fmt(row.get('repeated_positive_trajectory_count', {}).get('mean'))}` | `{fmt(row.get('fraction_positive_trajectories_repeated', {}).get('mean'))}` | `{fmt(row.get('median_distance_first_to_second_positive', {}).get('mean'))}` | `{fmt(row.get('normalized_first_positive_position_mean', {}).get('mean'))}` |")
    lines.extend([
        "",
        "## Selected Fixed-Budget Early-Intervention Metrics",
        "",
        "| policy | budget | row deferral | trajectory deferral | row capture | first-failure coverage | repeated-failure coverage | allowed positives before first deferral |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for key, label, budget in selected_rows:
        row = agg.get(key, {})
        lines.append(f"| `{label}` | `{budget}` | `{fmt(row.get('row_level_deferral_rate', {}).get('mean'))}` | `{fmt(row.get('trajectory_level_deferral_rate', {}).get('mean'))}` | `{fmt(row.get('row_level_target_positive_capture', {}).get('mean'))}` | `{fmt(row.get('first_failure_coverage', {}).get('mean'))}` | `{fmt(row.get('repeated_failure_coverage', {}).get('mean'))}` | `{fmt(row.get('target_positive_rows_allowed_before_first_deferral_rate', {}).get('mean'))}` |")
    lines.extend([
        "",
        "## Cross-Target Early-Intervention Diagnostics",
        "",
        "| policy | budget | evaluation target | row capture | first-failure coverage |",
        "|---|---:|---|---:|---:|",
    ])
    for eval_target in TARGETS:
        key = f"next_step_bad::hist_gradient_boosting::all_plus_interactions::fixed_budget::0.05::{eval_target}"
        row = agg.get(key, {})
        lines.append(f"| `next_step_bad::hist_gradient_boosting::all_plus_interactions` | `5%` | `{eval_target}` | `{fmt(row.get('row_level_target_positive_capture', {}).get('mean'))}` | `{fmt(row.get('first_failure_coverage', {}).get('mean'))}` |")
    lines.extend([
        "",
        "## Strict-Alpha Early-Intervention Diagnostics",
        "",
        "| policy/evaluation target | alpha | low-base allow-all rate | row deferral | first-failure coverage |",
        "|---|---:|---:|---:|---:|",
    ])
    strict_policy_by_target = {
        "next_step_bad": "next_step_bad::hist_gradient_boosting::all_plus_interactions",
        "next_step_incorrect": "next_step_incorrect::hist_gradient_boosting::all_structured",
        "next_step_unuseful": "next_step_unuseful::random_forest::all_structured",
    }
    for target, policy in strict_policy_by_target.items():
        for alpha in DEFAULT_ALPHAS:
            key = f"{policy}::strict_alpha::{alpha}::{target}"
            row = agg.get(key, {})
            if row:
                lines.append(f"| `{policy}` | `{alpha}` | `{fmt(row.get('low_base_rate_allow_all_rate'))}` | `{fmt(row.get('row_level_deferral_rate', {}).get('mean'))}` | `{fmt(row.get('first_failure_coverage', {}).get('mean'))}` |")
    lines.extend([
        "",
        "## Do policies intervene before failures compound?",
        "",
        "The first-failure and repeated-failure coverage metrics distinguish rows deferred at the first target-positive opportunity from deferrals that occur only after target-positive rows have already appeared in the offline trajectory.",
        "",
        "## Does the review-budget story hold at trajectory level?",
        "",
        "The report includes both row-level and trajectory-level deferral costs because small row-level budgets can still touch a larger share of trajectories if deferrals are spread broadly.",
        "",
        "## Incorrect vs unuseful timing",
        "",
        "Unuseful labels are sparse. Timing diagnostics compare first incorrect and first unuseful positions only as exploratory target-ablation evidence.",
        "",
        "## Reviewer-facing interpretation",
        "",
        "These are preliminary Batch 9C diagnostics over saved scores. They evaluate whether policies flag offline intervention opportunities early enough to support the intervention framing beyond ranking metrics.",
        "",
        "## Caveats",
        "",
        "- Offline proxy only; a deferred row is a captured intervention opportunity, not proof that later behavior would change.",
        "- No causal prevention claim is made.",
        "- Target labels are benchmark annotations and remain proxy outcomes.",
        "- Unuseful labels are sparse.",
        "- Repeated split variance remains material.",
        "- No raw semantic text, embeddings, or LLM judges are used.",
        "- Benchmark-level evidence only; not production StepHarbor validation.",
        "",
        "## Recommended next batch",
        "",
        "Recommend Batch 9D cross-source / held-out robustness unless this batch reveals an early-intervention weakness that needs corrective analysis first.",
    ])
    return "\n".join(lines)


def report_tables(report: dict[str, Any]) -> str:
    agg = report["aggregate_policy_metrics"]
    lines = [
        "# Batch 9C Report Candidate Tables",
        "",
        "All tables are candidate / not final.",
        "",
        "## Fixed-Budget First-Failure Coverage",
        "",
        "| policy | budget | row capture | first-failure coverage | repeated-failure coverage | trajectory deferral |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for policy in (
        "next_step_bad::hist_gradient_boosting::all_plus_interactions",
        "next_step_bad::random_forest::all_structured",
        "next_step_bad::logistic_regression::all_structured",
        "next_step_bad::logistic_regression::prefix_position_only",
    ):
        for budget in DEFAULT_BUDGETS:
            key = f"{policy}::fixed_budget::{budget}::next_step_bad"
            row = agg.get(key, {})
            if row:
                lines.append(f"| `{policy}` | `{budget}` | `{fmt(row.get('row_level_target_positive_capture', {}).get('mean'))}` | `{fmt(row.get('first_failure_coverage', {}).get('mean'))}` | `{fmt(row.get('repeated_failure_coverage', {}).get('mean'))}` | `{fmt(row.get('trajectory_level_deferral_rate', {}).get('mean'))}` |")
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_inputs()
    eval_targets, requested_configs, budgets, alphas, seeds = selected_options(args)
    unknown_targets = sorted(set(eval_targets) - set(TARGETS))
    if unknown_targets:
        raise SystemExit(f"ERROR: unknown targets {unknown_targets}")
    prefix_rows = model_features.load_rows(PREFIX_PATH, SHARD_DIR)
    split_defs = load_json(REPEATED_SPLITS)
    label_lookup = load_prefix_label_lookup(prefix_rows)
    warnings: list[dict[str, Any]] = ordering_warnings(prefix_rows)
    configs = set(requested_configs)
    score_rows, available_configs, score_guards = load_score_rows(configs, set(seeds), label_lookup, warnings)
    skipped = []
    for config in requested_configs:
        if config not in available_configs:
            skipped.append({"config": "::".join(config), "reason": "row-level score output unavailable; no substitution used"})
    assignments_by_seed = {int(item["seed"]): item["assignments"] for item in split_defs["splits"] if int(item["seed"]) in seeds}
    failure_per_seed = []
    for seed, assignments in assignments_by_seed.items():
        split_rows = repeated_utils.rows_by_split(prefix_rows, assignments)
        test_rows = sorted(split_rows["test"], key=lambda row: (str(row["trajectory_id"]), int(row.get("step_index", 0))))
        for target in eval_targets:
            failure = failure_propagation_for_seed(test_rows, target)
            failure["seed"] = seed
            failure_per_seed.append(failure)
    per_seed_metrics = []
    event_records = []
    curve_rows = []
    for seed in seeds:
        for policy_target, model, feature_set in requested_configs:
            if (policy_target, model, feature_set) not in available_configs:
                continue
            split_rows = score_rows.get((seed, policy_target, model, feature_set))
            if not split_rows:
                skipped.append({"config": f"{policy_target}::{model}::{feature_set}", "seed": seed, "reason": "selected config available but seed rows missing"})
                continue
            policy_metrics, events, curves = analyze_policy(seed, policy_target, model, feature_set, split_rows, eval_targets, budgets, alphas)
            per_seed_metrics.extend(policy_metrics)
            event_records.extend(events)
            curve_rows.extend(curves)
    aggregate = aggregate_policy_results(per_seed_metrics)
    paired = paired_deltas(per_seed_metrics)
    INTERVENTION_DIR.mkdir(parents=True, exist_ok=True)
    with EVENTS_JSONL.open("w") as handle:
        for record in event_records:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
    guard_results = {
        **score_guards,
        "event_output_raw_text_key_hits": raw_key_hits_in_records(event_records),
        "trajectory_ordering_warning_count": len(warnings),
        "trajectory_ordering_warnings": warnings[:50],
        "trajectory_leakage": [],
        "threshold_selection_split": "calibration_only",
        "policy_metric_split": "test_after_calibration_threshold_selection",
        "low_base_rate_allow_all_cases_flagged": any(row.get("selection", {}).get("low_base_rate_allow_all_case") for row in per_seed_metrics),
    }
    report = {
        "schema_version": "risk-controlled-intervention-batch-9c-early-intervention.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Offline benchmark intervention-opportunity diagnostics only; not production StepHarbor validation, not a conformal production guarantee, and not causal prevention.",
        "dataset_paths": {"prefix": str(PREFIX_PATH.relative_to(WORKSPACE)), "repeated_splits": str(REPEATED_SPLITS.relative_to(WORKSPACE)), "schema_lock": str(SCHEMA_LOCK.relative_to(WORKSPACE))},
        "score_output_paths_used": [str(BATCH9B_SCORES.relative_to(WORKSPACE)), str(BATCH9A_SCORES.relative_to(WORKSPACE)) if BATCH9A_SCORES.exists() else None],
        "selected_policy_configurations": ["::".join(config) for config in requested_configs],
        "available_policy_configurations": ["::".join(config) for config in sorted(available_configs)],
        "threshold_definitions": {"fixed_budget": budgets, "strict_alpha": alphas, "selection_split": "calibration"},
        "failure_propagation_per_seed": failure_per_seed,
        "failure_propagation_aggregate": aggregate_failure_propagation(failure_per_seed),
        "per_seed_policy_metrics": per_seed_metrics,
        "aggregate_policy_metrics": aggregate,
        "paired_comparisons": paired,
        "curve_data": curve_rows,
        "event_output": str(EVENTS_JSONL.relative_to(WORKSPACE)),
        "skipped_configurations": skipped,
        "guard_results": guard_results,
        "warnings": warnings,
    }
    md = markdown(report)
    report["guard_results"]["report_forbidden_language_hits"] = forbidden_language_hits(md)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(md + "\n")
    PAPER_TABLES_MD.write_text(report_tables(report) + "\n")
    CURVE_DATA_JSON.write_text(json.dumps({"curve_data": curve_rows}, indent=2, sort_keys=True) + "\n")
    return report


def main() -> int:
    args = parse_args()
    report = run(args)
    print(json.dumps({
        "per_seed_policy_metrics": len(report["per_seed_policy_metrics"]),
        "event_output": report["event_output"],
        "events": sum(1 for _ in EVENTS_JSONL.open()),
        "skipped": len(report["skipped_configurations"]),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
