#!/usr/bin/env python3
"""Batch T-8 Part C: oracle trajectory selection with learned warning timing."""

from __future__ import annotations

import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean

from t8_oracle_gap_utils import (
    BETAS,
    REPORTS,
    lead_summary,
    load_score_rows,
    trajectory_summaries,
    write_csv,
    write_json,
)

OUT_JSON = REPORTS / "batch_T8_oracle_selection_learned_timing.json"
OUT_MD = REPORTS / "batch_T8_oracle_selection_learned_timing.md"
OUT_CSV = REPORTS / "batch_T8_oracle_selection_learned_timing.csv"

STRATEGIES = ["earliest_failures", "latest_failures", "repeated_bad_trajectories", "random_bad_trajectories"]
TIMING_POLICIES = [
    "first_crossing_train_q80",
    "earliest_top3_score_row",
    "max_score_row",
    "cumulative_hazard_train_q80",
    "early_weighted_train_q80",
]


def _thresholds_from_train(train_summaries: list[dict]) -> dict[str, float]:
    all_scores = []
    all_early = []
    all_cumulative_max = []
    for summary in train_summaries:
        scores = list(summary["scores"])
        all_scores.extend(scores)
        all_early.extend([score / (1.0 + 0.03 * idx) for score, idx in zip(scores, summary["prefix_indices"])])
        running = 0.0
        max_running = 0.0
        for score in scores:
            running += score
            max_running = max(max_running, running)
        all_cumulative_max.append(max_running)
    def q80(vals: list[float]) -> float:
        if not vals:
            return math.inf
        ordered = sorted(vals)
        return ordered[min(len(ordered) - 1, max(0, int(round(0.80 * (len(ordered) - 1)))))]
    return {
        "score_q80": q80(all_scores),
        "early_q80": q80(all_early),
        "cumulative_q80": q80(all_cumulative_max),
    }


def _select_oracle_bad(group: list[dict], beta: float, strategy: str, seed: int) -> list[dict]:
    bad = [summary for summary in group if int(summary["trajectory_has_first_failure"])]
    cap = max(1, min(len(group), math.ceil(len(group) * beta))) if group else 0
    if strategy == "earliest_failures":
        ordered = sorted(bad, key=lambda s: (s["first_bad_row_index"], s["trajectory_id"]))
    elif strategy == "latest_failures":
        ordered = sorted(bad, key=lambda s: (-s["first_bad_row_index"], s["trajectory_id"]))
    elif strategy == "repeated_bad_trajectories":
        ordered = sorted(bad, key=lambda s: (-int(s["trajectory_has_repeated_bad"]), s["first_bad_row_index"], s["trajectory_id"]))
    elif strategy == "random_bad_trajectories":
        ordered = list(bad)
        rng = random.Random(seed + int(beta * 1000))
        rng.shuffle(ordered)
    else:
        raise ValueError(strategy)
    return ordered[: min(cap, len(ordered))]


def _warning_time(summary: dict, policy: str, thresholds: dict[str, float]) -> int | None:
    scores = list(summary["scores"])
    idxs = list(summary["prefix_indices"])
    if not scores:
        return None
    if policy == "first_crossing_train_q80":
        threshold = thresholds["score_q80"]
        for idx, score in zip(idxs, scores):
            if score >= threshold:
                return int(idx)
        return None
    if policy == "earliest_top3_score_row":
        ranked = sorted(zip(idxs, scores), key=lambda x: (x[1], -x[0]), reverse=True)
        top = ranked[: min(3, len(ranked))]
        return min(int(idx) for idx, _ in top)
    if policy == "max_score_row":
        return int(max(zip(idxs, scores), key=lambda x: (x[1], -x[0]))[0])
    if policy == "cumulative_hazard_train_q80":
        threshold = thresholds["cumulative_q80"]
        running = 0.0
        for idx, score in zip(idxs, scores):
            running += score
            if running >= threshold:
                return int(idx)
        return None
    if policy == "early_weighted_train_q80":
        threshold = thresholds["early_q80"]
        for idx, score in zip(idxs, scores):
            if score / (1.0 + 0.03 * idx) >= threshold:
                return int(idx)
        return None
    raise ValueError(policy)


def main() -> None:
    rows = load_score_rows()
    train_summaries = trajectory_summaries(rows, split_role="train")
    test_summaries = trajectory_summaries(rows, split_role="test")
    by_seed_family_train: dict[tuple[int, str], list[dict]] = defaultdict(list)
    by_seed_family_test: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for summary in train_summaries:
        by_seed_family_train[(summary["split_seed"], summary["score_family"])].append(summary)
    for summary in test_summaries:
        by_seed_family_test[(summary["split_seed"], summary["score_family"])].append(summary)

    result_rows = []
    for (seed, family), group in sorted(by_seed_family_test.items()):
        train_group = by_seed_family_train.get((seed, family), [])
        thresholds = _thresholds_from_train(train_group)
        bad_total = sum(int(s["trajectory_has_first_failure"]) for s in group)
        for beta in BETAS:
            for strategy in STRATEGIES:
                selected = _select_oracle_bad(group, beta, strategy, seed)
                for policy in TIMING_POLICIES:
                    covered = 0
                    pre = 0
                    late = 0
                    missed_selected = 0
                    post_failure_only = 0
                    leads = []
                    for summary in selected:
                        first_bad = int(summary["first_bad_row_index"])
                        warning = _warning_time(summary, policy, thresholds)
                        if warning is None:
                            missed_selected += 1
                        elif warning <= first_bad:
                            covered += 1
                            if warning < first_bad:
                                pre += 1
                            leads.append(first_bad - warning)
                        else:
                            late += 1
                            post_failure_only += 1
                            missed_selected += 1
                    result_rows.append({
                        "split_seed": seed,
                        "score_family": family,
                        "trajectory_budget": beta,
                        "oracle_selection_strategy": strategy,
                        "learned_timing_policy": policy,
                        "selected_bad_trajectory_count": len(selected),
                        "bad_trajectory_count": bad_total,
                        "trajectory_count": len(group),
                        "first_failure_coverage": covered / bad_total if bad_total else 0.0,
                        "pre_failure_coverage": pre / bad_total if bad_total else 0.0,
                        "late_warning_rate": late / bad_total if bad_total else 0.0,
                        "missed_first_failure_among_selected_bad": missed_selected / len(selected) if selected else 0.0,
                        "post_failure_only_warning_rate": post_failure_only / len(selected) if selected else 0.0,
                        "trajectory_burden": len(selected) / len(group) if group else 0.0,
                        "false_alarm_trajectory_rate": 0.0,
                        "timing_gap_to_oracle_first_bad": (len(selected) - covered) / bad_total if bad_total else 0.0,
                        **lead_summary(leads),
                    })

    best = max(result_rows, key=lambda r: r["first_failure_coverage"]) if result_rows else {}
    mean_selected_miss = mean(r["missed_first_failure_among_selected_bad"] for r in result_rows) if result_rows else None
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-8",
        "purpose": "isolate policy-family limitation by giving learned timing oracle trajectory selection",
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
        "best_by_coverage": best,
        "mean_missed_among_selected_bad": mean_selected_miss,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-8 Oracle Selection + Learned Timing",
        "",
        "This oracle gap diagnostic gives the method oracle first-event trajectory selection and measures learned timing quality. It is a benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Result rows: `{len(result_rows)}`",
        f"- Mean missed first failure among selected bad trajectories: `{mean_selected_miss:.4f}`",
        "",
        "## Best Oracle Selection With Learned Timing",
        "",
        f"- Score family: `{best.get('score_family')}`",
        f"- Strategy: `{best.get('oracle_selection_strategy')}`",
        f"- Learned timing policy: `{best.get('learned_timing_policy')}`",
        f"- Trajectory budget: `{best.get('trajectory_budget')}`",
        f"- First-failure coverage: `{best.get('first_failure_coverage', 0.0):.4f}`",
        f"- Pre-failure coverage: `{best.get('pre_failure_coverage', 0.0):.4f}`",
        f"- Missed among selected bad: `{best.get('missed_first_failure_among_selected_bad', 0.0):.4f}`",
        "",
        "## Interpretation",
        "",
        "If oracle selection plus learned timing still misses many selected bad trajectories, the policy-family/timing component is weak. If timing succeeds under oracle selection, trajectory ranking score weakness explains more of the oracle gap.",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "mean_missed_selected": mean_selected_miss, "best_coverage": best.get("first_failure_coverage")}, indent=2))


if __name__ == "__main__":
    main()
