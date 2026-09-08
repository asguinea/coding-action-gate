#!/usr/bin/env python3
"""Batch 9I dual-unit policy selection over existing score outputs."""

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

REPORT_JSON = REPORTS_DIR / "batch_9i_dual_unit_policy_selection.json"
REPORT_MD = REPORTS_DIR / "batch_9i_dual_unit_policy_selection.md"
GRID_CSV = REPORTS_DIR / "batch_9i_dual_unit_policy_grid.csv"
SELECTED_CSV = REPORTS_DIR / "batch_9i_dual_unit_selected_policies.csv"
TEST_RESULTS_CSV = REPORTS_DIR / "batch_9i_dual_unit_test_results.csv"
FEASIBILITY_CSV = REPORTS_DIR / "batch_9i_dual_unit_feasibility.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9i_dual_unit_by_group.csv"
PARETO_CSV = REPORTS_DIR / "batch_9i_dual_unit_pareto_frontier.csv"

DEFAULT_POLICIES = (
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
    "next_step_bad::gradient_boosting::all_structured",
    "next_step_bad::logistic_regression::non_position_history_only",
    "next_step_bad::logistic_regression::prefix_position_only",
)
DEFAULT_SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
ROW_BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20)
TRAJECTORY_BUDGETS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)
ALPHAS = (0.02, 0.03, 0.04, 0.05)
CAPTURE_TARGETS = (0.20, 0.30, 0.40, 0.50)
FIRST_FAILURE_TARGETS = (0.20, 0.30, 0.40, 0.50)
LAMBDA_ROW = (0.5, 1.0)
LAMBDA_TRAJ = (0.5, 1.0, 2.0)
GROUPS = ("all", "SWE-like", "TerminalBench-like", "OpenHands-like", "short", "medium", "long", "no_bad_step", "exactly_one_bad_step", "repeated_bad_steps")
METRIC_KEYS = ("row_deferral_rate", "trajectory_burden", "burden_inflation", "bad_row_capture", "first_failure_coverage", "allowed_bad_rate", "capture_per_touched_trajectory", "first_failure_per_touched_trajectory")


def load_module(name: str, filename: str):
    path = Path(__file__).resolve().with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


burden = load_module("batch9i_burden", "analyze_row_to_trajectory_burden.py")
traj_eval = load_module("batch9i_traj_eval", "evaluate_trajectory_aware_budgeted_intervention.py")


def parse_csv_arg(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_float_arg(value: str | None, defaults: Iterable[float]) -> list[float]:
    return [float(item) for item in parse_csv_arg(value, defaults)]


def parse_int_arg(value: str | None, defaults: Iterable[int]) -> list[int]:
    return [int(item) for item in parse_csv_arg(value, defaults)]


def top_k_mean(values: list[float], k: int = 3) -> float:
    return statistics.mean(sorted(values, reverse=True)[: min(k, len(values))]) if values else 0.0


def trajectory_scores(rows: list[dict[str, Any]], aggregator: str) -> dict[str, float]:
    grouped = burden.group_by_trajectory(rows)
    out = {}
    for tid, vals in grouped.items():
        ordered = sorted(vals, key=lambda r: r["step_index"])
        scores = [row["score"] for row in ordered]
        if aggregator == "max_score":
            out[tid] = max(scores)
        elif aggregator == "top_3_mean_score":
            out[tid] = top_k_mean(scores, 3)
        elif aggregator == "sum_top_3_score":
            out[tid] = sum(sorted(scores, reverse=True)[: min(3, len(scores))])
        elif aggregator == "early_weighted_max_score":
            out[tid] = max(row["score"] / (1.0 + 0.05 * idx) for idx, row in enumerate(ordered))
        else:
            raise ValueError(f"unknown trajectory aggregator: {aggregator}")
    return out


def trajectory_threshold(rows: list[dict[str, Any]], beta: float, aggregator: str) -> float:
    scores = sorted(trajectory_scores(rows, aggregator).values(), reverse=True)
    if not scores:
        return math.inf
    k = max(1, min(len(scores), int(math.ceil(beta * len(scores)))))
    return scores[k - 1]


def selected_trajectory_ids(rows: list[dict[str, Any]], threshold: float, aggregator: str) -> set[str]:
    return {tid for tid, score in trajectory_scores(rows, aggregator).items() if score >= threshold}


def decision_keys(rows: list[dict[str, Any]], decisions: list[bool]) -> set[tuple[str, int]]:
    return {(row["trajectory_id"], row["step_index"]) for row, decision in zip(rows, decisions) if decision}


def decisions_from_keys(rows: list[dict[str, Any]], keys: set[tuple[str, int]]) -> list[bool]:
    return [(row["trajectory_id"], row["step_index"]) in keys for row in rows]


def top_k_decision_keys(rows: list[dict[str, Any]], selected: set[str], k: int) -> set[tuple[str, int]]:
    grouped = burden.group_by_trajectory(rows)
    keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        for row in sorted(vals, key=lambda r: (-r["score"], r["step_index"]))[: min(k, len(vals))]:
            keys.add((row["trajectory_id"], row["step_index"]))
    return keys


def first_crossing_keys(rows: list[dict[str, Any]], selected: set[str], row_threshold: float) -> set[tuple[str, int]]:
    grouped = burden.group_by_trajectory(rows)
    keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        crossing = [row for row in vals if row["score"] >= row_threshold]
        chosen = crossing[0] if crossing else max(vals, key=lambda row: (row["score"], -row["step_index"]))
        keys.add((chosen["trajectory_id"], chosen["step_index"]))
    return keys


def earliest_high_risk_keys(rows: list[dict[str, Any]], selected: set[str]) -> set[tuple[str, int]]:
    grouped = burden.group_by_trajectory(rows)
    keys = set()
    for tid, vals in grouped.items():
        if tid not in selected:
            continue
        max_score = max(row["score"] for row in vals)
        candidates = [row for row in vals if row["score"] >= 0.80 * max_score]
        chosen = min(candidates, key=lambda row: row["step_index"])
        keys.add((chosen["trajectory_id"], chosen["step_index"]))
    return keys


def action_keys(rows: list[dict[str, Any]], selected: set[str], action: str, row_threshold: float) -> set[tuple[str, int]]:
    if action == "top_1_row":
        return top_k_decision_keys(rows, selected, 1)
    if action == "top_2_rows":
        return top_k_decision_keys(rows, selected, 2)
    if action == "top_3_rows":
        return top_k_decision_keys(rows, selected, 3)
    if action == "first_crossing":
        return first_crossing_keys(rows, selected, row_threshold)
    if action == "earliest_high_risk":
        return earliest_high_risk_keys(rows, selected)
    if action == "all_above_row_threshold":
        return {(row["trajectory_id"], row["step_index"]) for row in rows if row["trajectory_id"] in selected and row["score"] >= row_threshold}
    raise ValueError(f"unknown action: {action}")


def candidate_row(base: dict[str, Any], cal: list[dict[str, Any]], test: list[dict[str, Any]], cal_decisions: list[bool], test_decisions: list[bool]) -> dict[str, Any]:
    cal_metrics = burden.compute_metrics(cal, cal_decisions)
    test_metrics = burden.compute_metrics(test, test_decisions)
    row = dict(base)
    for prefix, metrics in [("calibration", cal_metrics), ("test", test_metrics)]:
        for key in METRIC_KEYS:
            row[f"{prefix}_{key}"] = metrics.get(key)
    row["calibration_feasible"] = True
    row["_cal_decisions"] = cal_decisions
    row["_test_decisions"] = test_decisions
    return row


def build_policy_grid(cal: list[dict[str, Any]], test: list[dict[str, Any]], policy_id: str, seed: int, row_budgets: list[float], trajectory_budgets: list[float]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for rho in row_budgets:
        threshold = burden.choose_score_threshold(cal, rho)
        base = {"policy_id": policy_id, "split_seed": seed, "policy_family": "global_row_threshold", "aggregator": "none", "within_trajectory_action": "all_above_row_threshold", "rho": rho, "beta": None, "threshold": threshold}
        candidates.append(candidate_row(base, cal, test, burden.decisions_by_threshold(cal, threshold), burden.decisions_by_threshold(test, threshold)))
        for family, cal_decisions, test_decisions in [
            ("random_row_deferral", burden.random_row_decisions(cal, rho, f"{policy_id}:{seed}:cal:{rho}"), burden.random_row_decisions(test, rho, f"{policy_id}:{seed}:test:{rho}")),
            ("oracle_bad_row_deferral", burden.oracle_bad_row_decisions(cal, rho), burden.oracle_bad_row_decisions(test, rho)),
            ("oracle_first_bad_row_deferral", burden.oracle_first_bad_decisions(cal, rho, "row"), burden.oracle_first_bad_decisions(test, rho, "row")),
        ]:
            base = {"policy_id": policy_id, "split_seed": seed, "policy_family": family, "aggregator": "none", "within_trajectory_action": "oracle_or_random", "rho": rho, "beta": None, "threshold": None}
            candidates.append(candidate_row(base, cal, test, cal_decisions, test_decisions))

    aggregators = ("max_score", "top_3_mean_score", "sum_top_3_score", "early_weighted_max_score")
    actions = ("top_1_row", "top_2_rows", "top_3_rows", "first_crossing", "earliest_high_risk", "all_above_row_threshold")
    for beta in trajectory_budgets:
        for aggregator in aggregators:
            threshold = trajectory_threshold(cal, beta, aggregator)
            cal_selected = selected_trajectory_ids(cal, threshold, aggregator)
            test_selected = selected_trajectory_ids(test, threshold, aggregator)
            row_threshold = burden.choose_score_threshold(cal, 0.05)
            for action in actions:
                family = "dual_budget_pareto_policy" if action == "all_above_row_threshold" else {
                    "top_1_row": "top_trajectory_first_crossing",
                    "top_2_rows": "yield_optimized_top_k_rows",
                    "top_3_rows": "yield_optimized_top_k_rows",
                    "first_crossing": "trajectory_budgeted_first_crossing",
                    "earliest_high_risk": "first_failure_oriented_selection",
                }[action]
                cal_keys = action_keys(cal, cal_selected, action, row_threshold)
                test_keys = action_keys(test, test_selected, action, row_threshold)
                base = {"policy_id": policy_id, "split_seed": seed, "policy_family": family, "aggregator": aggregator, "within_trajectory_action": action, "rho": 0.05 if action == "all_above_row_threshold" else None, "beta": beta, "threshold": threshold}
                candidates.append(candidate_row(base, cal, test, decisions_from_keys(cal, cal_keys), decisions_from_keys(test, test_keys)))

        for family, cal_decisions, test_decisions in [
            ("trajectory_uniform_random_deferral", burden.trajectory_uniform_decisions(cal, beta, f"{policy_id}:{seed}:cal:{beta}"), burden.trajectory_uniform_decisions(test, beta, f"{policy_id}:{seed}:test:{beta}")),
            ("oracle_first_bad_row_deferral", burden.oracle_first_bad_decisions(cal, beta, "trajectory"), burden.oracle_first_bad_decisions(test, beta, "trajectory")),
        ]:
            base = {"policy_id": policy_id, "split_seed": seed, "policy_family": family, "aggregator": "none", "within_trajectory_action": "oracle_or_random", "rho": None, "beta": beta, "threshold": None}
            candidates.append(candidate_row(base, cal, test, cal_decisions, test_decisions))
    return candidates


def score_utility(row: dict[str, Any], lambda_row: float, lambda_traj: float) -> float:
    return (
        float(row.get("calibration_bad_row_capture") or 0.0)
        + float(row.get("calibration_first_failure_coverage") or 0.0)
        - lambda_row * float(row.get("calibration_row_deferral_rate") or 0.0)
        - lambda_traj * float(row.get("calibration_trajectory_burden") or 0.0)
    )


def choose_best(rows: list[dict[str, Any]], key_fn, reverse: bool = True) -> dict[str, Any] | None:
    if not rows:
        return None
    return sorted(rows, key=key_fn, reverse=reverse)[0]


def strip_internal(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: v for k, v in row.items() if not k.startswith("_")}


def selected_record(selector: str, params: dict[str, Any], chosen: dict[str, Any] | None, reason: str | None = None) -> dict[str, Any]:
    base = {"selector": selector, **params, "no_safe_recommendation": chosen is None}
    if chosen is None:
        base.update({"reason": reason or "no_feasible_policy"})
        return base
    base.update(strip_internal(chosen) or {})
    for key in ["row_deferral_rate", "trajectory_burden", "allowed_bad_rate"]:
        limit = params.get({"row_deferral_rate": "rho", "trajectory_burden": "beta", "allowed_bad_rate": "alpha"}[key])
        value = chosen.get(f"test_{key}")
        if limit is not None and value is not None:
            base[f"test_{key}_violation"] = value > limit
    base["calibration_to_test_gap_bad_row_capture"] = (chosen.get("test_bad_row_capture") or 0) - (chosen.get("calibration_bad_row_capture") or 0)
    base["calibration_to_test_gap_first_failure_coverage"] = (chosen.get("test_first_failure_coverage") or 0) - (chosen.get("calibration_first_failure_coverage") or 0)
    base["calibration_to_test_gap_trajectory_burden"] = (chosen.get("test_trajectory_burden") or 0) - (chosen.get("calibration_trajectory_burden") or 0)
    base["reason"] = "selected_on_calibration"
    return base


def select_policies(candidates: list[dict[str, Any]], row_budgets: list[float], trajectory_budgets: list[float]) -> list[dict[str, Any]]:
    selected = []
    for rho in row_budgets:
        for beta in trajectory_budgets:
            feasible = [r for r in candidates if (r.get("calibration_row_deferral_rate") or 0) <= rho and (r.get("calibration_trajectory_burden") or 0) <= beta]
            chosen = choose_best(feasible, lambda r: ((r.get("calibration_bad_row_capture") or 0), (r.get("calibration_first_failure_coverage") or 0), -(r.get("calibration_allowed_bad_rate") or 1), -(r.get("calibration_trajectory_burden") or 0)))
            selected.append(selected_record("max_capture_under_dual_budget", {"rho": rho, "beta": beta}, chosen))
            feasible_first = [r for r in candidates if (r.get("calibration_trajectory_burden") or 0) <= beta and (r.get("calibration_row_deferral_rate") or 0) <= rho]
            chosen_first = choose_best(feasible_first, lambda r: ((r.get("calibration_first_failure_coverage") or 0), (r.get("calibration_bad_row_capture") or 0), -(r.get("calibration_trajectory_burden") or 0)))
            selected.append(selected_record("max_first_failure_under_trajectory_budget", {"rho": rho, "beta": beta}, chosen_first))
    for beta in trajectory_budgets:
        feasible = [r for r in candidates if (r.get("calibration_trajectory_burden") or 0) <= beta]
        chosen = choose_best(feasible, lambda r: ((r.get("calibration_allowed_bad_rate") if r.get("calibration_allowed_bad_rate") is not None else 1.0), -(r.get("calibration_bad_row_capture") or 0)), reverse=False)
        selected.append(selected_record("min_allowed_bad_under_trajectory_budget", {"beta": beta}, chosen))
    for lr in LAMBDA_ROW:
        for lt in LAMBDA_TRAJ:
            chosen = choose_best(candidates, lambda r, lr=lr, lt=lt: score_utility(r, lr, lt))
            selected.append(selected_record("balanced_utility", {"lambda_row": lr, "lambda_traj": lt}, chosen))
    for rho in (0.01, 0.05):
        for beta in (0.10, 0.25):
            for gamma in CAPTURE_TARGETS:
                for eta in FIRST_FAILURE_TARGETS:
                    feasible = [
                        r for r in candidates
                        if (r.get("calibration_row_deferral_rate") or 0) <= rho
                        and (r.get("calibration_trajectory_burden") or 0) <= beta
                        and (r.get("calibration_bad_row_capture") or 0) >= gamma
                        and (r.get("calibration_first_failure_coverage") or 0) >= eta
                    ]
                    chosen = choose_best(feasible, lambda r: ((r.get("calibration_bad_row_capture") or 0), (r.get("calibration_first_failure_coverage") or 0)))
                    selected.append(selected_record("feasibility_fail_closed", {"rho": rho, "beta": beta, "gamma": gamma, "eta": eta}, chosen, reason="no_policy_satisfies_dual_constraints_and_targets"))
    return selected


def is_dominated(row: dict[str, Any], other: dict[str, Any], prefix: str = "calibration") -> bool:
    high = [f"{prefix}_bad_row_capture", f"{prefix}_first_failure_coverage"]
    low = [f"{prefix}_allowed_bad_rate", f"{prefix}_row_deferral_rate", f"{prefix}_trajectory_burden"]
    better_or_equal = True
    strictly = False
    for key in high:
        if (other.get(key) or 0) < (row.get(key) or 0):
            better_or_equal = False
        if (other.get(key) or 0) > (row.get(key) or 0):
            strictly = True
    for key in low:
        ov = other.get(key)
        rv = row.get(key)
        if ov is None or rv is None:
            continue
        if ov > rv:
            better_or_equal = False
        if ov < rv:
            strictly = True
    return better_or_equal and strictly


def pareto_frontier(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [strip_internal(row) for row in rows if not any(is_dominated(row, other) for other in rows if other is not row)]


def by_group_for_selected(selected: list[dict[str, Any]], candidates: list[dict[str, Any]], test_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {(row["policy_id"], row["split_seed"], row["policy_family"], row.get("aggregator"), row.get("within_trajectory_action"), row.get("rho"), row.get("beta"), row.get("threshold")): row for row in candidates}
    out = []
    for sel in selected:
        if sel.get("no_safe_recommendation"):
            continue
        key = (sel.get("policy_id"), sel.get("split_seed"), sel.get("policy_family"), sel.get("aggregator"), sel.get("within_trajectory_action"), sel.get("rho"), sel.get("beta"), sel.get("threshold"))
        candidate = by_id.get(key)
        if not candidate:
            continue
        decisions = candidate["_test_decisions"]
        for group in GROUPS:
            paired = [(row, decision) for row, decision in zip(test_rows, decisions) if burden.row_in_group(row, group)]
            if not paired:
                continue
            group_rows = [item[0] for item in paired]
            group_decisions = [item[1] for item in paired]
            out.append({"selector": sel["selector"], "policy_id": sel.get("policy_id"), "split_seed": sel.get("split_seed"), "group": group, **burden.compute_metrics(group_rows, group_decisions)})
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("")
        return
    clean_rows = [strip_internal(row) or {} for row in rows]
    keys = sorted({key for row in clean_rows for key in row if key != "defers_per_touched_distribution"})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in clean_rows)


def aggregate_selected(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row.get("selector", ""), row.get("policy_family", "no_safe"))].append(row)
    out = []
    for (selector, family), vals in sorted(groups.items()):
        rec = {"selector": selector, "policy_family": family, "count": len(vals), "no_safe_recommendation_rate": sum(1 for v in vals if v.get("no_safe_recommendation")) / len(vals)}
        for key in ["test_bad_row_capture", "test_first_failure_coverage", "test_trajectory_burden", "test_row_deferral_rate", "test_allowed_bad_rate", "calibration_to_test_gap_trajectory_burden"]:
            nums = [v.get(key) for v in vals if isinstance(v.get(key), (int, float))]
            rec[f"{key}_mean"] = statistics.mean(nums) if nums else None
        out.append(rec)
    return out


def markdown(report: dict[str, Any]) -> str:
    top = report.get("top_selected_non_oracle", report.get("top_selected", []))
    lines = [
        "# Batch 9I Dual-Unit Policy Selection",
        "",
        "Exploratory benchmark-level dual-unit evaluation on CodeTraceBench-derived trajectories. This is an offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed. Domain shift and calibration support remain explicit caveats.",
        "",
        "## Summary",
        "",
        f"- Policy grid rows: `{report['policy_grid_size']}`",
        f"- Selected policy rows: `{report['selected_policy_count']}`",
        f"- No-safe recommendation rate: `{report['no_safe_recommendation_rate']}`",
        f"- Raw-text key hits: `{report['guard_results']['raw_key_hits']}`",
        "",
        "## Most Promising Selected Policies",
        "",
    ]
    for row in top[:8]:
        lines.append(f"- `{row['selector']}` / `{row.get('policy_family')}` / `{row.get('policy_id')}`: test capture `{row.get('test_bad_row_capture')}`, first-failure `{row.get('test_first_failure_coverage')}`, trajectory burden `{row.get('test_trajectory_burden')}`")
    lines.extend([
        "",
        "## Interpretation",
        "",
        "- Dual-unit selectors expose when row-level risk reduction conflicts with trajectory-level burden.",
        "- Calibration support matters: fail-closed rows are retained rather than silently relaxed.",
        "- Test feasibility is evaluated after calibration-only selection; violations are reported as benchmark-level diagnostics.",
        "- Source/layout metadata is used for stratified evaluation only, not as a model feature.",
    ])
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9I dual-unit policy selection.")
    parser.add_argument("--quick-check", action="store_true")
    parser.add_argument("--policies", help="Comma-separated policy ids")
    parser.add_argument("--seeds", help="Comma-separated split seeds")
    parser.add_argument("--row-budgets", help="Comma-separated row budgets")
    parser.add_argument("--trajectory-budgets", help="Comma-separated trajectory budgets")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    policies = set(parse_csv_arg(args.policies, DEFAULT_POLICIES if not args.quick_check else DEFAULT_POLICIES[:2]))
    seeds = set(parse_int_arg(args.seeds, DEFAULT_SEEDS if not args.quick_check else DEFAULT_SEEDS[:1]))
    row_budgets = parse_float_arg(args.row_budgets, ROW_BUDGETS if not args.quick_check else (0.05,))
    trajectory_budgets = parse_float_arg(args.trajectory_budgets, TRAJECTORY_BUDGETS if not args.quick_check else (0.25,))

    meta = burden.load_prefix_metadata()
    length_bucket = burden.length_buckets_by_trajectory(meta)
    batches, load_info = burden.load_score_rows(policies, seeds, meta, include_heuristics=False)
    all_candidates: list[dict[str, Any]] = []
    all_selected: list[dict[str, Any]] = []
    all_by_group: list[dict[str, Any]] = []
    support_rows: list[dict[str, Any]] = []
    for (policy_id, seed), split_rows in batches.items():
        cal = split_rows.get("calibration", [])
        test = split_rows.get("test", [])
        if not cal or not test:
            continue
        burden.annotate_rows(cal, length_bucket)
        burden.annotate_rows(test, length_bucket)
        candidates = build_policy_grid(cal, test, policy_id, seed, row_budgets, trajectory_budgets)
        selected = select_policies(candidates, row_budgets, trajectory_budgets)
        all_candidates.extend(candidates)
        all_selected.extend(selected)
        all_by_group.extend(by_group_for_selected(selected, candidates, test))
        support_rows.append({
            "policy_id": policy_id,
            "split_seed": seed,
            "calibration_rows": len(cal),
            "calibration_positives": sum(row["target"] for row in cal),
            "calibration_trajectories": len(burden.group_by_trajectory(cal)),
            "calibration_positive_trajectories": sum(1 for vals in burden.group_by_trajectory(cal).values() if any(row["target"] for row in vals)),
            "candidate_policies": len(candidates),
            "pareto_policies": len(pareto_frontier(candidates)),
            "selected_policies": len(selected),
            "no_safe_recommendations": sum(1 for row in selected if row.get("no_safe_recommendation")),
        })

    frontier = pareto_frontier(all_candidates)
    selected_clean = [strip_internal(row) or {} for row in all_selected]
    grid_clean = [strip_internal(row) or {} for row in all_candidates]
    deployable_selected = [row for row in selected_clean if "oracle" not in str(row.get("policy_family", "")) and "random" not in str(row.get("policy_family", ""))]
    top_selected = sorted(
        [row for row in selected_clean if not row.get("no_safe_recommendation")],
        key=lambda r: ((r.get("test_bad_row_capture") or 0) + (r.get("test_first_failure_coverage") or 0) - (r.get("test_trajectory_burden") or 0)),
        reverse=True,
    )[:20]
    top_selected_non_oracle = sorted(
        [row for row in deployable_selected if not row.get("no_safe_recommendation")],
        key=lambda r: ((r.get("test_bad_row_capture") or 0) + (r.get("test_first_failure_coverage") or 0) - (r.get("test_trajectory_burden") or 0)),
        reverse=True,
    )[:20]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; dual-unit row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_scores": str(burden.SCORE_PATH),
        "policies": sorted(policies),
        "seeds": sorted(seeds),
        "row_budgets": row_budgets,
        "trajectory_budgets": trajectory_budgets,
        "selector_objectives": ["max_capture_under_dual_budget", "max_first_failure_under_trajectory_budget", "min_allowed_bad_under_trajectory_budget", "balanced_utility", "feasibility_fail_closed"],
        "policy_grid_size": len(grid_clean),
        "selected_policy_count": len(selected_clean),
        "no_safe_recommendation_rate": (sum(1 for row in selected_clean if row.get("no_safe_recommendation")) / len(selected_clean)) if selected_clean else None,
        "aggregate_selected": aggregate_selected(selected_clean),
        "top_selected": top_selected,
        "top_selected_non_oracle": top_selected_non_oracle,
        "support": support_rows,
        "guard_results": {"raw_key_hits": load_info.get("raw_key_hits", 0), "metadata_as_features": False, "test_tuning_detected": False},
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(GRID_CSV, grid_clean)
    write_csv(SELECTED_CSV, selected_clean)
    write_csv(TEST_RESULTS_CSV, selected_clean)
    write_csv(FEASIBILITY_CSV, support_rows)
    write_csv(BY_GROUP_CSV, all_by_group)
    write_csv(PARETO_CSV, frontier)
    print(json.dumps({"policy_grid_size": len(grid_clean), "selected_policy_count": len(selected_clean), "no_safe_recommendation_rate": report["no_safe_recommendation_rate"]}, indent=2))


if __name__ == "__main__":
    main()
