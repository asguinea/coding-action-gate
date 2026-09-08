#!/usr/bin/env python3
"""Reconstruct cleaner Option C theory grids when row-level artifacts support it."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
DATA = WORKSPACE / "data"
AUDIT = REPORTS / "batch_T6_row_level_score_artifact_audit.json"
OUT_GRID = DATA / "intervention_outputs" / "theory_option_c_threshold_grids.json"
OUT_JSON = REPORTS / "batch_T6_option_C_grid_reconstruction.json"
OUT_MD = REPORTS / "batch_T6_option_C_grid_reconstruction.md"


def main() -> None:
    if not AUDIT.exists():
        raise FileNotFoundError(AUDIT)
    audit = json.loads(AUDIT.read_text())
    usable = [row for row in audit["artifacts"] if row["supports_fixed_score_threshold_grid"] or row["supports_split_calibration_grid_then_risk"] or row["supports_train_score_quantiles"]]
    if not usable:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
            "status": "skipped",
            "reason": "No row-level first-event or hybrid score artifact with trajectory_id, prefix index, and split support was available.",
            "output_grid_written": False,
            "guard_results": {"raw_text_used": False, "test_tuning": False},
        }
        OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        OUT_MD.write_text("\n".join([
            "# Batch T-6 Option C Grid Reconstruction",
            "",
            report["claim_boundary"],
            "",
            "- Status: `skipped`",
            f"- Reason: {report['reason']}",
        ]) + "\n")
        print(json.dumps({"status": "skipped"}, indent=2))
        return
    grid = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "fixed_score_threshold_grid": [0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99],
        "source_artifacts": usable,
    }
    OUT_GRID.write_text(json.dumps(grid, indent=2, sort_keys=True) + "\n")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "status": "grid_template_written",
        "usable_artifacts": usable,
        "output_grid_written": True,
        "output_grid_path": str(OUT_GRID),
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("# Batch T-6 Option C Grid Reconstruction\n\n" + report["claim_boundary"] + "\n\n- Status: `grid_template_written`\n")
    print(json.dumps({"status": report["status"], "usable_artifacts": len(usable)}, indent=2))


if __name__ == "__main__":
    main()
