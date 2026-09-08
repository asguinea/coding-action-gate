#!/usr/bin/env python3
"""Build risk-cost frontiers for saved score files."""

from __future__ import annotations

import csv
import importlib.util
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
OUTPUT_JSON = REPORTS_DIR / "risk_cost_frontier.json"
OUTPUT_MD = REPORTS_DIR / "risk_cost_frontier.md"
CAL_CSV = REPORTS_DIR / "risk_cost_frontier_calibration.csv"
TEST_CSV = REPORTS_DIR / "risk_cost_frontier_test.csv"
THRESHOLD_SCRIPT = Path(__file__).resolve().with_name("run_risk_control_thresholds.py")


def _load_threshold_module():
    spec = importlib.util.spec_from_file_location("run_risk_control_thresholds", THRESHOLD_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


thresholds = _load_threshold_module()
rcm = thresholds.rcm


def compact_thresholds(scores: list[float], max_points: int = 200) -> list[float]:
    candidates = rcm.candidate_thresholds(scores)
    if len(candidates) <= max_points:
        return candidates
    step = max(1, len(candidates) // max_points)
    chosen = candidates[::step]
    if candidates[-1] not in chosen:
        chosen.append(candidates[-1])
    return chosen


def build_frontier() -> dict[str, Any]:
    rows = thresholds.load_score_rows()
    grouped = thresholds.group_by_baseline(rows)
    records = []
    for baseline_name, by_split in sorted(grouped.items()):
        for split in ("calibration", "test"):
            split_rows = by_split.get(split, [])
            if not split_rows:
                continue
            scores, labels, trajectories = thresholds.rows_to_scores_labels(split_rows)
            for tau in compact_thresholds(scores):
                metrics = rcm.decision_metrics(scores, labels, tau, alpha=0.0, trajectory_ids=trajectories)
                records.append(
                    {
                        "baseline_name": baseline_name,
                        "split": split,
                        "tau": tau,
                        "allowed_bad_rate": metrics["allowed_bad_rate"],
                        "deferral_rate": metrics["deferral_rate"],
                        "allowed_rate": metrics["allowed_rate"],
                        "allowed_count": metrics["allowed_count"],
                        "bad_allowed": metrics["bad_allowed"],
                    }
                )
    return {
        "schema_version": "risk-controlled-intervention-risk-cost-frontier.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8 risk-cost frontier only; benchmark-level, not production guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "frontier_points": records,
    }


def write_csv(records: list[dict[str, Any]], split: str, path: Path) -> None:
    fields = ["baseline_name", "split", "tau", "allowed_bad_rate", "deferral_rate", "allowed_rate", "allowed_count", "bad_allowed"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in records:
            if row["split"] == split:
                writer.writerow({field: row.get(field) for field in fields})


def markdown(report: dict[str, Any]) -> str:
    counts: dict[str, int] = defaultdict(int)
    for row in report["frontier_points"]:
        counts[f"{row['baseline_name']}:{row['split']}"] += 1
    lines = [
        "# Risk-Cost Frontier",
        "",
        "Threshold sweep for calibration and test scores. No final publication figures are generated here.",
        "",
    ]
    for key, count in sorted(counts.items()):
        lines.append(f"- `{key}`: `{count}` points")
    return "\n".join(lines)


def main() -> int:
    report = build_frontier()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    write_csv(report["frontier_points"], "calibration", CAL_CSV)
    write_csv(report["frontier_points"], "test", TEST_CSV)
    print(json.dumps({"frontier_points": len(report["frontier_points"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
