#!/usr/bin/env python3
"""Analyze Option C alpha/beta feasible region."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

REPORTS = Path(__file__).resolve().parents[1] / "reports"
IN_CSV = REPORTS / "batch_T5_option_C_real_data_results.csv"
OUT_JSON = REPORTS / "batch_T5_option_C_feasible_region.json"
OUT_MD = REPORTS / "batch_T5_option_C_feasible_region.md"
OUT_CSV = REPORTS / "batch_T5_option_C_feasible_region.csv"
HEATMAP = REPORTS / "batch_T5_option_C_no_safe_heatmap.csv"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str) -> float:
    value = row.get(key)
    return float(value) if value not in (None, "") else 0.0


def aggregate(rows: list[dict[str, str]], keys: list[str]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[k] for k in keys)].append(row)
    out = []
    for vals, group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        feasible = [r for r in group if r["no_safe"] == "False"]
        item = {k: v for k, v in zip(keys, vals)}
        item.update({
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"] == "True") / len(group),
            "feasible_rate": len(feasible) / len(group),
            "mean_test_miss_feasible": mean([f(r, "test_missed_first_failure_rate") for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([f(r, "test_trajectory_burden") for r in feasible]) if feasible else None,
            "mean_first_failure_coverage_feasible": mean([f(r, "test_first_failure_coverage") for r in feasible]) if feasible else None,
            "joint_success_rate_feasible": mean([1.0 if r["test_joint_success"] == "True" else 0.0 for r in feasible]) if feasible else None,
        })
        out.append(item)
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows = [
        r for r in read_csv(IN_CSV)
        if r["correction_name"] == "clopper_pearson_union" and r["grid_protocol"] == "calibration_score_quantiles"
    ]
    region = aggregate(rows, ["alpha", "beta"])
    heatmap = [{"alpha": r["alpha"], "beta": r["beta"], "no_safe_rate": r["no_safe_rate"], "feasible_rate": r["feasible_rate"]} for r in region]
    feasible_cells = [r for r in region if r["feasible_rate"] > 0]
    realistic = [
        r for r in region
        if r["feasible_rate"] > 0.05 and r["joint_success_rate_feasible"] is not None and r["joint_success_rate_feasible"] >= 0.9
    ]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "dual-constraint feasible set; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "rows_analyzed": len(rows),
        "feasible_region_rows": region,
        "feasible_cells": len(feasible_cells),
        "realistic_cells": realistic,
        "interpretation": "The feasible region identifies alpha/beta pairs supported by calibration; empty or sparse cells are expected under structural burden/miss conflict.",
        "guard_results": {"test_tuning": False, "raw_text_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, region)
    write_csv(HEATMAP, heatmap)
    OUT_MD.write_text("\n".join([
        "# Batch T-5 Option C Feasible Region",
        "",
        report["claim_boundary"],
        "",
        f"- Rows analyzed: `{len(rows)}`",
        f"- Feasible alpha/beta cells: `{len(feasible_cells)}`",
        f"- Realistic cells with feasible rate > 0.05 and joint success >= 0.9: `{len(realistic)}`",
        "",
        report["interpretation"],
    ]) + "\n")
    print(json.dumps({"rows": len(rows), "feasible_cells": len(feasible_cells), "realistic_cells": len(realistic)}, indent=2))


if __name__ == "__main__":
    main()
