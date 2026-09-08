#!/usr/bin/env python3
"""Aggregate Batch 8.75 repeated split diagnostics."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

SPLIT_AUDIT = utils.REPORTS_DIR / "repeated_verified_split_audit.json"
BASELINES = utils.REPORTS_DIR / "repeated_baseline_metrics.json"
STRICT = utils.REPORTS_DIR / "repeated_strict_alpha_thresholds.json"
RELATIVE = utils.REPORTS_DIR / "repeated_relative_risk_thresholds.json"
BUDGET = utils.REPORTS_DIR / "repeated_deferral_budget_analysis.json"
DECILE = utils.REPORTS_DIR / "repeated_score_decile_analysis.json"
OUTPUT_JSON = utils.REPORTS_DIR / "repeated_split_summary.json"
OUTPUT_MD = utils.REPORTS_DIR / "repeated_split_summary.md"
STATEMENT = "These repeated-split diagnostics are benchmark-level evidence on CodeTraceBench-derived trajectories, not production CodingActionGate guarantees."


def aggregate_baseline_metrics(report: dict[str, Any]) -> dict[str, Any]:
    grouped: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for seed_report in report["seed_reports"]:
        for model, model_report in seed_report["models"].items():
            for split, item in model_report["splits"].items():
                for metric in ("auroc", "average_precision", "brier_score", "positive_rate"):
                    if item.get(metric) is not None:
                        grouped[(model, split)][metric].append(item[metric])
    return {
        f"{model}:{split}": {metric: utils.summary_stats(values) for metric, values in metrics.items()}
        for (model, split), metrics in sorted(grouped.items())
    }


def aggregate_thresholds(report: dict[str, Any], alpha_field: str) -> dict[str, Any]:
    grouped: dict[tuple[Any, str, str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in report["threshold_results"]:
        key = (row[alpha_field], row["baseline_name"], row["thresholding_variant"], row["split"])
        for metric in ("allowed_bad_rate", "deferral_rate", "fraction_of_bad_steps_deferred", "false_deferral_rate", "useful_allowed_rate"):
            if row.get(metric) is not None:
                grouped[key][metric].append(row[metric])
        grouped[key]["risk_met"].append(0.0 if row["risk_violation"] else 1.0)
    return {
        f"{target}:{model}:{variant}:{split}": {metric: utils.summary_stats(values) for metric, values in metrics.items()}
        for (target, model, variant, split), metrics in sorted(grouped.items(), key=lambda item: str(item[0]))
    }


def aggregate_budget(report: dict[str, Any]) -> dict[str, Any]:
    grouped: dict[tuple[float, str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in report["budget_results"]:
        key = (row["requested_deferral_budget"], row["baseline_name"], row["split"])
        for metric in ("allowed_bad_rate", "deferral_rate", "fraction_of_bad_steps_deferred", "bad_step_capture_rate", "false_deferral_rate", "useful_allowed_rate", "relative_risk_reduction_vs_always_allow"):
            if row.get(metric) is not None:
                grouped[key][metric].append(row[metric])
    return {
        f"{budget}:{model}:{split}": {metric: utils.summary_stats(values) for metric, values in metrics.items()}
        for (budget, model, split), metrics in sorted(grouped.items(), key=lambda item: str(item[0]))
    }


def aggregate_deciles(report: dict[str, Any]) -> dict[str, Any]:
    grouped: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in report["decile_results"]:
        key = (row["baseline_name"], row["split"])
        for metric in ("top_decile_bad_rate", "bottom_decile_bad_rate", "top_bottom_ratio", "top_10pct_bad_step_capture", "top_20pct_bad_step_capture"):
            if row.get(metric) is not None:
                grouped[key][metric].append(row[metric])
    return {
        f"{model}:{split}": {metric: utils.summary_stats(values) for metric, values in metrics.items()}
        for (model, split), metrics in sorted(grouped.items())
    }


def split_variability(report: dict[str, Any]) -> dict[str, Any]:
    gaps = [row["calibration_test_base_risk_gap"] for row in report["split_audits"]]
    cal_rates = [row["positive_rates"]["calibration"] for row in report["split_audits"]]
    test_rates = [row["positive_rates"]["test"] for row in report["split_audits"]]
    return {"calibration_base_risk": utils.summary_stats(cal_rates), "test_base_risk": utils.summary_stats(test_rates), "calibration_test_gap": utils.summary_stats(gaps)}


def build_summary() -> dict[str, Any]:
    split_report = utils.load_json(SPLIT_AUDIT)
    baseline_report = utils.load_json(BASELINES)
    strict = utils.load_json(STRICT)
    relative = utils.load_json(RELATIVE)
    budget = utils.load_json(BUDGET)
    decile = utils.load_json(DECILE)
    return {
        "schema_version": "risk-controlled-intervention-repeated-summary.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": STATEMENT,
        "seeds_completed": len(split_report["seeds"]),
        "split_prevalence_variability": split_variability(split_report),
        "baseline_metric_summary": aggregate_baseline_metrics(baseline_report),
        "strict_alpha_summary": aggregate_thresholds(strict, "alpha"),
        "relative_risk_summary": aggregate_thresholds(relative, "target_fraction"),
        "deferral_budget_summary": aggregate_budget(budget),
        "score_decile_summary": aggregate_deciles(decile),
        "recommended_main_report_table_candidates": [
            "Repeated-split AUROC/AP for logistic_regression and heuristics",
            "Fixed deferral budget bad-step capture at 5%, 10%, and 20%",
            "Strict alpha deferral burden for alpha 0.02, 0.03, and 0.04",
            "Score-decile risk concentration for logistic_regression",
        ],
        "recommended_figure_candidates": [
            "risk-cost curve",
            "fixed-budget bad-step capture",
            "score-decile risk concentration",
            "calibration/test split variability",
        ],
        "next_recommendation": "Use repeated-split summaries for report-table drafting, then decide whether a feature/model improvement batch is needed.",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Repeated Split Summary",
        "",
        STATEMENT,
        "",
        f"- Seeds completed: `{report['seeds_completed']}`",
        f"- Calibration base risk: `{report['split_prevalence_variability']['calibration_base_risk']}`",
        f"- Test base risk: `{report['split_prevalence_variability']['test_base_risk']}`",
        f"- Calibration/test gap: `{report['split_prevalence_variability']['calibration_test_gap']}`",
        "",
        "## Recommended Tables",
        "",
    ]
    lines.extend(f"- {item}" for item in report["recommended_main_report_table_candidates"])
    lines.extend(["", "## Recommended Figures", ""])
    lines.extend(f"- {item}" for item in report["recommended_figure_candidates"])
    lines.extend(["", f"## Next\n\n{report['next_recommendation']}"])
    return "\n".join(lines)


def main() -> int:
    report = build_summary()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"seeds_completed": report["seeds_completed"], "next": report["next_recommendation"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
