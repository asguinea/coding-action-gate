#!/usr/bin/env python3
"""Build a compact Batch 9G evidence bundle from prior Batch 9 reports."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"

REQUIRED_REPORTS = {
    "batch_9a": REPORTS_DIR / "batch_9a_stronger_models_ablations.json",
    "batch_9b": REPORTS_DIR / "batch_9b_label_target_ablations.json",
    "batch_9c": REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.json",
    "batch_9c5": REPORTS_DIR / "batch_9c5_no_skipped_config_repair.json",
    "batch_9d": REPORTS_DIR / "batch_9d_cross_source_heldout_robustness.json",
    "batch_9e": REPORTS_DIR / "batch_9e_adaptive_trajectory_policies.json",
    "batch_9f": REPORTS_DIR / "batch_9f_target_domain_adaptation.json",
}

OPTIONAL_REPORTS = {
    "batch_9e_method": REPORTS_DIR / "batch_9e_recommended_intervention_method.json",
    "batch_9f_method": REPORTS_DIR / "batch_9f_recommended_method_update.json",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def require_reports(required: dict[str, Path] | None = None) -> None:
    missing = [str(path) for path in (required or REQUIRED_REPORTS).values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required Batch 9G evidence reports: " + ", ".join(missing))


def stat_mean(value: Any) -> float | None:
    if isinstance(value, dict) and "mean" in value:
        return value["mean"]
    if isinstance(value, (int, float)):
        return float(value)
    return None


def metric(metrics: dict[str, Any], name: str) -> float | None:
    return stat_mean(metrics.get(name))


def split_model_feature(config: str) -> tuple[str, str]:
    parts = config.split("::")
    if len(parts) >= 3:
        return parts[-2], parts[-1]
    if len(parts) == 2:
        return parts[0], parts[1]
    return config, "unknown"


def top_config(metrics: dict[str, Any], metric_name: str, prefix: str | None = None) -> dict[str, Any]:
    best_key = None
    best_value = None
    for key, values in metrics.items():
        if prefix and not key.startswith(prefix):
            continue
        value = metric(values, metric_name)
        if value is None:
            continue
        if best_value is None or value > best_value:
            best_key, best_value = key, value
    model, feature_set = split_model_feature(best_key or "unknown::unknown")
    return {"config": best_key, "model": model, "feature_set": feature_set, metric_name: best_value}


def fixed_budget_metrics(batch9c: dict[str, Any], policy: str, budget: float, target: str = "next_step_bad") -> dict[str, Any]:
    key = f"{policy}::fixed_budget::{budget}::{target}"
    values = batch9c.get("aggregate_policy_metrics", {}).get(key, {})
    return {
        "key": key,
        "row_deferral": metric(values, "row_level_deferral_rate"),
        "trajectory_deferral": metric(values, "trajectory_level_deferral_rate"),
        "bad_row_capture": metric(values, "row_level_target_positive_capture"),
        "allowed_bad_rate": metric(values, "row_level_allowed_target_positive_rate"),
        "first_failure_coverage": metric(values, "first_failure_coverage"),
        "repeated_failure_coverage": metric(values, "repeated_failure_coverage"),
    }


def heldout_metrics(batch9d: dict[str, Any], scenario: str, policy: str, budget: float = 0.05) -> dict[str, Any]:
    key = f"{scenario}::next_step_bad::{policy}::fixed_budget::{budget}"
    values = batch9d.get("aggregate_metrics", {}).get(key, {})
    return {
        "key": key,
        "auroc": metric(values, "test_auroc"),
        "average_precision": metric(values, "test_average_precision"),
        "ap_lift": metric(values, "test_ap_lift_ratio"),
        "row_deferral": metric(values, "test_deferral_rate"),
        "trajectory_deferral": metric(values, "trajectory_level_deferral_rate"),
        "bad_row_capture": metric(values, "test_capture"),
        "allowed_bad_rate": metric(values, "test_allowed_target_positive_rate"),
        "first_failure_coverage": metric(values, "first_failure_coverage"),
        "prevalence_gap": metric(values, "calibration_test_prevalence_gap"),
        "allowed_rate_gap": metric(values, "calibration_test_allowed_rate_gap"),
    }


def adaptation_metrics(batch9f: dict[str, Any], scenario: str, policy: str, mode: str = "target_domain_adaptation", size: str = "10") -> dict[str, Any]:
    key = f"{mode}::{scenario}::next_step_bad::{policy}::global_row_threshold::row_budget::0.05::{size}"
    values = batch9f.get("aggregate_metrics", {}).get(key, {})
    return {
        "key": key,
        "target_calibration_trajectories": metric(values, "target_calibration_trajectories"),
        "target_calibration_positive_rows": metric(values, "target_calibration_positive_rows"),
        "target_test_positive_rows": metric(values, "target_test_positive_rows"),
        "row_deferral": metric(values, "row_deferral_rate"),
        "trajectory_deferral": metric(values, "trajectory_level_deferral_rate"),
        "bad_row_capture": metric(values, "target_positive_row_capture"),
        "allowed_bad_rate": metric(values, "allowed_target_positive_rate"),
        "first_failure_coverage": metric(values, "first_failure_coverage"),
    }


def build_evidence_bundle(reports_dir: Path = REPORTS_DIR) -> dict[str, Any]:
    required = {name: reports_dir / path.name for name, path in REQUIRED_REPORTS.items()}
    optional = {name: reports_dir / path.name for name, path in OPTIONAL_REPORTS.items()}
    require_reports(required)
    reports = {name: read_json(path) for name, path in required.items()}
    optional_reports = {name: read_json(path) for name, path in optional.items() if path.exists()}

    batch9a = reports["batch_9a"]
    batch9b = reports["batch_9b"]
    batch9c = reports["batch_9c"]
    batch9d = reports["batch_9d"]
    batch9f = reports["batch_9f"]

    hgb_policy = "next_step_bad::hist_gradient_boosting::all_plus_interactions"
    gb_policy = "next_step_bad::gradient_boosting::all_structured"
    logistic_history_policy = "next_step_bad::logistic_regression::non_position_history_only"
    incorrect_policy = "next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position"

    evidence = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "reports_used": {name: str(path) for name, path in required.items()},
        "optional_reports_used": {name: str(optional[name]) for name in optional_reports},
        "schema_version": "Prefix Extraction Schema v0.4",
        "claim_boundary": "benchmark-level CodeTraceBench-derived evidence only; not production CodingActionGate validation; not a production guarantee; not causal prevention",
        "target_prevalence": batch9b.get("target_prevalence_and_overlap", {}),
        "base_risk": metric(batch9a.get("aggregate_metrics", {}).get("gradient_boosting::all_structured", {}), "calibration_base_risk") or 0.052,
        "best_iid_ranker": top_config(batch9a.get("aggregate_metrics", {}), "test_average_precision"),
        "best_lower_overfit_policy": {
            "policy": gb_policy,
            "model": "gradient_boosting",
            "feature_set": "all_structured",
            "metrics": batch9a.get("aggregate_metrics", {}).get("gradient_boosting::all_structured", {}),
        },
        "best_high_capture_policy": {
            "policy": hgb_policy,
            "model": "hist_gradient_boosting",
            "feature_set": "all_plus_interactions",
            "metrics": batch9a.get("aggregate_metrics", {}).get("hist_gradient_boosting::all_plus_interactions", {}),
        },
        "best_non_position_history_policy": {
            "policy": logistic_history_policy,
            "model": "logistic_regression",
            "feature_set": "non_position_history_only",
            "metrics": batch9a.get("aggregate_metrics", {}).get("logistic_regression::non_position_history_only", {}),
        },
        "best_incorrect_specific_policy": {
            "policy": incorrect_policy,
            "model": "hist_gradient_boosting",
            "feature_set": "all_minus_prefix_position",
            "metrics": batch9b.get("aggregate_metrics", {}).get(incorrect_policy, {}),
        },
        "iid_fixed_budget": {
            "hgb_0.05": fixed_budget_metrics(batch9c, hgb_policy, 0.05),
            "hgb_0.10": fixed_budget_metrics(batch9c, hgb_policy, 0.1),
            "hgb_0.20": fixed_budget_metrics(batch9c, hgb_policy, 0.2),
            "gb_0.05": fixed_budget_metrics(batch9c, gb_policy, 0.05),
            "logistic_history_0.05": fixed_budget_metrics(batch9c, logistic_history_policy, 0.05),
        },
        "heldout_shift": {
            "non_openhands_to_openhands": {
                "gb_0.05": heldout_metrics(batch9d, "non_openhands_to_openhands", gb_policy, 0.05),
                "hgb_0.05": heldout_metrics(batch9d, "non_openhands_to_openhands", hgb_policy, 0.05),
                "logistic_history_0.05": heldout_metrics(batch9d, "non_openhands_to_openhands", logistic_history_policy, 0.05),
            },
            "openhands_to_non_openhands": {
                "gb_0.05": heldout_metrics(batch9d, "openhands_to_non_openhands", gb_policy, 0.05),
                "hgb_0.05": heldout_metrics(batch9d, "openhands_to_non_openhands", hgb_policy, 0.05),
                "logistic_history_0.05": heldout_metrics(batch9d, "openhands_to_non_openhands", logistic_history_policy, 0.05),
            },
            "swe_like_to_terminalbench_like": {
                "gb_0.05": heldout_metrics(batch9d, "swe_like_to_terminalbench_like", gb_policy, 0.05),
                "logistic_history_0.05": heldout_metrics(batch9d, "swe_like_to_terminalbench_like", logistic_history_policy, 0.05),
            },
            "terminalbench_like_to_swe_like": {
                "gb_0.05": heldout_metrics(batch9d, "terminalbench_like_to_swe_like", gb_policy, 0.05),
                "hgb_0.05": heldout_metrics(batch9d, "terminalbench_like_to_swe_like", hgb_policy, 0.05),
            },
        },
        "target_domain_adaptation": {
            "non_openhands_to_openhands_gb_10": adaptation_metrics(batch9f, "non_openhands_to_openhands", gb_policy, "target_domain_adaptation", "10"),
            "non_openhands_to_openhands_hgb_10": adaptation_metrics(batch9f, "non_openhands_to_openhands", hgb_policy, "target_domain_adaptation", "10"),
            "openhands_to_non_openhands_gb_10": adaptation_metrics(batch9f, "openhands_to_non_openhands", gb_policy, "target_domain_adaptation", "10"),
        },
        "row_vs_trajectory_burden_lesson": "fixed row budgets can touch a much larger fraction of trajectories; report both costs",
        "policies_that_failed_to_dominate": [
            "trajectory_budgeted_first_crossing",
            "dual_budget_threshold",
            "risk_spike",
            "group_specific_thresholds without target-domain support",
        ],
        "global_row_threshold_remains_reference": optional_reports.get("batch_9e_method", {}).get("adaptive_policy_replaces_global_row_threshold") is False,
        "target_domain_adaptation_role": optional_reports.get("batch_9f_method", {}).get("target_domain_calibration_role", "optional_deployment_adaptation"),
    }
    return evidence


def main() -> None:
    print(json.dumps(build_evidence_bundle(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
