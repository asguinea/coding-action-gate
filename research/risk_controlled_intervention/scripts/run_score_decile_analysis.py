#!/usr/bin/env python3
"""Score decile/risk-ranking diagnostics for saved Batch 7 scores."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import risk_diagnostic_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "score_decile_analysis.json"
REPORT_MD = utils.REPORTS_DIR / "score_decile_analysis.md"


def decile_records(rows: list[dict[str, Any]], cutpoints: list[float]) -> list[dict[str, Any]]:
    by_decile: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_decile[utils.assign_decile(float(row["score"]), cutpoints)].append(row)
    total_rows = len(rows)
    total_positives = sum(int(row["target"]) for row in rows)
    records = []
    cumulative_rows = 0
    cumulative_positives = 0
    for decile in range(10, 0, -1):
        group = by_decile.get(decile, [])
        positives = sum(int(row["target"]) for row in group)
        cumulative_rows += len(group)
        cumulative_positives += positives
        records.append(
            {
                "decile": decile,
                "risk_order": "highest_to_lowest",
                "rows": len(group),
                "positives": positives,
                "bad_step_rate": positives / len(group) if group else None,
                "cumulative_bad_step_capture_from_highest_risk": cumulative_positives / total_positives if total_positives else 0.0,
                "cumulative_deferral_rate_from_highest_risk": cumulative_rows / total_rows if total_rows else 0.0,
            }
        )
    return records


def run_decile_analysis(rows: list[dict[str, Any]]) -> dict[str, Any]:
    validation = utils.validate_score_rows(rows)
    if validation["error_count"] or validation["raw_text_key_hit_count"] or not validation["schema_ok"]:
        raise SystemExit(f"ERROR: invalid score rows: {json.dumps(validation, indent=2)}")
    grouped = utils.group_by_baseline(rows)
    results = []
    ranking_summaries = []
    for baseline, by_split in sorted(grouped.items()):
        calibration_rows = by_split.get("calibration", [])
        test_rows = by_split.get("test", [])
        if not calibration_rows or not test_rows:
            continue
        cutpoints = utils.decile_cutpoints([float(row["score"]) for row in calibration_rows])
        for split, split_rows in (("calibration", calibration_rows), ("test", test_rows)):
            records = decile_records(split_rows, cutpoints)
            results.append({"baseline_name": baseline, "split": split, "calibration_cutpoints": cutpoints, "deciles": records})
            top = next((row for row in records if row["decile"] == 10), None)
            bottom = next((row for row in records if row["decile"] == 1), None)
            ranking_summaries.append(
                {
                    "baseline_name": baseline,
                    "split": split,
                    "top_decile_bad_rate": top["bad_step_rate"] if top else None,
                    "bottom_decile_bad_rate": bottom["bad_step_rate"] if bottom else None,
                    "top_to_bottom_bad_rate_ratio": (
                        (top["bad_step_rate"] / bottom["bad_step_rate"]) if top and bottom and top["bad_step_rate"] is not None and bottom["bad_step_rate"] else None
                    ),
                }
            )
    return {
        "schema_version": "risk-controlled-intervention-score-deciles.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8.5 ranking diagnostic only; not production CodingActionGate guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "score_validation": validation,
        "decile_results": results,
        "ranking_summaries": ranking_summaries,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Score Decile Analysis",
        "",
        "Decile cut points are computed on calibration scores and applied to calibration and test.",
        "",
        "| baseline | split | top decile bad rate | bottom decile bad rate | ratio |",
        "|---|---|---:|---:|---:|",
    ]
    for row in report["ranking_summaries"]:
        lines.append(
            f"| `{row['baseline_name']}` | `{row['split']}` | `{row['top_decile_bad_rate']}` | "
            f"`{row['bottom_decile_bad_rate']}` | `{row['top_to_bottom_bad_rate_ratio']}` |"
        )
    return "\n".join(lines)


def main() -> int:
    report = run_decile_analysis(utils.load_score_rows())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"baseline_split_rows": len(report["decile_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
