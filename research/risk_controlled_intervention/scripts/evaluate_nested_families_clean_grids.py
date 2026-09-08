#!/usr/bin/env python3
"""Evaluate one-dimensional nested family expansion with clean grids."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from option_a_first_event_calibration import option_a_select_threshold
from option_c_dual_constraint_calibration import option_c_select_threshold
from theory_clean_grid_utils import build_threshold_table, load_scores, quantile, split_rows_for_protocol, transform_rows, write_csv

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T7_nested_family_clean_grid_results.json"
OUT_MD = REPORTS / "batch_T7_nested_family_clean_grid_results.md"
OUT_CSV = REPORTS / "batch_T7_nested_family_clean_grid_results.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
DELTAS = [0.10]
QUANTILES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.975, 0.99]
FAMILIES = ["single_score_first_crossing", "cumulative_hazard_first_crossing", "hybrid_score_first_crossing", "early_weighted_first_crossing", "generic_history_first_crossing"]


def family_rows(rows: list[dict[str, Any]], family: str) -> list[dict[str, Any]]:
    if family == "hybrid_score_first_crossing":
        return [r for r in rows if str(r["score_family"]).startswith("hybrid_")]
    if family == "generic_history_first_crossing":
        return [r for r in rows if r["score_family"] == "generic_bad_logistic_history"]
    if family in {"single_score_first_crossing", "cumulative_hazard_first_crossing", "early_weighted_first_crossing"}:
        return rows
    raise ValueError(family)


def maybe_transform(rows: list[dict[str, Any]], family: str) -> list[dict[str, Any]]:
    if family in {"single_score_first_crossing", "hybrid_score_first_crossing", "generic_history_first_crossing"}:
        return rows
    return transform_rows(rows, family)


def nested_clean(table: list[dict[str, Any]]) -> bool:
    ordered = sorted(table, key=lambda r: float(r["threshold"]))
    for prev, cur in zip(ordered, ordered[1:]):
        if cur["empirical_burden"] > prev["empirical_burden"] + 1e-12:
            return False
        if cur["empirical_miss_rate"] < prev["empirical_miss_rate"] - 1e-12:
            return False
    return True


def main() -> None:
    rows = load_scores()
    grouped = defaultdict(list)
    for row in rows:
        grouped[(int(row["split_seed"]), row["score_family"])].append(row)
    results = []
    for family in FAMILIES:
        fam_groups = defaultdict(list)
        for key, vals in grouped.items():
            kept = family_rows(vals, family)
            if kept:
                fam_groups[key].extend(kept)
        for (seed, score_family), vals in sorted(fam_groups.items()):
            transformed = maybe_transform(vals, family)
            train = [r for r in transformed if r["split_role"] == "train"]
            cal = split_rows_for_protocol(transformed, "train_score_quantiles", "calibration")
            thresholds = sorted({round(quantile([float(r["score_value"]) for r in train], q), 12) for q in QUANTILES})
            cal_table = build_threshold_table(cal, thresholds)
            clean = nested_clean(cal_table)
            for alpha in ALPHAS:
                selected_a = option_a_select_threshold(cal_table, alpha, 0.10, thresholds, correction_name="clopper_pearson_union")
                results.append({
                    "family": family,
                    "split_seed": seed,
                    "score_family": score_family,
                    "selector": "Option_A",
                    "alpha": alpha,
                    "beta": None,
                    "nestedness_pass": clean,
                    "no_safe": selected_a["no_safe"],
                    "feasible_count": selected_a["feasible_count"],
                    "test_tuning": False,
                })
                for beta in BETAS:
                    selected_c = option_c_select_threshold(cal_table, alpha, beta, 0.10, thresholds, correction="clopper_pearson_union")
                    results.append({
                        "family": family,
                        "split_seed": seed,
                        "score_family": score_family,
                        "selector": "Option_C",
                        "alpha": alpha,
                        "beta": beta,
                        "nestedness_pass": clean,
                        "no_safe": selected_c["no_safe"],
                        "feasible_count": selected_c["feasible_count"],
                        "test_tuning": False,
                    })
    summary = []
    groups = defaultdict(list)
    for row in results:
        groups[(row["family"], row["selector"])].append(row)
    for (family, selector), vals in sorted(groups.items()):
        summary.append({
            "family": family,
            "selector": selector,
            "rows": len(vals),
            "nestedness_pass_rate": mean([1.0 if v["nestedness_pass"] else 0.0 for v in vals]),
            "no_safe_rate": mean([1.0 if v["no_safe"] else 0.0 for v in vals]),
            "mean_feasible_count": mean([v["feasible_count"] for v in vals]),
        })
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "row-level score artifacts; clean-grid evaluation; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "families": FAMILIES,
        "grid_protocol": "train_score_quantiles",
        "summary": summary,
        "result_rows": len(results),
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, results)
    OUT_MD.write_text("\n".join([
        "# Batch T-7 Nested Family Clean-Grid Results",
        "",
        report["claim_boundary"],
        "",
        f"- Result rows: `{len(results)}`",
        f"- Families: `{', '.join(FAMILIES)}`",
        "- Grid protocol: `train_score_quantiles`",
    ]) + "\n")
    print(json.dumps({"rows": len(results), "families": len(FAMILIES)}, indent=2))


if __name__ == "__main__":
    main()
