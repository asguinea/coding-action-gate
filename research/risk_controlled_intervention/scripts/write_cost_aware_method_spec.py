#!/usr/bin/env python3
"""Write Batch 9G cost-aware method specification reports."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from policy_selector_evidence import build_evidence_bundle  # noqa: E402

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
SPEC_JSON = REPORTS_DIR / "batch_9g_cost_aware_method_spec.json"
SPEC_MD = REPORTS_DIR / "batch_9g_cost_aware_method_spec.md"
MAIN_JSON = REPORTS_DIR / "batch_9g_recommended_main_method.json"
MAIN_MD = REPORTS_DIR / "batch_9g_recommended_main_method.md"


def method_spec(evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived method specification; not production StepHarbor validation; not a production guarantee; not causal prevention",
        "prediction_unit": "trajectory prefix up to step t",
        "control_unit": "ALLOW or DEFER decision before step t+1",
        "risk_unit": ["next_step_bad", "next_step_incorrect", "next_step_unuseful"],
        "row_cost": "fraction of prefix rows deferred",
        "trajectory_cost": "fraction of trajectories touched by at least one deferral",
        "timing_utility": ["first-failure coverage", "distance to first failure", "repeated-failure coverage"],
        "domain_condition": ["iid_repeated", "source_shift", "framework_shift", "openhands_stress", "target_domain_calibrated", "unknown_shift"],
        "calibration_support": "number of calibration rows, positive rows, trajectories, positive trajectories, and target-domain availability",
        "policy_selector": {
            "inputs": ["objective", "target_name", "deployment_context", "constraints", "calibration_support", "evidence_bundle"],
            "outputs": ["recommended policy family", "score model", "feature set", "thresholding rule", "expected tradeoff", "warnings", "fallback"],
        },
        "policy_families": {
            "global_row_threshold": "main benchmark reference for fixed row-level review budgets",
            "strict_alpha_threshold": "diagnostic when allowed-bad-rate target is primary; must report deferral cost",
            "trajectory_budgeted_first_crossing": "used when trajectory-level review burden is primary; may sacrifice capture",
            "dual_budget_threshold": "used when row and trajectory budgets are both explicit; can be infeasible",
            "group_specific_calibration": "threshold calibration by group when support exists; metadata is not a model feature",
            "target_domain_adaptation": "optional adaptation when labeled target-domain calibration examples are available",
            "conservative_fallback": "used for high shift or sparse support when evidence is insufficient",
            "no_safe_recommendation": "valid output when constraints are incompatible with evidence",
        },
        "fallback_behavior": [
            "return no_safe_recommendation when constraints are unsupported",
            "recommend collecting target-domain calibration data under high shift",
            "recommend relaxing capture or trajectory-burden constraints when infeasible",
            "use always-review only as a high-review fallback, not as a performance claim",
        ],
        "evidence_summary": {
            "best_iid_ranker": evidence.get("best_iid_ranker"),
            "best_high_capture_policy": evidence.get("best_high_capture_policy", {}),
            "best_lower_overfit_policy": evidence.get("best_lower_overfit_policy", {}),
            "row_vs_trajectory_burden_lesson": evidence.get("row_vs_trajectory_burden_lesson"),
            "target_domain_adaptation_role": evidence.get("target_domain_adaptation_role"),
        },
    }


def recommended_main_method(evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "recommended_report_facing_main_method": "learned structured risk score plus global row-thresholding under fixed row-budget evaluation",
        "recommended_default_score_model": "hist_gradient_boosting",
        "recommended_default_feature_set": "all_plus_interactions",
        "lower_overfitting_reference_model": "gradient_boosting::all_structured",
        "recommended_default_policy_family": "global_row_threshold",
        "thresholding_rule": "select threshold on calibration split for the fixed row-level deferral budget, then evaluate on held-out test rows and trajectories",
        "required_companion_metrics": [
            "row-level deferral rate",
            "target-positive row capture",
            "allowed target-positive rate",
            "trajectory-level deferral rate",
            "first-failure coverage",
            "repeated-failure coverage",
            "strict-alpha diagnostic cost",
            "held-out robustness",
        ],
        "required_caveats": [
            "benchmark-level CodeTraceBench-derived evidence only",
            "not production StepHarbor validation",
            "not a production guarantee",
            "not causal prevention",
            "row-level review budget is not trajectory-level burden",
            "OpenHands/framework shifts are stress cases",
            "next_step_unuseful is sparse and secondary",
        ],
        "baseline_policies": [
            "always_allow",
            "always_review",
            "logistic_regression::prefix_position_only",
            "logistic_regression::non_position_history_only",
            "long_prefix_heuristic where available",
        ],
        "diagnostic_or_appendix_policies": [
            "trajectory_budgeted_first_crossing",
            "dual_budget_threshold",
            "risk_spike",
            "group_specific_calibration",
            "target-specific incorrect/unuseful policies",
        ],
        "optional_deployment_extensions": [
            "target_domain_adaptation with labeled target-domain calibration trajectories",
            "group-specific thresholds when group calibration support is sufficient",
        ],
        "no_safe_recommendation_conditions": [
            "strict constraints under OpenHands/unknown shift without target-domain calibration",
            "required calibration support is sparse or unavailable",
            "requested trajectory burden and capture constraints are incompatible with prior evidence",
            "sparse unuseful target is requested as a primary risk-control target without sufficient positives",
        ],
        "evidence_pointers": {
            "batch_9a": "stronger structured risk ranking and feature ablations",
            "batch_9b": "target decomposition and sparse unuseful caveat",
            "batch_9c": "early-intervention and trajectory-level burden",
            "batch_9d": "cross-source held-out robustness",
            "batch_9e": "adaptive policies did not replace global row thresholding",
            "batch_9f": "target-domain calibration is optional adaptation, not pure held-out transfer",
        },
    }


def spec_markdown(spec: dict[str, Any]) -> str:
    lines = [
        "# Batch 9G Cost-Aware Method Specification",
        "",
        "This is a benchmark-level method specification for CodeTraceBench-derived trajectories. It is not production StepHarbor validation, not a production guarantee, and not causal prevention.",
        "",
        "## Units",
        "",
        f"- Prediction unit: {spec['prediction_unit']}",
        f"- Control unit: {spec['control_unit']}",
        f"- Risk unit: {', '.join(spec['risk_unit'])}",
        f"- Row cost: {spec['row_cost']}",
        f"- Trajectory cost: {spec['trajectory_cost']}",
        f"- Timing utility: {', '.join(spec['timing_utility'])}",
        "",
        "## Policy Selector",
        "",
        "The selector maps objective, target, deployment context, constraints, calibration support, domain shift condition, and empirical evidence to a policy family, thresholding rule, expected tradeoff, warnings, and fallback.",
        "",
        "## Why row-level risk control is insufficient by itself",
        "",
        "A fixed row-level deferral budget can touch a much larger fraction of trajectories. The method therefore requires trajectory-level burden and first-failure coverage alongside row-level risk and capture metrics.",
        "",
        "## Why this is not a production guarantee",
        "",
        "The evidence is benchmark-level and CodeTraceBench-derived. It does not validate production StepHarbor behavior, does not establish production statistical guarantees, and does not establish validity under arbitrary distribution shift.",
        "",
        "## How this differs from process-level trajectory diagnosis",
        "",
        "The method makes prefix-level ALLOW/DEFER decisions before the next step. It is not a post-hoc whole-trajectory diagnosis system and does not use future trajectory content.",
        "",
        "## How this differs from generic agentic conformal/risk control",
        "",
        "The method is cost-aware and trajectory-aware: it reports row cost, trajectory cost, timing utility, calibration support, and domain condition. It does not claim a general conformal guarantee.",
        "",
        "## Policy Families",
        "",
    ]
    for name, desc in spec["policy_families"].items():
        lines.append(f"- `{name}`: {desc}")
    return "\n".join(lines)


def main_markdown(method: dict[str, Any]) -> str:
    lines = [
        "# Batch 9G Recommended Main Method",
        "",
        "Candidate method summary only; not final report prose.",
        "",
        f"- Main method: {method['recommended_report_facing_main_method']}",
        f"- Default score model: `{method['recommended_default_score_model']}::{method['recommended_default_feature_set']}`",
        f"- Lower-overfitting reference: `{method['lower_overfitting_reference_model']}`",
        f"- Default policy family: `{method['recommended_default_policy_family']}`",
        f"- Thresholding rule: {method['thresholding_rule']}",
        "",
        "## Required Companion Metrics",
        "",
    ]
    for item in method["required_companion_metrics"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Required Caveats", ""])
    for item in method["required_caveats"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Baselines", ""])
    for item in method["baseline_policies"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Diagnostic / Appendix Policies", ""])
    for item in method["diagnostic_or_appendix_policies"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Optional Deployment Extensions", ""])
    for item in method["optional_deployment_extensions"]:
        lines.append(f"- {item}")
    lines.extend(["", "## No-Safe-Recommendation Conditions", ""])
    for item in method["no_safe_recommendation_conditions"]:
        lines.append(f"- {item}")
    return "\n".join(lines)


def write_reports() -> dict[str, Any]:
    evidence = build_evidence_bundle()
    spec = method_spec(evidence)
    method = recommended_main_method(evidence)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SPEC_JSON.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n")
    SPEC_MD.write_text(spec_markdown(spec) + "\n")
    MAIN_JSON.write_text(json.dumps(method, indent=2, sort_keys=True) + "\n")
    MAIN_MD.write_text(main_markdown(method) + "\n")
    return {"spec_json": str(SPEC_JSON), "spec_md": str(SPEC_MD), "main_json": str(MAIN_JSON), "main_md": str(MAIN_MD)}


def main() -> None:
    print(json.dumps(write_reports(), indent=2))


if __name__ == "__main__":
    main()
