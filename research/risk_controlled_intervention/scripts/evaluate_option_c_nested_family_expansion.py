#!/usr/bin/env python3
"""Nested policy-family diagnostics for Option C feasible-region expansion."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

REPORTS = Path(__file__).resolve().parents[1] / "reports"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
T5_CSV = REPORTS / "batch_T5_option_C_real_data_results.csv"
OUT_JSON = REPORTS / "batch_T6_option_C_nested_family_expansion.json"
OUT_MD = REPORTS / "batch_T6_option_C_nested_family_expansion.md"
OUT_CSV = REPORTS / "batch_T6_option_C_nested_family_expansion.csv"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str) -> float:
    value = row.get(key)
    return float(value) if value not in (None, "") else 0.0


def monotonicity(policy_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for r in policy_rows:
        groups[(r["split_seed"], r["score_family"], r["policy_variant"])].append(r)
    out = []
    for (seed, score, variant), group in groups.items():
        ordered = sorted(group, key=lambda r: f(r, "threshold_quantile"))
        burden_viol = 0
        miss_viol = 0
        for prev, cur in zip(ordered, ordered[1:]):
            if f(cur, "calibration_trajectory_burden") > f(prev, "calibration_trajectory_burden") + 1e-12:
                burden_viol += 1
            if f(cur, "calibration_missed_first_failure_rate") < f(prev, "calibration_missed_first_failure_rate") - 1e-12:
                miss_viol += 1
        out.append({
            "split_seed": seed,
            "score_family": score,
            "policy_variant": variant,
            "threshold_count": len(ordered),
            "burden_monotonicity_violations": burden_viol,
            "miss_monotonicity_violations": miss_viol,
            "nested_empirically_clean": burden_viol == 0 and miss_viol == 0,
        })
    return out


def family_feasibility(t5_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for r in t5_rows:
        if r["correction_name"] == "clopper_pearson_union" and r["grid_protocol"] == "calibration_score_quantiles":
            groups[r["policy_variant"]].append(r)
    out = []
    for variant, group in sorted(groups.items()):
        feasible = [r for r in group if r["no_safe"] == "False"]
        out.append({
            "policy_variant": variant,
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"] == "True") / len(group),
            "feasible_count": len(feasible),
            "mean_test_miss_feasible": mean([f(r, "test_missed_first_failure_rate") for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([f(r, "test_trajectory_burden") for r in feasible]) if feasible else None,
            "joint_success_rate_feasible": mean([1.0 if r["test_joint_success"] == "True" else 0.0 for r in feasible]) if feasible else None,
        })
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for r in rows for k in r})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    policy_rows = read_csv(POLICY_TABLE)
    t5_rows = read_csv(T5_CSV)
    mono = monotonicity(policy_rows)
    fam = family_feasibility(t5_rows)
    clean_rate = sum(1 for r in mono if r["nested_empirically_clean"]) / len(mono) if mono else None
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "status": "evaluated_existing_nested_families",
        "monotonicity_rows": len(mono),
        "family_rows": len(fam),
        "empirically_clean_nested_rate": clean_rate,
        "family_summary": fam,
        "monotonicity_summary": {
            "total_groups": len(mono),
            "groups_with_burden_violations": sum(1 for r in mono if r["burden_monotonicity_violations"] > 0),
            "groups_with_miss_violations": sum(1 for r in mono if r["miss_monotonicity_violations"] > 0),
        },
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, fam)
    OUT_MD.write_text("\n".join([
        "# Batch T-6 Option C Nested Family Expansion",
        "",
        report["claim_boundary"],
        "",
        f"- Status: `{report['status']}`",
        f"- Empirically clean nested rate: `{clean_rate}`",
        f"- Family rows: `{len(fam)}`",
        "",
        "This uses existing one-dimensional threshold families from the first-event policy table. No new row-level score artifacts are fabricated.",
    ]) + "\n")
    print(json.dumps({"families": len(fam), "clean_nested_rate": clean_rate}, indent=2))


if __name__ == "__main__":
    main()
