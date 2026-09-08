#!/usr/bin/env python3
"""Analyze Batch 9N first-event selected policies by group and shift proxies."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import build_first_event_policy_table as policy_table
import first_event_calibration_utils as utils
import hybrid_failure_onset_utils as hybrid_utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
SELECTED_CSV = REPORTS_DIR / "batch_9n_first_event_selected_policies.csv"
REPORT_JSON = REPORTS_DIR / "batch_9n_first_event_groups_shift.json"
REPORT_MD = REPORTS_DIR / "batch_9n_first_event_groups_shift.md"
SOURCE_CSV = REPORTS_DIR / "batch_9n_first_event_by_source_group.csv"
TIMING_CSV = REPORTS_DIR / "batch_9n_first_event_by_timing_group.csv"


def load_selected() -> list[dict[str, Any]]:
    utils.require(SELECTED_CSV)
    with SELECTED_CSV.open() as handle:
        return list(csv.DictReader(handle))


def fnum(row: dict[str, Any], key: str, default: float | None = None) -> float | None:
    value = row.get(key)
    if value in ("", None):
        return default
    return float(value)


def decisions_for_selected(row: dict[str, Any], bundles: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[bool]]:
    seed = int(row["split_seed"])
    score_family = row["score_family"]
    variant = row["policy_variant"]
    if variant == "peak_then_confirm":
        if score_family == "peak_confirm_exact_logistic":
            primary, confirm = bundles["ff_exact_hgb_interactions"], bundles["generic_bad_logistic_history"]
        else:
            primary, confirm = bundles["ff_warning_rf_structured"], bundles["generic_bad_hgb_interactions"]
        rows, primary_scores, confirm_scores = hybrid_utils.align_scores(primary, confirm, "test")
        decisions = utils.peak_then_confirm(rows, primary_scores, confirm_scores, fnum(row, "row_threshold", 1.0) or 1.0, fnum(row, "confirm_threshold", 1.0) or 1.0)
        return rows, decisions
    bundle = bundles[score_family]
    rows = bundle["rows"]["test"]
    scores = bundle["scores"]["test"]
    thresholds = {
        "row_threshold": fnum(row, "row_threshold", 1.0) or 1.0,
        "trajectory_top3_threshold": fnum(row, "trajectory_top3_threshold", 1.0) or 1.0,
        "cumulative_threshold": fnum(row, "cumulative_threshold", 1.0) or 1.0,
        "early_weighted_threshold": fnum(row, "early_weighted_threshold", 1.0) or 1.0,
    }
    decisions = policy_table.decisions_for_variant(rows, scores, variant, thresholds)
    return rows, decisions


def trajectory_group_label(rows: list[dict[str, Any]], group: str, row: dict[str, Any], buckets: dict[str, str]) -> bool:
    tid = str(row["trajectory_id"])
    first_pos = row.get("bad_normalized_first_bad_position")
    any_bad = int(row.get("bad_trajectory_has_any_bad_row", 0))
    repeated = int(row.get("bad_trajectory_has_repeated_bad_rows", 0))
    if group == "all":
        return True
    if utils.source_group(row) == group:
        return True
    if buckets.get(tid) == group:
        return True
    if group == "early_first_failure" and first_pos is not None and first_pos != "" and float(first_pos) <= 0.33:
        return True
    if group == "late_first_failure" and first_pos is not None and first_pos != "" and float(first_pos) >= 0.67:
        return True
    if group == "repeated_bad" and repeated:
        return True
    if group == "exactly_one_bad" and any_bad and not repeated:
        return True
    if group == "no_bad" and not any_bad:
        return True
    return False


def group_metrics(base: dict[str, Any], rows: list[dict[str, Any]], decisions: list[bool], groups: list[str]) -> list[dict[str, Any]]:
    buckets = utils.length_buckets(rows)
    out = []
    for group in groups:
        paired = [(row, decision) for row, decision in zip(rows, decisions) if trajectory_group_label(rows, group, row, buckets)]
        if not paired:
            continue
        out.append({**base, "group": group, **utils.event_metrics([p[0] for p in paired], [p[1] for p in paired])})
    return out


def evaluate() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected = load_selected()
    rows = hybrid_utils.load_rows()
    splits = hybrid_utils.load_splits()
    by_seed: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in selected:
        # Keep the group report compact and interpretable.
        if row["selector"] not in {"max_coverage_under_burden", "max_event_utility", "crc_style_event_loss_proxy"}:
            continue
        by_seed[int(row["split_seed"])].append(row)
    source_rows: list[dict[str, Any]] = []
    timing_rows: list[dict[str, Any]] = []
    for seed, selected_rows in by_seed.items():
        split_rows = hybrid_utils.rows_by_split(rows, splits, seed)
        bundles = utils.build_score_bundles(split_rows, seed)
        for row in selected_rows:
            test_rows, decisions = decisions_for_selected(row, bundles)
            base = {key: row.get(key) for key in ["split_seed", "selector", "score_family", "score_type", "policy_variant", "threshold_quantile", "beta", "phi", "alpha"]}
            source_rows.extend(group_metrics(base, test_rows, decisions, ["all", "SWE-like", "TerminalBench-like", "OpenHands-like", "no_bad"]))
            timing_rows.extend(group_metrics(base, test_rows, decisions, ["short", "medium", "long", "early_first_failure", "late_first_failure", "repeated_bad", "exactly_one_bad"]))
    return source_rows, timing_rows


def markdown(report: dict[str, Any]) -> str:
    return "\n".join([
        "# Batch 9N First-Event Groups and Shift Diagnostics",
        "",
        "This benchmark-level CodeTraceBench-derived offline proxy stratifies selected first-event and first-failure warning policies by source/timing groups using trajectory-level loss and trajectory-level burden metrics. Metadata is used for evaluation grouping only, not as model features. The analysis includes calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Source/group rows: `{report['summary']['source_group_rows']}`",
        f"- Timing/group rows: `{report['summary']['timing_group_rows']}`",
        f"- OpenHands rows: `{report['summary']['openhands_rows']}`",
    ])


def main() -> None:
    source_rows, timing_rows = evaluate()
    openhands = [row for row in source_rows if row["group"] == "OpenHands-like"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-event and first-failure trajectory-level loss, trajectory-level burden, calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "summary": {
            "source_group_rows": len(source_rows),
            "timing_group_rows": len(timing_rows),
            "openhands_rows": len(openhands),
        },
        "aggregate_source_groups": utils.aggregate(source_rows, ["selector", "group"], ["first_failure_coverage", "pre_failure_warning_coverage", "false_alarm_trajectory_rate", "trajectory_burden", "event_level_utility"]),
        "aggregate_timing_groups": utils.aggregate(timing_rows, ["selector", "group"], ["first_failure_coverage", "pre_failure_warning_coverage", "false_alarm_trajectory_rate", "trajectory_burden", "event_level_utility"]),
        "guard_results": {"metadata_as_model_features": False, "raw_marker_hits": [], "test_tuning": False},
    }
    utils.write_csv(SOURCE_CSV, source_rows)
    utils.write_csv(TIMING_CSV, timing_rows)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
