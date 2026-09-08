#!/usr/bin/env python3
"""Relative risk-reduction threshold diagnostics for saved Batch 7 scores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import risk_diagnostic_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "relative_risk_thresholds.json"
REPORT_MD = utils.REPORTS_DIR / "relative_risk_thresholds.md"
TARGET_FRACTIONS = (0.75, 0.50, 0.25)
VARIANTS = ("empirical_threshold", "conservative_threshold")


def run_relative_risk(rows: list[dict[str, Any]]) -> dict[str, Any]:
    validation = utils.validate_score_rows(rows)
    if validation["error_count"] or validation["raw_text_key_hit_count"] or not validation["schema_ok"]:
        raise SystemExit(f"ERROR: invalid score rows: {json.dumps(validation, indent=2)}")
    grouped = utils.group_by_baseline(rows)
    results = []
    for baseline, by_split in sorted(grouped.items()):
        calibration_rows = by_split.get("calibration", [])
        test_rows = by_split.get("test", [])
        if not calibration_rows or not test_rows:
            continue
        calibration_base = utils.base_risk(calibration_rows)
        split_base = {"calibration": calibration_base, "test": utils.base_risk(test_rows)}
        for fraction in TARGET_FRACTIONS:
            target = calibration_base * fraction
            for variant in VARIANTS:
                conservative = variant == "conservative_threshold"
                selected = utils.select_threshold_for_alpha(baseline, calibration_rows, target, conservative=conservative)
                tau = float(selected["tau"])
                for split, split_rows in (("calibration", calibration_rows), ("test", test_rows)):
                    metrics = utils.evaluate_rows(split_rows, tau, alpha=target)
                    utils.add_reduction_metrics(metrics, split_base[split])
                    results.append(
                        {
                            "baseline_name": baseline,
                            "target_fraction_of_calibration_base_risk": fraction,
                            "target_allowed_bad_rate": target,
                            "calibration_base_risk": calibration_base,
                            "thresholding_variant": variant,
                            "split": split,
                            "selection": selected if split == "calibration" else {"tau_selected_on": "calibration"},
                            "split_base_risk": split_base[split],
                            **metrics,
                        }
                    )
    return {
        "schema_version": "risk-controlled-intervention-relative-risk.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8.5 relative-risk diagnostics only; not production CodingActionGate guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "target_fractions": list(TARGET_FRACTIONS),
        "thresholding_variants": list(VARIANTS),
        "score_validation": validation,
        "threshold_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Relative Risk Thresholds",
        "",
        "Targets are fractions of the calibration base allowed-bad rate. Thresholds are selected on calibration only.",
        "",
        "| baseline | variant | target fraction | split | target risk | allowed bad | deferral | violation |",
        "|---|---|---:|---|---:|---:|---:|---:|",
    ]
    keep = {"logistic_regression", "class_weighted_logistic_regression", "observation_error_keyword_heuristic", "always_allow", "always_review"}
    for row in report["threshold_results"]:
        if row["baseline_name"] not in keep:
            continue
        lines.append(
            f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['target_fraction_of_calibration_base_risk']}` | "
            f"`{row['split']}` | `{row['target_allowed_bad_rate']}` | `{row['allowed_bad_rate']}` | `{row['deferral_rate']}` | `{row['risk_violation']}` |"
        )
    return "\n".join(lines)


def main() -> int:
    report = run_relative_risk(utils.load_score_rows())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"threshold_rows": len(report["threshold_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
