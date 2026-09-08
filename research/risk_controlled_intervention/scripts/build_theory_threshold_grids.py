#!/usr/bin/env python3
"""Build theorem-compatible threshold grids for Batch T-7."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from theory_clean_grid_utils import load_scores, quantile, stable_calibration_role

WORKSPACE = Path(__file__).resolve().parents[1]
OUT = WORKSPACE / "data" / "intervention_outputs" / "theory_threshold_grids.json"
REPORT_JSON = WORKSPACE / "reports" / "batch_T7_theory_threshold_grids.json"
REPORT_MD = WORKSPACE / "reports" / "batch_T7_theory_threshold_grids.md"
REPORT_CSV = WORKSPACE / "reports" / "batch_T7_theory_threshold_grids.csv"

FIXED_THRESHOLDS = [0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]


def main() -> None:
    rows = load_scores()
    grouped: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(int(row["split_seed"]), row["score_family"])].append(row)
    grid_rows = []
    for (seed, family), vals in sorted(grouped.items()):
        train_scores = [float(r["score_value"]) for r in vals if r["split_role"] == "train"]
        cal_scores = [float(r["score_value"]) for r in vals if r["split_role"] == "calibration"]
        grid_cal_scores = [float(r["score_value"]) for r in vals if r["split_role"] == "calibration" and stable_calibration_role(r) == "grid_calibration"]
        specs = [
            ("fixed_score_threshold_grid", FIXED_THRESHOLDS, True, False, False, False, "clean", "scores normalized using train split during score regeneration; thresholds fixed in [0,1]"),
            ("train_score_quantiles", [quantile(train_scores, q) for q in QUANTILES], True, False, False, False, "clean", "threshold values from train score distribution only"),
            ("split_calibration_grid_then_risk", [quantile(grid_cal_scores, q) for q in QUANTILES], False, True, False, False, "clean_with_sample_split", "calibration trajectories split into grid_calibration and risk_calibration"),
            ("calibration_score_quantiles", [quantile(cal_scores, q) for q in QUANTILES], False, True, False, False, "acceptable_with_caveat", "uses calibration scores but not labels; included as baseline"),
        ]
        for protocol, thresholds, uses_train, uses_cal, uses_labels, uses_test, compat, detail in specs:
            clean = sorted({round(float(t), 12) for t in thresholds if t == t})
            grid_rows.append({
                "split_seed": seed,
                "score_family": family,
                "grid_protocol": protocol,
                "thresholds": clean,
                "threshold_count": len(clean),
                "uses_train_scores": uses_train,
                "uses_calibration_scores": uses_cal,
                "uses_calibration_labels": uses_labels,
                "uses_test_scores": uses_test,
                "theorem_compatibility": compat,
                "score_normalization_details": detail,
            })
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "row-level score artifacts; clean-grid evaluation; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "grids": grid_rows,
        "grid_protocols": sorted({row["grid_protocol"] for row in grid_rows}),
        "guard_results": {"raw_text_used": False, "test_tuning": False, "uses_test_scores": False},
    }
    OUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    REPORT_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    fields = [k for k in grid_rows[0] if k != "thresholds"] + ["thresholds"]
    with REPORT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in grid_rows:
            writer.writerow({**row, "thresholds": json.dumps(row["thresholds"])})
    REPORT_MD.write_text("\n".join([
        "# Batch T-7 Theory Threshold Grids",
        "",
        payload["claim_boundary"],
        "",
        f"- Grid rows: `{len(grid_rows)}`",
        f"- Protocols: `{', '.join(payload['grid_protocols'])}`",
        "- Test scores used: `False`",
        "- Calibration labels used: `False`",
    ]) + "\n")
    print(json.dumps({"grid_rows": len(grid_rows), "protocols": payload["grid_protocols"]}, indent=2))


if __name__ == "__main__":
    main()
