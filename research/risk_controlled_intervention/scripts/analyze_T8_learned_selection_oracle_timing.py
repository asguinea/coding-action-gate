#!/usr/bin/env python3
"""Batch T-8 Part B: learned trajectory selection with oracle first-event timing."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from t8_oracle_gap_utils import (
    AGGREGATORS,
    ALPHAS,
    BETAS,
    REPORTS,
    aggregate_score,
    load_score_rows,
    oracle_upper_bound,
    select_top_by_budget,
    trajectory_selection_metrics,
    trajectory_summaries,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T8_learned_selection_oracle_timing.json"
OUT_MD = REPORTS / "batch_T8_learned_selection_oracle_timing.md"
OUT_CSV = REPORTS / "batch_T8_learned_selection_oracle_timing.csv"


def _option_c_reference() -> dict:
    path = REPORTS / "batch_T7_option_C_clean_grid_results.json"
    if not path.exists():
        return {"available": False}
    obj = json.loads(path.read_text())
    return {
        "available": True,
        "source_report": str(path),
        "no_safe_rate": obj.get("best_default", {}).get("no_safe_rate", obj.get("no_safe_rate")),
        "mean_feasible_test_miss_rate": obj.get("best_default", {}).get("mean_feasible_test_miss_rate"),
        "mean_feasible_test_burden": obj.get("best_default", {}).get("mean_feasible_test_burden"),
    }


def main() -> None:
    rows = load_score_rows()
    summaries = trajectory_summaries(rows, split_role="test")
    by_seed_family: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for summary in summaries:
        by_seed_family[(summary["split_seed"], summary["score_family"])].append(summary)

    result_rows: list[dict] = []
    feasible_rows: list[dict] = []
    for (seed, family), group in sorted(by_seed_family.items()):
        bad_prev = sum(int(s["trajectory_has_first_failure"]) for s in group) / len(group)
        for agg in AGGREGATORS:
            values = [aggregate_score(summary, agg) for summary in group]
            for beta in BETAS:
                selected = select_top_by_budget(group, values, beta)
                metrics = trajectory_selection_metrics(group, selected)
                upper = oracle_upper_bound(beta, bad_prev)
                row = {
                    "split_seed": seed,
                    "score_family": family,
                    "aggregator": agg,
                    "trajectory_budget": beta,
                    "timing_convention": "oracle_first_bad_warning_for_selected_bad_trajectories",
                    "oracle_trajectory_selection_upper_bound": upper,
                    "gap_to_oracle_upper_bound": upper - metrics["first_failure_coverage"],
                    "gap_to_oracle_first_bad_warning": 1.0 - metrics["first_failure_coverage"],
                    **metrics,
                }
                result_rows.append(row)
                for alpha in ALPHAS:
                    feasible_rows.append({
                        **row,
                        "alpha": alpha,
                        "uncorrected_alpha_beta_feasible": bool(metrics["missed_first_failure_rate"] <= alpha and metrics["trajectory_burden"] <= beta),
                    })

    best_by_coverage = max(result_rows, key=lambda r: r["first_failure_coverage"]) if result_rows else {}
    mean_gap = mean(row["gap_to_oracle_upper_bound"] for row in result_rows) if result_rows else None
    mean_coverage_by_beta = {
        str(beta): mean(row["first_failure_coverage"] for row in result_rows if row["trajectory_budget"] == beta)
        for beta in BETAS
    }
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-8",
        "purpose": "isolate score weakness by giving learned trajectory selection oracle first-event timing",
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
        "result_rows": len(result_rows),
        "best_by_coverage": best_by_coverage,
        "mean_gap_to_oracle_upper_bound": mean_gap,
        "mean_first_failure_coverage_by_beta": mean_coverage_by_beta,
        "uncorrected_feasibility_rows": len(feasible_rows),
        "uncorrected_feasible_rate": sum(1 for r in feasible_rows if r["uncorrected_alpha_beta_feasible"]) / len(feasible_rows) if feasible_rows else 0.0,
        "option_c_clean_grid_reference": _option_c_reference(),
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-8 Learned Selection + Oracle Timing",
        "",
        "This oracle gap diagnostic asks whether learned score aggregations can select first-failure trajectories if timing is made oracle. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Result rows: `{len(result_rows)}`",
        f"- Mean gap to oracle feasibility upper bound: `{mean_gap:.4f}`",
        f"- Uncorrected alpha/beta feasible rate across diagnostic rows: `{payload['uncorrected_feasible_rate']:.4f}`",
        "",
        "## Best Learned Selection With Oracle Timing",
        "",
        f"- Score family: `{best_by_coverage.get('score_family')}`",
        f"- Aggregator: `{best_by_coverage.get('aggregator')}`",
        f"- Trajectory budget: `{best_by_coverage.get('trajectory_budget')}`",
        f"- First-failure coverage: `{best_by_coverage.get('first_failure_coverage', 0.0):.4f}`",
        f"- Trajectory burden: `{best_by_coverage.get('trajectory_burden', 0.0):.4f}`",
        "",
        "## Interpretation",
        "",
        "If learned selection plus oracle timing remains far below the oracle upper bound, score weakness is a dominant part of the oracle gap. If it is strong, remaining failures point more toward policy-family limitation or timing.",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "mean_gap": mean_gap, "best_coverage": best_by_coverage.get("first_failure_coverage")}, indent=2))


if __name__ == "__main__":
    main()
