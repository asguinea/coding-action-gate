#!/usr/bin/env python3
"""Transparent cost-aware intervention policy selector for Batch 9G."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from policy_selector_evidence import build_evidence_bundle, metric  # noqa: E402

VALID_OBJECTIVES = {
    "row_budget",
    "trajectory_budget",
    "strict_alpha",
    "early_warning",
    "heldout_shift",
    "target_domain_adaptation",
    "balanced_default",
}

VALID_TARGETS = {"next_step_bad", "next_step_incorrect", "next_step_unuseful"}

METADATA_FEATURE_WARNING = "Source/layout/parser metadata may be used for grouping or calibration only, never as model features."


def _constraints(constraints: dict[str, Any] | None) -> dict[str, Any]:
    return constraints or {}


def _support(calibration_support: dict[str, Any] | None) -> dict[str, Any]:
    return calibration_support or {"support_status": "unknown"}


def _mean(metrics: dict[str, Any] | None, key: str) -> float | None:
    return metric(metrics or {}, key)


def _policy_from_evidence(evidence: dict[str, Any], stable: bool = False, history: bool = False, incorrect: bool = False) -> tuple[str, str, str]:
    if incorrect:
        p = evidence.get("best_incorrect_specific_policy", {})
    elif history:
        p = evidence.get("best_non_position_history_policy", {})
    elif stable:
        p = evidence.get("best_lower_overfit_policy", {})
    else:
        p = evidence.get("best_high_capture_policy", {})
    return p.get("policy", "next_step_bad::gradient_boosting::all_structured"), p.get("model", "gradient_boosting"), p.get("feature_set", "all_structured")


def _tradeoff_from_iid(evidence: dict[str, Any], budget: float = 0.05) -> dict[str, Any]:
    key = f"hgb_{budget:.2f}"
    key = key.replace("0.10", "0.10").replace("0.05", "0.05").replace("0.20", "0.20")
    return evidence.get("iid_fixed_budget", {}).get(key) or evidence.get("iid_fixed_budget", {}).get("hgb_0.05", {})


def _support_is_sufficient(support: dict[str, Any], target_name: str) -> bool:
    status = support.get("support_status", "unknown")
    positives = support.get("calibration_positive_rows")
    trajectories = support.get("calibration_positive_trajectories")
    if status == "sufficient":
        return True
    if status in {"sparse", "unavailable"}:
        return False
    if positives is None:
        return target_name != "next_step_unuseful"
    min_pos = 5 if target_name == "next_step_unuseful" else 20
    return positives >= min_pos and (trajectories is None or trajectories >= 3)


def _base_result() -> dict[str, Any]:
    return {
        "recommended_policy_family": None,
        "recommended_base_model": None,
        "recommended_feature_set": None,
        "thresholding_rule": None,
        "calibration_mode": None,
        "expected_tradeoff": {},
        "warnings": [METADATA_FEATURE_WARNING],
        "fallback_policy": None,
        "no_safe_recommendation": False,
        "rationale": [],
    }


def _apply_constraint_checks(result: dict[str, Any], constraints: dict[str, Any]) -> dict[str, Any]:
    tradeoff = result.get("expected_tradeoff", {})
    capture = tradeoff.get("bad_row_capture")
    trajectory_deferral = tradeoff.get("trajectory_deferral")
    if constraints.get("minimum_bad_row_capture") is not None and capture is not None and capture < constraints["minimum_bad_row_capture"]:
        result["warnings"].append("Expected bad-row capture is below the requested minimum.")
        result["no_safe_recommendation"] = True
        result["fallback_policy"] = "conservative_fallback"
        result["rationale"].append("Requested capture constraint is not supported by prior evidence.")
    if constraints.get("max_trajectory_deferral") is not None and trajectory_deferral is not None and trajectory_deferral > constraints["max_trajectory_deferral"]:
        result["warnings"].append("Expected trajectory-level burden exceeds the requested maximum.")
        if constraints.get("require_calibration_support", False):
            result["no_safe_recommendation"] = True
            result["fallback_policy"] = "no_safe_recommendation"
    return result


def select_intervention_policy(
    objective: str,
    target_name: str,
    deployment_context: str,
    constraints: dict[str, Any] | None,
    calibration_support: dict[str, Any] | None,
    preferred_model_family: str | None = None,
    evidence_bundle: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Select an intervention policy family from empirical Batch 9 evidence."""
    if objective not in VALID_OBJECTIVES:
        raise ValueError(f"unknown objective: {objective}")
    if target_name not in VALID_TARGETS:
        raise ValueError(f"unknown target: {target_name}")
    evidence = evidence_bundle or build_evidence_bundle()
    constraints = _constraints(constraints)
    support = _support(calibration_support)
    result = _base_result()
    base_risk = evidence.get("base_risk", 0.052)

    if target_name == "next_step_unuseful":
        result["warnings"].append("next_step_unuseful is sparse and should be treated as secondary/diagnostic evidence.")
        result["warnings"].append("Strict-alpha values above the unuseful base rate are often uninformative.")
        if support.get("support_status") != "sufficient":
            result["rationale"].append("Sparse unuseful support limits policy strength.")

    if constraints.get("require_calibration_support") and not _support_is_sufficient(support, target_name):
        result.update({
            "recommended_policy_family": "conservative_fallback",
            "thresholding_rule": "collect_more_calibration_or_use_higher_review",
            "calibration_mode": "insufficient_calibration_support",
            "fallback_policy": "no_safe_recommendation",
            "no_safe_recommendation": True,
        })
        result["warnings"].append("Calibration support is insufficient for the requested constraints.")
        result["rationale"].append("The selector fails closed when calibration support is required but sparse or unavailable.")
        return result

    if objective in {"row_budget", "balanced_default"} and deployment_context == "iid_repeated":
        policy, model, feature_set = _policy_from_evidence(evidence, stable=preferred_model_family == "lower_overfit")
        row_budget = float(constraints.get("max_row_deferral", 0.05))
        tradeoff = _tradeoff_from_iid(evidence, row_budget)
        if target_name == "next_step_unuseful":
            tradeoff = {
                "target_prevalence": evidence.get("target_prevalence", {}).get("prevalence", {}).get("next_step_unuseful"),
                "row_deferral": row_budget,
                "trajectory_deferral": None,
                "bad_row_capture": None,
                "first_failure_coverage": None,
            }
        result.update({
            "recommended_policy_family": "global_row_threshold",
            "recommended_base_model": model,
            "recommended_feature_set": feature_set,
            "thresholding_rule": f"select threshold on calibration to defer approximately top {row_budget:.0%} highest-risk rows",
            "calibration_mode": "iid_calibration",
            "expected_tradeoff": tradeoff,
            "fallback_policy": "logistic_regression::non_position_history_only",
        })
        result["warnings"].append("Report trajectory-level burden alongside row-level deferral; row budget is not total review burden.")
        result["rationale"].append("Global row-thresholding remains the clean benchmark reference for fixed row budgets.")
        return _apply_constraint_checks(result, constraints)

    if objective in {"trajectory_budget", "early_warning"}:
        policy, model, feature_set = _policy_from_evidence(evidence, stable=True)
        q = float(constraints.get("max_trajectory_deferral", 0.25))
        result.update({
            "recommended_policy_family": "trajectory_budgeted_first_crossing",
            "recommended_base_model": model,
            "recommended_feature_set": feature_set,
            "thresholding_rule": f"select first-crossing threshold on calibration subject to trajectory deferral <= {q:.0%}",
            "calibration_mode": "trajectory_budget_calibration",
            "expected_tradeoff": {"trajectory_deferral": q, "bad_row_capture": None, "first_failure_coverage": None},
            "fallback_policy": "global_row_threshold_with_trajectory_burden_warning",
        })
        result["warnings"].append("Trajectory-budgeted policies can reduce touched trajectories but may lose bad-row capture and first-failure coverage.")
        result["rationale"].append("Use this when trajectory-level review burden is the primary operational cost.")
        if constraints.get("minimum_bad_row_capture", 0) and constraints["minimum_bad_row_capture"] > 0.10:
            result["no_safe_recommendation"] = True
            result["fallback_policy"] = "no_safe_recommendation"
            result["warnings"].append("Prior trajectory-budget evidence does not support a strong minimum capture guarantee.")
        return result

    if objective == "strict_alpha":
        policy, model, feature_set = _policy_from_evidence(evidence, stable=True)
        alpha = float(constraints.get("target_alpha", 0.03))
        result.update({
            "recommended_policy_family": "strict_alpha_threshold",
            "recommended_base_model": model,
            "recommended_feature_set": feature_set,
            "thresholding_rule": f"select least-deferring calibration threshold with allowed_bad_rate <= {alpha:.3f}",
            "calibration_mode": "calibration_only_threshold_selection",
            "expected_tradeoff": {"base_risk": base_risk, "target_alpha": alpha},
            "fallback_policy": "global_row_threshold_for_risk_cost_diagnostic",
        })
        if alpha >= base_risk:
            result["warnings"].append("Target alpha is near or above calibration base risk; allow-all may satisfy the constraint and is not meaningful intervention.")
        elif alpha < 0.5 * base_risk:
            result["warnings"].append("Target alpha is far below base risk; heavy deferral is expected.")
        result["rationale"].append("Strict alpha is useful as a diagnostic only when interpreted with deferral cost.")
        return result

    if objective == "heldout_shift" or (objective != "target_domain_adaptation" and deployment_context in {"source_shift", "framework_shift", "openhands_stress", "unknown_shift"}):
        target_available = bool(support.get("target_domain_calibration_available"))
        if deployment_context in {"openhands_stress", "unknown_shift"} and not target_available:
            result.update({
                "recommended_policy_family": "conservative_fallback",
                "recommended_base_model": "gradient_boosting",
                "recommended_feature_set": "all_structured",
                "thresholding_rule": "do not estimate target-domain thresholds without target-domain calibration; use source-calibrated threshold only as diagnostic",
                "calibration_mode": "pure_heldout_transfer",
                "expected_tradeoff": evidence.get("heldout_shift", {}).get("non_openhands_to_openhands", {}).get("gb_0.05", {}),
                "fallback_policy": "collect_target_domain_calibration_or_raise_review_budget",
            })
            result["warnings"].append("OpenHands/unknown shift showed weak transfer and high trajectory-level burden without target-domain calibration.")
            result["rationale"].append("Pure held-out transfer cannot use target-domain examples for threshold selection.")
            if constraints.get("minimum_bad_row_capture") or constraints.get("max_trajectory_deferral"):
                result["no_safe_recommendation"] = True
                result["fallback_policy"] = "no_safe_recommendation"
            return result
        policy, model, feature_set = _policy_from_evidence(evidence, history=deployment_context in {"source_shift", "swe_to_terminalbench_shift"})
        scenario_key = {
            "swe_to_terminalbench_shift": "swe_like_to_terminalbench_like",
            "terminalbench_to_swe_shift": "terminalbench_like_to_swe_like",
            "source_shift": "swe_like_to_terminalbench_like",
        }.get(deployment_context, "swe_like_to_terminalbench_like")
        if model == "logistic_regression":
            metric_key = "logistic_history_0.05"
        elif model == "hist_gradient_boosting":
            metric_key = "hgb_0.05"
        else:
            metric_key = "gb_0.05"
        result.update({
            "recommended_policy_family": "global_row_threshold",
            "recommended_base_model": model,
            "recommended_feature_set": feature_set,
            "thresholding_rule": "source-domain calibration threshold; report held-out degradation and trajectory burden",
            "calibration_mode": "pure_heldout_transfer",
            "expected_tradeoff": evidence.get("heldout_shift", {}).get(scenario_key, {}).get(metric_key, {}),
            "fallback_policy": "conservative_fallback",
        })
        result["warnings"].append("Held-out transfer is benchmark evidence only; threshold transfer can degrade under source/framework shift.")
        result["rationale"].append("Use pure held-out evidence when target-domain calibration is unavailable.")
        return _apply_constraint_checks(result, constraints)

    if objective == "target_domain_adaptation":
        if not support.get("target_domain_calibration_available") or not constraints.get("allow_adaptation", False):
            result.update({
                "recommended_policy_family": "conservative_fallback",
                "thresholding_rule": "target-domain calibration unavailable or adaptation not allowed",
                "calibration_mode": "no_target_domain_adaptation",
                "fallback_policy": "pure_heldout_transfer_with_warning",
                "no_safe_recommendation": True,
            })
            result["warnings"].append("Target-domain adaptation requires labeled target-domain calibration examples.")
            return result
        policy, model, feature_set = _policy_from_evidence(evidence, stable=True)
        result.update({
            "recommended_policy_family": "target_domain_adaptation",
            "recommended_base_model": model,
            "recommended_feature_set": feature_set,
            "thresholding_rule": "select thresholds on a small labeled target-domain calibration subset and evaluate on disjoint target-domain test trajectories",
            "calibration_mode": "target_domain_calibration",
            "expected_tradeoff": evidence.get("target_domain_adaptation", {}).get("non_openhands_to_openhands_gb_10", {}),
            "fallback_policy": "global_row_threshold_pure_heldout_reference",
        })
        result["warnings"].append("Adaptation is not pure held-out generalization.")
        result["warnings"].append("Batch 9F found target-domain calibration can reduce trajectory burden while sacrificing capture or first-failure coverage.")
        result["rationale"].append("Use adaptation only when labeled target-domain calibration support exists and is trajectory-disjoint from evaluation.")
        return _apply_constraint_checks(result, constraints)

    result.update({
        "recommended_policy_family": "no_safe_recommendation",
        "thresholding_rule": "constraints or context are unsupported by current evidence",
        "calibration_mode": "unsupported",
        "fallback_policy": "collect_more_calibration_or_relax_constraints",
        "no_safe_recommendation": True,
    })
    result["warnings"].append("No current Batch 9 evidence supports this policy request.")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Select a cost-aware intervention policy from Batch 9 evidence.")
    parser.add_argument("--objective", default="row_budget")
    parser.add_argument("--target-name", default="next_step_bad")
    parser.add_argument("--deployment-context", default="iid_repeated")
    parser.add_argument("--max-row-deferral", type=float)
    parser.add_argument("--max-trajectory-deferral", type=float)
    parser.add_argument("--target-alpha", type=float)
    parser.add_argument("--minimum-bad-row-capture", type=float)
    parser.add_argument("--allow-adaptation", action="store_true")
    parser.add_argument("--target-domain-calibration-available", action="store_true")
    parser.add_argument("--support-status", default="unknown")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    constraints = {
        key: value for key, value in {
            "max_row_deferral": args.max_row_deferral,
            "max_trajectory_deferral": args.max_trajectory_deferral,
            "target_alpha": args.target_alpha,
            "minimum_bad_row_capture": args.minimum_bad_row_capture,
            "allow_adaptation": args.allow_adaptation,
        }.items() if value is not None
    }
    support = {
        "support_status": args.support_status,
        "target_domain_calibration_available": args.target_domain_calibration_available,
    }
    print(json.dumps(select_intervention_policy(args.objective, args.target_name, args.deployment_context, constraints, support), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
