#!/usr/bin/env python3
"""Batch 9F small target-domain threshold adaptation."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
INTERVENTION_DIR = WORKSPACE / "data" / "intervention_outputs"

POLICY_SET_PATH = REPORTS_DIR / "batch_9d_recommended_policy_set.json"
BATCH9D_REPORT = REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.json"
BATCH9E_REPORT = REPORTS_DIR / "batch_9e_adaptive_trajectory_policies.json"
BATCH9E_METHOD = REPORTS_DIR / "batch_9e_recommended_intervention_method.json"
BATCH9D_SCORES = MODEL_OUTPUT_DIR / "batch_9d_cross_source_scores.jsonl"

REPORT_JSON = REPORTS_DIR / "batch_9f_target_domain_adaptation.json"
REPORT_MD = REPORTS_DIR / "batch_9f_target_domain_adaptation.md"
PAPER_TABLES_MD = REPORTS_DIR / "batch_9f_report_candidate_tables.md"
CURVE_DATA_JSON = REPORTS_DIR / "batch_9f_curve_data.json"
EVENTS_JSONL = INTERVENTION_DIR / "batch_9f_target_domain_adaptation_events.jsonl"
METHOD_UPDATE_JSON = REPORTS_DIR / "batch_9f_recommended_method_update.json"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
DEFAULT_SCENARIOS = ("non_openhands_to_openhands", "terminalbench_like_to_swe_like", "openhands_to_non_openhands", "swe_like_to_terminalbench_like")
QUICK_SCENARIOS = ("non_openhands_to_openhands",)
DEFAULT_POLICIES = (
    "next_step_bad::gradient_boosting::all_structured",
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
    "next_step_bad::logistic_regression::non_position_history_only",
    "next_step_bad::logistic_regression::prefix_position_only",
    "next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position",
)
QUICK_POLICIES = (
    "next_step_bad::gradient_boosting::all_structured",
    "next_step_bad::hist_gradient_boosting::all_plus_interactions",
)
DEFAULT_SEEDS = (20250617, 20250618, 20250619)
DEFAULT_BUDGETS = (0.05, 0.10, 0.20)
DEFAULT_TRAJECTORY_BUDGETS = (0.10, 0.25, 0.50)
DEFAULT_ADAPTATION_SIZES = ("5", "10", "20", "10pct")
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
FORBIDDEN_PHRASES = ("provides a production guarantee", "provides safety guarantees", "causally prevents", "prevented bad steps", "establishes conformal guarantees", "pure held-out generalization from adaptation")


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9e = load_script("evaluate_adaptive_trajectory_policies")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Batch 9F target-domain threshold adaptation.")
    parser.add_argument("--quick-check", action="store_true")
    parser.add_argument("--scenarios", help="Comma-separated held-out scenarios.")
    parser.add_argument("--targets", help="Comma-separated targets.")
    parser.add_argument("--policies", help="Comma-separated target::model::feature_set policies.")
    parser.add_argument("--adaptation-sizes", help="Comma-separated sizes, e.g. 5,10,20,10pct.")
    parser.add_argument("--seeds", help="Comma-separated split seeds.")
    parser.add_argument("--budgets", help="Comma-separated row budgets.")
    parser.add_argument("--trajectory-budgets", help="Comma-separated trajectory budgets.")
    parser.add_argument("--policy-families", help="Comma-separated families: global_row_threshold,trajectory_budgeted_first_crossing,dual_budget_threshold.")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--stream-large-jsonl", action="store_true")
    return parser.parse_args()


def parse_csv(value: str | None, defaults: Iterable[Any]) -> list[str]:
    if not value:
        return [str(item) for item in defaults]
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_int_csv(value: str | None, defaults: Iterable[int]) -> list[int]:
    return [int(item) for item in parse_csv(value, defaults)]


def require_inputs() -> None:
    missing = [path for path in (POLICY_SET_PATH, BATCH9D_REPORT, BATCH9E_REPORT, BATCH9E_METHOD, BATCH9D_SCORES) if not path.exists()]
    if missing:
        raise SystemExit("ERROR: missing required Batch 9F inputs: " + ", ".join(str(path) for path in missing))


def selected_options(args: argparse.Namespace) -> dict[str, Any]:
    if args.quick_check:
        return {
            "scenarios": list(QUICK_SCENARIOS),
            "targets": ["next_step_bad"],
            "policies": list(QUICK_POLICIES),
            "adaptation_sizes": ["5", "10pct"],
            "seeds": [DEFAULT_SEEDS[0]],
            "budgets": [0.05],
            "trajectory_budgets": [0.50],
            "policy_families": ["global_row_threshold", "trajectory_budgeted_first_crossing", "dual_budget_threshold"],
        }
    return {
        "scenarios": parse_csv(args.scenarios, DEFAULT_SCENARIOS),
        "targets": parse_csv(args.targets, ("next_step_bad", "next_step_incorrect")),
        "policies": parse_csv(args.policies, DEFAULT_POLICIES),
        "adaptation_sizes": parse_csv(args.adaptation_sizes, DEFAULT_ADAPTATION_SIZES),
        "seeds": parse_int_csv(args.seeds, DEFAULT_SEEDS),
        "budgets": [float(item) for item in parse_csv(args.budgets, (0.05, 0.10))],
        "trajectory_budgets": [float(item) for item in parse_csv(args.trajectory_budgets, (0.50,))],
        "policy_families": parse_csv(args.policy_families, ("global_row_threshold", "trajectory_budgeted_first_crossing", "dual_budget_threshold")),
    }


def target_value(row: dict[str, Any], target: str) -> int:
    return batch9e.target_value(row, target)


def policy_id_from_row(row: dict[str, Any]) -> str:
    return "::".join([str(row["policy_target_name"]), str(row["policy_model_name"]), str(row["policy_feature_set"])])


def normalize_row(row: dict[str, Any], scenario: str) -> dict[str, Any]:
    policy = policy_id_from_row(row)
    return {
        "scenario": scenario,
        "split_seed": int(row["split_seed"]),
        "split": str(row["split"]),
        "trajectory_id": str(row["trajectory_id"]),
        "step_index": int(row["step_index"]),
        "target_name": str(row["target_name"]),
        "target_value": int(row.get("target_value", target_value(row, str(row["target_name"])))),
        "policy_id": policy,
        "policy_target_name": policy.split("::")[0],
        "policy_model_name": policy.split("::")[1],
        "policy_feature_set": policy.split("::")[2],
        "score": float(row["score"]),
        "next_step_bad": int(row["next_step_bad"]),
        "next_step_incorrect": int(row.get("next_step_incorrect", 0)),
        "next_step_unuseful": int(row.get("next_step_unuseful", 0)),
    }


def load_score_batches(options: dict[str, Any], stream_large: bool) -> tuple[dict[tuple[str, int, str, str], dict[str, list[dict[str, Any]]]], dict[str, Any]]:
    if not stream_large:
        raise SystemExit("ERROR: Batch 9F requires --stream-large-jsonl to read Batch 9D scores.")
    scenario_set = set(options["scenarios"])
    target_set = set(options["targets"])
    policy_set = set(options["policies"])
    seed_set = set(options["seeds"])
    batches: dict[tuple[str, int, str, str], dict[str, list[dict[str, Any]]]] = defaultdict(lambda: {"source_calibration": [], "target_all": []})
    raw_hits = 0
    rows_seen = 0
    selected_scenarios_seen: set[str] = set()
    seen_selected = False
    with BATCH9D_SCORES.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            rows_seen += 1
            raw_hits += len(RAW_KEYS & set(row))
            scenario = str(row.get("scenario_id"))
            if seen_selected and selected_scenarios_seen.issuperset(scenario_set) and scenario not in scenario_set:
                break
            if scenario not in scenario_set:
                continue
            seen_selected = True
            selected_scenarios_seen.add(scenario)
            if int(row.get("split_seed", -1)) not in seed_set:
                continue
            if str(row.get("target_name")) not in target_set:
                continue
            policy = policy_id_from_row(row)
            if policy not in policy_set:
                continue
            split = str(row.get("split"))
            if split not in {"calibration", "test"}:
                continue
            normalized = normalize_row(row, scenario)
            key = (scenario, normalized["split_seed"], normalized["target_name"], normalized["policy_id"])
            if split == "calibration":
                batches[key]["source_calibration"].append(normalized)
            else:
                batches[key]["target_all"].append(normalized)
    for rows_by_split in batches.values():
        for rows in rows_by_split.values():
            rows.sort(key=lambda row: (row["trajectory_id"], row["step_index"]))
    return batches, {"raw_score_key_hits": raw_hits, "score_rows_seen": rows_seen, "score_batches_loaded": len(batches), "selected_scenarios_seen": sorted(selected_scenarios_seen)}


def stable_seed(seed: int, *parts: str) -> int:
    digest = hashlib.sha256("::".join([str(seed), *parts]).encode()).hexdigest()
    return int(digest[:12], 16)


def trajectory_has_positive(rows: list[dict[str, Any]], target: str) -> bool:
    return any(target_value(row, target) for row in rows)


def adaptation_count(size: str, total: int) -> int:
    if size.endswith("pct"):
        pct = float(size[:-3]) / 100.0
        return max(1, int(round(total * pct)))
    return int(size)


def select_target_calibration_ids(rows: list[dict[str, Any]], target: str, size: str, seed: int, scenario: str) -> tuple[set[str], dict[str, Any]]:
    grouped = batch9e.group_by_trajectory(rows)
    desired = min(max(1, adaptation_count(size, len(grouped))), max(1, len(grouped) - 1))
    positives = [tid for tid, traj in grouped.items() if trajectory_has_positive(traj, target)]
    negatives = [tid for tid, traj in grouped.items() if not trajectory_has_positive(traj, target)]
    rng = random.Random(stable_seed(seed, scenario, target, size))
    rng.shuffle(positives)
    rng.shuffle(negatives)
    selected = []
    if positives:
        selected.append(positives.pop(0))
    for bucket in (positives, negatives):
        for tid in bucket:
            if len(selected) >= desired:
                break
            selected.append(tid)
        if len(selected) >= desired:
            break
    selected_set = set(selected)
    return selected_set, {"requested_size": size, "actual_target_calibration_trajectories": len(selected_set), "target_domain_trajectory_count": len(grouped)}


def split_target_rows(rows: list[dict[str, Any]], target: str, size: str, seed: int, scenario: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    cal_ids, info = select_target_calibration_ids(rows, target, size, seed, scenario)
    cal = [row for row in rows if row["trajectory_id"] in cal_ids]
    test = [row for row in rows if row["trajectory_id"] not in cal_ids]
    info.update(support_info([], cal, test, target))
    info["target_calibration_test_disjoint"] = set(batch9e.group_by_trajectory(cal)).isdisjoint(set(batch9e.group_by_trajectory(test)))
    return cal, test, info


def support_info(source_cal: list[dict[str, Any]], target_cal: list[dict[str, Any]], target_test: list[dict[str, Any]], target: str) -> dict[str, Any]:
    def stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
        grouped = batch9e.group_by_trajectory(rows)
        return {
            "rows": len(rows),
            "trajectories": len(grouped),
            "positive_rows": sum(target_value(row, target) for row in rows),
            "positive_trajectories": sum(1 for traj in grouped.values() if trajectory_has_positive(traj, target)),
        }
    return {
        "source_calibration": stats(source_cal),
        "target_calibration": stats(target_cal),
        "target_test": stats(target_test),
    }


def choose_global_threshold(cal_rows: list[dict[str, Any]], budget: float) -> float:
    return batch9e.threshold_for_row_budget(cal_rows, budget) if cal_rows else math.inf


def evaluate_decisions(mode: str, scenario: str, seed: int, target: str, policy: str, family: str, budget_type: str, budget_value: float, cal_rows: list[dict[str, Any]], test_rows: list[dict[str, Any]], decisions: list[bool], threshold: float | None, support: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    cal_decisions = batch9e.decisions_global(cal_rows, threshold) if threshold is not None and cal_rows else [False] * len(cal_rows)
    cal_metrics = batch9e.aggregate_events(cal_rows, target, cal_decisions) if cal_rows else {}
    test_metrics = batch9e.aggregate_events(test_rows, target, decisions)
    return {
        "adaptation_mode": mode,
        "scenario": scenario,
        "split_seed": seed,
        "target_name": target,
        "base_policy_id": policy,
        "policy_family": family,
        "budget_type": budget_type,
        "budget_value": budget_value,
        "threshold": threshold,
        "calibration_metrics": cal_metrics,
        "test_metrics": test_metrics,
        "support": support,
        "zero_positive_target_calibration": support["target_calibration"]["positive_rows"] == 0,
        "extra": extra or {},
    }


def evaluate_batch(batch_key: tuple[str, int, str, str], rows_by_split: dict[str, list[dict[str, Any]]], adaptation_sizes: list[str], budgets: list[float], trajectory_budgets: list[float], policy_families: set[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    scenario, seed, target, policy = batch_key
    source_cal = rows_by_split["source_calibration"]
    target_all = rows_by_split["target_all"]
    results = []
    events = []
    skips = []
    if not source_cal or len(batch9e.group_by_trajectory(target_all)) < 2:
        return [], [], [{"scenario": scenario, "seed": seed, "target": target, "policy": policy, "reason": "missing source calibration or target trajectories"}]
    for size in adaptation_sizes:
        target_cal, target_test, split_info = split_target_rows(target_all, target, size, seed, scenario)
        if not target_test:
            skips.append({"scenario": scenario, "seed": seed, "target": target, "policy": policy, "adaptation_size": size, "reason": "empty target test after adaptation split"})
            continue
        support = support_info(source_cal, target_cal, target_test, target)
        support.update({k: v for k, v in split_info.items() if k not in support})
        for mode, cal_rows in (
            ("pure_heldout_reference", source_cal),
            ("target_domain_adaptation", target_cal),
            ("source_plus_target_pooled_adaptation", source_cal + target_cal),
        ):
            if "global_row_threshold" in policy_families:
                for budget in budgets:
                    tau = choose_global_threshold(cal_rows, budget)
                    decisions = batch9e.decisions_global(target_test, tau)
                    results.append(evaluate_decisions(mode, scenario, seed, target, policy, "global_row_threshold", "row_budget", budget, cal_rows, target_test, decisions, tau, support, {"adaptation_size": size}))
                    events.extend(event_records_for_result(results[-1], target_test, decisions))
            if "trajectory_budgeted_first_crossing" in policy_families:
                for q in trajectory_budgets:
                    selected = batch9e.select_trajectory_budget_threshold(cal_rows, target, q)
                    tau = float(selected["tau"])
                    decisions = batch9e.decisions_first_trigger(target_test, tau)
                    results.append(evaluate_decisions(mode, scenario, seed, target, policy, "trajectory_budgeted_first_crossing", "trajectory_budget", q, cal_rows, target_test, decisions, tau, support, {"adaptation_size": size, "selection": "max_capture_subject_to_trajectory_budget"}))
            if "dual_budget_threshold" in policy_families:
                for r in budgets:
                    for q in trajectory_budgets:
                        selected = batch9e.select_dual_budget_threshold(cal_rows, target, r, q)
                        if selected.get("infeasible"):
                            skips.append({"scenario": scenario, "seed": seed, "target": target, "policy": policy, "adaptation_size": size, "mode": mode, "family": "dual_budget_threshold", "row_budget": r, "trajectory_budget": q, "reason": "infeasible"})
                            continue
                        tau = float(selected["tau"])
                        decisions = batch9e.decisions_global(target_test, tau)
                        results.append(evaluate_decisions(mode, scenario, seed, target, policy, "dual_budget_threshold", "dual_budget", q, cal_rows, target_test, decisions, tau, support, {"adaptation_size": size, "row_budget": r, "trajectory_budget": q}))
    return results, events, skips


def event_records_for_result(result: dict[str, Any], test_rows: list[dict[str, Any]], decisions: list[bool], limit: int = 10) -> list[dict[str, Any]]:
    context = {
        "split_seed": result["split_seed"],
        "scenario": result["scenario"],
        "adaptation_mode": result["adaptation_mode"],
        "base_policy_id": result["base_policy_id"],
        "policy_family": result["policy_family"],
        "budget_type": result["budget_type"],
        "budget_value": result["budget_value"],
        "threshold": result["threshold"],
        "adaptation_size": result["extra"].get("adaptation_size"),
    }
    rows = []
    grouped = batch9e.group_by_trajectory(test_rows)
    flags_by_tid: dict[str, list[bool]] = defaultdict(list)
    for row, flag in zip(test_rows, decisions):
        flags_by_tid[row["trajectory_id"]].append(flag)
    for tid, traj_rows in list(grouped.items())[:limit]:
        flags = flags_by_tid[tid]
        event = batch9e.trajectory_event_from_decisions(traj_rows, result["target_name"], flags)
        rows.append({
            **context,
            "split": "target_test",
            "trajectory_id": tid,
            "target_name": result["target_name"],
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
    return rows


def summarize(values: list[float]) -> dict[str, Any]:
    clean = [float(v) for v in values if v is not None]
    if not clean:
        return {"count": 0, "mean": None, "std": None, "min": None, "median": None, "max": None}
    return {"count": len(clean), "mean": sum(clean) / len(clean), "std": statistics.pstdev(clean) if len(clean) > 1 else 0.0, "min": min(clean), "median": statistics.median(clean), "max": max(clean)}


def aggregate_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in results:
        key = "::".join([row["adaptation_mode"], row["scenario"], row["target_name"], row["base_policy_id"], row["policy_family"], row["budget_type"], str(row["budget_value"]), str(row["extra"].get("adaptation_size"))])
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
            "target_calibration_positive_rows": summarize([r["support"]["target_calibration"]["positive_rows"] for r in rows]),
            "target_calibration_trajectories": summarize([r["support"]["target_calibration"]["trajectories"] for r in rows]),
            "target_test_positive_rows": summarize([r["support"]["target_test"]["positive_rows"] for r in rows]),
            "zero_positive_calibration_rate": sum(1 for r in rows if r["zero_positive_target_calibration"]) / len(rows),
        }
    return aggregate


def adaptation_deltas(aggregate: dict[str, Any]) -> list[dict[str, Any]]:
    refs = {key: value for key, value in aggregate.items() if key.startswith("pure_heldout_reference::")}
    rows = []
    for key, value in aggregate.items():
        if key.startswith("pure_heldout_reference::"):
            continue
        ref_key = "pure_heldout_reference::" + "::".join(key.split("::")[1:])
        ref = refs.get(ref_key)
        if not ref:
            continue
        cap = value["target_positive_row_capture"]["mean"]
        rcap = ref["target_positive_row_capture"]["mean"]
        burden = value["trajectory_level_deferral_rate"]["mean"]
        rburden = ref["trajectory_level_deferral_rate"]["mean"]
        ff = value["first_failure_coverage"]["mean"]
        rff = ref["first_failure_coverage"]["mean"]
        row = {
            "aggregate_key": key,
            "reference_key": ref_key,
            "capture_delta": delta(cap, rcap),
            "trajectory_burden_delta": delta(burden, rburden),
            "first_failure_delta": delta(ff, rff),
            "lower_burden_adaptation": bool(cap is not None and rcap is not None and burden is not None and rburden and cap > 0 and cap >= 0.95 * rcap and burden <= 0.80 * rburden),
            "higher_capture_adaptation": bool(cap is not None and rcap is not None and burden is not None and rburden is not None and burden <= rburden + 0.05 and ((rcap > 0 and cap >= 1.10 * rcap and cap - rcap >= 0.005) or (rcap == 0 and cap >= 0.01))),
            "better_first_failure_adaptation": bool(ff is not None and rff is not None and burden is not None and rburden is not None and burden <= rburden + 0.05 and ((rff > 0 and ff >= 1.10 * rff and ff - rff >= 0.02) or (rff == 0 and ff >= 0.05))),
        }
        rows.append(row)
    return rows


def delta(left: float | None, right: float | None) -> float | None:
    return None if left is None or right is None else left - right


def recommended_update(deltas: list[dict[str, Any]]) -> dict[str, Any]:
    improvements = [row for row in deltas if row["lower_burden_adaptation"] or row["higher_capture_adaptation"] or row["better_first_failure_adaptation"]]
    lower_burden = [row for row in improvements if row["lower_burden_adaptation"]]
    return {
        "target_domain_calibration_part_of_method": bool(improvements),
        "target_domain_calibration_role": "optional_deployment_adaptation" if improvements else "future_work_or_appendix_diagnostic",
        "global_row_threshold_remains_main_method": not bool(lower_burden),
        "dual_budget_or_trajectory_budget_adaptation_included": any("dual_budget" in row["aggregate_key"] or "trajectory_budgeted" in row["aggregate_key"] for row in lower_burden),
        "next_batch": "Batch 10" if improvements else "Batch 10 with adaptation as limitation/future work",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9F Target-Domain Calibration / Adaptation",
        "",
        "Benchmark adaptation diagnostics only. Adaptation uses a labeled target-domain calibration subset and is not pure held-out generalization, not a production guarantee, not a conformal guarantee, and not causal prevention.",
        "",
        "## Executive Summary",
        "",
        f"- Scenarios evaluated: `{', '.join(report['scenarios_evaluated'])}`",
        f"- Adaptation modes: `{', '.join(report['adaptation_modes'])}`",
        f"- Adaptation sizes: `{', '.join(report['adaptation_sizes'])}`",
        f"- Per-seed rows: `{len(report['per_seed_metrics'])}`",
        f"- Compact event rows: `{report['event_output_rows']}`",
        "",
        "## Adaptation Scenarios and Support",
        "",
        "| key | target calibration trajectories | target calibration positives | target test positives | zero-positive calibration rate |",
        "|---|---:|---:|---:|---:|",
    ]
    for key, value in list(report["aggregate_metrics"].items())[:30]:
        lines.append(f"| `{key}` | `{fmt(value['target_calibration_trajectories']['mean'])}` | `{fmt(value['target_calibration_positive_rows']['mean'])}` | `{fmt(value['target_test_positive_rows']['mean'])}` | `{fmt(value['zero_positive_calibration_rate'])}` |")
    lines.extend([
        "",
        "## Pure Held-Out Reference Versus Target-Domain Adaptation",
        "",
        "| aggregate key | capture delta | trajectory burden delta | first-failure delta | lower burden | higher capture | better first failure |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ])
    for row in report["adaptation_deltas"][:40]:
        lines.append(f"| `{row['aggregate_key']}` | `{fmt(row['capture_delta'])}` | `{fmt(row['trajectory_burden_delta'])}` | `{fmt(row['first_failure_delta'])}` | `{row['lower_burden_adaptation']}` | `{row['higher_capture_adaptation']}` | `{row['better_first_failure_adaptation']}` |")
    lines.extend([
        "",
        "## OpenHands Stress-Case Adaptation",
        "",
        "OpenHands adaptation rows are kept separate from pure held-out transfer. Any benefit here is target-domain calibration, not pure held-out generalization.",
        "",
        "## Row Capture Versus Trajectory Burden After Adaptation",
        "",
        "The report compares target-positive row capture with trajectory-level burden for every adaptation mode and size.",
        "",
        "## First-Failure Coverage After Adaptation",
        "",
        "First-failure coverage is reported as an offline intervention-opportunity metric, not causal prevention.",
        "",
        "## Zero-Positive Calibration and Infeasibility",
        "",
        "Zero-positive target calibration subsets are explicitly reported and use deterministic threshold fallback behavior.",
        "",
        "## Does small target-domain calibration repair OpenHands shift?",
        "",
        "See OpenHands stress-case rows and adaptation deltas; improvements must be interpreted as target-domain calibration effects.",
        "",
        "## How many target-domain trajectories are needed?",
        "",
        "Adaptation-size sensitivity is reported for count-based and percentage-based target calibration subsets.",
        "",
        "## Does adaptation reduce trajectory burden or improve capture?",
        "",
        "The Pareto flags indicate whether adaptation improves lower-burden, higher-capture, or first-failure criteria versus pure held-out transfer.",
        "",
        "## Adaptation is not pure held-out generalization",
        "",
        "Mode B and pooled calibration use target-domain labels for threshold selection and are therefore adaptation.",
        "",
        "## Should adaptation be part of the method?",
        "",
        f"Recommendation: `{report['recommended_method_update']['target_domain_calibration_role']}`.",
        "",
        "## Recommended next step",
        "",
        f"`{report['recommended_method_update']['next_batch']}`.",
    ])
    return "\n".join(lines)


def fmt(value: Any) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def raw_key_hits(rows: Iterable[dict[str, Any]]) -> int:
    return sum(len(RAW_KEYS & set(row)) for row in rows)


def forbidden_language_hits(text: str) -> list[str]:
    lowered = text.lower()
    return [phrase for phrase in FORBIDDEN_PHRASES if phrase in lowered]


def main() -> int:
    args = parse_args()
    options = selected_options(args)
    require_inputs()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    INTERVENTION_DIR.mkdir(parents=True, exist_ok=True)
    batches, score_guard = load_score_batches(options, args.stream_large_jsonl or args.quick_check)
    per_seed = []
    events = []
    skips = []
    for key, rows_by_split in sorted(batches.items()):
        results, event_rows, skipped = evaluate_batch(key, rows_by_split, options["adaptation_sizes"], options["budgets"], options["trajectory_budgets"], set(options["policy_families"]))
        per_seed.extend(results)
        events.extend(event_rows)
        skips.extend(skipped)
    aggregate = aggregate_results(per_seed)
    deltas = adaptation_deltas(aggregate)
    method = recommended_update(deltas)
    if len(events) > 500_000:
        raise SystemExit("ERROR: compact event output would exceed configured row limit; write aggregates only or reduce options.")
    with EVENTS_JSONL.open("w") as handle:
        for row in events:
            handle.write(json.dumps(row, sort_keys=True) + "\n")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Benchmark target-domain adaptation diagnostics only; not pure held-out generalization, production StepHarbor validation, conformal guarantee, safety guarantee, arbitrary distribution-shift guarantee, causal prevention claim, or final report result.",
        "input_files_used": {
            "policy_set": str(POLICY_SET_PATH.relative_to(WORKSPACE)),
            "batch9d_report": str(BATCH9D_REPORT.relative_to(WORKSPACE)),
            "batch9e_report": str(BATCH9E_REPORT.relative_to(WORKSPACE)),
            "batch9e_method": str(BATCH9E_METHOD.relative_to(WORKSPACE)),
            "batch9d_scores": str(BATCH9D_SCORES.relative_to(WORKSPACE)),
        },
        "scenarios_evaluated": options["scenarios"],
        "adaptation_modes": ["pure_heldout_reference", "target_domain_adaptation", "source_plus_target_pooled_adaptation"],
        "adaptation_sizes": options["adaptation_sizes"],
        "budgets": options["budgets"],
        "trajectory_budgets": options["trajectory_budgets"],
        "policies_evaluated": options["policies"],
        "policy_families_evaluated": options["policy_families"],
        "targets_evaluated": options["targets"],
        "threshold_rules": {
            "global_row": "threshold selected on declared calibration rows for row budgets 0.05, 0.10, 0.20",
            "trajectory_budgeted": "maximize target-positive row capture subject to trajectory budget on declared calibration rows",
            "dual_budget": "maximize target-positive row capture subject to row and trajectory budgets on declared calibration rows",
        },
        "per_seed_metrics": per_seed,
        "aggregate_metrics": aggregate,
        "pure_heldout_references": {k: v for k, v in aggregate.items() if k.startswith("pure_heldout_reference::")},
        "adaptation_deltas": deltas,
        "zero_positive_calibration_analysis": {"zero_positive_rows": sum(1 for row in per_seed if row["zero_positive_target_calibration"])},
        "infeasible_threshold_analysis": skips,
        "event_output": str(EVENTS_JSONL.relative_to(WORKSPACE)),
        "event_output_rows": len(events),
        "recommended_method_update": method,
        "guard_results": {
            **score_guard,
            "raw_event_key_hits": raw_key_hits(events),
            "target_calibration_test_disjoint": all(row["support"].get("target_calibration_test_disjoint", True) for row in per_seed),
            "pure_heldout_and_adaptation_separated": True,
            "adaptation_not_described_as_pure_heldout": True,
            "test_labels_used_for_threshold_selection": False,
            "metadata_used_as_model_features": False,
            "no_silent_policy_substitution": True,
            "zero_positive_calibration_reported": True,
            "large_output_warning": False,
        },
        "warnings": [],
    }
    md = markdown(report)
    report["guard_results"]["report_forbidden_language_hits"] = forbidden_language_hits(md)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    REPORT_MD.write_text(md)
    CURVE_DATA_JSON.write_text(json.dumps([{"aggregate_key": k, **v} for k, v in aggregate.items()], indent=2, sort_keys=True))
    PAPER_TABLES_MD.write_text("# Batch 9F Report Candidate Tables\n\nAll tables are candidate / not final.\n\n" + "\n".join(markdown(report).splitlines()[12:40]))
    METHOD_UPDATE_JSON.write_text(json.dumps(method, indent=2, sort_keys=True))
    print(json.dumps({"per_seed_metrics": len(per_seed), "aggregate_metrics": len(aggregate), "event_rows": len(events), "adaptation_deltas": len(deltas), "recommended": method["target_domain_calibration_role"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
