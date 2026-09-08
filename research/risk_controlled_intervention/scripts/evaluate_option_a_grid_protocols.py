#!/usr/bin/env python3
"""Audit finite threshold-grid protocols for Batch T-4."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
OUT_JSON = REPORTS / "batch_T4_option_A_grid_protocols.json"
OUT_MD = REPORTS / "batch_T4_option_A_grid_protocols.md"
OUT_CSV = REPORTS / "batch_T4_option_A_grid_protocols.csv"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def main() -> None:
    require(POLICY_TABLE)
    rows = [
        {
            "protocol": "calibration_score_quantiles",
            "evaluated": True,
            "uses_calibration_labels": False,
            "uses_calibration_scores": True,
            "compatible_with_T2_theorem_candidate": "caveated",
            "sample_size_implication": "uses all calibration trajectories for risk; grid values are score-derived",
            "behavior_source": "Batch 9N threshold_quantile grid reused in T-4 correction comparison",
            "caveat": "Quantile levels are fixed, but threshold values are calibration-score derived.",
        },
        {
            "protocol": "train_score_quantiles",
            "evaluated": False,
            "uses_calibration_labels": False,
            "uses_calibration_scores": False,
            "compatible_with_T2_theorem_candidate": "yes_if_train_scores_available",
            "sample_size_implication": "keeps calibration trajectories for risk correction",
            "behavior_source": "unavailable",
            "caveat": "Row-level train split scores were not available in reusable T-3/T-4 policy grid artifacts.",
        },
        {
            "protocol": "split_calibration_grid_then_risk",
            "evaluated": False,
            "uses_calibration_labels": False,
            "uses_calibration_scores": True,
            "compatible_with_T2_theorem_candidate": "cleaner_with_sample_split",
            "sample_size_implication": "reduces n for risk correction",
            "behavior_source": "unavailable",
            "caveat": "Existing aggregate policy grid lacks trajectory-level score rows needed to resplit calibration.",
        },
        {
            "protocol": "predeclared_quantile_grid",
            "evaluated": True,
            "uses_calibration_labels": False,
            "uses_calibration_scores": True,
            "compatible_with_T2_theorem_candidate": "caveated",
            "sample_size_implication": "same as calibration_score_quantiles",
            "behavior_source": "same fixed quantile levels as Batch 9N grid",
            "caveat": "Quantile levels are predeclared but threshold values are data-derived.",
        },
        {
            "protocol": "fixed_score_threshold_grid",
            "evaluated": False,
            "uses_calibration_labels": False,
            "uses_calibration_scores": False,
            "compatible_with_T2_theorem_candidate": "yes_if_score_scale_fixed",
            "sample_size_implication": "keeps calibration trajectories for risk correction",
            "behavior_source": "unavailable",
            "caveat": "Existing policy table stores quantile thresholds, not normalized row score scale for fixed thresholds.",
        },
    ]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "correction refinement; theory candidate; trajectory-level loss; first-event; missed first failure; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "input_files": [str(POLICY_TABLE)],
        "protocols": rows,
        "recommended_protocol_for_next_batch": "train_score_quantiles_or_fixed_score_threshold_grid_if_row_scores_are_available; otherwise predeclared_quantile_grid with caveat",
        "guard_results": {"test_tuning": False, "raw_text_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    with OUT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-4 Option A Grid Protocols",
        "",
        report["claim_boundary"],
        "",
        "| Protocol | Evaluated | T-2 compatibility | Caveat |",
        "| --- | --- | --- | --- |",
        *[f"| {r['protocol']} | {r['evaluated']} | {r['compatible_with_T2_theorem_candidate']} | {r['caveat']} |" for r in rows],
        "",
        "The cleanest future protocol is a train-derived or fixed score threshold grid. The current reusable aggregate artifacts support calibration/predeclared quantile-grid analysis with theory caveats.",
    ]) + "\n")
    print(json.dumps({"protocols": len(rows), "evaluated": sum(1 for r in rows if r["evaluated"])}, indent=2))


if __name__ == "__main__":
    main()
