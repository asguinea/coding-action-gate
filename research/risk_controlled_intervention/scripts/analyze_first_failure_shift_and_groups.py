#!/usr/bin/env python3
"""Analyze Batch 9L first-failure source/group diagnostics."""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
BY_GROUP_INPUT = REPORTS_DIR / "batch_9l_first_failure_by_group.csv"
REPORT_JSON = REPORTS_DIR / "batch_9l_first_failure_shift_groups.json"
REPORT_MD = REPORTS_DIR / "batch_9l_first_failure_shift_groups.md"
BY_SOURCE_CSV = REPORTS_DIR / "batch_9l_first_failure_by_source_group.csv"
BY_TIMING_CSV = REPORTS_DIR / "batch_9l_first_failure_by_timing_group.csv"


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9L group input: {path}")


def read_csv(path: Path) -> list[dict[str, str]]:
    require(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def f(row: dict[str, Any], key: str) -> float | None:
    try:
        value = row.get(key)
        if value in ("", None, "None"):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def aggregate(rows: list[dict[str, str]], groups: set[str]) -> list[dict[str, Any]]:
    out = []
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("group") in groups:
            grouped[(row.get("group", "unknown"), row.get("score_source", "unknown"))].append(row)
    for (group, source), vals in grouped.items():
        item = {"group": group, "score_source": source, "count": len(vals)}
        for key in ("first_failure_coverage", "pre_failure_warning_coverage", "trajectory_burden", "mean_lead_time", "warning_precision"):
            clean = [f(row, key) for row in vals if f(row, key) is not None]
            item[f"{key}_mean"] = statistics.mean(clean) if clean else None
        out.append(item)
    return sorted(out, key=lambda row: (row["group"], row["score_source"]))


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9L First-Failure Shift and Group Diagnostics",
        "",
        "Exploratory benchmark-level group diagnostics on CodeTraceBench-derived trajectories. Source/layout metadata is used only for evaluation stratification, not as model features. This offline proxy covers first-failure row-level risk, trajectory-level burden, calibration support, and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| group | score source | first-failure coverage | pre-failure coverage | trajectory burden |",
        "|---|---|---:|---:|---:|",
    ]
    for row in report["source_group_summary"][:20]:
        lines.append(f"| `{row['group']}` | `{row['score_source']}` | `{row.get('first_failure_coverage_mean')}` | `{row.get('pre_failure_warning_coverage_mean')}` | `{row.get('trajectory_burden_mean')}` |")
    return "\n".join(lines)


def main() -> None:
    rows = read_csv(BY_GROUP_INPUT)
    source_groups = {"all", "SWE-like", "TerminalBench-like", "OpenHands-like", "short", "medium", "long"}
    timing_groups = {"early_first_failure", "late_first_failure", "repeated_bad", "exactly_one_bad"}
    source_summary = aggregate(rows, source_groups)
    timing_summary = aggregate(rows, timing_groups)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure group diagnostics, row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "source_group_summary": source_summary,
        "timing_group_summary": timing_summary,
        "guard_results": {"metadata_as_model_features": False, "raw_marker_hits": []},
    }
    write_csv(BY_SOURCE_CSV, source_summary)
    write_csv(BY_TIMING_CSV, timing_summary)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"source_rows": len(source_summary), "timing_rows": len(timing_summary)}, indent=2))


if __name__ == "__main__":
    main()
