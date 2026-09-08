#!/usr/bin/env python3
"""Exploratory early-intervention metrics from risk-control decisions."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DECISIONS = WORKSPACE / "data" / "model_outputs" / "risk_control_decisions.jsonl"
OUTPUT_JSON = REPORTS_DIR / "early_intervention_metrics.json"
OUTPUT_MD = REPORTS_DIR / "early_intervention_metrics.md"


def load_decisions() -> list[dict[str, Any]]:
    rows = []
    with DECISIONS.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def trajectory_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_traj: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_traj[str(row["trajectory_id"])].append(row)
    any_bad = any_intervention = before_bad = immediately_before = 0
    within = {k: 0 for k in (0, 1, 2, 3, 5)}
    bad_after_first = 0
    total_bad = 0
    for traj_rows in by_traj.values():
        ordered = sorted(traj_rows, key=lambda row: int(row["step_index"]))
        bad_steps = [int(row["step_index"]) + 1 for row in ordered if int(row["target"]) == 1]
        defer_steps = [int(row["step_index"]) for row in ordered if row["decision"] == "DEFER"]
        total_bad += len(bad_steps)
        if bad_steps:
            any_bad += 1
        if defer_steps:
            any_intervention += 1
        if bad_steps and defer_steps:
            first_bad = min(bad_steps)
            first_defer = min(defer_steps)
            if first_defer < first_bad:
                before_bad += 1
            if first_defer == first_bad - 1:
                immediately_before += 1
            for k in within:
                if first_defer <= first_bad + k:
                    within[k] += 1
            bad_after_first += sum(1 for step in bad_steps if step > first_defer)
    return {
        "trajectory_count": len(by_traj),
        "trajectories_with_any_bad_step": any_bad,
        "trajectories_with_any_intervention": any_intervention,
        "intervention_before_first_bad_step": before_bad,
        "intervention_at_step_immediately_before_bad_step": immediately_before,
        "intervention_within_k_steps_after_first_bad": {str(k): value for k, value in within.items()},
        "bad_steps_after_first_intervention": bad_after_first,
        "total_bad_steps_under_always_allow": total_bad,
        "reduction_in_allowed_bad_steps_vs_always_allow": total_bad - bad_after_first,
    }


def build_report() -> dict[str, Any]:
    rows = load_decisions()
    if not rows or not all(row.get("trajectory_id") is not None and row.get("step_index") is not None for row in rows):
        return {
            "schema_version": "risk-controlled-intervention-early-intervention.v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "available": False,
            "reason": "trajectory_id or step_index missing from decision rows",
        }
    grouped: dict[tuple[str, str, float, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("split") == "test":
            grouped[(row["baseline_name"], row["thresholding_variant"], float(row["alpha"]), row["split"])].append(row)
    summaries = [
        {
            "baseline_name": key[0],
            "thresholding_variant": key[1],
            "alpha": key[2],
            "split": key[3],
            **trajectory_summary(value),
        }
        for key, value in sorted(grouped.items())
    ]
    return {
        "schema_version": "risk-controlled-intervention-early-intervention.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Exploratory timing summary only; no causal prevention claim.",
        "available": True,
        "scope": "Test split decisions for frozen v0.4 extraction-supported verified subset.",
        "summaries": summaries,
    }


def markdown(report: dict[str, Any]) -> str:
    if not report.get("available"):
        return f"# Early Intervention Metrics\n\nNot available: {report.get('reason')}\n"
    lines = [
        "# Early Intervention Metrics",
        "",
        "Exploratory only. This does not establish causal prevention.",
        "",
        "| baseline | variant | alpha | any intervention | before first bad | bad after first intervention |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for row in report["summaries"]:
        lines.append(
            f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['alpha']}` | "
            f"`{row['trajectories_with_any_intervention']}` | `{row['intervention_before_first_bad_step']}` | `{row['bad_steps_after_first_intervention']}` |"
        )
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"available": report.get("available"), "summaries": len(report.get("summaries", []))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
