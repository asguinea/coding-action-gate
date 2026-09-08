#!/usr/bin/env python3
"""Synthetic theorem demonstration for feasibility-aware first-event control."""

from __future__ import annotations

import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import mean
from typing import Any

from feasibility_aware_first_event_control import (
    clopper_pearson_lower_bound,
    estimate_first_failure_prevalence,
    feasibility_aware_select_policy,
)
from t16_evaluation_utils import REPORTS, claim_boundary, write_csv, write_json, write_md

OUT_JSON = REPORTS / "batch_T17_synthetic_theorem_demo.json"
OUT_MD = REPORTS / "batch_T17_synthetic_theorem_demo.md"
OUT_CSV = REPORTS / "batch_T17_synthetic_theorem_demo.csv"
OUT_BY_SCENARIO = REPORTS / "batch_T17_synthetic_theorem_demo_by_scenario.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
DELTAS = [0.10, 0.05]
THRESHOLDS = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]
SEEDS = [101, 202, 303, 404, 505]


SCENARIOS: dict[str, dict[str, Any]] = {
    "structural_impossible_by_prevalence": {"p": 0.65, "signal": 0.85, "noise": 0.08, "n_cal": 160, "n_test": 320, "shift": 0.0, "expected": "structural_no_safe"},
    "feasible_good_scores": {"p": 0.28, "signal": 0.92, "noise": 0.04, "n_cal": 180, "n_test": 360, "shift": 0.0, "expected": "selected_policy"},
    "oracle_feasible_score_limited": {"p": 0.30, "signal": 0.55, "noise": 0.22, "n_cal": 180, "n_test": 360, "shift": 0.0, "expected": "empirical_infeasible"},
    "correction_blocked_small_calibration": {"p": 0.24, "signal": 0.88, "noise": 0.06, "n_cal": 28, "n_test": 360, "shift": 0.0, "expected": "correction_blocked"},
    "weak_scores_high_false_alarm": {"p": 0.42, "signal": 0.52, "noise": 0.26, "n_cal": 180, "n_test": 360, "shift": 0.0, "expected": "empirical_infeasible"},
    "calibration_test_shift": {"p": 0.28, "signal": 0.88, "noise": 0.05, "n_cal": 180, "n_test": 360, "shift": 0.22, "expected": "shift_degrades_success"},
    "low_prevalence_easy": {"p": 0.10, "signal": 0.94, "noise": 0.04, "n_cal": 180, "n_test": 360, "shift": 0.0, "expected": "selected_policy"},
    "high_prevalence_high_burden_required": {"p": 0.58, "signal": 0.90, "noise": 0.06, "n_cal": 180, "n_test": 360, "shift": 0.0, "expected": "boundary_governs"},
}


def _clip(x: float) -> float:
    return min(1.0, max(0.0, x))


def generate_trajectories(config: dict[str, Any], seed: int, split: str) -> list[dict[str, Any]]:
    rng = random.Random(seed + (10000 if split == "test" else 0))
    n = int(config["n_test"] if split == "test" else config["n_cal"])
    p = float(config["p"]) + (float(config["shift"]) if split == "test" else 0.0)
    p = _clip(p)
    rows = []
    for i in range(n):
        has_failure = rng.random() < p
        length = rng.randint(6, 30)
        first_failure = rng.randint(1, length - 1) if has_failure else math.inf
        base = float(config["signal"]) if has_failure else 1.0 - float(config["signal"])
        if split == "test" and config.get("shift", 0.0):
            base = base - 0.18 if has_failure else base + 0.18
        score = _clip(rng.gauss(base, float(config["noise"])))
        rows.append({
            "trajectory_id": f"{split}_{seed}_{i}",
            "length": length,
            "first_failure_exists": has_failure,
            "trajectory_has_first_failure": has_failure,
            "first_failure_index": first_failure,
            "score": score,
        })
    return rows


def build_loss_table(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    n = len(rows)
    bad = [r for r in rows if r["first_failure_exists"]]
    n_bad = len(bad)
    out = []
    for order, threshold in enumerate(THRESHOLDS):
        warned = [r for r in rows if r["score"] >= threshold]
        warned_bad = [r for r in bad if r["score"] >= threshold]
        miss_rate = 1.0 - (len(warned_bad) / n_bad if n_bad else 0.0)
        burden = len(warned) / n if n else 0.0
        false_alarm = len([r for r in warned if not r["first_failure_exists"]]) / max(1, len([r for r in rows if not r["first_failure_exists"]]))
        pre_failure = len(warned_bad) / n_bad if n_bad else 0.0
        out.append({
            "threshold": threshold,
            "threshold_order": order,
            "n_miss": n_bad,
            "n_burden": n,
            "empirical_miss_rate": miss_rate,
            "empirical_burden": burden,
            "empirical_false_alarm_rate": false_alarm,
            "empirical_pre_failure_coverage": pre_failure,
            "trajectory_count": n,
        })
    return out


def build_test_table(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "threshold": r["threshold"],
            "test_missed_first_failure_rate": r["empirical_miss_rate"],
            "test_trajectory_burden": r["empirical_burden"],
        }
        for r in build_loss_table(rows)
    ]


def main() -> None:
    result_rows = []
    for scenario, config in SCENARIOS.items():
        for seed in SEEDS:
            cal = generate_trajectories(config, seed, "calibration")
            test = generate_trajectories(config, seed, "test")
            prev = estimate_first_failure_prevalence(cal)
            true_p = float(config["p"])
            cal_table = build_loss_table(cal)
            test_table = build_test_table(test)
            for alpha in ALPHAS:
                for beta in BETAS:
                    for delta in DELTAS:
                        p_lcb = clopper_pearson_lower_bound(prev["k_first_failure"], prev["n"], delta)
                        selected = feasibility_aware_select_policy(
                            cal_table,
                            alpha=alpha,
                            beta=beta,
                            delta=delta,
                            p_hat=prev["p_hat"],
                            p_lcb=p_lcb,
                            threshold_grid=THRESHOLDS,
                            test_table=test_table,
                        )
                        result_rows.append({
                            "scenario": scenario,
                            "seed": seed,
                            "alpha": alpha,
                            "beta": beta,
                            "delta": delta,
                            "true_p_F": true_p,
                            "p_hat_F": prev["p_hat"],
                            "p_lcb": p_lcb,
                            "structural_true_impossible": alpha + beta < true_p,
                            "empirical_structurally_infeasible": selected["empirical_structurally_infeasible"],
                            "certified_structurally_infeasible": selected["certified_structurally_infeasible"],
                            "no_safe": selected["no_safe"],
                            "no_safe_reason": selected["no_safe_reason"],
                            "selected_threshold": selected.get("selected_threshold"),
                            "selected_test_miss": selected.get("selected_test_miss"),
                            "selected_test_burden": selected.get("selected_test_burden"),
                            "joint_test_success": selected.get("selected_test_joint_success"),
                            "expected_behavior": config["expected"],
                            "shift_level": config["shift"],
                        })
    by_scenario = []
    for scenario in SCENARIOS:
        rows = [r for r in result_rows if r["scenario"] == scenario]
        selected = [r for r in rows if not r["no_safe"]]
        reasons = Counter(r["no_safe_reason"] for r in rows)
        by_scenario.append({
            "scenario": scenario,
            "rows": len(rows),
            "true_p_F": SCENARIOS[scenario]["p"],
            "selected_rate": len(selected) / len(rows),
            "certified_structural_no_safe_rate": sum(r["certified_structurally_infeasible"] for r in rows) / len(rows),
            "empirical_structural_no_safe_rate": sum(r["empirical_structurally_infeasible"] for r in rows) / len(rows),
            "joint_success_among_selected": (sum(bool(r["joint_test_success"]) for r in selected) / len(selected)) if selected else None,
            "top_no_safe_reason": reasons.most_common(1)[0][0] if reasons else "",
        })
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-17",
        "rows": len(result_rows),
        "scenario_count": len(SCENARIOS),
        "claim_boundary": claim_boundary(),
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "new_model_training": False},
        "scenario_summary": by_scenario,
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    write_csv(OUT_BY_SCENARIO, by_scenario)
    write_md(
        OUT_MD,
        "Batch T-17 Synthetic Theorem Demonstration",
        [
            "This synthetic theorem demonstration checks method behavior under known first-event feasibility regimes.",
            "It is not a performance benchmark, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
            f"- Rows: `{len(result_rows)}`",
            f"- Scenarios: `{len(SCENARIOS)}`",
            "The calibration-test shift scenario intentionally violates assumptions and is expected to degrade joint success.",
        ],
        by_scenario,
        ["scenario", "true_p_F", "selected_rate", "certified_structural_no_safe_rate", "joint_success_among_selected", "top_no_safe_reason"],
    )
    print({"rows": len(result_rows), "scenarios": len(SCENARIOS)})


if __name__ == "__main__":
    main()
