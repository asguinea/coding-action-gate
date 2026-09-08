#!/usr/bin/env python3
"""Batch T-8 Part A: score diagnostics for trajectory-level first-event ranking."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from t8_oracle_gap_utils import (
    AGGREGATORS,
    BETAS,
    REPORTS,
    binary_ranking_metrics,
    load_score_rows,
    oracle_upper_bound,
    select_top_by_budget,
    trajectory_selection_metrics,
    trajectory_summaries,
    aggregate_score,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T8_score_trajectory_ranking.json"
OUT_MD = REPORTS / "batch_T8_score_trajectory_ranking.md"
OUT_CSV = REPORTS / "batch_T8_score_trajectory_ranking.csv"
OUT_CURVES = REPORTS / "batch_T8_score_trajectory_budget_curves.csv"

TARGETS = [
    "trajectory_has_first_failure",
    "trajectory_has_repeated_bad",
    "early_first_failure",
    "late_first_failure",
]


def main() -> None:
    rows = load_score_rows()
    summaries = trajectory_summaries(rows, split_role="test")
    if not summaries:
        raise RuntimeError("No test trajectories found in theory_row_level_scores.jsonl")
    by_seed_family: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for summary in summaries:
        by_seed_family[(summary["split_seed"], summary["score_family"])].append(summary)

    ranking_rows: list[dict] = []
    curve_rows: list[dict] = []
    best_primary = None
    for (seed, family), group in sorted(by_seed_family.items()):
        for agg in AGGREGATORS:
            values = [aggregate_score(summary, agg) for summary in group]
            for target in TARGETS:
                labels = [int(summary[target]) for summary in group]
                metrics = binary_ranking_metrics(values, labels)
                row = {
                    "split_seed": seed,
                    "score_family": family,
                    "aggregator": agg,
                    "target": target,
                    "trajectory_count": len(group),
                    "positive_trajectory_count": sum(labels),
                    **metrics,
                }
                ranking_rows.append(row)
                if target == "trajectory_has_first_failure" and (best_primary is None or row["ap"] > best_primary["ap"]):
                    best_primary = row
            bad_prev = sum(int(s["trajectory_has_first_failure"]) for s in group) / len(group)
            for beta in BETAS:
                selected = select_top_by_budget(group, values, beta)
                metrics = trajectory_selection_metrics(group, selected)
                upper = oracle_upper_bound(beta, bad_prev)
                curve_rows.append({
                    "split_seed": seed,
                    "score_family": family,
                    "aggregator": agg,
                    "trajectory_budget": beta,
                    "bad_trajectory_prevalence": bad_prev,
                    "oracle_trajectory_selection_upper_bound": upper,
                    "gap_to_oracle_upper_bound": upper - metrics["first_failure_coverage"],
                    **metrics,
                })

    primary_rows = [r for r in ranking_rows if r["target"] == "trajectory_has_first_failure"]
    mean_primary_ap = mean(r["ap"] for r in primary_rows)
    mean_primary_auroc = mean(r["auroc"] for r in primary_rows)
    best_curves = [
        row for row in curve_rows
        if best_primary
        and row["split_seed"] == best_primary["split_seed"]
        and row["score_family"] == best_primary["score_family"]
        and row["aggregator"] == best_primary["aggregator"]
    ]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-8",
        "purpose": "oracle gap score weakness diagnostic for trajectory-level first-event ranking",
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "offline_proxy": True,
        },
        "guard_results": {
            "raw_text_used": False,
            "metadata_used_as_model_features": False,
            "test_tuning": False,
            "mock_data_used": False,
        },
        "score_families": sorted({s["score_family"] for s in summaries}),
        "split_seeds": sorted({s["split_seed"] for s in summaries}),
        "ranking_rows": len(ranking_rows),
        "budget_curve_rows": len(curve_rows),
        "mean_primary_ap": mean_primary_ap,
        "mean_primary_auroc": mean_primary_auroc,
        "best_primary_first_failure_ranking": best_primary,
        "best_primary_budget_curves": best_curves,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, ranking_rows)
    write_csv(OUT_CURVES, curve_rows)

    best = best_primary or {}
    OUT_MD.write_text("\n".join([
        "# Batch T-8 Score Trajectory Ranking",
        "",
        "This oracle gap diagnostic tests score weakness at the trajectory-selection level. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Score families: `{', '.join(payload['score_families'])}`",
        f"- Split seeds: `{len(payload['split_seeds'])}`",
        f"- Ranking rows: `{len(ranking_rows)}`",
        f"- Budget curve rows: `{len(curve_rows)}`",
        f"- Mean primary AUROC for first-event first-failure trajectory ranking: `{mean_primary_auroc:.4f}`",
        f"- Mean primary AP: `{mean_primary_ap:.4f}`",
        "",
        "## Best First-Failure Trajectory Ranking",
        "",
        f"- Score family: `{best.get('score_family')}`",
        f"- Aggregator: `{best.get('aggregator')}`",
        f"- AUROC: `{best.get('auroc', 0.0):.4f}`",
        f"- AP: `{best.get('ap', 0.0):.4f}`",
        f"- AP lift: `{best.get('ap_lift', 0.0):.4f}`",
        "",
        "## Interpretation",
        "",
        "Current scores contain some first-event trajectory-level signal if AUROC/AP exceed prevalence, but the budget curves quantify the remaining gap to oracle feasibility. Large gaps indicate score weakness before timing or policy-family limitation is considered.",
    ]) + "\n")
    print(json.dumps({"ranking_rows": len(ranking_rows), "budget_curve_rows": len(curve_rows), "best_ap": best.get("ap")}, indent=2))


if __name__ == "__main__":
    main()
