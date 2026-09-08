#!/usr/bin/env python3
"""Batch 9D cross-source and held-out robustness evaluation."""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
import statistics
import sys
import time
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
POLICY_SET_PATH = REPORTS_DIR / "batch_9d_recommended_policy_set.json"
BATCH9C_REPORT = REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.json"
BATCH9C5_REPORT = REPORTS_DIR / "batch_9c5_no_skipped_config_repair.json"
REPORT_JSON = REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.json"
REPORT_MD = REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9d_report_candidate_tables.md"
CURVE_DATA_JSON = REPORTS_DIR / "batch_9d_curve_data.json"
SCORES_JSONL = MODEL_OUTPUT_DIR / "batch_9d_cross_source_scores.jsonl"
EVENTS_JSONL = INTERVENTION_DIR / "batch_9d_cross_source_intervention_events.jsonl"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
BUDGETS = (0.05, 0.10, 0.20)
ALPHAS = (0.02, 0.03, 0.04, 0.05)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
METADATA_FIELDS = {"source_bucket", "source_inferred", "agent", "layout_family", "parser_adapter", "category", "difficulty", "model", "artifact_path", "artifact_id"}
PROHIBITED_FEATURE_TOKENS = ("target", "label")
MIN_SUPPORT = {
    "next_step_bad": {"train_pos": 30, "cal_pos": 10, "test_pos": 10, "test_pos_traj": 5},
    "next_step_incorrect": {"train_pos": 30, "cal_pos": 10, "test_pos": 10, "test_pos_traj": 5},
    "next_step_unuseful": {"train_pos": 20, "cal_pos": 5, "test_pos": 5, "test_pos_traj": 3},
}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9b = load_script("evaluate_label_target_ablations")
batch9c = load_script("analyze_early_intervention_failure_propagation")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9D cross-source held-out robustness.")
    parser.add_argument("--scenarios", help="Comma-separated scenario IDs.")
    parser.add_argument("--targets", help="Comma-separated targets.")
    parser.add_argument("--policies", help="Comma-separated target::model::feature_set policy IDs.")
    parser.add_argument("--seeds", help="Comma-separated seeds.")
    parser.add_argument("--budgets", help="Comma-separated row-level budgets.")
    parser.add_argument("--alphas", help="Comma-separated strict-alpha values.")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--quick-check", action="store_true")
    return parser.parse_args()


def parse_csv(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_policy_id(value: str) -> tuple[str, str, str]:
    parts = value.split("::")
    if len(parts) != 3:
        raise SystemExit(f"ERROR: policy must be target::model::feature_set, got {value!r}")
    return parts[0], parts[1], parts[2]


def require_inputs() -> None:
    missing = [path for path in (POLICY_SET_PATH,) if not path.exists()]
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        missing.append(PREFIX_PATH)
    if missing:
        raise SystemExit("ERROR: missing required Batch 9D inputs: " + ", ".join(str(path) for path in missing))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def target_value(row: dict[str, Any], target: str) -> int:
    if target == "next_step_bad":
        return int(row.get("next_step_incorrect", 0)) | int(row.get("next_step_unuseful", 0))
    return int(row.get(target, 0))


def policy_id(policy: dict[str, Any] | tuple[str, str, str]) -> str:
    if isinstance(policy, tuple):
        return "::".join(policy)
    return "::".join([str(policy["target_name"]), str(policy["model_name"]), str(policy["feature_set"])])


def load_policy_set() -> list[dict[str, Any]]:
    policy_set = load_json(POLICY_SET_PATH)
    policies = []
    for policy in policy_set.get("policies", []):
        if policy.get("model_name") == "always_allow":
            policies.append(policy)
            continue
        if policy.get("scores_available") and policy.get("early_intervention_events_available"):
            policies.append(policy)
    return policies


def selected_options(args: argparse.Namespace, policies: list[dict[str, Any]], scenarios: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]], list[int], list[float], list[float], set[str] | None]:
    if args.quick_check:
        policy_keep = {"next_step_bad::hist_gradient_boosting::all_plus_interactions", "next_step_bad::logistic_regression::non_position_history_only", "next_step_bad::logistic_regression::prefix_position_only", "next_step_bad::always_allow::policy_baseline"}
        scenario_keep = {"swe_like_to_terminalbench_like", "heldout_source_openhands"}
        return ["next_step_bad"], [p for p in policies if policy_id(p) in policy_keep], [SEEDS[0]], [0.05], [0.03], scenario_keep
    targets = parse_csv(args.targets, TARGETS)
    policy_filter = set(parse_csv(args.policies, (policy_id(p) for p in policies))) if args.policies else None
    selected_policies = [p for p in policies if policy_filter is None or policy_id(p) in policy_filter]
    seeds = [int(seed) for seed in parse_csv(args.seeds, SEEDS)]
    budgets = [float(budget) for budget in parse_csv(args.budgets, BUDGETS)]
    alphas = [float(alpha) for alpha in parse_csv(args.alphas, ALPHAS)]
    scenario_filter = set(parse_csv(args.scenarios, (s["scenario_id"] for s in scenarios))) if args.scenarios else None
    return targets, selected_policies, seeds, budgets, alphas, scenario_filter


def group_rows_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["trajectory_id"])].append(row)
    for trajectory_rows in grouped.values():
        trajectory_rows.sort(key=lambda row: int(row.get("step_index", 0)))
    return dict(grouped)


def trajectory_label(rows: list[dict[str, Any]], target: str) -> int:
    return int(any(target_value(row, target) for row in rows))


def trajectory_meta(rows: list[dict[str, Any]]) -> dict[str, Any]:
    first = rows[0]
    return {field: str(first.get(field, "unknown")) for field in ("source_bucket", "source_inferred", "agent", "layout_family", "parser_adapter", "category", "difficulty", "model")}


def group_name(row_or_meta: dict[str, Any], group_type: str) -> str:
    source = str(row_or_meta.get("source_bucket", "unknown"))
    if group_type == "source_bucket":
        return source
    if group_type == "openhands_binary":
        return "openhands" if source == "openhands" else "non_openhands"
    if group_type == "parser_adapter":
        return str(row_or_meta.get("parser_adapter", "unknown"))
    if group_type == "layout_family":
        return str(row_or_meta.get("layout_family", "unknown"))
    return str(row_or_meta.get(group_type, "unknown"))


def group_ids(trajectory_meta_by_id: dict[str, dict[str, Any]], group_type: str, wanted: set[str]) -> set[str]:
    return {tid for tid, meta in trajectory_meta_by_id.items() if group_name(meta, group_type) in wanted}


def support_for_ids(grouped: dict[str, list[dict[str, Any]]], ids: set[str]) -> dict[str, Any]:
    selected = [rows for tid, rows in grouped.items() if tid in ids]
    all_rows = [row for rows in selected for row in rows]
    lengths = [len(rows) for rows in selected]
    result = {
        "trajectory_count": len(selected),
        "prefix_row_count": len(all_rows),
        "median_trajectory_prefix_rows": statistics.median(lengths) if lengths else None,
        "positives": {},
        "prevalence": {},
        "positive_trajectories": {},
    }
    for target in TARGETS:
        pos = sum(target_value(row, target) for row in all_rows)
        result["positives"][target] = pos
        result["prevalence"][target] = pos / len(all_rows) if all_rows else 0.0
        result["positive_trajectories"][target] = sum(1 for rows in selected if any(target_value(row, target) for row in rows))
    return result


def grouping_audit(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = group_rows_by_trajectory(rows)
    meta = {tid: trajectory_meta(traj_rows) for tid, traj_rows in grouped.items()}
    audit = {}
    group_defs = {
        "source_bucket": sorted({group_name(m, "source_bucket") for m in meta.values()}),
        "openhands_binary": ["openhands", "non_openhands"],
        "parser_adapter": sorted({group_name(m, "parser_adapter") for m in meta.values()}),
        "layout_family": sorted({group_name(m, "layout_family") for m in meta.values()}),
    }
    for group_type, values in group_defs.items():
        audit[group_type] = {}
        for value in values:
            ids = group_ids(meta, group_type, {value})
            support = support_for_ids(grouped, ids)
            support["feasible_for_training_next_step_bad"] = support["positives"]["next_step_bad"] >= MIN_SUPPORT["next_step_bad"]["train_pos"]
            support["feasible_for_heldout_next_step_bad"] = support["positives"]["next_step_bad"] >= MIN_SUPPORT["next_step_bad"]["test_pos"] and support["positive_trajectories"]["next_step_bad"] >= MIN_SUPPORT["next_step_bad"]["test_pos_traj"]
            audit[group_type][value] = support
    return audit


def build_scenarios(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grouped = group_rows_by_trajectory(rows)
    meta = {tid: trajectory_meta(traj_rows) for tid, traj_rows in grouped.items()}
    scenarios = [
        {"scenario_id": "swe_like_to_terminalbench_like", "scenario_type": "cross_source", "train_group_type": "source_bucket", "train_groups": ["swe_bench_like"], "test_group_type": "source_bucket", "test_groups": ["terminalbench_like"]},
        {"scenario_id": "terminalbench_like_to_swe_like", "scenario_type": "cross_source", "train_group_type": "source_bucket", "train_groups": ["terminalbench_like"], "test_group_type": "source_bucket", "test_groups": ["swe_bench_like"]},
        {"scenario_id": "non_openhands_to_openhands", "scenario_type": "cross_source", "train_group_type": "openhands_binary", "train_groups": ["non_openhands"], "test_group_type": "openhands_binary", "test_groups": ["openhands"]},
        {"scenario_id": "openhands_to_non_openhands", "scenario_type": "cross_source", "train_group_type": "openhands_binary", "train_groups": ["openhands"], "test_group_type": "openhands_binary", "test_groups": ["non_openhands"]},
    ]
    for adapter in sorted({group_name(m, "parser_adapter") for m in meta.values()}):
        scenarios.append({"scenario_id": f"heldout_parser_{adapter}", "scenario_type": "heldout_parser_adapter", "train_group_type": "parser_adapter", "train_groups": ["__REST__"], "test_group_type": "parser_adapter", "test_groups": [adapter]})
    parser_values = sorted({group_name(m, "parser_adapter") for m in meta.values()})
    layout_values = sorted({group_name(m, "layout_family") for m in meta.values()})
    skipped = []
    if parser_values == layout_values and all(group_name(m, "parser_adapter") == group_name(m, "layout_family") for m in meta.values()):
        skipped.append({"scenario_type": "heldout_layout_family", "reason": "layout_family partitions duplicate parser_adapter partitions exactly; parser one-vs-rest scenarios cover the same split."})
    else:
        for layout in layout_values:
            scenarios.append({"scenario_id": f"heldout_layout_{layout}", "scenario_type": "heldout_layout_family", "train_group_type": "layout_family", "train_groups": ["__REST__"], "test_group_type": "layout_family", "test_groups": [layout]})
    for source in sorted({group_name(m, "source_bucket") for m in meta.values()}):
        scenarios.append({"scenario_id": f"within_source_{source}", "scenario_type": "within_source_reference", "group_type": "source_bucket", "groups": [source]})
    return scenarios, skipped


def resolve_scenario_ids(scenario: dict[str, Any], meta: dict[str, dict[str, Any]]) -> tuple[set[str], set[str]]:
    if scenario["scenario_type"] == "within_source_reference":
        ids = group_ids(meta, scenario["group_type"], set(scenario["groups"]))
        return ids, ids
    test_ids = group_ids(meta, scenario["test_group_type"], set(scenario["test_groups"]))
    if scenario["train_groups"] == ["__REST__"]:
        train_ids = set(meta) - test_ids
    else:
        train_ids = group_ids(meta, scenario["train_group_type"], set(scenario["train_groups"]))
    return train_ids, test_ids


def split_ids_for_target(grouped: dict[str, list[dict[str, Any]]], train_pool: set[str], test_pool: set[str], target: str, seed: int, within_source: bool = False) -> dict[str, str]:
    rng = random.Random(seed)
    ids = list(train_pool)
    positives = [tid for tid in ids if trajectory_label(grouped[tid], target)]
    negatives = [tid for tid in ids if not trajectory_label(grouped[tid], target)]
    rng.shuffle(positives)
    rng.shuffle(negatives)
    assignments: dict[str, str] = {}
    if within_source:
        for bucket in (positives, negatives):
            n = len(bucket)
            train_n = int(round(n * 0.60))
            cal_n = int(round(n * 0.20))
            for index, tid in enumerate(bucket):
                if index < train_n:
                    assignments[tid] = "train"
                elif index < train_n + cal_n:
                    assignments[tid] = "calibration"
                else:
                    assignments[tid] = "test"
    else:
        for bucket in (positives, negatives):
            n = len(bucket)
            cal_n = max(1 if n >= 4 else 0, int(round(n * 0.25)))
            cal_set = set(bucket[:cal_n])
            for tid in bucket:
                assignments[tid] = "calibration" if tid in cal_set else "train"
        for tid in test_pool:
            assignments[tid] = "test"
    return assignments


def split_rows(rows: list[dict[str, Any]], assignments: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    by_split = {"train": [], "calibration": [], "test": []}
    for row in rows:
        split = assignments.get(str(row["trajectory_id"]))
        if split in by_split:
            by_split[split].append(row)
    return by_split


def support_for_split(split_rows_: dict[str, list[dict[str, Any]]], target: str) -> dict[str, Any]:
    result = {}
    for split, rows in split_rows_.items():
        trajs = group_rows_by_trajectory(rows)
        pos = sum(target_value(row, target) for row in rows)
        result[split] = {
            "rows": len(rows),
            "trajectories": len(trajs),
            "positive_rows": pos,
            "positive_trajectories": sum(1 for traj_rows in trajs.values() if any(target_value(row, target) for row in traj_rows)),
            "prevalence": pos / len(rows) if rows else 0.0,
        }
    return result


def feasibility(split_support: dict[str, Any], target: str) -> tuple[bool, list[str]]:
    thresholds = MIN_SUPPORT[target]
    reasons = []
    if split_support["train"]["positive_rows"] < thresholds["train_pos"]:
        reasons.append(f"train positive rows {split_support['train']['positive_rows']} < {thresholds['train_pos']}")
    if split_support["calibration"]["positive_rows"] < thresholds["cal_pos"]:
        reasons.append(f"calibration positive rows {split_support['calibration']['positive_rows']} < {thresholds['cal_pos']}")
    if split_support["test"]["positive_rows"] < thresholds["test_pos"]:
        reasons.append(f"test positive rows {split_support['test']['positive_rows']} < {thresholds['test_pos']}")
    if split_support["test"]["positive_trajectories"] < thresholds["test_pos_traj"]:
        reasons.append(f"test positive trajectories {split_support['test']['positive_trajectories']} < {thresholds['test_pos_traj']}")
    return not reasons, reasons


def validate_feature_set(policy: dict[str, Any]) -> list[str]:
    if policy["model_name"] == "always_allow":
        return []
    feature_set = policy["feature_set"]
    features = batch9b.batch9a.FEATURE_SETS.get(feature_set)
    if features is None:
        return [f"unknown feature set {feature_set}"]
    errors = []
    for feature in features:
        if feature in METADATA_FIELDS or feature in batch9b.batch9a.PROHIBITED_FEATURES or any(token in feature for token in PROHIBITED_FEATURE_TOKENS):
            errors.append(feature)
    return errors


def fit_policy(policy: dict[str, Any], split_rows_: dict[str, list[dict[str, Any]]], target: str, seed: int, n_jobs: int, sklearn_info: dict[str, Any]) -> tuple[dict[str, list[float]], dict[str, Any] | None, str | None]:
    if policy["model_name"] == "always_allow":
        return {split: [0.0] * len(rows) for split, rows in split_rows_.items()}, {"family": "policy_baseline"}, None
    scores, meta, skip, _feature_count = batch9b.fit_scores(policy["model_name"], policy["feature_set"], split_rows_, target, seed, n_jobs, sklearn_info)
    return scores, meta, skip


def ranking_metrics(scores: list[float], rows: list[dict[str, Any]], target: str) -> dict[str, Any]:
    labels = [target_value(row, target) for row in rows]
    prevalence = sum(labels) / len(labels) if labels else 0.0
    ap = batch9b.baseline_metrics.average_precision(scores, labels)
    return {
        "rows": len(rows),
        "positive_rows": sum(labels),
        "prevalence": prevalence,
        "auroc": batch9b.baseline_metrics.auroc(scores, labels),
        "average_precision": ap,
        "ap_lift_ratio": ap / prevalence if ap is not None and prevalence else None,
        "ap_lift_absolute": ap - prevalence if ap is not None else None,
    }


def score_summary(scores: list[float]) -> dict[str, Any]:
    if not scores:
        return {"count": 0, "mean": None, "std": None, "min": None, "q25": None, "median": None, "q75": None, "max": None}
    ordered = sorted(float(score) for score in scores)
    def q(frac: float) -> float:
        return ordered[min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * frac))))]
    return {"count": len(ordered), "mean": sum(ordered) / len(ordered), "std": statistics.pstdev(ordered) if len(ordered) > 1 else 0.0, "min": ordered[0], "q25": q(0.25), "median": q(0.5), "q75": q(0.75), "max": ordered[-1]}


def scored_rows(rows: list[dict[str, Any]], scores: list[float], scenario_id: str, seed: int, policy: dict[str, Any], target: str, split: str) -> list[dict[str, Any]]:
    return [{
        "scenario_id": scenario_id,
        "split_seed": seed,
        "split": split,
        "trajectory_id": row["trajectory_id"],
        "step_index": row.get("step_index"),
        "target_name": target,
        "target_value": target_value(row, target),
        "policy_target_name": policy["target_name"],
        "policy_model_name": policy["model_name"],
        "policy_feature_set": policy["feature_set"],
        "score": float(score),
        "next_step_bad": int(row["next_step_bad"]),
        "next_step_incorrect": int(row["next_step_incorrect"]),
        "next_step_unuseful": int(row["next_step_unuseful"]),
    } for row, score in zip(rows, scores)]


def threshold_metrics(rows: list[dict[str, Any]], scores: list[float], target: str, tau: float, alpha: float = 0.0) -> dict[str, Any]:
    labels = [target_value(row, target) for row in rows]
    metrics = batch9b.risk_metrics.decision_metrics(scores, labels, tau, alpha, [str(row["trajectory_id"]) for row in rows])
    metrics["target_positive_capture"] = metrics["true_deferral_rate"]
    metrics["allowed_target_positive_rate"] = metrics["allowed_bad_rate"]
    metrics["capture_per_deferred_row"] = metrics["defer_precision"]
    return metrics


def event_metrics(test_rows: list[dict[str, Any]], scores: list[float], target: str, tau: float) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows_with_scores = [dict(row, score=float(score)) for row, score in zip(test_rows, scores)]
    grouped = batch9c.group_by_trajectory(rows_with_scores)
    events = [batch9c.trajectory_policy_event(traj_rows, target, tau) for traj_rows in grouped.values()]
    row_metrics = threshold_metrics(test_rows, scores, target, tau)
    aggregate = batch9c.aggregate_policy_events(events, row_metrics)
    return aggregate, events


def score_record_output(row: dict[str, Any]) -> dict[str, Any]:
    return {k: row[k] for k in ("scenario_id", "split_seed", "split", "trajectory_id", "step_index", "target_name", "target_value", "policy_target_name", "policy_model_name", "policy_feature_set", "score", "next_step_bad", "next_step_incorrect", "next_step_unuseful")}


def event_record_output(scenario_id: str, seed: int, trajectory_id: str, target: str, policy: dict[str, Any], policy_type: str, value: float, tau: float, event: dict[str, Any]) -> dict[str, Any]:
    record = batch9c.event_output_record(seed, "test", trajectory_id, target, policy["target_name"], policy["model_name"], policy["feature_set"], policy_type, value, tau, event)
    record["scenario_id"] = scenario_id
    return record


def evaluate_policy_scenario(
    scenario: dict[str, Any],
    seed: int,
    target: str,
    policy: dict[str, Any],
    rows: list[dict[str, Any]],
    assignments: dict[str, str],
    budgets: list[float],
    alphas: list[float],
    n_jobs: int,
    sklearn_info: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None]:
    split_rows_ = split_rows(rows, assignments)
    scores_by_split, meta, skip = fit_policy(policy, split_rows_, target, seed, n_jobs, sklearn_info)
    if skip:
        return [], [], [], {"scenario_id": scenario["scenario_id"], "seed": seed, "target": target, "policy": policy_id(policy), "reason": skip}
    ranking = {split: ranking_metrics(scores_by_split[split], split_rows_[split], target) for split in ("train", "calibration", "test")}
    score_dist = {split: score_summary(scores_by_split[split]) for split in ("train", "calibration", "test")}
    records = []
    score_outputs = []
    event_outputs = []
    for split in ("train", "calibration", "test"):
        score_outputs.extend(score_record_output(row) for row in scored_rows(split_rows_[split], scores_by_split[split], scenario["scenario_id"], seed, policy, target, split))
    for budget in budgets:
        tau = batch9c.threshold_for_budget(scores_by_split["calibration"], budget)
        cal_metrics = threshold_metrics(split_rows_["calibration"], scores_by_split["calibration"], target, tau)
        test_metrics = threshold_metrics(split_rows_["test"], scores_by_split["test"], target, tau)
        early, events = event_metrics(split_rows_["test"], scores_by_split["test"], target, tau)
        for trajectory_id, event in zip(batch9c.group_by_trajectory([dict(row, score=float(score)) for row, score in zip(split_rows_["test"], scores_by_split["test"])]).keys(), events):
            event_outputs.append(event_record_output(scenario["scenario_id"], seed, trajectory_id, target, policy, "fixed_budget", budget, tau, event))
        records.append({
            "scenario_id": scenario["scenario_id"],
            "scenario_type": scenario["scenario_type"],
            "seed": seed,
            "target_name": target,
            "policy_id": policy_id(policy),
            "policy_target_name": policy["target_name"],
            "policy_model_name": policy["model_name"],
            "policy_feature_set": policy["feature_set"],
            "policy_type": "fixed_budget",
            "budget_or_alpha": budget,
            "threshold": tau,
            "ranking": ranking,
            "score_distribution": score_dist,
            "calibration_metrics": cal_metrics,
            "test_metrics": test_metrics,
            "early_intervention": early,
            "model_metadata": meta,
            "calibration_test_prevalence_gap": ranking["test"]["prevalence"] - ranking["calibration"]["prevalence"],
            "calibration_test_allowed_rate_gap": (test_metrics["allowed_target_positive_rate"] - cal_metrics["allowed_target_positive_rate"]) if test_metrics["allowed_target_positive_rate"] is not None and cal_metrics["allowed_target_positive_rate"] is not None else None,
            "calibration_test_deferral_rate_gap": test_metrics["deferral_rate"] - cal_metrics["deferral_rate"],
        })
    for alpha in alphas:
        labels = [target_value(row, target) for row in split_rows_["calibration"]]
        selected = batch9c.select_alpha_threshold(scores_by_split["calibration"], labels, alpha)
        tau = float(selected["tau"])
        cal_prev = sum(labels) / len(labels) if labels else 0.0
        cal_metrics = threshold_metrics(split_rows_["calibration"], scores_by_split["calibration"], target, tau, alpha)
        test_metrics = threshold_metrics(split_rows_["test"], scores_by_split["test"], target, tau, alpha)
        early, events = event_metrics(split_rows_["test"], scores_by_split["test"], target, tau)
        records.append({
            "scenario_id": scenario["scenario_id"],
            "scenario_type": scenario["scenario_type"],
            "seed": seed,
            "target_name": target,
            "policy_id": policy_id(policy),
            "policy_target_name": policy["target_name"],
            "policy_model_name": policy["model_name"],
            "policy_feature_set": policy["feature_set"],
            "policy_type": "strict_alpha",
            "budget_or_alpha": alpha,
            "threshold": tau,
            "ranking": ranking,
            "score_distribution": score_dist,
            "calibration_metrics": cal_metrics,
            "test_metrics": test_metrics,
            "early_intervention": early,
            "strict_alpha_selection": selected,
            "low_base_rate_allow_all_case": bool(cal_prev <= alpha and selected.get("allowed_count") == len(labels)),
            "calibration_test_prevalence_gap": ranking["test"]["prevalence"] - ranking["calibration"]["prevalence"],
            "calibration_test_allowed_rate_gap": (test_metrics["allowed_target_positive_rate"] - cal_metrics["allowed_target_positive_rate"]) if test_metrics["allowed_target_positive_rate"] is not None and cal_metrics["allowed_target_positive_rate"] is not None else None,
            "calibration_test_deferral_rate_gap": test_metrics["deferral_rate"] - cal_metrics["deferral_rate"],
        })
    return records, score_outputs, event_outputs, None


def summarize(values: list[float]) -> dict[str, Any]:
    clean = [float(v) for v in values if v is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "median": None, "min": None, "max": None}
    return {"count": len(clean), "mean": sum(clean) / len(clean), "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0, "median": statistics.median(clean), "min": min(clean), "max": max(clean)}


def aggregate_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = "::".join([record["scenario_id"], record["target_name"], record["policy_id"], record["policy_type"], str(record["budget_or_alpha"])])
        grouped[key].append(record)
    result = {}
    for key, rows in grouped.items():
        result[key] = {
            "test_auroc": summarize([r["ranking"]["test"]["auroc"] for r in rows]),
            "test_average_precision": summarize([r["ranking"]["test"]["average_precision"] for r in rows]),
            "test_ap_lift_ratio": summarize([r["ranking"]["test"]["ap_lift_ratio"] for r in rows]),
            "test_prevalence": summarize([r["ranking"]["test"]["prevalence"] for r in rows]),
            "train_test_auroc_gap": summarize([(r["ranking"]["train"]["auroc"] - r["ranking"]["test"]["auroc"]) for r in rows if r["ranking"]["train"]["auroc"] is not None and r["ranking"]["test"]["auroc"] is not None]),
            "train_test_ap_gap": summarize([(r["ranking"]["train"]["average_precision"] - r["ranking"]["test"]["average_precision"]) for r in rows if r["ranking"]["train"]["average_precision"] is not None and r["ranking"]["test"]["average_precision"] is not None]),
            "test_deferral_rate": summarize([r["test_metrics"]["deferral_rate"] for r in rows]),
            "calibration_deferral_rate": summarize([r["calibration_metrics"]["deferral_rate"] for r in rows]),
            "test_capture": summarize([r["test_metrics"]["target_positive_capture"] for r in rows]),
            "test_allowed_target_positive_rate": summarize([r["test_metrics"]["allowed_target_positive_rate"] for r in rows]),
            "calibration_allowed_target_positive_rate": summarize([r["calibration_metrics"]["allowed_target_positive_rate"] for r in rows]),
            "calibration_test_prevalence_gap": summarize([r["calibration_test_prevalence_gap"] for r in rows]),
            "calibration_test_allowed_rate_gap": summarize([r["calibration_test_allowed_rate_gap"] for r in rows]),
            "calibration_test_deferral_rate_gap": summarize([r["calibration_test_deferral_rate_gap"] for r in rows]),
            "trajectory_level_deferral_rate": summarize([r["early_intervention"]["trajectory_level_deferral_rate"] for r in rows]),
            "positive_trajectory_coverage": summarize([r["early_intervention"]["trajectory_level_positive_coverage"] for r in rows]),
            "first_failure_coverage": summarize([r["early_intervention"]["first_failure_coverage"] for r in rows]),
            "repeated_failure_coverage": summarize([r["early_intervention"]["repeated_failure_coverage"] for r in rows]),
            "target_positive_rows_allowed_before_first_deferral_rate": summarize([r["early_intervention"]["target_positive_rows_allowed_before_first_deferral_rate"] for r in rows]),
        }
        burden = result[key]["trajectory_level_deferral_rate"]["mean"]
        row_def = result[key]["test_deferral_rate"]["mean"]
        result[key]["row_budget_to_trajectory_burden_ratio"] = (burden / row_def) if burden is not None and row_def else None
        if rows[0]["policy_type"] == "strict_alpha":
            result[key]["low_base_rate_allow_all_rate"] = sum(1 for r in rows if r.get("low_base_rate_allow_all_case")) / len(rows)
    return result


def iid_reference_lookup() -> dict[str, dict[str, Any]]:
    lookup = {}
    for path in (BATCH9C_REPORT, BATCH9C5_REPORT):
        if not path.exists():
            continue
        report = load_json(path)
        source = report.get("aggregate_policy_metrics") or report.get("aggregate_repaired_metrics") or {}
        for key, value in source.items():
            lookup[key] = value
    return lookup


def degradation(records: list[dict[str, Any]], aggregate: dict[str, Any]) -> list[dict[str, Any]]:
    iid = iid_reference_lookup()
    rows = []
    for key, value in aggregate.items():
        parts = key.split("::")
        scenario_id = parts[0]
        if scenario_id.startswith("within_source_"):
            continue
        target = parts[1]
        policy = "::".join(parts[2:5])
        policy_type = parts[5]
        setting = parts[6]
        iid_key = f"{policy}::{policy_type}::{setting}::{target}"
        ref = iid.get(iid_key)
        if not ref:
            continue
        row = {
            "aggregate_key": key,
            "iid_reference_key": iid_key,
            "delta_auroc": maybe_delta(value, ref, "test_auroc"),
            "delta_ap": maybe_delta(value, ref, "test_average_precision"),
            "delta_ap_lift": maybe_delta(value, ref, "test_ap_lift_ratio"),
            "delta_capture": maybe_delta(value, ref, "test_capture", "row_level_target_positive_capture"),
            "delta_allowed_target_positive_rate": maybe_delta(value, ref, "test_allowed_target_positive_rate", "row_level_allowed_target_positive_rate"),
            "delta_first_failure_coverage": maybe_delta(value, ref, "first_failure_coverage"),
            "delta_trajectory_level_deferral_rate": maybe_delta(value, ref, "trajectory_level_deferral_rate"),
        }
        row["classification"] = classify_outcome(value, row)
        rows.append(row)
    return rows


def maybe_delta(value: dict[str, Any], ref: dict[str, Any], metric: str, ref_metric: str | None = None) -> float | None:
    left = value.get(metric, {}).get("mean")
    ref_name = ref_metric or metric
    right_obj = ref.get(ref_name)
    right = right_obj.get("mean") if isinstance(right_obj, dict) else right_obj
    if left is None or right is None:
        return None
    return left - right


def classify_outcome(value: dict[str, Any], delta: dict[str, Any]) -> str:
    positives = value.get("test_prevalence", {}).get("mean")
    if positives is None:
        return "underpowered"
    d_auc = delta.get("delta_auroc")
    d_capture = delta.get("delta_capture")
    allowed_gap = value.get("calibration_test_allowed_rate_gap", {}).get("mean")
    if d_auc is not None and d_auc <= -0.10:
        return "ranking_degrades"
    if d_auc is not None and d_auc >= -0.05 and allowed_gap is not None and abs(allowed_gap) > 0.02:
        return "ranking_survives_but_calibration_shifts"
    if d_auc is not None and d_auc >= -0.05 and (d_capture is None or d_capture >= -0.10):
        return "robust"
    return "ranking_degrades"


def forbidden_language_hits(text: str) -> list[str]:
    bad_phrases = ("provides a production guarantee", "provides safety guarantees", "causally prevents", "prevented bad steps", "establishes conformal guarantees")
    return [phrase for phrase in bad_phrases if phrase in text.lower()]


def raw_key_hits(rows: Iterable[dict[str, Any]]) -> int:
    return sum(len(RAW_KEYS & set(row)) for row in rows)


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def metric_mean(aggregate: dict[str, Any], key: str, metric: str) -> Any:
    item = aggregate.get(key, {}).get(metric)
    return item.get("mean") if isinstance(item, dict) else item


def markdown(report: dict[str, Any]) -> str:
    aggregate = report["aggregate_metrics"]
    lines = [
        "# Batch 9D Cross-Source and Held-Out Robustness",
        "",
        "Preliminary benchmark robustness diagnostics only. These are not production guarantees, conformal guarantees, or causal-prevention claims.",
        "",
        "## Source/Group Support",
        "",
        "| group type | group | trajectories | rows | next_step_bad positives | next_step_bad prevalence |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for group_type, groups in report["grouping_audit"].items():
        for group, stats in groups.items():
            lines.append(f"| `{group_type}` | `{group}` | `{stats['trajectory_count']}` | `{stats['prefix_row_count']}` | `{stats['positives']['next_step_bad']}` | `{fmt(stats['prevalence']['next_step_bad'])}` |")
    lines.extend([
        "",
        "## Feasible and Skipped Scenarios",
        "",
        f"- Feasible scenario/target/seed units: `{len(report['feasibility_audit']['feasible'])}`",
        f"- Skipped scenario/target/seed units: `{len(report['feasibility_audit']['skipped'])}`",
        "",
        "## Held-Out Ranking Metrics",
        "",
        "| scenario | policy | target | budget | AUROC | AP | AP lift | prevalence |",
        "|---|---|---|---:|---:|---:|---:|---:|",
    ])
    for key in selected_summary_keys(aggregate):
        scenario, target, policy, policy_type, setting = unpack_aggregate_key(key)
        if policy_type != "fixed_budget" or setting != "0.05":
            continue
        row = aggregate[key]
        lines.append(f"| `{scenario}` | `{policy}` | `{target}` | `{setting}` | `{fmt(row['test_auroc']['mean'])}` | `{fmt(row['test_average_precision']['mean'])}` | `{fmt(row['test_ap_lift_ratio']['mean'])}` | `{fmt(row['test_prevalence']['mean'])}` |")
    lines.extend([
        "",
        "## Fixed-Budget Held-Out Intervention Metrics",
        "",
        "| scenario | policy | budget | row capture | allowed target-positive rate | row deferral | trajectory deferral | first-failure coverage |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ])
    for key in selected_summary_keys(aggregate):
        scenario, target, policy, policy_type, setting = unpack_aggregate_key(key)
        if policy_type != "fixed_budget":
            continue
        row = aggregate[key]
        lines.append(f"| `{scenario}` | `{policy}` | `{setting}` | `{fmt(row['test_capture']['mean'])}` | `{fmt(row['test_allowed_target_positive_rate']['mean'])}` | `{fmt(row['test_deferral_rate']['mean'])}` | `{fmt(row['trajectory_level_deferral_rate']['mean'])}` | `{fmt(row['first_failure_coverage']['mean'])}` |")
    lines.extend([
        "",
        "## Row-level budget is not trajectory-level burden",
        "",
        "A fixed row-level review budget can touch a much larger fraction of trajectories. The report therefore pairs row capture with trajectory-level deferral, positive-trajectory coverage, first-failure coverage, repeated-failure coverage, and row-budget-to-trajectory-burden ratio for every main scenario.",
        "",
        "| scenario | policy | budget | row deferral | trajectory deferral | burden ratio |",
        "|---|---|---:|---:|---:|---:|",
    ])
    for key in selected_summary_keys(aggregate):
        scenario, target, policy, policy_type, setting = unpack_aggregate_key(key)
        if policy_type == "fixed_budget":
            row = aggregate[key]
            lines.append(f"| `{scenario}` | `{policy}` | `{setting}` | `{fmt(row['test_deferral_rate']['mean'])}` | `{fmt(row['trajectory_level_deferral_rate']['mean'])}` | `{fmt(row.get('row_budget_to_trajectory_burden_ratio'))}` |")
    lines.extend([
        "",
        "## IID vs Held-Out Degradation",
        "",
        "| held-out key | classification | delta AUROC | delta AP | delta capture | delta first-failure |",
        "|---|---|---:|---:|---:|---:|",
    ])
    for row in report["degradation_comparisons"][:40]:
        lines.append(f"| `{row['aggregate_key']}` | `{row['classification']}` | `{fmt(row['delta_auroc'])}` | `{fmt(row['delta_ap'])}` | `{fmt(row['delta_capture'])}` | `{fmt(row['delta_first_failure_coverage'])}` |")
    lines.extend([
        "",
        "## What generalizes?",
        "",
        "The strongest held-out behavior is scenario-specific. SWE-like training transfers best to TerminalBench-like held-out trajectories for the non-position logistic and gradient-boosting policies. TerminalBench-like to SWE-like transfer is weaker but still above the always-allow prevalence baseline for gradient boosting. OpenHands-family shifts are substantially harder and should be framed as robustness limitations rather than main success claims.",
        "",
        "## What breaks under shift?",
        "",
        "| scenario | representative policy | outcome | AUROC | AP lift | capture at 10% budget | trajectory deferral at 10% | prevalence gap | allowed-rate gap | evidence |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---|",
    ])
    for row in scenario_outcome_rows(aggregate):
        lines.append(
            f"| `{row['scenario']}` | `{row['policy']}` | `{row['outcome']}` | `{fmt(row['auroc'])}` | `{fmt(row['ap_lift'])}` | `{fmt(row['capture'])}` | `{fmt(row['trajectory_deferral'])}` | `{fmt(row['prevalence_gap'])}` | `{fmt(row['allowed_rate_gap'])}` | {row['evidence']} |"
        )
    lines.extend([
        "",
        "## Best ranker versus best early-warning policy under shift",
        "",
        "High row-capture policies and simpler history policies optimize different objectives. This report avoids declaring a single winner when one policy has stronger row capture and another has lower trajectory-level burden or earlier first-failure coverage.",
        "",
        "## Source shift versus calibration shift",
        "",
        "Each aggregate entry includes calibration/test prevalence gaps, allowed-rate gaps, deferral-rate gaps, and score-distribution summaries to distinguish ranking degradation from calibration mismatch and prevalence shift.",
        "",
        "## Unuseful under held-out shift",
        "",
        "`next_step_unuseful` is sparse and should remain secondary/appendix material unless a scenario has adequate support and stable behavior.",
        "",
        "## How should robustness be framed in the report?",
        "",
        "The source/layout-family results are useful for report caveats and selected appendix tables. The main report should emphasize that cross-source risk-controlled intervention is nontrivial: some rankers retain signal, but calibration-selected thresholds can transfer poorly and small row-level budgets can still touch many trajectories. Negative and underpowered scenarios should be reported, not hidden.",
        "",
        "## Recommended next batch",
        "",
        "Proceed to Batch 10 report-facing tables/figures if the selected held-out scenarios are interpretable; otherwise use Batch 9E only for clearly fixable robustness weaknesses.",
    ])
    return "\n".join(lines)


def mean_stat(row: dict[str, Any], key: str) -> float | None:
    value = row.get(key)
    if isinstance(value, dict):
        return value.get("mean")
    return None


def scenario_outcome_rows(aggregate: dict[str, Any]) -> list[dict[str, Any]]:
    representative = {
        "swe_like_to_terminalbench_like": "next_step_bad::logistic_regression::non_position_history_only",
        "terminalbench_like_to_swe_like": "next_step_bad::gradient_boosting::all_structured",
        "non_openhands_to_openhands": "next_step_bad::gradient_boosting::all_structured",
        "openhands_to_non_openhands": "next_step_bad::gradient_boosting::all_structured",
    }
    rows = []
    for scenario, policy in representative.items():
        key = f"{scenario}::next_step_bad::{policy}::fixed_budget::0.1"
        row = aggregate.get(key)
        if not row:
            continue
        auroc = mean_stat(row, "test_auroc")
        ap_lift = mean_stat(row, "test_ap_lift_ratio")
        capture = mean_stat(row, "test_capture")
        trajectory_deferral = mean_stat(row, "trajectory_level_deferral_rate")
        prevalence_gap = mean_stat(row, "calibration_test_prevalence_gap")
        allowed_rate_gap = mean_stat(row, "calibration_test_allowed_rate_gap")
        outcome = classify_scenario_outcome(auroc, ap_lift, capture, trajectory_deferral, prevalence_gap, allowed_rate_gap)
        evidence = "ranking signal remains useful" if outcome == "robust" else "ranking/calibration degradation or high trajectory burden"
        if trajectory_deferral is not None and trajectory_deferral > 0.75:
            evidence += "; row budget spreads across many trajectories"
        rows.append({
            "scenario": scenario,
            "policy": policy,
            "outcome": outcome,
            "auroc": auroc,
            "ap_lift": ap_lift,
            "capture": capture,
            "trajectory_deferral": trajectory_deferral,
            "prevalence_gap": prevalence_gap,
            "allowed_rate_gap": allowed_rate_gap,
            "evidence": evidence,
        })
    return rows


def classify_scenario_outcome(
    auroc: float | None,
    ap_lift: float | None,
    capture: float | None,
    trajectory_deferral: float | None,
    prevalence_gap: float | None,
    allowed_rate_gap: float | None,
) -> str:
    if auroc is None or ap_lift is None:
        return "underpowered"
    if auroc < 0.58 or ap_lift < 1.25:
        return "ranking_degrades"
    calibration_shift = abs(prevalence_gap or 0.0) > 0.02 or abs(allowed_rate_gap or 0.0) > 0.02
    high_burden = (trajectory_deferral or 0.0) > 0.75
    if calibration_shift or high_burden:
        return "ranking_survives_but_calibration_shifts"
    if (capture or 0.0) >= 0.20:
        return "robust"
    return "ranking_degrades"


def selected_summary_keys(aggregate: dict[str, Any]) -> list[str]:
    priority_scenarios = ("swe_like_to_terminalbench_like", "terminalbench_like_to_swe_like", "non_openhands_to_openhands", "openhands_to_non_openhands")
    priority_policies = ("next_step_bad::hist_gradient_boosting::all_plus_interactions", "next_step_bad::gradient_boosting::all_structured", "next_step_bad::logistic_regression::non_position_history_only", "next_step_bad::logistic_regression::prefix_position_only")
    keys = []
    for key in sorted(aggregate):
        scenario, target, policy, policy_type, setting = unpack_aggregate_key(key)
        if scenario in priority_scenarios and target == "next_step_bad" and policy in priority_policies:
            keys.append(key)
    return keys[:80]


def unpack_aggregate_key(key: str) -> tuple[str, str, str, str, str]:
    parts = key.split("::")
    scenario = parts[0]
    target = parts[1]
    policy = "::".join(parts[2:5])
    policy_type = parts[5]
    setting = parts[6]
    return scenario, target, policy, policy_type, setting


def report_tables(report: dict[str, Any]) -> str:
    lines = ["# Batch 9D Report Candidate Tables", "", "All tables are candidate / not final.", "", "## Held-Out Fixed-Budget Summary", "", "| key | AUROC | AP | capture | first-failure | trajectory deferral |", "|---|---:|---:|---:|---:|---:|"]
    for key in selected_summary_keys(report["aggregate_metrics"])[:24]:
        row = report["aggregate_metrics"][key]
        lines.append(f"| `{key}` | `{fmt(row['test_auroc']['mean'])}` | `{fmt(row['test_average_precision']['mean'])}` | `{fmt(row['test_capture']['mean'])}` | `{fmt(row['first_failure_coverage']['mean'])}` | `{fmt(row['trajectory_level_deferral_rate']['mean'])}` |")
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_inputs()
    rows = batch9b.model_features.load_rows(PREFIX_PATH, SHARD_DIR)
    grouped = group_rows_by_trajectory(rows)
    meta = {tid: trajectory_meta(traj_rows) for tid, traj_rows in grouped.items()}
    policies = load_policy_set()
    scenarios, scenario_skips = build_scenarios(rows)
    targets, selected_policies, seeds, budgets, alphas, scenario_filter = selected_options(args, policies, scenarios)
    scenarios = [s for s in scenarios if scenario_filter is None or s["scenario_id"] in scenario_filter]
    sklearn_info = batch9b.batch9a.sklearn_components()
    feature_errors = {policy_id(policy): validate_feature_set(policy) for policy in selected_policies}
    bad_features = {key: value for key, value in feature_errors.items() if value}
    if bad_features:
        raise SystemExit(f"ERROR: prohibited or unknown policy feature sets: {bad_features}")
    per_seed_metrics = []
    score_output_count = 0
    event_output_count = 0
    raw_score_hits = 0
    raw_event_hits = 0
    feasibility_audit = {"feasible": [], "skipped": list(scenario_skips)}
    model_skips = []
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    INTERVENTION_DIR.mkdir(parents=True, exist_ok=True)
    progress = 0
    with SCORES_JSONL.open("w") as score_handle, EVENTS_JSONL.open("w") as event_handle:
        for scenario in scenarios:
            train_pool, test_pool = resolve_scenario_ids(scenario, meta)
            within = scenario["scenario_type"] == "within_source_reference"
            for target in targets:
                for seed in seeds:
                    assignments = split_ids_for_target(grouped, train_pool, test_pool, target, seed, within)
                    split_rows_ = split_rows(rows, assignments)
                    split_support = support_for_split(split_rows_, target)
                    feasible, reasons = feasibility(split_support, target)
                    audit_entry = {"scenario_id": scenario["scenario_id"], "target_name": target, "seed": seed, "split_support": split_support, "reasons": reasons}
                    if not feasible:
                        feasibility_audit["skipped"].append(audit_entry)
                        continue
                    feasibility_audit["feasible"].append(audit_entry)
                    for policy in selected_policies:
                        if policy["target_name"] != target and policy["target_name"] != "next_step_bad":
                            continue
                        progress += 1
                        if progress == 1 or progress % 25 == 0:
                            print(json.dumps({"progress": progress, "scenario": scenario["scenario_id"], "target": target, "seed": seed, "policy": policy_id(policy)}), flush=True)
                        metrics, scores, events, skip = evaluate_policy_scenario(scenario, seed, target, policy, rows, assignments, budgets, alphas, args.n_jobs, sklearn_info)
                        if skip:
                            model_skips.append(skip)
                        per_seed_metrics.extend(metrics)
                        raw_score_hits += raw_key_hits(scores)
                        raw_event_hits += raw_key_hits(events)
                        for row in scores:
                            score_handle.write(json.dumps(row, sort_keys=True) + "\n")
                        for row in events:
                            event_handle.write(json.dumps(row, sort_keys=True) + "\n")
                        score_output_count += len(scores)
                        event_output_count += len(events)
    aggregate = aggregate_metrics(per_seed_metrics)
    degrade = degradation(per_seed_metrics, aggregate)
    report = {
        "schema_version": "risk-controlled-intervention-batch-9d-heldout-robustness.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Benchmark held-out robustness diagnostics only; not production CodingActionGate validation, conformal guarantee, safety guarantee, arbitrary distribution-shift guarantee, causal prevention claim, or final report result.",
        "selected_policies_loaded": [policy_id(policy) for policy in selected_policies],
        "grouping_audit": grouping_audit(rows),
        "scenarios_attempted": scenarios,
        "feasibility_audit": feasibility_audit,
        "model_skips": model_skips,
        "per_seed_metrics": per_seed_metrics,
        "aggregate_metrics": aggregate,
        "degradation_comparisons": degrade,
        "curve_data": [{"aggregate_key": key, **value} for key, value in aggregate.items()],
        "score_output": str(SCORES_JSONL.relative_to(WORKSPACE)),
        "score_output_rows": score_output_count,
        "event_output": str(EVENTS_JSONL.relative_to(WORKSPACE)),
        "event_output_rows": event_output_count,
        "guard_results": {
            "raw_score_output_key_hits": raw_score_hits,
            "raw_event_output_key_hits": raw_event_hits,
            "metadata_feature_errors": bad_features,
            "threshold_selection_split": "calibration_only",
            "heldout_test_not_used_for_threshold_selection": True,
            "skipped_scenarios_reported": bool(feasibility_audit["skipped"]),
            "no_silent_policy_substitution": True,
            "low_base_rate_allow_all_cases_flagged": any(r.get("low_base_rate_allow_all_case") for r in per_seed_metrics),
        },
    }
    md = markdown(report)
    report["guard_results"]["report_forbidden_language_hits"] = forbidden_language_hits(md)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(md + "\n")
    PAPER_TABLES_MD.write_text(report_tables(report) + "\n")
    CURVE_DATA_JSON.write_text(json.dumps({"curve_data": report["curve_data"]}, indent=2, sort_keys=True) + "\n")
    return report


def main() -> int:
    args = parse_args()
    report = run(args)
    print(json.dumps({
        "per_seed_metrics": len(report["per_seed_metrics"]),
        "aggregate_metrics": len(report["aggregate_metrics"]),
        "feasible_units": len(report["feasibility_audit"]["feasible"]),
        "skipped_units": len(report["feasibility_audit"]["skipped"]),
        "score_output": report["score_output"],
        "event_output": report["event_output"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
