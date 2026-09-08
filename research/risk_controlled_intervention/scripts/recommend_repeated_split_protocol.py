#!/usr/bin/env python3
"""Recommend a repeated split protocol for later benchmark robustness checks."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import risk_diagnostic_utils as utils

MISMATCH = utils.REPORTS_DIR / "calibration_test_mismatch_audit.json"
OUTPUT_JSON = utils.REPORTS_DIR / "repeated_split_protocol_recommendation.json"
OUTPUT_MD = utils.REPORTS_DIR / "repeated_split_protocol_recommendation.md"


def build_protocol(mismatch: dict[str, Any] | None = None) -> dict[str, Any]:
    gap = None if mismatch is None else mismatch.get("calibration_test_base_risk_gap")
    return {
        "schema_version": "risk-controlled-intervention-repeated-split-protocol.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Protocol recommendation only; no repeated split experiment is run in Batch 8.5.",
        "recommended": True,
        "reason": (
            f"Calibration/test base-risk gap observed: {gap}. Repeated splits can separate score/model behavior from one split's composition."
            if gap is not None
            else "Repeated splits are recommended to quantify split sensitivity before final report tables."
        ),
        "number_of_random_trajectory_splits": 10,
        "split_ratio": {"train": 0.60, "calibration": 0.20, "test": 0.20},
        "stratification_variables": ["source_bucket", "agent", "layout_family", "trajectory_has_any_bad_step"],
        "per_split_retraining": "Retrain lightweight baseline models on the train split only; deterministic heuristics require no fitting.",
        "per_split_calibration": "Select ALLOW/DEFER thresholds on the calibration split only for each model and target.",
        "per_split_test_use": "Use test split only for held-out evaluation after threshold selection.",
        "metrics_to_average": [
            "AUROC",
            "average_precision",
            "allowed_bad_rate",
            "deferral_rate",
            "fraction_of_bad_steps_deferred",
            "false_deferral_rate",
            "relative risk reduction",
        ],
        "uncertainty_reporting": "Report mean, standard deviation, split-level percentile interval, and trajectory-bootstrap intervals within representative splits.",
        "estimated_computational_cost": "Low to moderate: 10 lightweight model fits over about 34.5k prefix rows plus threshold sweeps; no LLM calls and no artifact re-extraction required.",
    }


def markdown(report: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# Repeated Split Protocol Recommendation",
            "",
            report["claim_boundary"],
            "",
            f"- Recommended: `{report['recommended']}`",
            f"- Number of splits: `{report['number_of_random_trajectory_splits']}`",
            f"- Ratios: `{report['split_ratio']}`",
            f"- Stratification variables: `{report['stratification_variables']}`",
            f"- Reason: {report['reason']}",
            f"- Cost estimate: {report['estimated_computational_cost']}",
        ]
    )


def main() -> int:
    mismatch = utils.load_json(MISMATCH) if MISMATCH.exists() else None
    report = build_protocol(mismatch)
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"recommended": report["recommended"], "splits": report["number_of_random_trajectory_splits"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
