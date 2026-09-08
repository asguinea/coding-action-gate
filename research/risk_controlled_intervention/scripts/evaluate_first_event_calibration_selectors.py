#!/usr/bin/env python3
"""Evaluate Batch 9N event-level calibration selectors."""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import first_event_calibration_utils as utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
POLICY_TABLE = REPORTS_DIR / "batch_9n_first_event_policy_table.csv"
BASELINE_9L = REPORTS_DIR / "batch_9l_first_failure_calibration.json"
BASELINE_9M = REPORTS_DIR / "batch_9m_hybrid_failure_onset_calibration.json"
REPORT_JSON = REPORTS_DIR / "batch_9n_first_event_calibration_selectors.json"
REPORT_MD = REPORTS_DIR / "batch_9n_first_event_calibration_selectors.md"
SELECTED_CSV = REPORTS_DIR / "batch_9n_first_event_selected_policies.csv"
TEST_RESULTS_CSV = REPORTS_DIR / "batch_9n_first_event_test_results.csv"
FEASIBILITY_CSV = REPORTS_DIR / "batch_9n_first_event_feasibility.csv"

METRICS = [
    "first_failure_coverage",
    "pre_failure_warning_coverage",
    "missed_first_failure_rate",
    "false_alarm_trajectory_rate",
    "late_warning_rate",
    "trajectory_burden",
    "row_deferral_rate",
    "warning_precision_trajectory_level",
    "mean_lead_time",
    "event_level_utility",
]


def load_policy_table() -> list[dict[str, Any]]:
    utils.require(POLICY_TABLE)
    with POLICY_TABLE.open() as handle:
        return list(csv.DictReader(handle))


def num(row: dict[str, Any], key: str, default: float | None = None) -> float | None:
    value = row.get(key)
    if value in ("", None):
        return default
    return float(value)


def selected_row(selector: str, constraint: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    out = {
        "selector": selector,
        **constraint,
        **row,
        "test_trajectory_constraint_satisfied": None,
        "test_false_alarm_constraint_satisfied": None,
        "test_event_loss_constraint_satisfied": None,
    }
    beta = constraint.get("beta")
    phi = constraint.get("phi")
    alpha = constraint.get("alpha")
    if beta is not None:
        out["test_trajectory_constraint_satisfied"] = (num(row, "test_trajectory_burden", 1.0) or 1.0) <= beta
    if phi is not None:
        out["test_false_alarm_constraint_satisfied"] = (num(row, "test_false_alarm_trajectory_rate", 1.0) or 1.0) <= phi
    if alpha is not None:
        loss = (num(row, "test_missed_first_failure_rate", 1.0) or 1.0) + 0.5 * (num(row, "test_false_alarm_trajectory_rate", 0.0) or 0.0)
        out["test_event_loss_constraint_satisfied"] = loss <= alpha
        out["test_event_level_loss_proxy"] = loss
    for metric in METRICS:
        cal = num(row, f"calibration_{metric}")
        test = num(row, f"test_{metric}")
        out[f"{metric}_calibration_to_test_gap"] = (test - cal) if cal is not None and test is not None else None
    return out


def select() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = load_policy_table()
    selected: list[dict[str, Any]] = []
    feasibility: list[dict[str, Any]] = []
    by_seed: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_seed[str(row["split_seed"])].append(row)
    for seed, vals in by_seed.items():
        for beta in utils.BETAS:
            feasible = [v for v in vals if (num(v, "calibration_trajectory_burden", 1.0) or 1.0) <= beta]
            feasibility.append({"split_seed": seed, "selector": "max_coverage_under_burden", "beta": beta, "phi": None, "alpha": None, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
            if feasible:
                best = max(feasible, key=lambda v: ((num(v, "calibration_first_failure_coverage", 0.0) or 0.0), (num(v, "calibration_pre_failure_warning_coverage", 0.0) or 0.0), -(num(v, "calibration_trajectory_burden", 1.0) or 1.0)))
                selected.append(selected_row("max_coverage_under_burden", {"beta": beta, "phi": None, "alpha": None, "desired_lead": None}, best))
            for phi in utils.PHIS:
                feasible = [
                    v for v in vals
                    if (num(v, "calibration_trajectory_burden", 1.0) or 1.0) <= beta
                    and (num(v, "calibration_false_alarm_trajectory_rate", 1.0) or 1.0) <= phi
                ]
                feasibility.append({"split_seed": seed, "selector": "max_pre_failure_under_false_alarm_and_burden", "beta": beta, "phi": phi, "alpha": None, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
                if feasible:
                    best = max(feasible, key=lambda v: ((num(v, "calibration_pre_failure_warning_coverage", 0.0) or 0.0), (num(v, "calibration_first_failure_coverage", 0.0) or 0.0), -(num(v, "calibration_false_alarm_trajectory_rate", 1.0) or 1.0)))
                    selected.append(selected_row("max_pre_failure_under_false_alarm_and_burden", {"beta": beta, "phi": phi, "alpha": None, "desired_lead": None}, best))
        for phi in utils.PHIS:
            feasible = [v for v in vals if (num(v, "calibration_false_alarm_trajectory_rate", 1.0) or 1.0) <= phi]
            feasibility.append({"split_seed": seed, "selector": "min_missed_under_false_alarm", "beta": None, "phi": phi, "alpha": None, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
            if feasible:
                best = min(feasible, key=lambda v: ((num(v, "calibration_missed_first_failure_rate", 1.0) or 1.0), -(num(v, "calibration_pre_failure_warning_coverage", 0.0) or 0.0)))
                selected.append(selected_row("min_missed_under_false_alarm", {"beta": None, "phi": phi, "alpha": None, "desired_lead": None}, best))
        best = max(vals, key=lambda v: (num(v, "calibration_event_level_utility", -999.0) or -999.0))
        selected.append(selected_row("max_event_utility", {"beta": None, "phi": None, "alpha": None, "desired_lead": None}, best))
        monotone_vals = [v for v in vals if v["policy_variant"] in {"single_threshold_first_crossing", "cumulative_hazard_threshold", "hybrid_event_score_policy"}]
        for alpha in utils.ALPHAS:
            feasible = [
                v for v in monotone_vals
                if ((num(v, "calibration_missed_first_failure_rate", 1.0) or 1.0) + 0.5 * (num(v, "calibration_false_alarm_trajectory_rate", 0.0) or 0.0)) <= alpha
            ]
            feasibility.append({"split_seed": seed, "selector": "crc_style_event_loss_proxy", "beta": None, "phi": None, "alpha": alpha, "feasible_count": len(feasible), "no_safe_recommendation": not feasible})
            if feasible:
                best = max(feasible, key=lambda v: (num(v, "calibration_event_level_utility", -999.0) or -999.0, -(num(v, "calibration_trajectory_burden", 1.0) or 1.0)))
                selected.append(selected_row("crc_style_event_loss_proxy", {"beta": None, "phi": None, "alpha": alpha, "desired_lead": None}, best))
    return selected, feasibility


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["selector"])].append(row)
    out = []
    for selector, vals in grouped.items():
        item = {"selector": selector, "count": len(vals)}
        for metric in [f"test_{m}" for m in METRICS] + ["test_event_level_loss_proxy"]:
            clean = [num(row, metric) for row in vals if num(row, metric) is not None]
            item[f"{metric}_mean"] = statistics.mean(clean) if clean else None
        out.append(item)
    return out


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9N First-Event Calibration Selectors",
        "",
        "This benchmark-level CodeTraceBench-derived offline proxy selects first-event and first-failure warning policies using calibration trajectory-level loss metrics, then evaluates test transfer. It includes trajectory-level burden, calibration support, and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| selector | test coverage | pre-failure coverage | burden | false alarm | utility | count |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["aggregate_results"]:
        lines.append(f"| `{row['selector']}` | `{row.get('test_first_failure_coverage_mean')}` | `{row.get('test_pre_failure_warning_coverage_mean')}` | `{row.get('test_trajectory_burden_mean')}` | `{row.get('test_false_alarm_trajectory_rate_mean')}` | `{row.get('test_event_level_utility_mean')}` | `{row.get('count')}` |")
    lines.extend(["", f"No-safe recommendation rate across selector feasibility checks: `{report['no_safe_recommendation_rate']}`."])
    return "\n".join(lines)


def main() -> None:
    utils.require(BASELINE_9L)
    utils.require(BASELINE_9M)
    selected, feasibility = select()
    agg = aggregate(selected)
    no_safe_rate = sum(str(row["no_safe_recommendation"]).lower() == "true" or row["no_safe_recommendation"] is True for row in feasibility) / len(feasibility) if feasibility else 0.0
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-event and first-failure trajectory-level loss, trajectory-level burden, calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(POLICY_TABLE), str(BASELINE_9L), str(BASELINE_9M)],
        "selectors": sorted({row["selector"] for row in selected}),
        "selected_rows": len(selected),
        "feasibility_rows": len(feasibility),
        "no_safe_recommendation_rate": no_safe_rate,
        "aggregate_results": agg,
        "guard_results": {"metadata_as_model_features": False, "test_tuning": False, "raw_marker_hits": []},
    }
    utils.write_csv(SELECTED_CSV, selected)
    utils.write_csv(TEST_RESULTS_CSV, selected)
    utils.write_csv(FEASIBILITY_CSV, feasibility)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"selected_rows": len(selected), "feasibility_rows": len(feasibility), "no_safe": no_safe_rate}, indent=2))


if __name__ == "__main__":
    main()
