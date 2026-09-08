#!/usr/bin/env python3
"""Evaluate Option C with expanded grids when reconstruction is available."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
RECON = REPORTS / "batch_T6_option_C_grid_reconstruction.json"
OUT_JSON = REPORTS / "batch_T6_option_C_expanded_grid_results.json"
OUT_MD = REPORTS / "batch_T6_option_C_expanded_grid_results.md"
OUT_CSV = REPORTS / "batch_T6_option_C_expanded_grid_results.csv"
HEATMAP = REPORTS / "batch_T6_option_C_expanded_grid_heatmap.csv"


def main() -> None:
    if not RECON.exists():
        raise FileNotFoundError(RECON)
    recon = json.loads(RECON.read_text())
    if recon.get("status") == "skipped":
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
            "status": "skipped",
            "reason": recon["reason"],
            "guard_results": {"raw_text_used": False, "test_tuning": False},
        }
        OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        OUT_MD.write_text("# Batch T-6 Option C Expanded Grid Results\n\n" + report["claim_boundary"] + f"\n\n- Status: `skipped`\n- Reason: {report['reason']}\n")
        OUT_CSV.write_text("status,reason\nskipped,\"" + report["reason"].replace('"', "'") + "\"\n")
        HEATMAP.write_text("status,reason\nskipped,\"" + report["reason"].replace('"', "'") + "\"\n")
        print(json.dumps({"status": "skipped"}, indent=2))
        return
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "status": "not_evaluated",
        "reason": "Grid template exists, but row-level first-event policy evaluation is not implemented in this batch without score rows.",
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("# Batch T-6 Option C Expanded Grid Results\n\n" + report["claim_boundary"] + "\n\n- Status: `not_evaluated`\n")
    OUT_CSV.write_text("status,reason\nnot_evaluated,\"requires row-level score rows\"\n")
    HEATMAP.write_text("status,reason\nnot_evaluated,\"requires row-level score rows\"\n")
    print(json.dumps({"status": report["status"]}, indent=2))


if __name__ == "__main__":
    main()
