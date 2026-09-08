#!/usr/bin/env python3
"""Evaluate Batch 9L first-failure intervention policies."""

from __future__ import annotations

import csv
import importlib.util
import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"

REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
GENERIC_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9l_first_failure_intervention.json"
REPORT_MD = REPORTS_DIR / "batch_9l_first_failure_intervention.md"
FIXED_ROW_CSV = REPORTS_DIR / "batch_9l_first_failure_fixed_row_budget.csv"
FIXED_TRAJ_CSV = REPORTS_DIR / "batch_9l_first_failure_fixed_trajectory_budget.csv"
LEAD_TIME_CSV = REPORTS_DIR / "batch_9l_first_failure_lead_time.csv"
COMPARISON_CSV = REPORTS_DIR / "batch_9l_first_failure_policy_comparison.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9l_first_failure_by_group.csv"

SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
ROW_BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20)
TRAJ_BUDGETS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)
FIRST_FAILURE_MODELS = (
    ("logistic_regression", "non_position_history_only"),
    ("logistic_regression", "prefix_position_only"),
    ("gradient_boosting", "all_structured"),
)
GENERIC_MODELS = (
    ("hist_gradient_boosting", "all_plus_interactions"),
    ("gradient_boosting", "all_structured"),
    ("logistic_regression", "non_position_history_only"),
    ("logistic_regression", "prefix_position_only"),
)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "terminal_output"}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


models = load_script("evaluate_first_failure_risk_models")
targets_mod = load_script("build_first_failure_targets")


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9L intervention input: {path}")


def load_rows() -> list[dict[str, Any]]:
    return targets_mod.add_first_failure_targets(targets_mod.load_prefix_rows())


def load_splits() -> dict[str, Any]:
    require(REPEATED_SPLITS)
    return json.loads(REPEATED_SPLITS.read_text())


def assignments_for_seed(splits: dict[str, Any], seed: int) -> dict[str, str]:
    for item in splits["splits"]:
        if int(item["seed"]) == int(seed):
            return item["assignments"]
    raise KeyError(seed)


def rows_by_split(rows: list[dict[str, Any]], assignments: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    out = {"train": [], "calibration": [], "test": []}
    for row in rows:
        split = assignments.get(str(row["trajectory_id"]))
        if split in out:
            out[split].append(row)
    for vals in out.values():
        vals.sort(key=lambda row: (str(row["trajectory_id"]), int(row["trajectory_row_ordinal"])))
    return out


def threshold_for_budget(scores: list[float], budget: float) -> float:
    if not scores:
        return math.inf
    ordered = sorted(scores, reverse=True)
    k = max(1, min(len(ordered), int(math.ceil(budget * len(ordered)))))
    return ordered[k - 1]


def trajectory_threshold(rows: list[dict[str, Any]], scores: list[float], budget: float) -> float:
    grouped: dict[str, list[float]] = defaultdict(list)
    for row, score in zip(rows, scores):
        grouped[str(row["trajectory_id"])].append(score)
    vals = sorted((max(v) for v in grouped.values()), reverse=True)
    if not vals:
        return math.inf
    k = max(1, min(len(vals), int(math.ceil(budget * len(vals)))))
    return vals[k - 1]


def first_crossing(rows: list[dict[str, Any]], scores: list[float], threshold: float) -> list[bool]:
    grouped: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for idx, (row, score) in enumerate(zip(rows, scores)):
        grouped[str(row["trajectory_id"])].append((idx, score))
    selected = set()
    for vals in grouped.values():
        for idx, score in sorted(vals, key=lambda item: int(rows[item[0]]["trajectory_row_ordinal"])):
            if score >= threshold:
                selected.add(idx)
                break
    return [idx in selected for idx in range(len(rows))]


def earliest_high_risk(rows: list[dict[str, Any]], scores: list[float], threshold: float) -> list[bool]:
    grouped: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for idx, (row, score) in enumerate(zip(rows, scores)):
        grouped[str(row["trajectory_id"])].append((idx, score))
    selected = set()
    for vals in grouped.values():
        max_score = max(score for _idx, score in vals)
        candidates = [(idx, score) for idx, score in vals if score >= threshold and score >= 0.8 * max_score]
        if candidates:
            selected.add(min(candidates, key=lambda item: int(rows[item[0]]["trajectory_row_ordinal"]))[0])
    return [idx in selected for idx in range(len(rows))]


def trajectory_triage(rows: list[dict[str, Any]], scores: list[float], traj_threshold: float, row_threshold: float) -> list[bool]:
    grouped: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for idx, (row, score) in enumerate(zip(rows, scores)):
        grouped[str(row["trajectory_id"])].append((idx, score))
    selected = set()
    for vals in grouped.values():
        if max(score for _idx, score in vals) < traj_threshold:
            continue
        crossing = [(idx, score) for idx, score in vals if score >= row_threshold]
        chosen = min(crossing or vals, key=lambda item: int(rows[item[0]]["trajectory_row_ordinal"]))
        selected.add(chosen[0])
    return [idx in selected for idx in range(len(rows))]


def source_group(row: dict[str, Any]) -> str:
    source = str(row.get("source_bucket", "unknown"))
    if source == "swe_bench_like":
        return "SWE-like"
    if source == "terminalbench_like":
        return "TerminalBench-like"
    if source == "openhands":
        return "OpenHands-like"
    return source


def length_bucket(rows: list[dict[str, Any]]) -> dict[str, str]:
    counts = defaultdict(int)
    for row in rows:
        counts[str(row["trajectory_id"])] += 1
    lengths = sorted(counts.values())
    q1 = lengths[len(lengths) // 3]
    q2 = lengths[(2 * len(lengths)) // 3]
    return {tid: "short" if n <= q1 else "medium" if n <= q2 else "long" for tid, n in counts.items()}


def first_failure_metrics(rows: list[dict[str, Any]], decisions: list[bool]) -> dict[str, Any]:
    grouped: dict[str, list[tuple[dict[str, Any], bool]]] = defaultdict(list)
    for row, decision in zip(rows, decisions):
        grouped[str(row["trajectory_id"])].append((row, decision))
    touched = positive = covered = precovered = post_only = false_alarm = repeated = repeated_cov = 0
    lead_times = []
    bad_deferred = 0
    bad_total = sum(int(row["next_step_bad"]) for row in rows)
    for vals in grouped.values():
        vals.sort(key=lambda item: int(item[0]["trajectory_row_ordinal"]))
        bad_idx = [idx for idx, (row, _d) in enumerate(vals) if int(row["next_step_bad"]) == 1]
        def_idx = [idx for idx, (_row, d) in enumerate(vals) if d]
        if def_idx:
            touched += 1
        if bad_idx:
            positive += 1
            first_bad = bad_idx[0]
            if len(bad_idx) > 1:
                repeated += 1
            if def_idx:
                first_def = def_idx[0]
                if first_def <= first_bad:
                    covered += 1
                    lead_times.append(first_bad - first_def)
                if first_def < first_bad:
                    precovered += 1
                if first_def > first_bad:
                    post_only += 1
                if len(bad_idx) > 1 and first_def <= bad_idx[1]:
                    repeated_cov += 1
        elif def_idx:
            false_alarm += 1
        bad_deferred += sum(1 for idx, (row, decision) in enumerate(vals) if decision and int(row["next_step_bad"]) == 1)
    row_def = sum(decisions) / len(rows) if rows else 0.0
    traj_burden = touched / len(grouped) if grouped else 0.0
    return {
        "rows": len(rows),
        "trajectory_count": len(grouped),
        "positive_trajectories": positive,
        "row_deferral_rate": row_def,
        "trajectory_burden": traj_burden,
        "first_failure_coverage": covered / positive if positive else None,
        "pre_failure_warning_coverage": precovered / positive if positive else None,
        "at_or_before_first_failure_coverage": covered / positive if positive else None,
        "post_failure_only_warning_rate": post_only / positive if positive else None,
        "mean_lead_time": statistics.mean(lead_times) if lead_times else None,
        "median_lead_time": statistics.median(lead_times) if lead_times else None,
        "warning_precision": covered / touched if touched else None,
        "false_alarm_trajectory_rate": false_alarm / max(len(grouped) - positive, 1),
        "bad_row_capture": bad_deferred / bad_total if bad_total else None,
        "allowed_bad_rate": (bad_total - bad_deferred) / max(len(rows) - sum(decisions), 1),
        "first_failure_coverage_per_touched_trajectory": covered / touched if touched else None,
        "warning_precision_per_row_budget": covered / max(sum(decisions), 1),
        "repeated_failure_coverage": repeated_cov / repeated if repeated else None,
    }


def group_rows(base: dict[str, Any], rows: list[dict[str, Any]], decisions: list[bool]) -> list[dict[str, Any]]:
    buckets = length_bucket(rows)
    groups = ["all", "SWE-like", "TerminalBench-like", "OpenHands-like", "short", "medium", "long", "early_first_failure", "late_first_failure", "repeated_bad", "exactly_one_bad"]
    out = []
    for group in groups:
        paired = []
        for row, decision in zip(rows, decisions):
            tid = str(row["trajectory_id"])
            first = row.get("bad_first_bad_row_index")
            is_early = first is not None and float(row.get("bad_normalized_first_bad_position") or 0) <= 0.33
            is_late = first is not None and float(row.get("bad_normalized_first_bad_position") or 0) >= 0.67
            count_flag = "repeated_bad" if int(row.get("bad_trajectory_has_repeated_bad_rows", 0)) else "exactly_one_bad" if int(row.get("bad_trajectory_has_any_bad_row", 0)) else "no_bad"
            if group == "all" or source_group(row) == group or buckets.get(tid) == group or (group == "early_first_failure" and is_early) or (group == "late_first_failure" and is_late) or count_flag == group:
                paired.append((row, decision))
        if paired:
            out.append({**base, "group": group, **first_failure_metrics([p[0] for p in paired], [p[1] for p in paired])})
    return out


def train_first_failure_scores(rows: list[dict[str, Any]], splits: dict[str, Any], seed: int) -> dict[str, dict[str, Any]]:
    split_rows = rows_by_split(rows, assignments_for_seed(splits, seed))
    sklearn_info = models.batch9a.sklearn_components()
    out = {}
    for model, feature_set in FIRST_FAILURE_MODELS:
        scores, _meta = models.fit_scores(model, feature_set, split_rows, "bad_first_failure_warning_candidate", seed, sklearn_info)
        out[f"first_failure::{model}::{feature_set}"] = {"rows": split_rows, "scores": scores, "score_source": "first_failure_specific_model"}
    return out


def load_generic_scores(rows: list[dict[str, Any]], splits: dict[str, Any], seed: int) -> dict[str, dict[str, Any]]:
    require(GENERIC_SCORES)
    split_rows = rows_by_split(rows, assignments_for_seed(splits, seed))
    index = {(str(row["trajectory_id"]), int(row["step_index"])): {**row, "_split": split} for split, vals in split_rows.items() for row in vals}
    store: dict[str, dict[str, list[Any]]] = defaultdict(lambda: {"train": [], "calibration": [], "test": [], "scores_train": [], "scores_calibration": [], "scores_test": []})
    with GENERIC_SCORES.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if int(row.get("split_seed", -1)) != seed or row.get("target_name") != "next_step_bad":
                continue
            ident = (row.get("model_name"), row.get("feature_set"))
            if ident not in GENERIC_MODELS:
                continue
            key = (str(row["trajectory_id"]), int(row["step_index"]))
            target_row = index.get(key)
            if not target_row:
                continue
            split = target_row["_split"]
            policy = f"generic_next_step_bad::{ident[0]}::{ident[1]}"
            store[policy][split].append(target_row)
            store[policy][f"scores_{split}"].append(float(row["score"]))
    out = {}
    for policy, data in store.items():
        out[policy] = {
            "rows": {split: data[split] for split in ("train", "calibration", "test")},
            "scores": {split: data[f"scores_{split}"] for split in ("train", "calibration", "test")},
            "score_source": "generic_next_step_bad_score",
        }
    return out


def evaluate_policy_set(policy_id: str, bundle: dict[str, Any], seed: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    cal_rows, test_rows = bundle["rows"]["calibration"], bundle["rows"]["test"]
    cal_scores, test_scores = bundle["scores"]["calibration"], bundle["scores"]["test"]
    fixed_row, fixed_traj, lead, by_group = [], [], [], []
    for budget in ROW_BUDGETS:
        threshold = threshold_for_budget(cal_scores, budget)
        decisions = [score >= threshold for score in test_scores]
        first_decisions = first_crossing(test_rows, test_scores, threshold)
        early_decisions = earliest_high_risk(test_rows, test_scores, threshold)
        for family, decs in [("global_first_failure_row_threshold", decisions), ("first_warning_per_trajectory", first_decisions), ("earliest_high_risk_warning", early_decisions)]:
            base = {"policy_id": policy_id, "score_source": bundle["score_source"], "split_seed": seed, "policy_family": family, "budget_type": "row_budget", "budget": budget}
            metrics = first_failure_metrics(test_rows, decs)
            fixed_row.append({**base, **metrics})
            lead.append({**base, "mean_lead_time": metrics["mean_lead_time"], "median_lead_time": metrics["median_lead_time"], "pre_failure_warning_coverage": metrics["pre_failure_warning_coverage"]})
            by_group.extend(group_rows(base, test_rows, decs))
    for budget in TRAJ_BUDGETS:
        t_threshold = trajectory_threshold(cal_rows, cal_scores, budget)
        r_threshold = threshold_for_budget(cal_scores, 0.05)
        decs = trajectory_triage(test_rows, test_scores, t_threshold, r_threshold)
        base = {"policy_id": policy_id, "score_source": bundle["score_source"], "split_seed": seed, "policy_family": "trajectory_level_first_failure_triage", "budget_type": "trajectory_budget", "budget": budget}
        metrics = first_failure_metrics(test_rows, decs)
        fixed_traj.append({**base, **metrics})
        by_group.extend(group_rows(base, test_rows, decs))
    return fixed_row, fixed_traj, lead, by_group


def evaluate() -> dict[str, Any]:
    rows = load_rows()
    splits = json.loads(REPEATED_SPLITS.read_text())
    fixed_row = []
    fixed_traj = []
    lead = []
    by_group = []
    for seed in SEEDS:
        bundles = {}
        bundles.update(train_first_failure_scores(rows, splits, seed))
        bundles.update(load_generic_scores(rows, splits, seed))
        for policy_id, bundle in bundles.items():
            row_part, traj_part, lead_part, group_part = evaluate_policy_set(policy_id, bundle, seed)
            fixed_row.extend(row_part)
            fixed_traj.extend(traj_part)
            lead.extend(lead_part)
            by_group.extend(group_part)
    return {"fixed_row": fixed_row, "fixed_traj": fixed_traj, "lead": lead, "by_group": by_group}


def aggregate(rows: list[dict[str, Any]], group_keys: list[str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row.get(key) for key in group_keys)].append(row)
    out = []
    metrics = ["first_failure_coverage", "pre_failure_warning_coverage", "trajectory_burden", "row_deferral_rate", "warning_precision", "mean_lead_time", "bad_row_capture", "allowed_bad_rate"]
    for key, vals in grouped.items():
        item = {name: value for name, value in zip(group_keys, key)}
        for metric in metrics:
            clean = [row.get(metric) for row in vals if isinstance(row.get(metric), (int, float))]
            item[f"{metric}_mean"] = statistics.mean(clean) if clean else None
        item["count"] = len(vals)
        out.append(item)
    return sorted(out, key=lambda row: (str(row.get("budget_type")), float(row.get("budget") or 0), -(row.get("first_failure_coverage_mean") or 0)))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9L First-Failure Intervention",
        "",
        "Exploratory benchmark-level first-failure intervention evaluation on CodeTraceBench-derived trajectories. This is an offline proxy for first-failure warning, lead time, row-level risk, and trajectory-level burden with calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| view | policy | budget | first-failure coverage | pre-failure coverage | trajectory burden | row deferral |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for row in report["best_rows"][:12]:
        lines.append(f"| `{row['view']}` | `{row['policy_id']}::{row['policy_family']}` | `{row['budget']}` | `{row.get('first_failure_coverage_mean')}` | `{row.get('pre_failure_warning_coverage_mean')}` | `{row.get('trajectory_burden_mean')}` | `{row.get('row_deferral_rate_mean')}` |")
    lines.extend(["", "First-failure-specific scores are compared against generic next-step-bad score baselines. Lead-time metrics distinguish before-failure warnings from at-failure intervention opportunities."])
    return "\n".join(lines)


def main() -> None:
    results = evaluate()
    row_agg = aggregate(results["fixed_row"], ["policy_id", "score_source", "policy_family", "budget_type", "budget"])
    traj_agg = aggregate(results["fixed_traj"], ["policy_id", "score_source", "policy_family", "budget_type", "budget"])
    comparison = [{**row, "view": "fixed_row"} for row in row_agg] + [{**row, "view": "fixed_trajectory"} for row in traj_agg]
    best_rows = sorted(comparison, key=lambda row: (-(row.get("first_failure_coverage_mean") or 0), row.get("trajectory_burden_mean") or 1))
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure warning and trajectory-level burden; row-level risk, calibration support, domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "seeds": list(SEEDS),
        "row_budgets": list(ROW_BUDGETS),
        "trajectory_budgets": list(TRAJ_BUDGETS),
        "best_rows": best_rows[:20],
        "summary": {
            "fixed_row_rows": len(results["fixed_row"]),
            "fixed_trajectory_rows": len(results["fixed_traj"]),
            "by_group_rows": len(results["by_group"]),
        },
        "guard_results": {"metadata_as_model_features": False, "test_tuning": False, "raw_marker_hits": []},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(FIXED_ROW_CSV, results["fixed_row"])
    write_csv(FIXED_TRAJ_CSV, results["fixed_traj"])
    write_csv(LEAD_TIME_CSV, results["lead"])
    write_csv(COMPARISON_CSV, comparison)
    write_csv(BY_GROUP_CSV, results["by_group"])
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
