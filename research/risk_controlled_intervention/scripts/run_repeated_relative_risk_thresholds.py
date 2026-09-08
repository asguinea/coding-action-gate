#!/usr/bin/env python3
"""Repeated relative-risk threshold diagnostics."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "repeated_relative_risk_thresholds.json"
REPORT_MD = utils.REPORTS_DIR / "repeated_relative_risk_thresholds.md"
TARGET_FRACTIONS = (0.75, 0.50, 0.25)
VARIANTS = ("empirical_threshold", "conservative_threshold")


def run_thresholds(score_rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = utils.group_scores(score_rows)
    results = []
    for seed, by_model in sorted(grouped.items()):
        for baseline, by_split in sorted(by_model.items()):
            calibration_rows = by_split.get("calibration", [])
            test_rows = by_split.get("test", [])
            if not calibration_rows or not test_rows:
                continue
            _, cal_labels, _ = utils.rows_to_scores_labels(calibration_rows)
            calibration_base_risk = sum(cal_labels) / len(cal_labels) if cal_labels else 0.0
            for fraction in TARGET_FRACTIONS:
                target = calibration_base_risk * fraction
                for variant in VARIANTS:
                    selected = utils.select_threshold(baseline, calibration_rows, target, conservative=(variant == "conservative_threshold"))
                    tau = float(selected["tau"])
                    for split, rows in (("calibration", calibration_rows), ("test", test_rows)):
                        metrics = utils.evaluate_threshold(rows, tau, target)
                        results.append({"seed": seed, "baseline_name": baseline, "target_fraction": fraction, "target_allowed_bad_rate": target, "calibration_base_risk": calibration_base_risk, "thresholding_variant": variant, "split": split, "selection": selected if split == "calibration" else {"tau_selected_on": "calibration"}, **metrics})
    return {
        "schema_version": "risk-controlled-intervention-repeated-relative-risk.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Repeated relative-risk diagnostics only; not production StepHarbor guarantees.",
        "target_fractions": list(TARGET_FRACTIONS),
        "threshold_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# Repeated Relative Risk Thresholds", "", "| target fraction | model | test seeds met | mean test deferral |", "|---:|---|---:|---:|"]
    by_key: dict[tuple[float, str], list[dict[str, Any]]] = {}
    for row in report["threshold_results"]:
        if row["split"] == "test" and row["thresholding_variant"] == "empirical_threshold":
            by_key.setdefault((row["target_fraction"], row["baseline_name"]), []).append(row)
    for (fraction, baseline), rows in sorted(by_key.items()):
        met = sum(1 for row in rows if not row["risk_violation"])
        mean_def = sum(row["deferral_rate"] for row in rows) / len(rows)
        lines.append(f"| `{fraction}` | `{baseline}` | `{met}/{len(rows)}` | `{mean_def}` |")
    return "\n".join(lines)


def main() -> int:
    report = run_thresholds(utils.load_repeated_scores())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"threshold_rows": len(report["threshold_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
