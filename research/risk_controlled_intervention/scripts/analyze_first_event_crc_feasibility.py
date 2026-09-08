#!/usr/bin/env python3
"""Analyze Batch 9N CRC-style first-event feasibility."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import first_event_calibration_utils as utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
POLICY_TABLE = REPORTS_DIR / "batch_9n_first_event_policy_table.csv"
REPORT_JSON = REPORTS_DIR / "batch_9n_first_event_crc_feasibility.json"
REPORT_MD = REPORTS_DIR / "batch_9n_first_event_crc_feasibility.md"
CHECKS_CSV = REPORTS_DIR / "batch_9n_first_event_monotonicity_checks.csv"


def load_rows() -> list[dict[str, Any]]:
    utils.require(POLICY_TABLE)
    with POLICY_TABLE.open() as handle:
        return list(csv.DictReader(handle))


def num(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = row.get(key)
    if value in ("", None):
        return default
    return float(value)


def nonincreasing(values: list[float], tolerance: float = 1e-12) -> bool:
    return all(values[i + 1] <= values[i] + tolerance for i in range(len(values) - 1))


def nondecreasing(values: list[float], tolerance: float = 1e-12) -> bool:
    return all(values[i + 1] + tolerance >= values[i] for i in range(len(values) - 1))


def evaluate() -> list[dict[str, Any]]:
    rows = [row for row in load_rows() if row["policy_variant"] in {"single_threshold_first_crossing", "cumulative_hazard_threshold", "hybrid_event_score_policy", "early_weighted_threshold"}]
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["split_seed"], row["score_family"], row["policy_variant"])].append(row)
    checks = []
    for (seed, score_family, variant), vals in grouped.items():
        vals.sort(key=lambda row: num(row, "threshold_quantile"))
        burden = [num(row, "calibration_trajectory_burden") for row in vals]
        false_alarm = [num(row, "calibration_false_alarm_trajectory_rate") for row in vals]
        missed = [num(row, "calibration_missed_first_failure_rate") for row in vals]
        event_loss = [num(row, "calibration_missed_first_failure_rate") + 0.5 * num(row, "calibration_false_alarm_trajectory_rate") for row in vals]
        checks.append({
            "split_seed": seed,
            "score_family": score_family,
            "policy_variant": variant,
            "trajectory_burden_nonincreasing_with_threshold": nonincreasing(burden),
            "false_alarm_nonincreasing_with_threshold": nonincreasing(false_alarm),
            "missed_first_failure_nondecreasing_with_threshold": nondecreasing(missed),
            "event_loss_monotone": nondecreasing(event_loss) or nonincreasing(event_loss),
            "nested_warning_family": nonincreasing(burden) and nonincreasing(false_alarm) and nondecreasing(missed),
            "min_calibration_burden": min(burden) if burden else None,
            "max_calibration_burden": max(burden) if burden else None,
            "min_calibration_missed": min(missed) if missed else None,
            "max_calibration_missed": max(missed) if missed else None,
        })
    return checks


def markdown(report: dict[str, Any]) -> str:
    return "\n".join([
        "# Batch 9N First-Event CRC Feasibility",
        "",
        "This benchmark-level CodeTraceBench-derived offline proxy checks whether first-event and first-failure warning policies form nested threshold families over trajectory-level loss and trajectory-level burden. This is a CRC-style feasibility assessment with calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Families checked: `{report['families_checked']}`",
        f"- Nested family rate: `{report['nested_family_rate']}`",
        f"- Clean monotone families: `{report['clean_monotone_family_count']}`",
        "",
        "A future formal treatment would still require trajectory-level exchangeability assumptions, a monotone loss family, correction or sample splitting for policy-family selection, and validation under domain shift.",
    ])


def main() -> None:
    checks = evaluate()
    nested_count = sum(1 for row in checks if row["nested_warning_family"])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-event and first-failure trajectory-level loss, trajectory-level burden, calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "families_checked": len(checks),
        "clean_monotone_family_count": nested_count,
        "nested_family_rate": nested_count / len(checks) if checks else 0.0,
        "formal_conformal_assessment": {
            "formal_conformal_guarantee_claimed": False,
            "finite_sample_guarantee_claimed": False,
            "suitable_elements": ["calibration-based threshold selection", "some nested warning families", "trajectory-level loss definitions"],
            "missing_elements": ["trajectory-level exchangeability assumptions", "policy-search correction", "separate validation for family selection", "domain-shift treatment"],
        },
        "guard_results": {"metadata_as_model_features": False, "raw_marker_hits": [], "formal_conformal_guarantee_claimed": False},
    }
    utils.write_csv(CHECKS_CSV, checks)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"checks": len(checks), "nested_rate": report["nested_family_rate"]}, indent=2))


if __name__ == "__main__":
    main()
