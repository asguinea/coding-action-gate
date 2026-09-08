#!/usr/bin/env python3
"""Batch 9H trajectory-aware budgeted intervention evaluation."""

from __future__ import annotations

import argparse
import csv
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
REPORTS_DIR = WORKSPACE / "reports"

REPORT_JSON = REPORTS_DIR / "batch_9h_trajectory_aware_intervention.json"
REPORT_MD = REPORTS_DIR / "batch_9h_trajectory_aware_intervention.md"
FIXED_TRAJ_CSV = REPORTS_DIR / "batch_9h_trajectory_aware_fixed_trajectory_budget.csv"
FIXED_ROW_CSV = REPORTS_DIR / "batch_9h_trajectory_aware_fixed_row_budget.csv"
PARETO_CSV = REPORTS_DIR / "batch_9h_trajectory_aware_pareto_frontier.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9h_trajectory_aware_by_group.csv"
RECOMMEND_JSON = REPORTS_DIR / "batch_9h_trajectory_aware_policy_recommendation.json"
RECOMMEND_MD = REPORTS_DIR / "batch_9h_trajectory_aware_policy_recommendation.md"

DEFAULT_POLICIES = (
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
    "next_step_bad::gradient_boosting::all_structured",
    "next_step_bad::logistic_regression::non_position_history_only",
    "next_step_bad::logistic_regression::prefix_position_only",
)
DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
ROW_BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20)
TRAJECTORY_BUDGETS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)
GROUPS = ("all", "SWE-like", "TerminalBench-like", "OpenHands-like", "short", "medium", "long", "no_bad_step", "exactly_one_bad_step", "repeated_bad_steps")


def load_burden_module():
    path = Path(__file__).resolve().with_name("analyze_row_to_trajectory_burden.py")
    spec = importlib.util.spec_from_file_location("batch9h_burden", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


burden = load_burden_module()


def parse_csv_arg(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_float_arg(value: str | None, defaults: Iterable[float]) -> list[float]:
    return [float(item) for item in parse_csv_arg(value, defaults)]


def parse_int_arg(value: str | None, defaults: Iterable[int]) -> list[int]:
    return [int(item) for item in parse_csv_arg(value, defaults)]


def top_k_mean(values: list[float], k: int = 3) -> float:
    if not values:
        return 0.0
    return statistics.mean(sorted(values, reverse=True)[: min(k, len(values))])


def trajectory_scores(rows: list[dict[str, Any]], aggregator: str) -> dict[str, float]:
    grouped = burden.group_by_trajectory(rows)
    scores = {}
    for tid, vals in grouped.items():
        ordered = sorted(vals, key=lambda r: r["step_index"])
        raw_scores = [row["score"] for row in ordered]
        if aggregator == "max_score":
            scores[tid] = max(raw_scores)
        elif aggregator == "top_k_mean_score":
            scores[tid] = top_k_mean(raw_scores, 3)
        elif aggregator == "sum_top_k_scores":
            scores[tid] = sum(sorted(raw_scores, reverse=True)[: min(3, len(raw_scores))])
        elif aggregator == "early_weighted_max_score":
            scores[tid] = max(row["score"] / (1.0 + 0.05 * idx) for idx, row in enumerate(ordered))
        else:
            raise ValueError(f"unknown aggregator: {aggregator}")
    return scores


def trajectory_threshold(cal_rows: list[dict[str, Any]], budget: float, aggregator: str) -> float:
    scores = sorted(trajectory_scores(cal_rows, aggregator).values(), reverse=True)
    if not scores:
        return math.inf
    k = max(1, min(len(scores), int(math.ceil(budget * len(scores)))))
    return scores[k - 1]


def selected_trajectories(rows: list[dict[str, Any]], threshold: float, aggregator: str) -> set[str]:
    return {tid for tid, score in trajectory_scores(rows, aggregator).items() if score >= threshold}


def first_crossing_decisions(rows: list[dict[str, Any]], selected: set[str], row_threshold: float) -> list[bool]:
    grouped = burden.group_by_trajectory(rows)
    selected_keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        crossing = [row for row in vals if row["score"] >= row_threshold]
        chosen = crossing[0] if crossing else max(vals, key=lambda row: (row["score"], -row["step_index"]))
        selected_keys.add((chosen["trajectory_id"], chosen["step_index"]))
    return [(row["trajectory_id"], row["step_index"]) in selected_keys for row in rows]


def top_k_row_decisions(rows: list[dict[str, Any]], selected: set[str], k: int = 3) -> list[bool]:
    grouped = burden.group_by_trajectory(rows)
    selected_keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        for row in sorted(vals, key=lambda r: (-r["score"], r["step_index"]))[: min(k, len(vals))]:
            selected_keys.add((row["trajectory_id"], row["step_index"]))
    return [(row["trajectory_id"], row["step_index"]) in selected_keys for row in rows]


def early_high_risk_decisions(rows: list[dict[str, Any]], selected: set[str]) -> list[bool]:
    grouped = burden.group_by_trajectory(rows)
    selected_keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        max_score = max(row["score"] for row in vals)
        candidates = [row for row in vals if row["score"] >= 0.80 * max_score]
        chosen = min(candidates, key=lambda row: row["step_index"])
        selected_keys.add((chosen["trajectory_id"], chosen["step_index"]))
    return [(row["trajectory_id"], row["step_index"]) in selected_keys for row in rows]


def group_metric_rows(base: dict[str, Any], rows: list[dict[str, Any]], decisions: list[bool]) -> list[dict[str, Any]]:
    grouped = []
    for group in GROUPS:
        paired = [(row, decision) for row, decision in zip(rows, decisions) if burden.row_in_group(row, group)]
        if not paired:
            continue
        group_rows = [item[0] for item in paired]
        group_decisions = [item[1] for item in paired]
        grouped.append({**base, "group": group, **burden.compute_metrics(group_rows, group_decisions)})
    return grouped


def evaluate_policy_family(cal: list[dict[str, Any]], test: list[dict[str, Any]], policy_id: str, seed: int, trajectory_budgets: list[float]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = []
    by_group = []
    row_threshold = burden.choose_score_threshold(cal, 0.05)
    family_specs = [
        ("top_trajectory_first_crossing", "max_score", "first_crossing"),
        ("top_trajectory_top_k_mean_first_crossing", "top_k_mean_score", "first_crossing"),
        ("yield_optimized_top_k_rows", "sum_top_k_scores", "top_k_rows"),
        ("first_failure_oriented_selection", "early_weighted_max_score", "early_high_risk"),
    ]
    for budget in trajectory_budgets:
        for family, aggregator, action in family_specs:
            threshold = trajectory_threshold(cal, budget, aggregator)
            selected = selected_trajectories(test, threshold, aggregator)
            if action == "first_crossing":
                decisions = first_crossing_decisions(test, selected, row_threshold)
            elif action == "top_k_rows":
                decisions = top_k_row_decisions(test, selected, 3)
            else:
                decisions = early_high_risk_decisions(test, selected)
            base = {
                "policy_id": policy_id,
                "split_seed": seed,
                "policy_family": family,
                "aggregator": aggregator,
                "budget_type": "trajectory_budget",
                "budget": budget,
                "threshold": threshold,
            }
            rows.append({**base, **burden.compute_metrics(test, decisions)})
            by_group.extend(group_metric_rows(base, test, decisions))
    return rows, by_group


def evaluate_baselines(cal: list[dict[str, Any]], test: list[dict[str, Any]], policy_id: str, seed: int, row_budgets: list[float], trajectory_budgets: list[float]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    fixed_row = []
    fixed_traj = []
    by_group = []
    for rb in row_budgets:
        threshold = burden.choose_score_threshold(cal, rb)
        for family, decisions in [
            ("global_row_threshold", burden.decisions_by_threshold(test, threshold)),
            ("random_row_deferral", burden.random_row_decisions(test, rb, f"{policy_id}:{seed}:{rb}")),
            ("oracle_bad_row_deferral", burden.oracle_bad_row_decisions(test, rb)),
            ("oracle_first_bad_row_deferral", burden.oracle_first_bad_decisions(test, rb, "row")),
        ]:
            base = {"policy_id": policy_id, "split_seed": seed, "policy_family": family, "budget_type": "row_budget", "budget": rb}
            fixed_row.append({**base, **burden.compute_metrics(test, decisions)})
            by_group.extend(group_metric_rows(base, test, decisions))
    for tb in trajectory_budgets:
        for family, decisions in [
            ("trajectory_uniform_random_deferral", burden.trajectory_uniform_decisions(test, tb, f"{policy_id}:{seed}:{tb}")),
            ("oracle_first_bad_row_deferral", burden.oracle_first_bad_decisions(test, tb, "trajectory")),
        ]:
            base = {"policy_id": policy_id, "split_seed": seed, "policy_family": family, "budget_type": "trajectory_budget", "budget": tb}
            fixed_traj.append({**base, **burden.compute_metrics(test, decisions)})
            by_group.extend(group_metric_rows(base, test, decisions))
    return fixed_row, fixed_traj, by_group


def is_dominated(row: dict[str, Any], other: dict[str, Any]) -> bool:
    high = ["bad_row_capture", "first_failure_coverage"]
    low = ["row_deferral_rate", "trajectory_burden", "allowed_bad_rate"]
    better_or_equal = True
    strictly_better = False
    for key in high:
        a = row.get(key)
        b = other.get(key)
        if a is None or b is None:
            continue
        if b < a:
            better_or_equal = False
        if b > a:
            strictly_better = True
    for key in low:
        a = row.get(key)
        b = other.get(key)
        if a is None or b is None:
            continue
        if b > a:
            better_or_equal = False
        if b < a:
            strictly_better = True
    return better_or_equal and strictly_better


def pareto_frontier(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for row in rows:
        if not any(is_dominated(row, other) for other in rows if other is not row):
            result.append(row)
    return result


def aggregate_rows(rows: list[dict[str, Any]], group_keys: list[str]) -> list[dict[str, Any]]:
    metrics = ["row_deferral_rate", "trajectory_burden", "burden_inflation", "bad_row_capture", "first_failure_coverage", "allowed_bad_rate", "capture_per_touched_trajectory", "first_failure_per_touched_trajectory"]
    return burden.aggregate_by(rows, group_keys, metrics)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    burden.write_csv(path, rows)


def by_group_rows(rows: list[dict[str, Any]], original_batches: dict[tuple[str, int], dict[str, list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    # Backward-compatible helper for tests and callers that only need a compact
    # all-row annotation. The main evaluation writes real stratified metrics.
    return [{**row, "group": row.get("group", "all")} for row in rows]


def recommendation(fixed_traj: list[dict[str, Any]], fixed_row: list[dict[str, Any]]) -> dict[str, Any]:
    adaptive = [row for row in fixed_traj if row["policy_family"] in {"top_trajectory_first_crossing", "top_trajectory_top_k_mean_first_crossing", "yield_optimized_top_k_rows", "first_failure_oriented_selection"}]
    if not adaptive:
        return {"promising": False, "recommended_role": "not_evaluated", "rationale": ["No adaptive rows were generated."]}
    best_capture = max(adaptive, key=lambda row: (row.get("bad_row_capture") or 0, row.get("first_failure_coverage") or 0))
    best_first = max(adaptive, key=lambda row: (row.get("first_failure_coverage") or 0, row.get("bad_row_capture") or 0))
    promising = bool((best_capture.get("bad_row_capture") or 0) > 0.10 or (best_first.get("first_failure_coverage") or 0) > 0.10)
    return {
        "promising": promising,
        "recommended_role": "complement_global_row_thresholding" if promising else "secondary_diagnostic",
        "best_bad_row_capture_policy": best_capture,
        "best_first_failure_policy": best_first,
        "rationale": [
            "Trajectory-aware policies are judged at fixed trajectory burden.",
            "They should complement rather than replace global row-thresholding unless they dominate on capture and first-failure coverage.",
        ],
    }


def markdown(report: dict[str, Any], rec: dict[str, Any]) -> str:
    lines = [
        "# Batch 9H Trajectory-Aware Budgeted Intervention",
        "",
        "Exploratory benchmark-level evaluation on CodeTraceBench-derived trajectories. This is an offline proxy analysis, not production validation, not a conformal guarantee, and not causal prevention. It evaluates row-level risk, trajectory-level burden, calibration support, and domain shift caveats.",
        "",
        "## Motivation",
        "",
        "The policy was tested because global row-level risk thresholds can capture many target-positive rows while touching a much larger fraction of trajectories.",
        "",
        "## Summary",
        "",
        f"- Fixed trajectory aggregate rows: `{len(report['fixed_trajectory_budget_aggregate'])}`",
        f"- Fixed row aggregate rows: `{len(report['fixed_row_budget_aggregate'])}`",
        f"- Pareto frontier rows: `{len(report['pareto_frontier'])}`",
        f"- Recommendation: `{rec['recommended_role']}`",
        "",
        "## Does it replace global row-thresholding?",
        "",
        "The recommendation file states whether trajectory-aware policies should replace, complement, or remain secondary to global row-thresholding. Negative results are retained.",
        "",
        "## Research Direction",
        "",
        "The evaluation supports a dual-unit view only if trajectory-aware policies improve capture or first-failure coverage at fixed trajectory burden. Otherwise, the honest contribution is the row/trajectory burden audit and cost-aware reporting requirement.",
    ]
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate trajectory-aware budgeted interventions.")
    parser.add_argument("--quick-check", action="store_true")
    parser.add_argument("--policies", help="Comma-separated policy ids.")
    parser.add_argument("--seeds", help="Comma-separated seeds.")
    parser.add_argument("--row-budgets", help="Comma-separated row budgets.")
    parser.add_argument("--trajectory-budgets", help="Comma-separated trajectory budgets.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    policies = set(burden.parse_csv_arg(args.policies, DEFAULT_POLICIES if not args.quick_check else DEFAULT_POLICIES[:2]))
    seeds = set(burden.parse_int_arg(args.seeds, DEFAULT_SEEDS if not args.quick_check else DEFAULT_SEEDS[:1]))
    row_budgets = burden.parse_float_arg(args.row_budgets, ROW_BUDGETS if not args.quick_check else (0.05,))
    trajectory_budgets = burden.parse_float_arg(args.trajectory_budgets, TRAJECTORY_BUDGETS if not args.quick_check else (0.25,))
    meta = burden.load_prefix_metadata()
    batches, load_info = burden.load_score_rows(policies, seeds, meta, include_heuristics=False)
    length_bucket = burden.length_buckets_by_trajectory(meta)
    fixed_row = []
    fixed_traj = []
    adaptive_rows = []
    by_group = []
    for (policy_id, seed), splits in batches.items():
        cal = splits.get("calibration", [])
        test = splits.get("test", [])
        if not cal or not test:
            continue
        burden.annotate_rows(test, length_bucket)
        base_row, base_traj, base_group = evaluate_baselines(cal, test, policy_id, seed, row_budgets, trajectory_budgets)
        fixed_row.extend(base_row)
        fixed_traj.extend(base_traj)
        by_group.extend(base_group)
        adaptive, adaptive_group = evaluate_policy_family(cal, test, policy_id, seed, trajectory_budgets)
        fixed_traj.extend(adaptive)
        adaptive_rows.extend(adaptive)
        by_group.extend(adaptive_group)
    frontier = pareto_frontier(fixed_traj + fixed_row)
    fixed_traj_agg = aggregate_rows(fixed_traj, ["policy_id", "policy_family", "budget_type", "budget"])
    fixed_row_agg = aggregate_rows(fixed_row, ["policy_id", "policy_family", "budget_type", "budget"])
    frontier_agg = aggregate_rows(frontier, ["policy_id", "policy_family", "budget_type", "budget"])
    rec = recommendation(fixed_traj, fixed_row)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention",
        "load_info": load_info,
        "policies": sorted(policies),
        "seeds": sorted(seeds),
        "row_budgets": row_budgets,
        "trajectory_budgets": trajectory_budgets,
        "fixed_trajectory_budget_aggregate": fixed_traj_agg,
        "fixed_row_budget_aggregate": fixed_row_agg,
        "pareto_frontier": frontier_agg,
        "recommendation": rec,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report, rec) + "\n")
    RECOMMEND_JSON.write_text(json.dumps(rec, indent=2, sort_keys=True) + "\n")
    RECOMMEND_MD.write_text(
        "# Batch 9H Trajectory-Aware Policy Recommendation\n\n"
        "Benchmark-level recommendation on CodeTraceBench-derived trajectories. This offline proxy uses row-level risk, trajectory-level burden, calibration support, and domain shift caveats; it is not production validation and not causal prevention.\n\n"
        + "\n".join(f"- {item}" for item in rec.get("rationale", []))
        + f"\n\nRecommended role: `{rec['recommended_role']}`\n"
    )
    write_csv(FIXED_TRAJ_CSV, fixed_traj)
    write_csv(FIXED_ROW_CSV, fixed_row)
    write_csv(PARETO_CSV, frontier)
    write_csv(BY_GROUP_CSV, by_group)
    print(json.dumps({"fixed_trajectory_rows": len(fixed_traj), "fixed_row_rows": len(fixed_row), "pareto_rows": len(frontier), "recommended_role": rec["recommended_role"]}, indent=2))


if __name__ == "__main__":
    main()
