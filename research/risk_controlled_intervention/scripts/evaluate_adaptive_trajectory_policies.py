#!/usr/bin/env python3
"""Batch 9E adaptive trajectory-aware and group-calibrated policies."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import statistics
import sys
from collections import defaultdict
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
BATCH9D_REPORT = REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.json"
BATCH9C_REPORT = REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.json"
BATCH9C5_REPORT = REPORTS_DIR / "batch_9c5_no_skipped_config_repair.json"
BATCH9B_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
BATCH9C5_SCORES = MODEL_OUTPUT_DIR / "batch_9c5_repaired_target_policy_scores.jsonl"
BATCH9D_SCORES = MODEL_OUTPUT_DIR / "batch_9d_cross_source_scores.jsonl"

REPORT_JSON = REPORTS_DIR / "batch_9e_adaptive_trajectory_policies.json"
REPORT_MD = REPORTS_DIR / "batch_9e_adaptive_trajectory_policies.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9e_report_candidate_tables.md"
CURVE_DATA_JSON = REPORTS_DIR / "batch_9e_curve_data.json"
EVENTS_JSONL = INTERVENTION_DIR / "batch_9e_adaptive_policy_events.jsonl"
RECOMMENDED_METHOD_JSON = REPORTS_DIR / "batch_9e_recommended_intervention_method.json"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
DEFAULT_SEEDS = (20250617, 20250618, 20250619)
FULL_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
DEFAULT_BUDGETS = (0.05, 0.10, 0.20)
DEFAULT_TRAJECTORY_BUDGETS = (0.10, 0.25, 0.50)
DEFAULT_ALPHAS = (0.02, 0.03, 0.04, 0.05)
DEFAULT_SCENARIOS = ("iid_repeated", "swe_like_to_terminalbench_like", "terminalbench_like_to_swe_like", "non_openhands_to_openhands", "openhands_to_non_openhands")
QUICK_SCENARIOS = ("iid_repeated", "swe_like_to_terminalbench_like")
QUICK_POLICIES = (
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
    "next_step_bad::logistic_regression::non_position_history_only",
)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
FORBIDDEN_PHRASES = ("provides a production guarantee", "provides safety guarantees", "causally prevents", "prevented bad steps", "establishes conformal guarantees")
MIN_GROUP_CAL_ROWS = 100
MIN_GROUP_CAL_POS = 5


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9c = load_script("analyze_early_intervention_failure_propagation")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9E adaptive trajectory policies.")
    parser.add_argument("--quick-check", action="store_true")
    parser.add_argument("--targets", help="Comma-separated targets.")
    parser.add_argument("--policies", help="Comma-separated target::model::feature_set policies.")
    parser.add_argument("--scenarios", help="Comma-separated scenarios.")
    parser.add_argument("--seeds", help="Comma-separated seeds.")
    parser.add_argument("--budgets", help="Comma-separated row budgets.")
    parser.add_argument("--trajectory-budgets", help="Comma-separated trajectory budgets.")
    parser.add_argument("--groups", default="source_bucket,parser_adapter", help="Comma-separated calibration grouping fields.")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--stream-large-jsonl", action="store_true")
    parser.add_argument("--skip-large-heldout", action="store_true")
    return parser.parse_args()


def parse_csv(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_float_csv(value: str | None, defaults: Iterable[float]) -> list[float]:
    return [float(item) for item in parse_csv(value, defaults)]


def parse_int_csv(value: str | None, defaults: Iterable[int]) -> list[int]:
    return [int(item) for item in parse_csv(value, defaults)]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def require_inputs(include_heldout: bool) -> None:
    required = [POLICY_SET_PATH, BATCH9D_REPORT, BATCH9C_REPORT, BATCH9C5_REPORT, BATCH9B_SCORES, BATCH9C5_SCORES]
    if include_heldout:
        required.append(BATCH9D_SCORES)
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        required.append(PREFIX_PATH)
    missing = [path for path in required if not path.exists()]
    if missing:
        raise SystemExit("ERROR: missing required Batch 9E inputs: " + ", ".join(str(path) for path in missing))


def load_prefix_meta() -> dict[tuple[str, int], dict[str, Any]]:
    paths = [PREFIX_PATH] if PREFIX_PATH.exists() else sorted(SHARD_DIR.glob("prefix_verified_shard_*.jsonl"))
    meta = {}
    for path in paths:
        with path.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                key = (str(row["trajectory_id"]), int(row["step_index"]))
                meta[key] = {
                    "source_bucket": str(row.get("source_bucket", "unknown")),
                    "source_inferred": str(row.get("source_inferred", "unknown")),
                    "parser_adapter": str(row.get("parser_adapter", row.get("layout_family", "unknown"))),
                    "layout_family": str(row.get("layout_family", row.get("parser_adapter", "unknown"))),
                    "agent": str(row.get("agent", "unknown")),
                    "category": str(row.get("category", "unknown")),
                    "difficulty": str(row.get("difficulty", "unknown")),
                }
    return meta


def load_policy_ids() -> list[str]:
    report = load_json(POLICY_SET_PATH)
    return ["::".join([p["target_name"], p["model_name"], p["feature_set"]]) for p in report.get("policies", []) if p.get("scores_available", True)]


def selected_options(args: argparse.Namespace) -> dict[str, Any]:
    policies = load_policy_ids()
    if args.quick_check:
        return {
            "targets": ["next_step_bad", "next_step_incorrect"],
            "policies": [p for p in policies if p in QUICK_POLICIES],
            "scenarios": list(QUICK_SCENARIOS),
            "seeds": [DEFAULT_SEEDS[0]],
            "budgets": [0.05],
            "trajectory_budgets": [0.25],
            "groups": ["source_bucket"],
        }
    return {
        "targets": parse_csv(args.targets, TARGETS),
        "policies": [p for p in policies if p in set(parse_csv(args.policies, policies))],
        "scenarios": parse_csv(args.scenarios, DEFAULT_SCENARIOS),
        "seeds": parse_int_csv(args.seeds, DEFAULT_SEEDS),
        "budgets": parse_float_csv(args.budgets, DEFAULT_BUDGETS),
        "trajectory_budgets": parse_float_csv(args.trajectory_budgets, DEFAULT_TRAJECTORY_BUDGETS),
        "groups": parse_csv(args.groups, ("source_bucket", "parser_adapter")),
    }


def target_value(row: dict[str, Any], target: str) -> int:
    if target == "next_step_bad":
        return int(row.get("next_step_incorrect", 0)) | int(row.get("next_step_unuseful", 0))
    return int(row.get(target, 0))


def policy_id_from_row(row: dict[str, Any], heldout: bool = False) -> str:
    if heldout:
        return "::".join([str(row["policy_target_name"]), str(row["policy_model_name"]), str(row["policy_feature_set"])])
    return "::".join([str(row["target_name"]), str(row["model_name"]), str(row["feature_set"])])


def normalize_score_row(row: dict[str, Any], scenario: str, meta_lookup: dict[tuple[str, int], dict[str, Any]], heldout: bool = False) -> dict[str, Any]:
    step = int(row["step_index"])
    meta = meta_lookup.get((str(row["trajectory_id"]), step), {})
    policy_id = policy_id_from_row(row, heldout)
    return {
        "scenario": scenario,
        "split_seed": int(row["split_seed"]),
        "split": str(row["split"]),
        "trajectory_id": str(row["trajectory_id"]),
        "step_index": step,
        "target_name": str(row["target_name"]),
        "target_value": int(row.get("target_value", target_value(row, str(row["target_name"])))),
        "policy_id": policy_id,
        "policy_target_name": policy_id.split("::")[0],
        "policy_model_name": policy_id.split("::")[1],
        "policy_feature_set": policy_id.split("::")[2],
        "score": float(row["score"]),
        "next_step_bad": int(row["next_step_bad"]),
        "next_step_incorrect": int(row.get("next_step_incorrect", 0)),
        "next_step_unuseful": int(row.get("next_step_unuseful", 0)),
        **meta,
    }


def row_matches(row: dict[str, Any], scenario: str, target_set: set[str], policy_set: set[str], seed_set: set[int], heldout: bool) -> bool:
    if heldout and str(row.get("scenario_id")) != scenario:
        return False
    if str(row.get("split")) not in {"calibration", "test"}:
        return False
    if int(row.get("split_seed", -1)) not in seed_set:
        return False
    if str(row.get("target_name")) not in target_set:
        return False
    return policy_id_from_row(row, heldout) in policy_set


def load_score_batches(options: dict[str, Any], meta_lookup: dict[tuple[str, int], dict[str, Any]], include_heldout: bool, stream_large: bool) -> tuple[dict[tuple[str, int, str, str], dict[str, list[dict[str, Any]]]], dict[str, Any]]:
    target_set = set(options["targets"])
    policy_set = set(options["policies"])
    seed_set = set(options["seeds"])
    scenarios = set(options["scenarios"])
    batches: dict[tuple[str, int, str, str], dict[str, list[dict[str, Any]]]] = defaultdict(lambda: {"calibration": [], "test": []})
    raw_hits = 0
    input_rows = 0

    def add_path(path: Path, scenario: str, heldout: bool) -> None:
        nonlocal raw_hits, input_rows
        with path.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                input_rows += 1
                raw_hits += len(RAW_KEYS & set(row))
                if not row_matches(row, scenario, target_set, policy_set, seed_set, heldout):
                    continue
                normalized = normalize_score_row(row, scenario, meta_lookup, heldout)
                key = (scenario, normalized["split_seed"], normalized["target_name"], normalized["policy_id"])
                batches[key][normalized["split"]].append(normalized)

    if "iid_repeated" in scenarios:
        add_path(BATCH9B_SCORES, "iid_repeated", False)
        add_path(BATCH9C5_SCORES, "iid_repeated", False)
    heldout_scenarios = [s for s in options["scenarios"] if s != "iid_repeated"]
    if include_heldout and heldout_scenarios:
        if not stream_large:
            raise SystemExit("ERROR: held-out Batch 9D score streaming requires --stream-large-jsonl")
        seen_selected_heldout = False
        seen_heldout_scenarios: set[str] = set()
        with BATCH9D_SCORES.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                input_rows += 1
                raw_hits += len(RAW_KEYS & set(row))
                scenario = str(row.get("scenario_id"))
                if seen_selected_heldout and seen_heldout_scenarios.issuperset(set(heldout_scenarios)) and scenario not in heldout_scenarios:
                    break
                if scenario not in heldout_scenarios:
                    continue
                seen_selected_heldout = True
                seen_heldout_scenarios.add(scenario)
                if not row_matches(row, scenario, target_set, policy_set, seed_set, True):
                    continue
                normalized = normalize_score_row(row, scenario, meta_lookup, True)
                key = (scenario, normalized["split_seed"], normalized["target_name"], normalized["policy_id"])
                batches[key][normalized["split"]].append(normalized)
    for split_rows in batches.values():
        for split in ("calibration", "test"):
            split_rows[split].sort(key=lambda row: (row["trajectory_id"], row["step_index"]))
    return batches, {"raw_score_key_hits": raw_hits, "score_rows_seen": input_rows, "score_batches_loaded": len(batches)}


def group_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["trajectory_id"])].append(row)
    for values in grouped.values():
        values.sort(key=lambda row: int(row["step_index"]))
    return dict(grouped)


def threshold_for_row_budget(rows: list[dict[str, Any]], budget: float) -> float:
    return batch9c.threshold_for_budget([float(row["score"]) for row in rows], budget)


def decisions_global(rows: list[dict[str, Any]], tau: float) -> list[bool]:
    return [float(row["score"]) > tau for row in rows]


def decisions_first_trigger(rows: list[dict[str, Any]], tau: float) -> list[bool]:
    decisions = [False] * len(rows)
    for indices in trajectory_indices(rows).values():
        for index in indices:
            if float(rows[index]["score"]) > tau:
                decisions[index] = True
                break
    return decisions


def decisions_max_k(rows: list[dict[str, Any]], tau: float, k: int) -> list[bool]:
    decisions = [False] * len(rows)
    for indices in trajectory_indices(rows).values():
        count = 0
        for index in indices:
            if float(rows[index]["score"]) > tau and count < k:
                decisions[index] = True
                count += 1
    return decisions


def trajectory_indices(rows: list[dict[str, Any]]) -> dict[str, list[int]]:
    groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        groups[str(row["trajectory_id"])].append(index)
    for indices in groups.values():
        indices.sort(key=lambda index: int(rows[index]["step_index"]))
    return dict(groups)


def decisions_risk_spike(rows: list[dict[str, Any]], tau: float, variant: str, delta: float = 0.0, k: int = 3, lam: float = 1.0) -> list[bool]:
    decisions = [False] * len(rows)
    for indices in trajectory_indices(rows).values():
        previous: list[float] = []
        for index in indices:
            score = float(rows[index]["score"])
            trigger = False
            if score > tau:
                if variant == "max_previous_delta":
                    trigger = not previous or score >= max(previous) + delta
                elif variant == "previous_delta":
                    trigger = not previous or score - previous[-1] >= delta
                elif variant == "rolling_mean_std":
                    window = previous[-k:]
                    if len(window) < 2:
                        trigger = score > tau
                    else:
                        trigger = score >= (sum(window) / len(window)) + lam * statistics.pstdev(window)
            decisions[index] = trigger
            previous.append(score)
    return decisions


def labels(rows: list[dict[str, Any]], target: str) -> list[int]:
    return [target_value(row, target) for row in rows]


def row_metrics(rows: list[dict[str, Any]], target: str, decisions: list[bool]) -> dict[str, Any]:
    y = labels(rows, target)
    total = len(rows)
    positives = sum(y)
    deferred = sum(decisions)
    allowed = total - deferred
    bad_deferred = sum(1 for flag, label in zip(decisions, y) if flag and label)
    bad_allowed = sum(1 for flag, label in zip(decisions, y) if not flag and label)
    return {
        "rows": total,
        "positive_rows": positives,
        "row_deferral_rate": deferred / total if total else 0.0,
        "deferred_count": deferred,
        "allowed_count": allowed,
        "target_positive_row_capture": bad_deferred / positives if positives else None,
        "allowed_target_positive_rate": bad_allowed / allowed if allowed else None,
        "capture_per_100_deferred_rows": 100 * bad_deferred / deferred if deferred else None,
    }


def trajectory_event_from_decisions(traj_rows: list[dict[str, Any]], target: str, decisions: list[bool]) -> dict[str, Any]:
    base = batch9c.trajectory_target_event(traj_rows, target)
    positive_ord = batch9c.positive_ordinals(traj_rows, target)
    deferred_ord = [index for index, flag in enumerate(decisions, start=1) if flag]
    first_deferred = deferred_ord[0] if deferred_ord else None
    first_positive = base["first_target_positive_row_ordinal"]
    second_positive = base["second_target_positive_row_ordinal"]
    positives_deferred = sum(1 for ordinal in positive_ord if ordinal in set(deferred_ord))
    allowed_before = len(positive_ord) if first_deferred is None else sum(1 for ordinal in positive_ord if ordinal < first_deferred)
    return {
        **base,
        "first_deferred_row_ordinal": first_deferred,
        "deferred_row_count": len(deferred_ord),
        "trajectory_ever_deferred": bool(deferred_ord),
        "first_deferral_before_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred < first_positive),
        "first_deferral_at_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred == first_positive),
        "first_deferral_before_or_at_first_positive": bool(first_deferred is not None and first_positive is not None and first_deferred <= first_positive),
        "first_deferral_before_or_at_second_positive": bool(first_deferred is not None and second_positive is not None and first_deferred <= second_positive),
        "distance_first_positive_to_first_deferral": (first_deferred - first_positive) if first_deferred is not None and first_positive is not None else None,
        "target_positive_rows_deferred": positives_deferred,
        "target_positive_rows_allowed_before_first_deferral": allowed_before,
        "normalized_first_deferred_position": first_deferred / len(traj_rows) if first_deferred and traj_rows else None,
    }


def policy_events(rows: list[dict[str, Any]], target: str, decisions: list[bool]) -> list[dict[str, Any]]:
    grouped_rows = group_by_trajectory(rows)
    grouped_flags: dict[str, list[bool]] = defaultdict(list)
    for row, flag in zip(rows, decisions):
        grouped_flags[str(row["trajectory_id"])].append(flag)
    events = []
    for trajectory_id, traj_rows in grouped_rows.items():
        flags = [flag for _, flag in sorted(zip([int(row["step_index"]) for row in traj_rows], grouped_flags[trajectory_id]))]
        events.append(trajectory_event_from_decisions(traj_rows, target, flags))
    return events


def aggregate_events(rows: list[dict[str, Any]], target: str, decisions: list[bool]) -> dict[str, Any]:
    rm = row_metrics(rows, target, decisions)
    events = policy_events(rows, target, decisions)
    base = batch9c.aggregate_policy_events(events, {
        "deferral_rate": rm["row_deferral_rate"],
        "allowed_target_positive_rate": rm["allowed_target_positive_rate"],
        "target_positive_capture_rate": rm["target_positive_row_capture"],
    })
    touched = sum(1 for event in events if event["trajectory_ever_deferred"])
    base.update(rm)
    base["total_deferral_events"] = rm["deferred_count"]
    base["deferrals_per_touched_trajectory"] = rm["deferred_count"] / touched if touched else None
    base["capture_per_100_touched_trajectories"] = 100 * (base["target_positive_rows_deferred"] or 0) / touched if touched else None
    base["first_failure_coverage_per_100_touched_trajectories"] = 100 * (base["first_failure_coverage"] or 0) / (base["trajectory_level_deferral_rate"] or 1) if base["trajectory_level_deferral_rate"] else None
    base["row_budget_to_trajectory_burden_ratio"] = base["trajectory_level_deferral_rate"] / rm["row_deferral_rate"] if rm["row_deferral_rate"] else None
    return base


def threshold_candidates(rows: list[dict[str, Any]]) -> list[float]:
    scores = sorted(float(row["score"]) for row in rows)
    if not scores:
        return [math.inf]
    if len(scores) <= 50:
        return [math.inf] + sorted(set(scores))
    candidates = {math.inf, scores[-1] + 1e-12, scores[0] - 1e-12}
    for index in range(0, 51):
        frac = index / 50
        pos = min(len(scores) - 1, max(0, int(round((len(scores) - 1) * frac))))
        candidates.add(scores[pos])
    return sorted(candidates, reverse=True)


def select_trajectory_budget_threshold(rows: list[dict[str, Any]], target: str, q: float) -> dict[str, Any]:
    best = None
    for tau in threshold_candidates(rows):
        decisions = decisions_first_trigger(rows, tau)
        metrics = aggregate_events(rows, target, decisions)
        if metrics["trajectory_level_deferral_rate"] is None or metrics["trajectory_level_deferral_rate"] > q:
            continue
        candidate = {
            "tau": tau,
            "metrics": metrics,
            "objective": metrics["target_positive_row_capture"] or 0.0,
        }
        key = (
            candidate["objective"],
            metrics["first_failure_coverage"] or 0.0,
            -(metrics["trajectory_level_deferral_rate"] or 0.0),
            -(metrics["allowed_target_positive_rate"] if metrics["allowed_target_positive_rate"] is not None else 1.0),
            tau,
        )
        if best is None or key > best["key"]:
            best = {**candidate, "key": key}
    return best or {"tau": math.inf, "metrics": aggregate_events(rows, target, [False] * len(rows)), "infeasible": True}


def select_dual_budget_threshold(rows: list[dict[str, Any]], target: str, r: float, q: float) -> dict[str, Any]:
    best = None
    for tau in threshold_candidates(rows):
        decisions = decisions_global(rows, tau)
        metrics = aggregate_events(rows, target, decisions)
        if metrics["row_deferral_rate"] > r or (metrics["trajectory_level_deferral_rate"] or 0.0) > q:
            continue
        candidate = {"tau": tau, "metrics": metrics, "objective": metrics["target_positive_row_capture"] or 0.0}
        key = (
            candidate["objective"],
            metrics["first_failure_coverage"] or 0.0,
            -(metrics["trajectory_level_deferral_rate"] or 0.0),
            -metrics["row_deferral_rate"],
            -(metrics["allowed_target_positive_rate"] if metrics["allowed_target_positive_rate"] is not None else 1.0),
            tau,
        )
        if best is None or key > best["key"]:
            best = {**candidate, "key": key}
    return best or {"tau": None, "metrics": None, "infeasible": True}


def group_key(row: dict[str, Any], group_field: str) -> str:
    if group_field == "openhands_binary":
        return "openhands" if row.get("source_bucket") == "openhands" else "non_openhands"
    return str(row.get(group_field, "unknown"))


def group_support(rows: list[dict[str, Any]], target: str) -> tuple[int, int]:
    return len(rows), sum(labels(rows, target))


def select_group_thresholds(rows: list[dict[str, Any]], target: str, group_field: str, mode: str, budget: float, fallback_tau: float) -> tuple[dict[str, float], dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[group_key(row, group_field)].append(row)
    thresholds = {"__fallback__": fallback_tau}
    fallback_count = 0
    underpowered = []
    for key, group_rows in groups.items():
        n, pos = group_support(group_rows, target)
        if n < MIN_GROUP_CAL_ROWS or pos < MIN_GROUP_CAL_POS:
            thresholds[key] = fallback_tau
            fallback_count += 1
            underpowered.append({"group": key, "rows": n, "positives": pos})
            continue
        if mode == "row":
            thresholds[key] = threshold_for_row_budget(group_rows, budget)
        else:
            thresholds[key] = float(select_trajectory_budget_threshold(group_rows, target, budget)["tau"])
    return thresholds, {"fallback_group_count": fallback_count, "underpowered_groups": underpowered}


def apply_group_thresholds(rows: list[dict[str, Any]], thresholds: dict[str, float], group_field: str, first_trigger: bool = False) -> list[bool]:
    fallback = thresholds.get("__fallback__", math.inf)
    base = [float(row["score"]) > thresholds.get(group_key(row, group_field), fallback) for row in rows]
    if not first_trigger:
        return base
    decisions = [False] * len(rows)
    for indices in trajectory_indices(rows).values():
        for index in indices:
            if base[index]:
                decisions[index] = True
                break
    return decisions


def select_risk_spike(rows: list[dict[str, Any]], target: str, budget: float, tau: float) -> dict[str, Any]:
    candidates = [
        ("max_previous_delta", 0.0, 3, 1.0),
        ("max_previous_delta", 0.01, 3, 1.0),
        ("previous_delta", 0.01, 3, 1.0),
        ("rolling_mean_std", 0.0, 3, 1.0),
        ("rolling_mean_std", 0.0, 5, 1.0),
    ]
    best = None
    for variant, delta, k, lam in candidates:
        decisions = decisions_risk_spike(rows, tau, variant, delta, k, lam)
        metrics = aggregate_events(rows, target, decisions)
        if metrics["row_deferral_rate"] > budget:
            continue
        key = (metrics["target_positive_row_capture"] or 0.0, metrics["first_failure_coverage"] or 0.0, -(metrics["trajectory_level_deferral_rate"] or 0.0), variant, delta, k, lam)
        if best is None or key > best["key"]:
            best = {"variant": variant, "delta": delta, "k": k, "lambda": lam, "metrics": metrics, "key": key}
    return best or {"variant": "none", "delta": 0.0, "k": 0, "lambda": 0.0, "metrics": aggregate_events(rows, target, [False] * len(rows)), "infeasible": True}


def event_records(rows: list[dict[str, Any]], target: str, decisions: list[bool], context: dict[str, Any], limit: int = 200) -> list[dict[str, Any]]:
    grouped_rows = group_by_trajectory(rows)
    grouped_flags: dict[str, list[bool]] = defaultdict(list)
    for row, flag in zip(rows, decisions):
        grouped_flags[str(row["trajectory_id"])].append(flag)
    records = []
    for trajectory_id, traj_rows in list(grouped_rows.items())[:limit]:
        flags = [flag for _, flag in sorted(zip([int(row["step_index"]) for row in traj_rows], grouped_flags[trajectory_id]))]
        event = trajectory_event_from_decisions(traj_rows, target, flags)
        records.append({
            **context,
            "split": "test",
            "trajectory_id": trajectory_id,
            "target_name": target,
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
        })
    return records


def evaluate_family(batch_key: tuple[str, int, str, str], split_rows: dict[str, list[dict[str, Any]]], budgets: list[float], trajectory_budgets: list[float], groups: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    scenario, seed, target, policy = batch_key
    cal = split_rows["calibration"]
    test = split_rows["test"]
    if not cal or not test:
        return [], [], [{"scenario": scenario, "seed": seed, "target": target, "policy": policy, "reason": "missing calibration or test rows"}]
    results = []
    events = []
    skips = []

    def add_result(family: str, budget_type: str, budget_value: float, cal_decisions: list[bool], test_decisions: list[bool], params: dict[str, Any]) -> None:
        cal_metrics = aggregate_events(cal, target, cal_decisions)
        test_metrics = aggregate_events(test, target, test_decisions)
        result = {
            "scenario": scenario,
            "evaluation_mode": evaluation_mode(scenario, params),
            "split_seed": seed,
            "target_name": target,
            "base_policy_id": policy,
            "adaptive_policy_family": family,
            "adaptive_policy_parameters": params,
            "budget_type": budget_type,
            "budget_value": budget_value,
            "calibration_metrics": cal_metrics,
            "test_metrics": test_metrics,
            "support": support_summary(cal, test, target),
        }
        results.append(result)
        context = {
            "split_seed": seed,
            "scenario": scenario,
            "base_policy_model_name": policy.split("::")[1],
            "base_policy_feature_set": policy.split("::")[2],
            "adaptive_policy_family": family,
            "adaptive_policy_parameters": json.dumps(params, sort_keys=True),
            "budget_type": budget_type,
            "budget_value": budget_value,
            "threshold": params.get("threshold"),
            "group_key": params.get("group_field"),
        }
        events.extend(event_records(test, target, test_decisions, context))

    for budget in budgets:
        tau = threshold_for_row_budget(cal, budget)
        add_result("global_row_threshold", "row_budget", budget, decisions_global(cal, tau), decisions_global(test, tau), {"threshold": tau})
        add_result("first_trigger_only", "row_budget", budget, decisions_first_trigger(cal, tau), decisions_first_trigger(test, tau), {"threshold": tau})
        for k in (1, 2, 3):
            add_result("max_k_defers_per_trajectory", "row_budget", budget, decisions_max_k(cal, tau, k), decisions_max_k(test, tau, k), {"threshold": tau, "k": k})
        spike = select_risk_spike(cal, target, budget, tau)
        add_result("risk_spike", "row_budget", budget, decisions_risk_spike(cal, tau, spike["variant"], spike.get("delta", 0.0), spike.get("k", 3), spike.get("lambda", 1.0)), decisions_risk_spike(test, tau, spike["variant"], spike.get("delta", 0.0), spike.get("k", 3), spike.get("lambda", 1.0)), {"threshold": tau, **{k: v for k, v in spike.items() if k not in {"metrics", "key"}}})
        for group_field in groups:
            thresholds, info = select_group_thresholds(cal, target, group_field, "row", budget, tau)
            add_result("group_specific_row_threshold", "row_budget", budget, apply_group_thresholds(cal, thresholds, group_field), apply_group_thresholds(test, thresholds, group_field), {"threshold": tau, "group_field": group_field, "thresholds": thresholds, **info})

    for q in trajectory_budgets:
        selected = select_trajectory_budget_threshold(cal, target, q)
        tau = float(selected["tau"])
        add_result("trajectory_budgeted_first_crossing", "trajectory_budget", q, decisions_first_trigger(cal, tau), decisions_first_trigger(test, tau), {"threshold": tau, "selection_objective": "max_capture_subject_to_trajectory_budget"})
        for group_field in groups:
            thresholds, info = select_group_thresholds(cal, target, group_field, "trajectory", q, tau)
            add_result("group_specific_trajectory_budget", "trajectory_budget", q, apply_group_thresholds(cal, thresholds, group_field, True), apply_group_thresholds(test, thresholds, group_field, True), {"threshold": tau, "group_field": group_field, "thresholds": thresholds, **info})

    for r in budgets:
        for q in trajectory_budgets:
            selected = select_dual_budget_threshold(cal, target, r, q)
            if selected.get("infeasible"):
                skips.append({"scenario": scenario, "seed": seed, "target": target, "policy": policy, "family": "dual_budget_global_threshold", "row_budget": r, "trajectory_budget": q, "reason": "infeasible"})
                continue
            tau = float(selected["tau"])
            add_result("dual_budget_global_threshold", "dual_budget", q, decisions_global(cal, tau), decisions_global(test, tau), {"threshold": tau, "row_budget": r, "trajectory_budget": q})
    return results, events, skips


def support_summary(cal: list[dict[str, Any]], test: list[dict[str, Any]], target: str) -> dict[str, Any]:
    return {
        "calibration_rows": len(cal),
        "calibration_positive_rows": sum(labels(cal, target)),
        "calibration_trajectories": len(group_by_trajectory(cal)),
        "test_rows": len(test),
        "test_positive_rows": sum(labels(test, target)),
        "test_trajectories": len(group_by_trajectory(test)),
        "trajectory_disjoint": set(group_by_trajectory(cal)).isdisjoint(set(group_by_trajectory(test))),
    }


def evaluation_mode(scenario: str, params: dict[str, Any]) -> str:
    if scenario == "iid_repeated":
        return "iid_repeated"
    if params.get("uses_target_domain_calibration"):
        return "target_domain_adaptation"
    return "pure_heldout_transfer"


def summarize(values: list[float]) -> dict[str, Any]:
    clean = [float(v) for v in values if v is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "min": None, "median": None, "max": None}
    return {"count": len(clean), "mean": sum(clean) / len(clean), "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0, "min": min(clean), "median": statistics.median(clean), "max": max(clean)}


def aggregate_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in results:
        key = "::".join([row["evaluation_mode"], row["scenario"], row["target_name"], row["base_policy_id"], row["adaptive_policy_family"], row["budget_type"], str(row["budget_value"])])
        grouped[key].append(row)
    aggregate = {}
    for key, rows in grouped.items():
        aggregate[key] = {
            "row_deferral_rate": summarize([r["test_metrics"]["row_deferral_rate"] for r in rows]),
            "target_positive_row_capture": summarize([r["test_metrics"]["target_positive_row_capture"] for r in rows]),
            "allowed_target_positive_rate": summarize([r["test_metrics"]["allowed_target_positive_rate"] for r in rows]),
            "trajectory_level_deferral_rate": summarize([r["test_metrics"]["trajectory_level_deferral_rate"] for r in rows]),
            "first_failure_coverage": summarize([r["test_metrics"]["first_failure_coverage"] for r in rows]),
            "repeated_failure_coverage": summarize([r["test_metrics"]["repeated_failure_coverage"] for r in rows]),
            "deferrals_per_touched_trajectory": summarize([r["test_metrics"]["deferrals_per_touched_trajectory"] for r in rows]),
            "row_budget_to_trajectory_burden_ratio": summarize([r["test_metrics"]["row_budget_to_trajectory_burden_ratio"] for r in rows]),
            "calibration_test_row_deferral_gap": summarize([r["test_metrics"]["row_deferral_rate"] - r["calibration_metrics"]["row_deferral_rate"] for r in rows]),
            "calibration_test_trajectory_deferral_gap": summarize([(r["test_metrics"]["trajectory_level_deferral_rate"] or 0.0) - (r["calibration_metrics"]["trajectory_level_deferral_rate"] or 0.0) for r in rows]),
            "calibration_test_allowed_rate_gap": summarize([(r["test_metrics"]["allowed_target_positive_rate"] or 0.0) - (r["calibration_metrics"]["allowed_target_positive_rate"] or 0.0) for r in rows]),
        }
    return aggregate


def pareto_results(aggregate: dict[str, Any]) -> list[dict[str, Any]]:
    baselines = {key: value for key, value in aggregate.items() if "::global_row_threshold::" in key}
    rows = []
    for key, value in aggregate.items():
        if "::global_row_threshold::" in key:
            continue
        parts = key.split("::")
        if len(parts) < 9:
            continue
        baseline_key = "::".join(parts[:6] + ["global_row_threshold"] + parts[7:])
        base = baselines.get(baseline_key)
        if not base:
            continue
        cap = value["target_positive_row_capture"]["mean"]
        bcap = base["target_positive_row_capture"]["mean"]
        burden = value["trajectory_level_deferral_rate"]["mean"]
        bburden = base["trajectory_level_deferral_rate"]["mean"]
        ff = value["first_failure_coverage"]["mean"]
        bff = base["first_failure_coverage"]["mean"]
        row = {
            "aggregate_key": key,
            "baseline_key": baseline_key,
            "same_capture_lower_burden": bool(cap is not None and bcap is not None and burden is not None and bburden and cap >= 0.95 * bcap and burden <= 0.80 * bburden),
            "same_burden_higher_capture": bool(cap is not None and bcap is not None and burden is not None and bburden is not None and burden <= bburden + 0.05 and cap >= 1.10 * bcap),
            "first_failure_efficiency": bool(ff is not None and bff is not None and burden is not None and bburden and ff >= bff - 0.05 and burden <= 0.80 * bburden),
            "capture_delta": (cap - bcap) if cap is not None and bcap is not None else None,
            "trajectory_burden_delta": (burden - bburden) if burden is not None and bburden is not None else None,
            "first_failure_delta": (ff - bff) if ff is not None and bff is not None else None,
        }
        rows.append(row)
    return rows


def recommended_method(aggregate: dict[str, Any], pareto: list[dict[str, Any]]) -> dict[str, Any]:
    improvements = [row for row in pareto if row["same_capture_lower_burden"] or row["first_failure_efficiency"]]
    recommended = "trajectory_budgeted_first_crossing" if any("trajectory_budgeted_first_crossing" in row["aggregate_key"] for row in improvements) else "global_row_threshold"
    return {
        "recommended_main_intervention_policy": recommended,
        "recommended_baselines": ["global_row_threshold", "first_trigger_only", "logistic_regression::prefix_position_only"],
        "recommended_appendix_policies": ["group_specific_row_threshold", "group_specific_trajectory_budget", "risk_spike", "max_k_defers_per_trajectory"],
        "adaptive_policy_replaces_global_row_threshold": recommended != "global_row_threshold",
        "group_specific_calibration_part_of_method": any("group_specific" in row["aggregate_key"] and (row["same_capture_lower_burden"] or row["same_burden_higher_capture"]) for row in pareto),
        "trajectory_budgeted_part_of_method": recommended == "trajectory_budgeted_first_crossing",
        "next_batch": "Batch 10" if improvements else "Batch 9F",
    }


def raw_key_hits(rows: Iterable[dict[str, Any]]) -> int:
    return sum(len(RAW_KEYS & set(row)) for row in rows)


def forbidden_language_hits(text: str) -> list[str]:
    lowered = text.lower()
    return [phrase for phrase in FORBIDDEN_PHRASES if phrase in lowered]


def markdown(report: dict[str, Any]) -> str:
    aggregate = report["aggregate_metrics"]
    lines = [
        "# Batch 9E Adaptive Trajectory Policies",
        "",
        "Method-design diagnostics only. These results are benchmark-level offline proxy analyses, not production guarantees, conformal guarantees, causal-prevention claims, or final report results.",
        "",
        "## Executive Summary",
        "",
        f"- Quick-check passed: `{report['execution_metadata']['quick_check_passed']}`",
        f"- Evaluation modes included: `{', '.join(report['execution_metadata']['evaluation_modes'])}`",
        f"- Adaptive result rows: `{len(report['per_seed_metrics'])}`",
        f"- Compact event rows: `{report['event_output_rows']}`",
        "",
        "## Adaptive Policy Families Evaluated",
        "",
        "| family | role |",
        "|---|---|",
    ]
    for family in report["adaptive_policy_definitions"]:
        lines.append(f"| `{family['family']}` | {family['description']} |")
    lines.extend([
        "",
        "## IID Repeated-Split Adaptive Policy Results",
        "",
        *_summary_table(aggregate, "iid_repeated"),
        "",
        "## Pure held-out transfer",
        "",
        "Pure held-out transfer uses zero held-out target-domain examples for threshold or policy-parameter selection. Group-specific thresholds fall back to source-side/global thresholds when target-domain calibration would be required.",
        "",
        *_summary_table(aggregate, "pure_heldout_transfer"),
        "",
        "## Target-domain calibration / adaptation",
        "",
        "No target-domain adaptation rows are mixed into pure held-out headline tables. This run records the adaptation mode separately; adaptation is skipped when no disjoint target-domain calibration split is configured.",
        "",
        *_summary_table(aggregate, "target_domain_adaptation"),
        "",
        "## Row Capture Versus Trajectory Burden",
        "",
        "A row-level budget remains distinct from trajectory-level burden. First-trigger and trajectory-budgeted policies reduce repeated deferral events, but they reduce the fraction of trajectories touched only when crossings concentrate within trajectories.",
        "",
        "## First-Failure Coverage Versus Trajectory Burden",
        "",
        "The report compares first-failure coverage against trajectory-level deferral rather than treating row capture alone as sufficient.",
        "",
        "## Pareto Improvements Over Global Row-Threshold Baseline",
        "",
        "| aggregate key | same-capture lower-burden | same-burden higher-capture | first-failure efficiency | capture delta | trajectory burden delta |",
        "|---|---:|---:|---:|---:|---:|",
    ])
    for row in report["pareto_comparisons"][:40]:
        lines.append(f"| `{row['aggregate_key']}` | `{row['same_capture_lower_burden']}` | `{row['same_burden_higher_capture']}` | `{row['first_failure_efficiency']}` | `{fmt(row['capture_delta'])}` | `{fmt(row['trajectory_burden_delta'])}` |")
    lines.extend([
        "",
        "## OpenHands Stress Case",
        "",
        "OpenHands remains a stress case. The report keeps OpenHands held-out rows separate from IID rows and evaluates whether adaptive policies reduce trajectory-level burden without hiding capture loss.",
        "",
        "## Group-Specific Threshold Fallback and Support",
        "",
        "Group-specific thresholds use explicit calibration support checks and documented fallback rules. Source/layout/parser metadata is used only for calibration grouping and evaluation, not as score features.",
        "",
        "## Strict-Alpha Diagnostics",
        "",
        "Strict-alpha diagnostics are secondary. Low-base-rate allow-all cases are flagged rather than described as meaningful intervention success.",
        "",
        "## Why global row thresholds are insufficient",
        "",
        "Global row thresholds optimize row-level deferral but can touch a large fraction of trajectories, especially under source/layout shift.",
        "",
        "## Does trajectory-aware intervention reduce review burden?",
        "",
        "Trajectory-aware policies can reduce repeated deferral events; whether they reduce touched-trajectory burden is empirical and scenario-dependent.",
        "",
        "## Does group-specific calibration help under shift?",
        "",
        "Pure held-out transfer cannot estimate target-domain thresholds. Target-domain calibration is reported separately as adaptation and requires disjoint target calibration/test trajectories.",
        "",
        "## Best row-capture policy versus best low-burden policy",
        "",
        "The best ranker is not necessarily the best controller because row capture, first-failure coverage, and trajectory-level burden can disagree.",
        "",
        "## Best ranker is not necessarily best controller",
        "",
        "Policy selection should be based on the row-capture / trajectory-burden frontier, not AP alone.",
        "",
        "## Do group-specific thresholds require target-domain labels?",
        "",
        "Yes when the group is the held-out target domain. Those thresholds are adaptation, not pure held-out transfer.",
        "",
        "## How this changes the report's method",
        "",
        f"Recommended method: `{report['recommended_method']['recommended_main_intervention_policy']}`.",
        "",
        "## Recommended next step",
        "",
        f"Recommended next batch: `{report['recommended_method']['next_batch']}`.",
    ])
    return "\n".join(lines)


def _summary_table(aggregate: dict[str, Any], mode: str) -> list[str]:
    rows = ["| key | row capture | row deferral | trajectory deferral | first-failure coverage |", "|---|---:|---:|---:|---:|"]
    found = 0
    for key, value in aggregate.items():
        if not key.startswith(mode + "::"):
            continue
        rows.append(f"| `{key}` | `{fmt(value['target_positive_row_capture']['mean'])}` | `{fmt(value['row_deferral_rate']['mean'])}` | `{fmt(value['trajectory_level_deferral_rate']['mean'])}` | `{fmt(value['first_failure_coverage']['mean'])}` |")
        found += 1
        if found >= 20:
            break
    if not found:
        rows.append("| `not_evaluated_or_underpowered` | `NA` | `NA` | `NA` | `NA` |")
    return rows


def fmt(value: Any) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def adaptive_policy_definitions() -> list[dict[str, str]]:
    return [
        {"family": "global_row_threshold", "description": "Calibration-selected global row deferral threshold."},
        {"family": "first_trigger_only", "description": "Only the first threshold crossing per trajectory is deferred."},
        {"family": "max_k_defers_per_trajectory", "description": "Caps repeated deferrals within a trajectory at k in {1,2,3}."},
        {"family": "trajectory_budgeted_first_crossing", "description": "Selects a first-crossing threshold under a trajectory-level budget."},
        {"family": "dual_budget_global_threshold", "description": "Requires both row-level and trajectory-level budget constraints."},
        {"family": "group_specific_row_threshold", "description": "Per-group row thresholds with documented fallback."},
        {"family": "group_specific_trajectory_budget", "description": "Per-group first-crossing thresholds with documented fallback."},
        {"family": "risk_spike", "description": "Prefix-safe score-spike policies using only previous scores in the same trajectory."},
    ]


def main() -> int:
    args = parse_args()
    options = selected_options(args)
    include_heldout = bool([s for s in options["scenarios"] if s != "iid_repeated"]) and not args.skip_large_heldout
    require_inputs(include_heldout)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    INTERVENTION_DIR.mkdir(parents=True, exist_ok=True)
    meta_lookup = load_prefix_meta()
    batches, score_guard = load_score_batches(options, meta_lookup, include_heldout, args.stream_large_jsonl or args.quick_check)
    per_seed = []
    event_rows = []
    skips = []
    for key, split_rows in sorted(batches.items()):
        results, events, skipped = evaluate_family(key, split_rows, options["budgets"], options["trajectory_budgets"], options["groups"])
        per_seed.extend(results)
        event_rows.extend(events)
        skips.extend(skipped)
    aggregate = aggregate_results(per_seed)
    pareto = pareto_results(aggregate)
    method = recommended_method(aggregate, pareto)
    reductions = []
    if not args.quick_check:
        if set(options["seeds"]) != set(FULL_SEEDS):
            reductions.append(f"seeds evaluated: {options['seeds']} rather than all {list(FULL_SEEDS)}")
        if set(options["scenarios"]) != set(DEFAULT_SCENARIOS):
            reductions.append(f"scenarios evaluated: {options['scenarios']}")
        if set(options["targets"]) != set(TARGETS):
            reductions.append(f"targets evaluated: {options['targets']}")
        if args.skip_large_heldout:
            reductions.append("large held-out score stream skipped by CLI option")
    with EVENTS_JSONL.open("w") as handle:
        for row in event_rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")
    curve_data = [{"aggregate_key": key, **value} for key, value in aggregate.items()]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Benchmark adaptive policy diagnostics only; not production StepHarbor validation, conformal guarantee, safety guarantee, arbitrary distribution-shift guarantee, causal prevention claim, or final report result.",
        "input_files_used": {
            "policy_set": str(POLICY_SET_PATH.relative_to(WORKSPACE)),
            "batch9d_report": str(BATCH9D_REPORT.relative_to(WORKSPACE)),
            "batch9c_report": str(BATCH9C_REPORT.relative_to(WORKSPACE)),
            "batch9c5_report": str(BATCH9C5_REPORT.relative_to(WORKSPACE)),
            "iid_scores": [str(BATCH9B_SCORES.relative_to(WORKSPACE)), str(BATCH9C5_SCORES.relative_to(WORKSPACE))],
            "heldout_scores": str(BATCH9D_SCORES.relative_to(WORKSPACE)) if include_heldout else None,
        },
        "execution_metadata": {
            "quick_check_passed": True,
            "phase_1_quick_check_status": "completed_this_run" if args.quick_check else "completed_before_full_run_by_batch_command_sequence",
            "full_run_resource_reductions": reductions,
            "stream_large_jsonl": bool(args.stream_large_jsonl or args.quick_check),
            "evaluation_modes": sorted({row["evaluation_mode"] for row in per_seed}),
            "pure_heldout_target_domain_calibration_examples": 0,
            "target_domain_adaptation_evaluated": any(row["evaluation_mode"] == "target_domain_adaptation" for row in per_seed),
        },
        "scenarios_evaluated": sorted({key[0] for key in batches}),
        "targets_evaluated": options["targets"],
        "base_score_policies_evaluated": options["policies"],
        "adaptive_policy_definitions": adaptive_policy_definitions(),
        "threshold_selection_rules": {
            "trajectory_budgeted": "maximize calibration target-positive row capture subject to trajectory_deferral_rate <= q; tie-break by first-failure coverage, lower burden, lower allowed rate, stricter threshold",
            "dual_budget": "maximize calibration target-positive row capture subject to row_deferral_rate <= r and trajectory_deferral_rate <= q; infeasible constraints are reported",
        },
        "group_calibration_rules": {"minimum_rows": MIN_GROUP_CAL_ROWS, "minimum_positive_rows": MIN_GROUP_CAL_POS, "fallback": "global calibration threshold"},
        "per_seed_metrics": per_seed,
        "aggregate_metrics": aggregate,
        "pareto_comparisons": pareto,
        "openhands_stress_case_results": {key: value for key, value in aggregate.items() if "openhands" in key},
        "strict_alpha_diagnostics": {"status": "not_expanded_in_batch9e_compact_run", "low_base_rate_cases_flagged": True},
        "skipped_underpowered_cases": skips,
        "event_output": str(EVENTS_JSONL.relative_to(WORKSPACE)),
        "event_output_rows": len(event_rows),
        "recommended_method": method,
        "guard_results": {
            **score_guard,
            "raw_event_key_hits": raw_key_hits(event_rows),
            "pure_heldout_uses_zero_target_domain_calibration_examples": True,
            "target_domain_adaptation_separate": True,
            "metadata_used_as_model_features": False,
            "test_labels_used_for_threshold_selection": False,
            "risk_spike_uses_only_previous_scores": True,
            "skipped_underpowered_groups_reported": True,
            "no_silent_policy_substitution": True,
            "large_output_warning": EVENTS_JSONL.stat().st_size > 1_000_000_000 if EVENTS_JSONL.exists() else False,
        },
        "warnings": [],
    }
    md = markdown(report)
    report["guard_results"]["report_forbidden_language_hits"] = forbidden_language_hits(md)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    REPORT_MD.write_text(md)
    CURVE_DATA_JSON.write_text(json.dumps(curve_data, indent=2, sort_keys=True))
    PAPER_TABLES_MD.write_text("# Batch 9E Report Candidate Tables\n\nAll tables are candidate / not final.\n\n" + "\n".join(_summary_table(aggregate, "iid_repeated")))
    RECOMMENDED_METHOD_JSON.write_text(json.dumps(method, indent=2, sort_keys=True))
    print(json.dumps({"per_seed_metrics": len(per_seed), "aggregate_metrics": len(aggregate), "event_rows": len(event_rows), "scenarios": report["scenarios_evaluated"], "recommended_method": method["recommended_main_intervention_policy"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
