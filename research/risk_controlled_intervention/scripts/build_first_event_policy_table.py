#!/usr/bin/env python3
"""Build Batch 9N trajectory-level first-event policy table."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import first_event_calibration_utils as utils
import hybrid_failure_onset_utils as hybrid_utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9n_first_event_policy_table.json"
REPORT_MD = REPORTS_DIR / "batch_9n_first_event_policy_table.md"
TABLE_CSV = REPORTS_DIR / "batch_9n_first_event_policy_table.csv"


METRIC_KEYS = [
    "first_failure_coverage",
    "pre_failure_warning_coverage",
    "missed_first_failure_rate",
    "late_warning_rate",
    "false_alarm_trajectory_rate",
    "clean_trajectory_specificity",
    "trajectory_burden",
    "row_deferral_rate",
    "mean_lead_time",
    "median_lead_time",
    "warning_precision_trajectory_level",
    "event_level_utility",
    "bad_row_capture",
    "allowed_bad_rate",
]


def threshold_values(rows: list[dict[str, Any]], scores: list[float], q: float) -> dict[str, float]:
    groups = utils.trajectory_groups(rows)
    top3 = [utils.top_k_mean([scores[idx] for idx in idxs], 3) for idxs in groups.values()]
    cumulative = utils.cumulative_scores(rows, scores)
    max_cumulative = [max(cumulative[idx] for idx in idxs) for idxs in groups.values()]
    early = [score * utils.early_weight(row) for row, score in zip(rows, scores)]
    return {
        "row_threshold": utils.quantile_threshold(scores, q),
        "trajectory_top3_threshold": utils.quantile_threshold(top3, q),
        "cumulative_threshold": utils.quantile_threshold(max_cumulative, q),
        "early_weighted_threshold": utils.quantile_threshold(early, q),
    }


def decisions_for_variant(rows: list[dict[str, Any]], scores: list[float], variant: str, thresholds: dict[str, float]) -> list[bool]:
    if variant == "single_threshold_first_crossing":
        return utils.single_threshold_first_crossing(rows, scores, thresholds["row_threshold"])
    if variant == "top_k_trajectory_first_warning":
        return utils.top_k_trajectory_first_warning(rows, scores, thresholds["trajectory_top3_threshold"], thresholds["row_threshold"])
    if variant == "cumulative_hazard_threshold":
        return utils.cumulative_hazard_threshold(rows, scores, thresholds["cumulative_threshold"])
    if variant == "early_weighted_threshold":
        weighted = [score * utils.early_weight(row) for row, score in zip(rows, scores)]
        return utils.single_threshold_first_crossing(rows, weighted, thresholds["early_weighted_threshold"])
    if variant == "hybrid_event_score_policy":
        return utils.single_threshold_first_crossing(rows, scores, thresholds["row_threshold"])
    raise ValueError(variant)


def row_from_metrics(base: dict[str, Any], cal_metrics: dict[str, Any], test_metrics: dict[str, Any]) -> dict[str, Any]:
    row = dict(base)
    row.update({f"calibration_{key}": cal_metrics.get(key) for key in METRIC_KEYS})
    row.update({f"test_{key}": test_metrics.get(key) for key in METRIC_KEYS})
    return row


def evaluate_score_family(seed: int, score_family: str, bundle: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    cal_rows = bundle["rows"]["calibration"]
    test_rows = bundle["rows"]["test"]
    cal_scores = bundle["scores"]["calibration"]
    test_scores = bundle["scores"]["test"]
    variants = ["single_threshold_first_crossing", "top_k_trajectory_first_warning", "cumulative_hazard_threshold", "early_weighted_threshold"]
    if bundle["score_type"] == "hybrid_failure_onset":
        variants.append("hybrid_event_score_policy")
    for variant in variants:
        for q in utils.QUANTILES:
            cal_thresholds = threshold_values(cal_rows, cal_scores, q)
            cal_decisions = decisions_for_variant(cal_rows, cal_scores, variant, cal_thresholds)
            test_decisions = decisions_for_variant(test_rows, test_scores, variant, cal_thresholds)
            base = {
                "split_seed": seed,
                "score_family": score_family,
                "score_type": bundle["score_type"],
                "policy_variant": variant,
                "threshold_quantile": q,
                **cal_thresholds,
                "selection_split": "calibration",
                "evaluation_split": "test",
            }
            out.append(row_from_metrics(base, utils.event_metrics(cal_rows, cal_decisions), utils.event_metrics(test_rows, test_decisions)))
    return out


def evaluate_peak_confirm(seed: int, bundles: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    specs = [
        ("peak_confirm_exact_logistic", "ff_exact_hgb_interactions", "generic_bad_logistic_history"),
        ("peak_confirm_warning_hgb", "ff_warning_rf_structured", "generic_bad_hgb_interactions"),
    ]
    out = []
    for score_family, primary_name, confirm_name in specs:
        primary = bundles[primary_name]
        confirm = bundles[confirm_name]
        for q in utils.QUANTILES:
            cal_rows, cal_primary, cal_confirm = hybrid_utils.align_scores(primary, confirm, "calibration")
            test_rows, test_primary, test_confirm = hybrid_utils.align_scores(primary, confirm, "test")
            primary_threshold = utils.quantile_threshold(cal_primary, q)
            confirm_threshold = utils.quantile_threshold(cal_confirm, q)
            cal_decisions = utils.peak_then_confirm(cal_rows, cal_primary, cal_confirm, primary_threshold, confirm_threshold)
            test_decisions = utils.peak_then_confirm(test_rows, test_primary, test_confirm, primary_threshold, confirm_threshold)
            base = {
                "split_seed": seed,
                "score_family": score_family,
                "score_type": "paired_confirmation",
                "policy_variant": "peak_then_confirm",
                "threshold_quantile": q,
                "row_threshold": primary_threshold,
                "confirm_threshold": confirm_threshold,
                "selection_split": "calibration",
                "evaluation_split": "test",
            }
            out.append(row_from_metrics(base, utils.event_metrics(cal_rows, cal_decisions), utils.event_metrics(test_rows, test_decisions)))
    return out


def evaluate() -> list[dict[str, Any]]:
    rows = hybrid_utils.load_rows()
    splits = hybrid_utils.load_splits()
    out: list[dict[str, Any]] = []
    for seed in utils.SEEDS:
        split_rows = hybrid_utils.rows_by_split(rows, splits, seed)
        bundles = utils.build_score_bundles(split_rows, seed)
        for score_family, bundle in bundles.items():
            out.extend(evaluate_score_family(seed, score_family, bundle))
        out.extend(evaluate_peak_confirm(seed, bundles))
    return out


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9N First-Event Policy Table",
        "",
        "This benchmark-level CodeTraceBench-derived offline proxy evaluates first-event and first-failure warning policies with trajectory-level loss, trajectory-level burden, calibration support, and domain shift caveats. Thresholds are chosen from calibration grids and test metrics are evaluated separately; this is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| score family | policy variant | q | test first-failure coverage | test pre-failure coverage | test burden | test false alarm | utility |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["best_rows"][:15]:
        lines.append(f"| `{row['score_family']}` | `{row['policy_variant']}` | `{row['threshold_quantile']}` | `{row.get('test_first_failure_coverage')}` | `{row.get('test_pre_failure_warning_coverage')}` | `{row.get('test_trajectory_burden')}` | `{row.get('test_false_alarm_trajectory_rate')}` | `{row.get('test_event_level_utility')}` |")
    return "\n".join(lines)


def main() -> None:
    rows = evaluate()
    best = sorted(rows, key=lambda row: (-(row.get("test_event_level_utility") or -999), row.get("test_trajectory_burden") or 1))[:25]
    summary = {
        "policy_table_rows": len(rows),
        "seeds": len(utils.SEEDS),
        "score_families": len({row["score_family"] for row in rows}),
        "policy_variants": sorted({row["policy_variant"] for row in rows}),
    }
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-event and first-failure trajectory-level loss, trajectory-level burden, calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "summary": summary,
        "best_rows": best,
        "guard_results": {"metadata_as_model_features": False, "test_tuning": False, "raw_marker_hits": []},
    }
    utils.write_csv(TABLE_CSV, rows)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
