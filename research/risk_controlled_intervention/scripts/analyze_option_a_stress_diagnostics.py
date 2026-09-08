#!/usr/bin/env python3
"""Stress diagnostics for Batch T-3 Option A prototype."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
REAL_CSV = REPORTS / "batch_T3_option_A_real_data_results.csv"
GROUP_CSV = REPORTS / "batch_9n_first_event_by_source_group.csv"
TIMING_CSV = REPORTS / "batch_9n_first_event_by_timing_group.csv"
OUT_JSON = REPORTS / "batch_T3_option_A_stress_diagnostics.json"
OUT_MD = REPORTS / "batch_T3_option_A_stress_diagnostics.md"
OUT_GROUP = REPORTS / "batch_T3_option_A_stress_by_group.csv"
OUT_TIMING = REPORTS / "batch_T3_option_A_stress_by_timing.csv"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str) -> float | None:
    value = row.get(key)
    if value in (None, ""):
        return None
    return float(value)


def summarize_existing(rows: list[dict[str, str]], group_key: str) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[row[group_key]].append(row)
    out = []
    for group, subset in sorted(groups.items()):
        def m(key: str) -> float | None:
            vals = [f(r, key) for r in subset if f(r, key) is not None]
            return mean(vals) if vals else None
        out.append({
            group_key: group,
            "rows": len(subset),
            "mean_missed_first_failure_rate": m("missed_first_failure_rate"),
            "mean_first_failure_coverage": m("first_failure_coverage"),
            "mean_pre_failure_warning_coverage": m("pre_failure_warning_coverage"),
            "mean_trajectory_burden": m("trajectory_burden"),
            "mean_false_alarm_rate": m("false_alarm_trajectory_rate"),
            "mean_positive_trajectories": m("positive_trajectories"),
            "source": "batch_9n_selected_policy_group_diagnostics",
        })
    return out


def summarize_option_a_by_alpha_score(rows: list[dict[str, str]]) -> dict[str, Any]:
    feasible = [r for r in rows if r["no_safe"] == "False"]
    by_alpha = defaultdict(list)
    by_score = defaultdict(list)
    for row in rows:
        by_alpha[row["alpha"]].append(row)
        by_score[row["score_family"]].append(row)
    return {
        "overall_no_safe_rate": sum(1 for r in rows if r["no_safe"] == "True") / len(rows),
        "high_burden_feasible_rate": sum(1 for r in feasible if f(r, "test_trajectory_burden") is not None and f(r, "test_trajectory_burden") > 0.5) / len(feasible) if feasible else None,
        "by_alpha_no_safe_rate": {alpha: sum(1 for r in group if r["no_safe"] == "True") / len(group) for alpha, group in by_alpha.items()},
        "by_score_no_safe_rate": {score: sum(1 for r in group if r["no_safe"] == "True") / len(group) for score, group in by_score.items()},
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    real = read_csv(REAL_CSV)
    group_rows = summarize_existing(read_csv(GROUP_CSV), "group")
    timing_rows = summarize_existing(read_csv(TIMING_CSV), "group")
    option_a_summary = summarize_option_a_by_alpha_score(real)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "empirical prototype; theory candidate; trajectory-level loss; first-event; missed first failure; Hoeffding union-bound correction; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "input_files": [str(REAL_CSV), str(GROUP_CSV), str(TIMING_CSV)],
        "option_a_summary": option_a_summary,
        "group_rows": len(group_rows),
        "timing_rows": len(timing_rows),
        "interpretation": "Stress diagnostics combine T-3 alpha/score feasibility with existing Batch 9N group and timing diagnostics; no new model features or test tuning are introduced.",
        "guard_results": {"metadata_as_model_features": False, "test_tuning": False, "raw_text_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_GROUP, group_rows)
    write_csv(OUT_TIMING, timing_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-3 Option A Stress Diagnostics",
        "",
        report["claim_boundary"],
        "",
        f"- Overall no-safe rate: `{option_a_summary['overall_no_safe_rate']:.3f}`",
        f"- High-burden feasible rate: `{option_a_summary['high_burden_feasible_rate']}`",
        "",
        "OpenHands/source-group and timing diagnostics are inherited from existing Batch 9N selected-policy group diagnostics for comparability. These diagnostics are for benchmark-level stress interpretation only.",
    ]) + "\n")
    print(json.dumps({"group_rows": len(group_rows), "timing_rows": len(timing_rows)}, indent=2))


if __name__ == "__main__":
    main()
