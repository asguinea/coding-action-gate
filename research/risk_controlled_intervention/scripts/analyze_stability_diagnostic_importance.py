#!/usr/bin/env python3
"""Analyze Batch 9K stability diagnostic importance."""

from __future__ import annotations

import csv
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DATASET_CSV = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.csv"

REPORT_JSON = REPORTS_DIR / "batch_9k_stability_diagnostic_importance.json"
REPORT_MD = REPORTS_DIR / "batch_9k_stability_diagnostic_importance.md"
REPORT_CSV = REPORTS_DIR / "batch_9k_stability_diagnostic_importance.csv"

DIAGNOSTICS = [
    "bootstrap_trajectory_burden_p90",
    "bootstrap_trajectory_burden_p95",
    "bootstrap_feasible_rate",
    "bootstrap_selected_policy_exact_match_rate",
    "bootstrap_selected_policy_family_entropy",
    "calibration_risk_gini_by_trajectory",
    "calibration_top_10pct_trajectory_risk_mass",
    "fraction_trajectories_within_0.01_threshold",
    "pareto_frontier_density_near_selected",
    "calibration_margin_to_trajectory_budget",
    "calibration_margin_to_row_budget",
    "calibration_positive_rows",
    "calibration_positive_trajectories",
]

OUTCOMES = ["any_test_constraint_violation", "bad_recommendation_outcome", "test_trajectory_budget_violation"]


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9K importance input: {path}")


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
        if value in (None, "", "None"):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def y(row: dict[str, Any], key: str) -> int:
    return 1 if str(row.get(key)).lower() == "true" else 0


def point_biserial(xs: list[float], ys: list[int]) -> float | None:
    if not xs or len(set(ys)) < 2:
        return None
    mx = statistics.mean(xs)
    my = statistics.mean(ys)
    sx = statistics.pstdev(xs)
    sy = statistics.pstdev(ys)
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (yy - my) for x, yy in zip(xs, ys)) / (len(xs) * sx * sy)


def auroc(xs: list[float], ys: list[int]) -> float | None:
    pos = [x for x, yy in zip(xs, ys) if yy == 1]
    neg = [x for x, yy in zip(xs, ys) if yy == 0]
    if not pos or not neg:
        return None
    wins = 0.0
    total = len(pos) * len(neg)
    for p in pos:
        for n in neg:
            if p > n:
                wins += 1.0
            elif p == n:
                wins += 0.5
    return wins / total


def average_precision(xs: list[float], ys: list[int]) -> float | None:
    positives = sum(ys)
    if positives == 0:
        return None
    ordered = sorted(zip(xs, ys), key=lambda pair: pair[0], reverse=True)
    hits = 0
    precisions: list[float] = []
    for rank, (_score, yy) in enumerate(ordered, start=1):
        if yy == 1:
            hits += 1
            precisions.append(hits / rank)
    return statistics.mean(precisions) if precisions else 0.0


def analyze(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for diag in DIAGNOSTICS:
        for outcome in OUTCOMES:
            pairs = [(f(row, diag), y(row, outcome)) for row in rows]
            pairs = [(x, yy) for x, yy in pairs if x is not None and not math.isnan(x)]
            xs = [float(x) for x, _yy in pairs]
            ys = [yy for _x, yy in pairs]
            auc = auroc(xs, ys)
            out.append({
                "diagnostic": diag,
                "outcome": outcome,
                "rows": len(xs),
                "outcome_rate": statistics.mean(ys) if ys else 0.0,
                "point_biserial": point_biserial(xs, ys),
                "auroc_direction_high": auc,
                "auroc_best_direction": max(auc or 0.0, 1 - (auc or 0.0)) if auc is not None else None,
                "average_precision_high": average_precision(xs, ys),
            })
    return out


def markdown(report: dict[str, Any]) -> str:
    top = report["top_diagnostics"][:5]
    lines = [
        "# Batch 9K Stability Diagnostic Importance",
        "",
        "This benchmark-level analysis treats test outcomes only as evaluation labels. It studies whether stability-aware calibration diagnostics are associated with dual-unit violations in an offline proxy on CodeTraceBench-derived trajectories. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "Safe scope concepts: benchmark-level, CodeTraceBench-derived, offline proxy, trajectory-level burden, row-level risk, dual-unit, calibration support, stability-aware, fail-closed, domain shift, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "## Top Diagnostics",
        "",
        "| diagnostic | outcome | AUROC best direction | correlation |",
        "|---|---:|---:|---:|",
    ]
    for row in top:
        corr = row["point_biserial"]
        auc = row["auroc_best_direction"]
        lines.append(f"| {row['diagnostic']} | {row['outcome']} | {auc:.4f} | {corr if corr is not None else ''} |")
    lines.extend(["", "The importance values are descriptive diagnostics, not a learned deployment guarantee."])
    return "\n".join(lines)


def main() -> None:
    rows = read_csv(DATASET_CSV)
    results = analyze(rows)
    top = sorted(results, key=lambda row: row["auroc_best_direction"] or 0.0, reverse=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; stability-aware dual-unit calibration support; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(DATASET_CSV)],
        "diagnostics_evaluated": DIAGNOSTICS,
        "outcomes_evaluated": OUTCOMES,
        "importance_rows": results,
        "top_diagnostics": top[:10],
        "guard_results": {"test_outcomes_used_as_labels_only": True, "metadata_as_risk_model_features": False},
    }
    write_csv(REPORT_CSV, results)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"importance_rows": len(results), "top": top[0]["diagnostic"] if top else None}, indent=2))


if __name__ == "__main__":
    main()
