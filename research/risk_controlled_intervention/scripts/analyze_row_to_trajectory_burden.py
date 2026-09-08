#!/usr/bin/env python3
"""Batch 9H row-to-trajectory burden robustness audit."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPORTS_DIR = WORKSPACE / "reports"

PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SCORE_PATH = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
HEURISTIC_SCORE_PATH = MODEL_OUTPUT_DIR / "heuristic_scores.jsonl"

REPORT_JSON = REPORTS_DIR / "batch_9h_row_to_trajectory_burden_audit.json"
REPORT_MD = REPORTS_DIR / "batch_9h_row_to_trajectory_burden_audit.md"
CURVES_CSV = REPORTS_DIR / "batch_9h_row_to_trajectory_burden_curves.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9h_row_to_trajectory_burden_by_group.csv"
ORACLE_RANDOM_CSV = REPORTS_DIR / "batch_9h_oracle_random_burden_diagnostics.csv"
LENGTH_ADJUSTED_CSV = REPORTS_DIR / "batch_9h_length_adjusted_burden.csv"

TARGET_NAME = "next_step_bad"
ROW_BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20)
TRAJECTORY_BUDGETS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)
DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
DEFAULT_POLICIES = (
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
    "next_step_bad::random_forest::all_structured",
    "next_step_bad::gradient_boosting::all_structured",
    "next_step_bad::logistic_regression::all_structured",
    "next_step_bad::logistic_regression::non_position_history_only",
    "next_step_bad::logistic_regression::prefix_position_only",
)
HEURISTIC_POLICIES = {
    "long_prefix": "long_prefix_heuristic",
    "observation_error_keyword": "observation_error_keyword_heuristic",
    "timeout_or_failure": "timeout_or_failure_heuristic",
    "repeated_action_or_observation": "repeated_action_or_observation_heuristic",
}
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "terminal_output"}


def parse_csv_arg(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_float_arg(value: str | None, defaults: Iterable[float]) -> list[float]:
    return [float(item) for item in parse_csv_arg(value, defaults)]


def parse_int_arg(value: str | None, defaults: Iterable[int]) -> list[int]:
    return [int(item) for item in parse_csv_arg(value, defaults)]


def stable_unit(value: str) -> float:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) / float(16**12 - 1)


def source_group(row: dict[str, Any]) -> str:
    source = str(row.get("source_bucket", "unknown"))
    if source == "swe_bench_like":
        return "SWE-like"
    if source == "terminalbench_like":
        return "TerminalBench-like"
    if source == "openhands":
        return "OpenHands-like"
    return source or "unknown"


def load_prefix_metadata() -> dict[tuple[str, int], dict[str, Any]]:
    if not PREFIX_PATH.exists():
        raise FileNotFoundError(f"missing prefix dataset: {PREFIX_PATH}")
    meta: dict[tuple[str, int], dict[str, Any]] = {}
    with PREFIX_PATH.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            key = (str(row["trajectory_id"]), int(row["step_index"]))
            meta[key] = {
                "source_bucket": str(row.get("source_bucket", "unknown")),
                "layout_family": str(row.get("layout_family", "unknown")),
                "parser_adapter": str(row.get("parser_adapter", "unknown")),
                "prefix_length": int(row.get("prefix_length", row.get("step_index", 0))),
            }
    return meta


def length_buckets_by_trajectory(meta: dict[tuple[str, int], dict[str, Any]]) -> dict[str, str]:
    counts: dict[str, int] = defaultdict(int)
    for trajectory_id, _step in meta:
        counts[trajectory_id] += 1
    lengths = sorted(counts.values())
    if not lengths:
        return {}
    q1 = lengths[len(lengths) // 3]
    q2 = lengths[(2 * len(lengths)) // 3]
    buckets = {}
    for tid, n in counts.items():
        if n <= q1:
            buckets[tid] = "short"
        elif n <= q2:
            buckets[tid] = "medium"
        else:
            buckets[tid] = "long"
    return buckets


def policy_id(row: dict[str, Any]) -> str:
    if "target_name" in row and "model_name" in row and "feature_set" in row:
        return f"{row['target_name']}::{row['model_name']}::{row['feature_set']}"
    name = row.get("baseline_name", row.get("model_name", "unknown"))
    return f"heuristic::{name}"


def normalize_score_row(row: dict[str, Any], meta: dict[tuple[str, int], dict[str, Any]], seed_fallback: int = 20250617) -> dict[str, Any]:
    step = int(row["step_index"])
    tid = str(row["trajectory_id"])
    md = meta.get((tid, step), {})
    bad = int(row.get("target_value", row.get("target", row.get("next_step_bad", 0))))
    return {
        "trajectory_id": tid,
        "step_index": step,
        "split": str(row["split"]),
        "split_seed": int(row.get("split_seed", seed_fallback)),
        "score": float(row.get("score", 0.0)),
        "target": bad,
        "next_step_bad": int(row.get("next_step_bad", bad)),
        "policy_id": policy_id(row),
        **md,
    }


def load_score_rows(policies: set[str], seeds: set[int], meta: dict[tuple[str, int], dict[str, Any]], include_heuristics: bool) -> tuple[dict[tuple[str, int], dict[str, list[dict[str, Any]]]], dict[str, Any]]:
    if not SCORE_PATH.exists():
        raise FileNotFoundError(f"missing required score source: {SCORE_PATH}")
    batches: dict[tuple[str, int], dict[str, list[dict[str, Any]]]] = defaultdict(lambda: {"calibration": [], "test": []})
    raw_hits = 0
    rows_seen = 0
    with SCORE_PATH.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            rows_seen += 1
            raw_hits += len(RAW_KEYS & set(row))
            if str(row.get("target_name")) != TARGET_NAME:
                continue
            pid = policy_id(row)
            if pid not in policies:
                continue
            seed = int(row.get("split_seed", -1))
            if seed not in seeds:
                continue
            split = str(row.get("split"))
            if split not in {"calibration", "test"}:
                continue
            batches[(pid, seed)][split].append(normalize_score_row(row, meta))

    optional_unavailable = []
    if include_heuristics:
        if HEURISTIC_SCORE_PATH.exists():
            heuristic_names = set(HEURISTIC_POLICIES.values())
            with HEURISTIC_SCORE_PATH.open() as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    rows_seen += 1
                    raw_hits += len(RAW_KEYS & set(row))
                    if row.get("baseline_name") not in heuristic_names:
                        continue
                    split = str(row.get("split"))
                    if split not in {"calibration", "test"}:
                        continue
                    normalized = normalize_score_row(row, meta, seed_fallback=min(seeds))
                    pid = normalized["policy_id"].replace("heuristic::", "")
                    normalized["policy_id"] = pid
                    batches[(pid, min(seeds))][split].append(normalized)
        else:
            optional_unavailable.append(str(HEURISTIC_SCORE_PATH))

    for split_rows in batches.values():
        for rows in split_rows.values():
            rows.sort(key=lambda r: (r["trajectory_id"], r["step_index"]))
    return batches, {"rows_seen": rows_seen, "raw_key_hits": raw_hits, "optional_unavailable": optional_unavailable}


def choose_score_threshold(rows: list[dict[str, Any]], budget: float) -> float:
    if not rows:
        return math.inf
    scores = sorted((row["score"] for row in rows), reverse=True)
    k = max(1, int(math.ceil(budget * len(scores))))
    k = min(k, len(scores))
    return scores[k - 1]


def decisions_by_threshold(rows: list[dict[str, Any]], threshold: float) -> list[bool]:
    return [row["score"] >= threshold for row in rows]


def group_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["trajectory_id"]].append(row)
    for vals in grouped.values():
        vals.sort(key=lambda r: r["step_index"])
    return grouped


def trajectory_event_metrics(rows: list[dict[str, Any]], decisions: list[bool]) -> dict[str, Any]:
    grouped = group_by_trajectory(rows)
    by_key = {(row["trajectory_id"], row["step_index"]): decision for row, decision in zip(rows, decisions)}
    positive_trajectories = 0
    repeated_positive_trajectories = 0
    first_failure_covered = 0
    repeated_failure_covered = 0
    touched = 0
    defers_per_touched = []
    bad_deferred = 0
    bad_allowed_before_first = 0
    for tid, vals in grouped.items():
        positives = [i for i, row in enumerate(vals) if row["target"] == 1]
        deferred = [i for i, row in enumerate(vals) if by_key[(tid, row["step_index"])]]
        if deferred:
            touched += 1
            defers_per_touched.append(len(deferred))
        bad_deferred += sum(1 for i in positives if i in set(deferred))
        if positives:
            positive_trajectories += 1
            first_pos = positives[0]
            first_def = min(deferred) if deferred else None
            if first_def is not None and first_def <= first_pos:
                first_failure_covered += 1
            if first_def is None:
                bad_allowed_before_first += len(positives)
            else:
                bad_allowed_before_first += sum(1 for i in positives if i < first_def)
        if len(positives) >= 2:
            repeated_positive_trajectories += 1
            second_pos = positives[1]
            first_def = min(deferred) if deferred else None
            if first_def is not None and first_def <= second_pos:
                repeated_failure_covered += 1
    return {
        "trajectory_count": len(grouped),
        "touched_trajectories": touched,
        "positive_trajectories": positive_trajectories,
        "repeated_positive_trajectories": repeated_positive_trajectories,
        "first_failure_covered": first_failure_covered,
        "repeated_failure_covered": repeated_failure_covered,
        "bad_rows_deferred": bad_deferred,
        "bad_rows_allowed_before_first_deferral": bad_allowed_before_first,
        "mean_defers_per_touched_trajectory": statistics.mean(defers_per_touched) if defers_per_touched else 0.0,
        "median_defers_per_touched_trajectory": statistics.median(defers_per_touched) if defers_per_touched else 0.0,
        "defers_per_touched_distribution": {
            "min": min(defers_per_touched) if defers_per_touched else 0,
            "max": max(defers_per_touched) if defers_per_touched else 0,
            "mean": statistics.mean(defers_per_touched) if defers_per_touched else 0.0,
        },
    }


def compute_metrics(rows: list[dict[str, Any]], decisions: list[bool]) -> dict[str, Any]:
    total = len(rows)
    positives = sum(row["target"] for row in rows)
    deferred = sum(decisions)
    bad_deferred = sum(1 for row, decision in zip(rows, decisions) if decision and row["target"] == 1)
    allowed = total - deferred
    bad_allowed = positives - bad_deferred
    events = trajectory_event_metrics(rows, decisions)
    trajectory_burden = events["touched_trajectories"] / events["trajectory_count"] if events["trajectory_count"] else 0.0
    row_deferral_rate = deferred / total if total else 0.0
    return {
        "rows": total,
        "positives": positives,
        "deferred_rows": deferred,
        "row_deferral_rate": row_deferral_rate,
        "trajectory_burden": trajectory_burden,
        "burden_inflation": trajectory_burden / row_deferral_rate if row_deferral_rate else None,
        "bad_row_capture": bad_deferred / positives if positives else None,
        "first_failure_coverage": events["first_failure_covered"] / events["positive_trajectories"] if events["positive_trajectories"] else None,
        "repeated_failure_coverage": events["repeated_failure_covered"] / events["repeated_positive_trajectories"] if events["repeated_positive_trajectories"] else None,
        "allowed_bad_rate": bad_allowed / allowed if allowed else None,
        "capture_per_touched_trajectory": bad_deferred / events["touched_trajectories"] if events["touched_trajectories"] else None,
        "first_failure_per_touched_trajectory": events["first_failure_covered"] / events["touched_trajectories"] if events["touched_trajectories"] else None,
        "mean_defers_per_touched_trajectory": events["mean_defers_per_touched_trajectory"],
        "median_defers_per_touched_trajectory": events["median_defers_per_touched_trajectory"],
        "defers_per_touched_distribution": events["defers_per_touched_distribution"],
        "touched_trajectories": events["touched_trajectories"],
        "trajectory_count": events["trajectory_count"],
    }


def random_row_decisions(rows: list[dict[str, Any]], budget: float, salt: str) -> list[bool]:
    return [stable_unit(f"{salt}:{row['trajectory_id']}:{row['step_index']}") < budget for row in rows]


def trajectory_uniform_decisions(rows: list[dict[str, Any]], trajectory_budget: float, salt: str) -> list[bool]:
    grouped = group_by_trajectory(rows)
    count = max(0, min(len(grouped), int(math.floor(trajectory_budget * len(grouped)))))
    selected = {tid for tid, _ in sorted(((tid, stable_unit(f"{salt}:{tid}")) for tid in grouped), key=lambda x: x[1])[:count]}
    return [row["trajectory_id"] in selected for row in rows]


def oracle_bad_row_decisions(rows: list[dict[str, Any]], row_budget: float) -> list[bool]:
    limit = max(1, int(math.floor(row_budget * len(rows)))) if rows else 0
    selected = {(row["trajectory_id"], row["step_index"]) for row in sorted(rows, key=lambda r: (1 - r["target"], r["trajectory_id"], r["step_index"]))[:limit] if row["target"] == 1}
    return [(row["trajectory_id"], row["step_index"]) in selected for row in rows]


def oracle_first_bad_decisions(rows: list[dict[str, Any]], budget: float, budget_type: str) -> list[bool]:
    grouped = group_by_trajectory(rows)
    first_bad = []
    for tid, vals in grouped.items():
        for row in vals:
            if row["target"] == 1:
                first_bad.append(row)
                break
    if budget_type == "row":
        limit = max(1, int(math.floor(budget * len(rows)))) if rows else 0
    else:
        limit = max(1, int(math.floor(budget * len(grouped)))) if grouped else 0
    selected = {(row["trajectory_id"], row["step_index"]) for row in sorted(first_bad, key=lambda r: (r["trajectory_id"], r["step_index"]))[:limit]}
    return [(row["trajectory_id"], row["step_index"]) in selected for row in rows]


def analytic_random_trajectory_burden(rows: list[dict[str, Any]], row_budget: float) -> float:
    grouped = group_by_trajectory(rows)
    if not grouped:
        return 0.0
    return statistics.mean(1.0 - ((1.0 - row_budget) ** len(vals)) for vals in grouped.values())


def aggregate_numeric(rows: list[dict[str, Any]], keys: list[str]) -> dict[str, Any]:
    result = {"count": len(rows)}
    for key in keys:
        vals = [row[key] for row in rows if isinstance(row.get(key), (int, float)) and row.get(key) is not None]
        result[key] = {
            "mean": statistics.mean(vals) if vals else None,
            "median": statistics.median(vals) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
        }
    return result


def annotate_rows(rows: list[dict[str, Any]], length_bucket: dict[str, str]) -> None:
    grouped = group_by_trajectory(rows)
    bad_counts = {tid: sum(row["target"] for row in vals) for tid, vals in grouped.items()}
    for row in rows:
        row["source_group"] = source_group(row)
        row["length_bucket"] = length_bucket.get(row["trajectory_id"], "unknown")
        count = bad_counts.get(row["trajectory_id"], 0)
        row["bad_step_group"] = "no_bad_step" if count == 0 else "exactly_one_bad_step" if count == 1 else "repeated_bad_steps"


def subset_rows(rows: list[dict[str, Any]], group_name: str) -> list[dict[str, Any]]:
    if group_name == "all":
        return rows
    return [row for row in rows if row.get("source_group") == group_name or row.get("length_bucket") == group_name or row.get("bad_step_group") == group_name]


def row_in_group(row: dict[str, Any], group_name: str) -> bool:
    return group_name == "all" or row.get("source_group") == group_name or row.get("length_bucket") == group_name or row.get("bad_step_group") == group_name


def evaluate_audit(batches: dict[tuple[str, int], dict[str, list[dict[str, Any]]]], row_budgets: list[float], trajectory_budgets: list[float], length_bucket: dict[str, str]) -> dict[str, Any]:
    curves = []
    by_group = []
    oracle_random = []
    length_adjusted = []
    groups = ["all", "SWE-like", "TerminalBench-like", "OpenHands-like", "short", "medium", "long", "no_bad_step", "exactly_one_bad_step", "repeated_bad_steps"]
    for (policy, seed), split_rows in batches.items():
        cal = split_rows.get("calibration", [])
        test = split_rows.get("test", [])
        if not test:
            continue
        annotate_rows(test, length_bucket)
        for budget in row_budgets:
            threshold = choose_score_threshold(cal, budget)
            learned_decisions = decisions_by_threshold(test, threshold)
            for policy_family, decisions in [
                ("global_row_threshold", learned_decisions),
                ("random_row_deferral", random_row_decisions(test, budget, f"{policy}:{seed}:{budget}")),
                ("oracle_bad_row_deferral", oracle_bad_row_decisions(test, budget)),
                ("oracle_first_bad_row_deferral", oracle_first_bad_decisions(test, budget, "row")),
            ]:
                metrics = compute_metrics(test, decisions)
                row = {"policy_id": policy, "policy_family": policy_family, "split_seed": seed, "budget_type": "row_budget", "budget": budget, **metrics}
                curves.append(row)
                for group in groups:
                    paired = [(r, decision) for r, decision in zip(test, decisions) if row_in_group(r, group)]
                    group_rows = [item[0] for item in paired]
                    if not group_rows:
                        continue
                    group_decisions = [item[1] for item in paired]
                    gm = compute_metrics(group_rows, group_decisions)
                    by_group.append({"policy_id": policy, "policy_family": policy_family, "split_seed": seed, "group": group, "budget_type": "row_budget", "budget": budget, **gm})
            expected = analytic_random_trajectory_burden(test, budget)
            observed = compute_metrics(test, learned_decisions)["trajectory_burden"]
            oracle_obs = compute_metrics(test, oracle_bad_row_decisions(test, budget))["trajectory_burden"]
            oracle_random.append({
                "policy_id": policy,
                "split_seed": seed,
                "row_budget": budget,
                "analytic_random_trajectory_burden": expected,
                "observed_learned_trajectory_burden": observed,
                "oracle_bad_row_trajectory_burden": oracle_obs,
            })
            length_adjusted.append({
                "policy_id": policy,
                "split_seed": seed,
                "row_budget": budget,
                "observed_burden": observed,
                "expected_random_burden": expected,
                "length_adjusted_burden_ratio": observed / expected if expected else None,
            })
        for budget in trajectory_budgets:
            decisions = trajectory_uniform_decisions(test, budget, f"{policy}:{seed}:{budget}")
            metrics = compute_metrics(test, decisions)
            curves.append({"policy_id": policy, "policy_family": "trajectory_uniform_random_deferral", "split_seed": seed, "budget_type": "trajectory_budget", "budget": budget, **metrics})
            oracle_decisions = oracle_first_bad_decisions(test, budget, "trajectory")
            curves.append({"policy_id": policy, "policy_family": "oracle_first_bad_row_deferral", "split_seed": seed, "budget_type": "trajectory_budget", "budget": budget, **compute_metrics(test, oracle_decisions)})
    numeric_keys = ["row_deferral_rate", "trajectory_burden", "burden_inflation", "bad_row_capture", "first_failure_coverage", "allowed_bad_rate", "capture_per_touched_trajectory", "first_failure_per_touched_trajectory", "mean_defers_per_touched_trajectory", "median_defers_per_touched_trajectory"]
    aggregate = aggregate_by(curves, ["policy_id", "policy_family", "budget_type", "budget"], numeric_keys)
    return {
        "curves": curves,
        "by_group": by_group,
        "oracle_random": oracle_random,
        "length_adjusted": length_adjusted,
        "aggregate": aggregate,
    }


def aggregate_by(rows: list[dict[str, Any]], group_keys: list[str], metric_keys: list[str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row.get(key) for key in group_keys)].append(row)
    result = []
    for group, vals in sorted(grouped.items(), key=lambda kv: str(kv[0])):
        out = {key: value for key, value in zip(group_keys, group)}
        out.update(aggregate_numeric(vals, metric_keys))
        result.append(out)
    return result


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("")
        return
    keys = sorted({key for row in rows for key in row if key != "defers_per_touched_distribution"})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in keys})


def markdown(report: dict[str, Any]) -> str:
    robust = report["summary"]["robust_burden_inflation"]
    structural = report["summary"]["structural_vs_model_induced"]
    lines = [
        "# Batch 9H Row-to-Trajectory Burden Audit",
        "",
        "Exploratory benchmark-level audit on CodeTraceBench-derived trajectories. This is an offline proxy analysis, not production validation and not causal prevention. It treats row-level risk and trajectory-level burden as paired costs under finite calibration support and possible domain shift.",
        "",
        "## Summary",
        "",
        f"- Robust burden inflation: `{robust}`",
        f"- Structural/model-induced assessment: `{structural}`",
        f"- Mean learned 5% row-budget trajectory burden: `{report['summary'].get('mean_learned_5pct_trajectory_burden')}`",
        f"- Mean learned 5% burden inflation: `{report['summary'].get('mean_learned_5pct_burden_inflation')}`",
        f"- Mean analytic random 5% trajectory burden: `{report['summary'].get('mean_random_expected_5pct_trajectory_burden')}`",
        f"- Mean oracle bad-row 5% trajectory burden: `{report['summary'].get('mean_oracle_bad_row_5pct_trajectory_burden')}`",
        "",
        "## Interpretation",
        "",
        "- Row-level risk policies should report trajectory-level burden as a paired primary cost.",
        "- Oracle and random diagnostics distinguish structural spread of bad opportunities from model-induced spread.",
        "- Source/layout metadata is used only for evaluation stratification, not as a model feature.",
        "",
        "## Output Tables",
        "",
        f"- Curves: `{CURVES_CSV.name}`",
        f"- By-group audit: `{BY_GROUP_CSV.name}`",
        f"- Oracle/random diagnostics: `{ORACLE_RANDOM_CSV.name}`",
        f"- Length-adjusted burden: `{LENGTH_ADJUSTED_CSV.name}`",
    ]
    return "\n".join(lines)


def summarize(results: dict[str, Any]) -> dict[str, Any]:
    curves = results["curves"]
    learned_5 = [r for r in curves if r["policy_family"] == "global_row_threshold" and r["budget_type"] == "row_budget" and abs(r["budget"] - 0.05) < 1e-9]
    random_5 = [r for r in results["oracle_random"] if abs(r["row_budget"] - 0.05) < 1e-9]
    oracle_5 = [r["oracle_bad_row_trajectory_burden"] for r in random_5 if r.get("oracle_bad_row_trajectory_burden") is not None]
    learned_burden = [r["trajectory_burden"] for r in learned_5 if r.get("trajectory_burden") is not None]
    learned_inflation = [r["burden_inflation"] for r in learned_5 if r.get("burden_inflation") is not None]
    expected_random = [r["analytic_random_trajectory_burden"] for r in random_5 if r.get("analytic_random_trajectory_burden") is not None]
    mean_learned = statistics.mean(learned_burden) if learned_burden else None
    mean_random = statistics.mean(expected_random) if expected_random else None
    mean_oracle = statistics.mean(oracle_5) if oracle_5 else None
    structural = "mixed"
    if mean_oracle is not None and mean_random is not None and mean_learned is not None:
        if mean_oracle >= 0.5 * mean_learned:
            structural = "mixed_with_structural_bad_row_spread"
        elif mean_learned > mean_random:
            structural = "model_induced_spread_dominant"
    return {
        "robust_burden_inflation": bool(learned_inflation and statistics.median(learned_inflation) > 2.0),
        "structural_vs_model_induced": structural,
        "mean_learned_5pct_trajectory_burden": mean_learned,
        "mean_learned_5pct_burden_inflation": statistics.mean(learned_inflation) if learned_inflation else None,
        "mean_random_expected_5pct_trajectory_burden": mean_random,
        "mean_oracle_bad_row_5pct_trajectory_burden": mean_oracle,
        "motivation_strength": "strong" if learned_inflation and statistics.median(learned_inflation) > 4.0 else "mixed",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze row-to-trajectory burden inflation.")
    parser.add_argument("--quick-check", action="store_true")
    parser.add_argument("--policies", help="Comma-separated policy ids.")
    parser.add_argument("--seeds", help="Comma-separated seeds.")
    parser.add_argument("--row-budgets", help="Comma-separated row budgets.")
    parser.add_argument("--trajectory-budgets", help="Comma-separated trajectory budgets.")
    parser.add_argument("--include-heuristics", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    policies = set(parse_csv_arg(args.policies, DEFAULT_POLICIES if not args.quick_check else DEFAULT_POLICIES[:2]))
    seeds = set(parse_int_arg(args.seeds, DEFAULT_SEEDS if not args.quick_check else DEFAULT_SEEDS[:1]))
    row_budgets = parse_float_arg(args.row_budgets, ROW_BUDGETS if not args.quick_check else (0.05,))
    trajectory_budgets = parse_float_arg(args.trajectory_budgets, TRAJECTORY_BUDGETS if not args.quick_check else (0.25,))
    meta = load_prefix_metadata()
    length_bucket = length_buckets_by_trajectory(meta)
    batches, load_info = load_score_rows(policies, seeds, meta, include_heuristics=args.include_heuristics)
    results = evaluate_audit(batches, row_budgets, trajectory_budgets, length_bucket)
    summary = summarize(results)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention",
        "policies": sorted(policies),
        "seeds": sorted(seeds),
        "row_budgets": row_budgets,
        "trajectory_budgets": trajectory_budgets,
        "load_info": load_info,
        "summary": summary,
        "aggregate": results["aggregate"],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(CURVES_CSV, results["curves"])
    write_csv(BY_GROUP_CSV, results["by_group"])
    write_csv(ORACLE_RANDOM_CSV, results["oracle_random"])
    write_csv(LENGTH_ADJUSTED_CSV, results["length_adjusted"])
    print(json.dumps({"aggregate_rows": len(results["aggregate"]), "curve_rows": len(results["curves"]), "summary": summary}, indent=2))


if __name__ == "__main__":
    main()
