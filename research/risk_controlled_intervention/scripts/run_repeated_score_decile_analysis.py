#!/usr/bin/env python3
"""Repeated score-decile/risk-ranking diagnostics."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "repeated_score_decile_analysis.json"
REPORT_MD = utils.REPORTS_DIR / "repeated_score_decile_analysis.md"


def cutpoints(scores: list[float]) -> list[float]:
    return [utils.risk_utils.quantile(scores, q / 10.0) for q in range(1, 10)]


def assign(score: float, cuts: list[float]) -> int:
    return utils.risk_utils.assign_decile(score, cuts)


def split_deciles(rows: list[dict[str, Any]], cuts: list[float]) -> dict[str, Any]:
    by_decile: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_decile[assign(float(row["score"]), cuts)].append(row)
    total_pos = sum(int(row["target"]) for row in rows)
    records = []
    cumulative_pos = 0
    cumulative_rows = 0
    for decile in range(10, 0, -1):
        group = by_decile.get(decile, [])
        positives = sum(int(row["target"]) for row in group)
        cumulative_pos += positives
        cumulative_rows += len(group)
        records.append(
            {
                "decile": decile,
                "rows": len(group),
                "positives": positives,
                "bad_step_rate": positives / len(group) if group else None,
                "cumulative_bad_step_capture_from_highest_risk": cumulative_pos / total_pos if total_pos else 0.0,
                "cumulative_deferral_rate_from_highest_risk": cumulative_rows / len(rows) if rows else 0.0,
            }
        )
    top = next(row for row in records if row["decile"] == 10)
    bottom = next(row for row in records if row["decile"] == 1)
    top20 = next((row for row in records if row["cumulative_deferral_rate_from_highest_risk"] >= 0.20), records[-1])
    return {
        "deciles": records,
        "top_decile_bad_rate": top["bad_step_rate"],
        "bottom_decile_bad_rate": bottom["bad_step_rate"],
        "top_bottom_ratio": (top["bad_step_rate"] / bottom["bad_step_rate"]) if top["bad_step_rate"] is not None and bottom["bad_step_rate"] else None,
        "top_10pct_bad_step_capture": top["cumulative_bad_step_capture_from_highest_risk"],
        "top_20pct_bad_step_capture": top20["cumulative_bad_step_capture_from_highest_risk"],
    }


def run_deciles(score_rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = utils.group_scores(score_rows)
    results = []
    for seed, by_model in sorted(grouped.items()):
        for baseline, by_split in sorted(by_model.items()):
            calibration_rows = by_split.get("calibration", [])
            test_rows = by_split.get("test", [])
            if not calibration_rows or not test_rows:
                continue
            cuts = cutpoints([float(row["score"]) for row in calibration_rows])
            for split, rows in (("calibration", calibration_rows), ("test", test_rows)):
                results.append({"seed": seed, "baseline_name": baseline, "split": split, "calibration_cutpoints": cuts, **split_deciles(rows, cuts)})
    return {
        "schema_version": "risk-controlled-intervention-repeated-score-deciles.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Repeated score-ranking diagnostic only; not production StepHarbor guarantees.",
        "decile_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# Repeated Score Decile Analysis", "", "| model | mean test top/bottom ratio | mean top 10% capture | mean top 20% capture |", "|---|---:|---:|---:|"]
    by_model: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in report["decile_results"]:
        if row["split"] == "test":
            by_model[row["baseline_name"]].append(row)
    for baseline, rows in sorted(by_model.items()):
        ratios = [row["top_bottom_ratio"] for row in rows if row["top_bottom_ratio"] is not None]
        mean_ratio = sum(ratios) / len(ratios) if ratios else None
        mean_top10 = sum(row["top_10pct_bad_step_capture"] for row in rows) / len(rows)
        mean_top20 = sum(row["top_20pct_bad_step_capture"] for row in rows) / len(rows)
        lines.append(f"| `{baseline}` | `{mean_ratio}` | `{mean_top10}` | `{mean_top20}` |")
    return "\n".join(lines)


def main() -> int:
    report = run_deciles(utils.load_repeated_scores())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"decile_rows": len(report["decile_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
