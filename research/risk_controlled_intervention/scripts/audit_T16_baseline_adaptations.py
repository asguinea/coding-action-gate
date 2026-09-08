#!/usr/bin/env python3
"""Audit Batch T-16 baseline adaptations and comparison caveats."""

from __future__ import annotations

from datetime import datetime, timezone

from t16_evaluation_utils import REPORTS, claim_boundary, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T16_baseline_adaptation_audit.json"
OUT_MD = REPORTS / "batch_T16_baseline_adaptation_audit.md"
OUT_CSV = REPORTS / "batch_T16_baseline_adaptation_audit.csv"


def main() -> None:
    rows = [
        {"baseline": "row-level thresholding", "status": "implemented", "source_report": "Batch 9C/9H/T3/T7", "input_score": "row risk score", "calibration_unit": "row or trajectory depending batch", "evaluation_unit": "row and trajectory", "losses_metrics": "bad-row capture, missed first failure, burden", "limitations": "row-to-trajectory burden inflation", "direct_comparison_fair": "partial", "comparison_type": "direct local baseline"},
        {"baseline": "row-level CRC-like adaptation", "status": "partially implemented", "source_report": "T3/T4/T7", "input_score": "row score", "calibration_unit": "trajectory for final theory variants", "evaluation_unit": "trajectory", "losses_metrics": "miss risk and burden", "limitations": "not a full CRC reproduction", "direct_comparison_fair": "with caveat", "comparison_type": "structural adaptation"},
        {"baseline": "CORA-like step abstention adaptation", "status": "conceptual only", "source_report": "T15 positioning audit", "input_score": "not locally verified", "calibration_unit": "requires verification", "evaluation_unit": "action/step", "losses_metrics": "requires verification", "limitations": "requires human/literature verification", "direct_comparison_fair": "no", "comparison_type": "conceptual neighbor"},
        {"baseline": "ToolChain-CRC-like trajectory aggregation adaptation", "status": "conceptual only", "source_report": "T15 positioning audit", "input_score": "requires verification", "calibration_unit": "requires verification", "evaluation_unit": "trajectory", "losses_metrics": "requires verification", "limitations": "requires human/literature verification", "direct_comparison_fair": "no", "comparison_type": "conceptual neighbor"},
        {"baseline": "Batch 9N first-event selectors", "status": "implemented", "source_report": "batch_9n_first_event_calibration_selectors.json", "input_score": "first-event policy table scores", "calibration_unit": "trajectory", "evaluation_unit": "trajectory", "losses_metrics": "coverage, burden, false alarm, lead time", "limitations": "selector family differs from finalized finite-grid theorem", "direct_comparison_fair": "yes with caveat", "comparison_type": "direct local baseline"},
        {"baseline": "Batch 9M hybrid first-event policies", "status": "implemented", "source_report": "batch_9m_hybrid_failure_onset_intervention.json", "input_score": "hybrid first-event scores", "calibration_unit": "varies by policy", "evaluation_unit": "row and trajectory", "losses_metrics": "coverage, burden, lead time", "limitations": "not feasibility-aware finite-grid method", "direct_comparison_fair": "yes with caveat", "comparison_type": "direct local baseline"},
        {"baseline": "oracle/random diagnostics", "status": "implemented", "source_report": "batch_9h and batch_T6 oracle/random diagnostics", "input_score": "oracle labels or random selection", "calibration_unit": "benchmark diagnostic", "evaluation_unit": "trajectory", "losses_metrics": "oracle feasible region, burden curves", "limitations": "not deployable", "direct_comparison_fair": "diagnostic only", "comparison_type": "oracle/random reference"},
    ]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-16",
        "rows": len(rows),
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
        "baseline_rows": rows,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, rows)
    write_md(
        OUT_MD,
        "Batch T-16 Baseline Adaptation Audit",
        [
            "This audit distinguishes direct local baselines from structural adaptations and conceptual neighbors.",
            "It makes no superiority claim over CORA-like or ToolChain-CRC-like methods.",
            "It is an offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        ],
        rows,
        ["baseline", "status", "source_report", "calibration_unit", "evaluation_unit", "limitations", "direct_comparison_fair", "comparison_type"],
    )
    print({"rows": len(rows), "output": str(OUT_JSON)})


if __name__ == "__main__":
    main()
