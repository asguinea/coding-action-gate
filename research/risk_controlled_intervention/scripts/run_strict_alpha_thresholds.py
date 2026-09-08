#!/usr/bin/env python3
"""Strict absolute-alpha threshold diagnostics for saved Batch 7 scores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import risk_diagnostic_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "strict_alpha_thresholds.json"
REPORT_MD = utils.REPORTS_DIR / "strict_alpha_thresholds.md"
ALPHAS = (0.005, 0.01, 0.02, 0.03, 0.04, 0.05)
VARIANTS = ("empirical_threshold", "conservative_threshold")


def run_strict_alpha(rows: list[dict[str, Any]], alphas: tuple[float, ...] = ALPHAS) -> dict[str, Any]:
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
        split_base = {"calibration": utils.base_risk(calibration_rows), "test": utils.base_risk(test_rows)}
        for alpha in alphas:
            for variant in VARIANTS:
                conservative = variant == "conservative_threshold"
                selected = utils.select_threshold_for_alpha(baseline, calibration_rows, alpha, conservative=conservative)
                tau = float(selected["tau"])
                for split, split_rows in (("calibration", calibration_rows), ("test", test_rows)):
                    metrics = utils.evaluate_rows(split_rows, tau, alpha=alpha)
                    utils.add_reduction_metrics(metrics, split_base[split])
                    results.append(
                        {
                            "baseline_name": baseline,
                            "alpha": alpha,
                            "thresholding_variant": variant,
                            "split": split,
                            "selection": selected if split == "calibration" else {"tau_selected_on": "calibration"},
                            "split_base_risk": split_base[split],
                            **metrics,
                        }
                    )
    return {
        "schema_version": "risk-controlled-intervention-strict-alpha.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8.5 diagnostic thresholding only; not production StepHarbor validation or guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "alpha_values": list(alphas),
        "thresholding_variants": list(VARIANTS),
        "score_validation": validation,
        "threshold_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Strict Alpha Thresholds",
        "",
        "Absolute alpha values below and around the calibration base risk. Thresholds are selected on calibration only.",
        "",
        "| baseline | variant | alpha | split | allowed bad | deferral | bad deferred | violation |",
        "|---|---|---:|---|---:|---:|---:|---:|",
    ]
    keep = {"logistic_regression", "class_weighted_logistic_regression", "observation_error_keyword_heuristic", "always_allow", "always_review"}
    for row in report["threshold_results"]:
        if row["baseline_name"] not in keep:
            continue
        lines.append(
            f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['alpha']}` | `{row['split']}` | "
            f"`{row['allowed_bad_rate']}` | `{row['deferral_rate']}` | `{row['bad_deferred']}` | `{row['risk_violation']}` |"
        )
    lines.append("")
    lines.append("Allowed-bad rate is `null` when no prefixes are allowed.")
    return "\n".join(lines)


def main() -> int:
    report = run_strict_alpha(utils.load_score_rows())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"threshold_rows": len(report["threshold_results"]), "baselines": len(utils.group_by_baseline(utils.load_score_rows()))}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
