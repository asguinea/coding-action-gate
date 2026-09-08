#!/usr/bin/env python3
"""Batch T-12 synthetic sanity evaluation for feasibility-aware controller."""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from statistics import mean

from feasibility_aware_first_event_control import (
    clopper_pearson_lower_bound,
    estimate_first_failure_prevalence,
    feasibility_aware_select_policy,
)
from t11_feasibility_utils import ALPHAS, BETAS, REPORTS, write_csv, write_json

OUT_JSON = REPORTS / "batch_T12_feasibility_aware_synthetic.json"
OUT_MD = REPORTS / "batch_T12_feasibility_aware_synthetic.md"
OUT_CSV = REPORTS / "batch_T12_feasibility_aware_synthetic.csv"
DELTAS = [0.10, 0.05]

SCENARIOS = {
    "structurally_impossible_low_beta": {"p": 0.55, "quality": "easy", "n": 220, "truth": "structural"},
    "structurally_feasible_easy_scores": {"p": 0.25, "quality": "easy", "n": 260, "truth": "selected"},
    "structurally_feasible_weak_scores": {"p": 0.25, "quality": "weak", "n": 260, "truth": "score_limited"},
    "oracle_feasible_but_score_limited": {"p": 0.35, "quality": "weak", "n": 260, "truth": "score_limited"},
    "correction_blocked_small_calibration": {"p": 0.25, "quality": "easy", "n": 45, "truth": "correction"},
    "calibration_test_shift": {"p": 0.25, "test_p": 0.45, "quality": "easy", "n": 220, "truth": "shift"},
    "high_prevalence_high_burden_required": {"p": 0.65, "quality": "medium", "n": 260, "truth": "structural_or_high_burden"},
    "low_prevalence_easy_burden": {"p": 0.10, "quality": "easy", "n": 260, "truth": "selected"},
}


def _make_trajectories(n: int, p: float, quality: str, rng: random.Random):
    rows = []
    for i in range(n):
        bad = int(rng.random() < p)
        if quality == "easy":
            score = rng.gauss(0.82 if bad else 0.18, 0.10)
        elif quality == "medium":
            score = rng.gauss(0.68 if bad else 0.32, 0.18)
        else:
            score = rng.gauss(0.55 if bad else 0.45, 0.20)
        rows.append({"trajectory_has_first_failure": bad, "score": max(0.0, min(1.0, score))})
    return rows


def _table(rows: list[dict], thresholds: list[float]):
    bad_total = sum(r["trajectory_has_first_failure"] for r in rows)
    out = []
    for order, threshold in enumerate(thresholds):
        selected = [r for r in rows if r["score"] >= threshold]
        covered = sum(r["trajectory_has_first_failure"] for r in selected)
        out.append({
            "threshold": threshold,
            "threshold_order": order,
            "n_miss": bad_total,
            "n_burden": len(rows),
            "empirical_miss_rate": 1.0 - covered / bad_total if bad_total else 0.0,
            "empirical_burden": len(selected) / len(rows) if rows else 0.0,
            "empirical_false_alarm_rate": (len(selected) - covered) / (len(rows) - bad_total) if len(rows) > bad_total else 0.0,
            "empirical_pre_failure_coverage": covered / bad_total if bad_total else 0.0,
        })
    return out


def main() -> None:
    result_rows = []
    for sidx, (scenario, cfg) in enumerate(SCENARIOS.items()):
        rng = random.Random(12000 + sidx)
        cal = _make_trajectories(cfg["n"], cfg["p"], cfg["quality"], rng)
        test = _make_trajectories(300, cfg.get("test_p", cfg["p"]), cfg["quality"], rng)
        thresholds = [i / 20 for i in range(0, 21)]
        cal_table = _table(cal, thresholds)
        test_table = [
            {
                **row,
                "test_missed_first_failure_rate": row["empirical_miss_rate"],
                "test_trajectory_burden": row["empirical_burden"],
            }
            for row in _table(test, thresholds)
        ]
        prevalence = estimate_first_failure_prevalence(cal)
        p_lcb_cache = {delta: clopper_pearson_lower_bound(prevalence["k_first_failure"], prevalence["n"], delta) for delta in DELTAS}
        for alpha in ALPHAS:
            for beta in BETAS:
                for delta in DELTAS:
                    selected = feasibility_aware_select_policy(
                        cal_table,
                        alpha=alpha,
                        beta=beta,
                        delta=delta,
                        p_hat=prevalence["p_hat"],
                        p_lcb=p_lcb_cache[delta],
                        threshold_grid=thresholds,
                        test_table=test_table,
                    )
                    reason = selected["no_safe_reason"]
                    truth = cfg["truth"]
                    reason_correct = (
                        (truth == "structural" and reason == "structurally_infeasible_by_first_failure_prevalence")
                        or (truth == "score_limited" and reason in {"empirical_infeasible", "correction_blocked"})
                        or (truth == "correction" and reason in {"correction_blocked", "selected_corrected_feasible_policy"})
                        or (truth == "selected" and reason == "selected_corrected_feasible_policy")
                        or truth in {"shift", "structural_or_high_burden"}
                    )
                    result_rows.append({
                        "scenario": scenario,
                        "known_scenario_type": truth,
                        "alpha": alpha,
                        "beta": beta,
                        "delta": delta,
                        "true_p_F": cfg["p"],
                        "p_hat": prevalence["p_hat"],
                        "p_lcb": p_lcb_cache[delta],
                        "no_safe": selected["no_safe"],
                        "no_safe_reason": reason,
                        "empirical_structurally_infeasible": selected["empirical_structurally_infeasible"],
                        "certified_structurally_infeasible": selected["certified_structurally_infeasible"],
                        "selected_test_miss": selected.get("selected_test_miss"),
                        "selected_test_burden": selected.get("selected_test_burden"),
                        "selected_test_joint_success": selected.get("selected_test_joint_success"),
                        "reason_correct_given_synthetic_label": reason_correct,
                    })
    structural = [r for r in result_rows if r["known_scenario_type"] == "structural"]
    selected = [r for r in result_rows if not r["no_safe"]]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-12",
        "rows": len(result_rows),
        "certified_structural_no_safe_rate": sum(r["certified_structurally_infeasible"] for r in result_rows) / len(result_rows),
        "empirical_structural_no_safe_rate": sum(r["empirical_structurally_infeasible"] for r in result_rows) / len(result_rows),
        "selected_policy_rate": len(selected) / len(result_rows),
        "synthetic_reason_accuracy": sum(r["reason_correct_given_synthetic_label"] for r in result_rows) / len(result_rows),
        "structural_scenario_certified_rate": sum(r["certified_structurally_infeasible"] for r in structural) / len(structural) if structural else None,
        "claim_boundary": {"not_production_validation": True, "not_causal_prevention": True, "no_formal_conformal_guarantee_claimed": True, "offline_proxy": True},
        "guard_results": {"raw_text_used": False, "metadata_used_as_model_features": False, "test_tuning": False, "mock_data_used": False},
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-12 Feasibility-Aware Synthetic Evaluation",
        "",
        "This synthetic evaluation checks the feasibility-aware structural lower bound and corrected feasible set for first-event trajectory-level loss. It is a theory candidate offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Rows: `{len(result_rows)}`",
        f"- Certified structural no_safe rate: `{payload['certified_structural_no_safe_rate']:.4f}`",
        f"- Empirical structural no_safe rate: `{payload['empirical_structural_no_safe_rate']:.4f}`",
        f"- Selected policy rate: `{payload['selected_policy_rate']:.4f}`",
        f"- Synthetic reason accuracy: `{payload['synthetic_reason_accuracy']:.4f}`",
        "",
        "The LCB-based check is intentionally conservative relative to p_hat; this avoids overclaiming structural impossibility when calibration support is limited.",
    ]) + "\n")
    print(json.dumps({"rows": len(result_rows), "selected_rate": payload["selected_policy_rate"]}, indent=2))


if __name__ == "__main__":
    main()
