#!/usr/bin/env python3
"""Calibration-based first-failure policy selection for Batch 9L."""

from __future__ import annotations

import csv
import importlib.util
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9l_first_failure_calibration.json"
REPORT_MD = REPORTS_DIR / "batch_9l_first_failure_calibration.md"
RESULTS_CSV = REPORTS_DIR / "batch_9l_first_failure_calibration_results.csv"
FEASIBILITY_CSV = REPORTS_DIR / "batch_9l_first_failure_calibration_feasibility.csv"

BETAS = (0.10, 0.25, 0.50)
ETAS = (0.20, 0.30, 0.40)


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


intervention = load_script("evaluate_first_failure_intervention_policies")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def candidate_metrics(rows: list[dict[str, Any]], scores: list[float], policy_family: str, budget: float) -> dict[str, Any]:
    if policy_family == "first_warning_per_trajectory":
        threshold = intervention.threshold_for_budget(scores, budget)
        decisions = intervention.first_crossing(rows, scores, threshold)
    elif policy_family == "trajectory_level_first_failure_triage":
        t = intervention.trajectory_threshold(rows, scores, budget)
        r = intervention.threshold_for_budget(scores, 0.05)
        decisions = intervention.trajectory_triage(rows, scores, t, r)
    else:
        threshold = intervention.threshold_for_budget(scores, budget)
        decisions = [score >= threshold for score in scores]
    return intervention.first_failure_metrics(rows, decisions)


def build_candidates() -> list[dict[str, Any]]:
    rows = intervention.load_rows()
    splits = json.loads(intervention.REPEATED_SPLITS.read_text())
    all_candidates = []
    for seed in intervention.SEEDS:
        bundles = {}
        bundles.update(intervention.train_first_failure_scores(rows, splits, seed))
        bundles.update(intervention.load_generic_scores(rows, splits, seed))
        for policy_id, bundle in bundles.items():
            for family in ("global_first_failure_row_threshold", "first_warning_per_trajectory", "trajectory_level_first_failure_triage"):
                budgets = intervention.TRAJ_BUDGETS if family == "trajectory_level_first_failure_triage" else intervention.ROW_BUDGETS
                for budget in budgets:
                    cal = candidate_metrics(bundle["rows"]["calibration"], bundle["scores"]["calibration"], family, budget)
                    test = candidate_metrics(bundle["rows"]["test"], bundle["scores"]["test"], family, budget)
                    all_candidates.append({
                        "split_seed": seed,
                        "policy_id": policy_id,
                        "score_source": bundle["score_source"],
                        "policy_family": family,
                        "budget": budget,
                        "calibration_first_failure_coverage": cal["first_failure_coverage"],
                        "calibration_pre_failure_warning_coverage": cal["pre_failure_warning_coverage"],
                        "calibration_warning_precision": cal["warning_precision"],
                        "calibration_trajectory_burden": cal["trajectory_burden"],
                        "calibration_false_alarm_trajectory_rate": cal["false_alarm_trajectory_rate"],
                        "calibration_post_failure_only_warning_rate": cal["post_failure_only_warning_rate"],
                        "test_first_failure_coverage": test["first_failure_coverage"],
                        "test_pre_failure_warning_coverage": test["pre_failure_warning_coverage"],
                        "test_warning_precision": test["warning_precision"],
                        "test_trajectory_burden": test["trajectory_burden"],
                        "test_false_alarm_trajectory_rate": test["false_alarm_trajectory_rate"],
                        "test_post_failure_only_warning_rate": test["post_failure_only_warning_rate"],
                    })
    return all_candidates


def select(candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected = []
    feasibility = []
    by_seed: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        by_seed[int(row["split_seed"])].append(row)
    for seed, vals in by_seed.items():
        for beta in BETAS:
            feasible = [v for v in vals if (v.get("calibration_trajectory_burden") or 1.0) <= beta]
            feasibility.append({"split_seed": seed, "selector": "max_first_failure_subject_to_beta", "beta": beta, "feasible_count": len(feasible), "no_safe_recommendation": len(feasible) == 0})
            if feasible:
                best = max(feasible, key=lambda v: ((v.get("calibration_first_failure_coverage") or 0), (v.get("calibration_pre_failure_warning_coverage") or 0), -(v.get("calibration_trajectory_burden") or 0)))
                selected.append({"selector": "max_first_failure_subject_to_beta", "beta": beta, "eta": None, **best})
            feasible = [v for v in vals if (v.get("calibration_trajectory_burden") or 1.0) <= beta]
            if feasible:
                best = max(feasible, key=lambda v: ((v.get("calibration_pre_failure_warning_coverage") or 0), (v.get("calibration_first_failure_coverage") or 0), -(v.get("calibration_trajectory_burden") or 0)))
                selected.append({"selector": "max_pre_failure_subject_to_beta", "beta": beta, "eta": None, **best})
        for eta in ETAS:
            feasible = [v for v in vals if (v.get("calibration_first_failure_coverage") or 0) >= eta]
            feasibility.append({"split_seed": seed, "selector": "max_precision_subject_to_eta", "eta": eta, "feasible_count": len(feasible), "no_safe_recommendation": len(feasible) == 0})
            if feasible:
                best = max(feasible, key=lambda v: ((v.get("calibration_warning_precision") or 0), -(v.get("calibration_trajectory_burden") or 0)))
                selected.append({"selector": "max_precision_subject_to_eta", "beta": None, "eta": eta, **best})
            feasible = [v for v in vals if (v.get("calibration_first_failure_coverage") or 0) >= eta]
            if feasible:
                best = min(feasible, key=lambda v: ((v.get("calibration_post_failure_only_warning_rate") or 1), v.get("calibration_trajectory_burden") or 1))
                selected.append({"selector": "min_post_failure_subject_to_eta", "beta": None, "eta": eta, **best})
        best = max(vals, key=lambda v: (v.get("calibration_first_failure_coverage") or 0) + (v.get("calibration_pre_failure_warning_coverage") or 0) - 0.5 * (v.get("calibration_false_alarm_trajectory_rate") or 0) - 0.5 * (v.get("calibration_trajectory_burden") or 0) - 0.25 * (v.get("calibration_post_failure_only_warning_rate") or 0))
        selected.append({"selector": "balanced_first_failure_utility", "beta": None, "eta": None, **best})
    return selected, feasibility


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["selector"])].append(row)
    out = []
    for selector, vals in grouped.items():
        item = {"selector": selector, "count": len(vals)}
        for key in ("first_failure_coverage", "pre_failure_warning_coverage", "warning_precision", "trajectory_burden", "false_alarm_trajectory_rate", "post_failure_only_warning_rate"):
            cal = [v[f"calibration_{key}"] for v in vals if isinstance(v.get(f"calibration_{key}"), (int, float))]
            test = [v[f"test_{key}"] for v in vals if isinstance(v.get(f"test_{key}"), (int, float))]
            item[f"calibration_{key}_mean"] = statistics.mean(cal) if cal else None
            item[f"test_{key}_mean"] = statistics.mean(test) if test else None
            item[f"calibration_to_test_{key}_gap_mean"] = statistics.mean([(v.get(f"calibration_{key}") or 0) - (v.get(f"test_{key}") or 0) for v in vals]) if vals else None
        out.append(item)
    return out


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9L First-Failure Calibration",
        "",
        "Exploratory benchmark-level calibration-based first-failure policy selection on CodeTraceBench-derived trajectories. This is an offline proxy for row-level risk and trajectory-level burden with calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| selector | count | test first-failure coverage | test pre-failure coverage | test trajectory burden |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in report["aggregate_results"]:
        lines.append(f"| `{row['selector']}` | `{row['count']}` | `{row.get('test_first_failure_coverage_mean')}` | `{row.get('test_pre_failure_warning_coverage_mean')}` | `{row.get('test_trajectory_burden_mean')}` |")
    return "\n".join(lines)


def main() -> None:
    candidates = build_candidates()
    selected, feasibility = select(candidates)
    agg = aggregate(selected)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure calibration support and domain shift caveats; row-level risk and trajectory-level burden; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "selectors": sorted({row["selector"] for row in selected}),
        "selected_rows": len(selected),
        "aggregate_results": agg,
        "constraint_violation_fields": ["trajectory_burden_exceeds_beta_where_applicable"],
        "no_safe_recommendation_rate": sum(1 for row in feasibility if row["no_safe_recommendation"]) / len(feasibility) if feasibility else 0.0,
        "guard_results": {"test_tuning": False, "metadata_as_model_features": False, "raw_marker_hits": []},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(RESULTS_CSV, selected)
    write_csv(FEASIBILITY_CSV, feasibility)
    print(json.dumps({"selected_rows": len(selected), "feasibility_rows": len(feasibility)}, indent=2))


if __name__ == "__main__":
    main()
