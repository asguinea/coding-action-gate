#!/usr/bin/env python3
"""Write the Batch 9I dual-unit intervention formulation."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9i_dual_unit_formulation.json"
REPORT_MD = REPORTS_DIR / "batch_9i_dual_unit_formulation.md"


def formulation() -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; dual-unit row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "prediction_unit": "prefix row x_{i,t}, representing trajectory i up to step t",
        "control_unit": "pi(x_{i,t}) in {ALLOW, DEFER}",
        "risk_units": ["next_step_bad", "next_step_incorrect", "next_step_unuseful"],
        "trajectory_set": "I = {1,...,N} trajectories",
        "prefix_row_set": "R = {(i,t): t is an observed prefix decision row in trajectory i}",
        "risk_score": "s(x_{i,t}) is a prefix-safe structured risk score; higher means riskier",
        "row_level_quantities": {
            "row_deferral_rate": "sum 1[pi(x)=DEFER] / |R|",
            "bad_row_capture": "sum 1[pi(x)=DEFER and y=1] / sum 1[y=1]",
            "allowed_bad_rate": "sum 1[pi(x)=ALLOW and y=1] / sum 1[pi(x)=ALLOW]",
            "row_risk_loss": "allowed bad rows normalized by allowed rows or all rows depending on objective",
        },
        "trajectory_level_quantities": {
            "trajectory_burden": "sum_i 1[exists t: pi(x_{i,t})=DEFER] / N",
            "first_failure_coverage": "positive trajectories whose first bad row is deferred before or at that row, divided by trajectories with any bad row",
            "repeated_failure_coverage": "trajectories with repeated bad rows where a deferral occurs before or at the second bad row",
            "trajectory_interruption_loss": "1[trajectory i is touched by at least one deferral]",
        },
        "dual_unit_quantities": {
            "burden_inflation": "trajectory_burden / row_deferral_rate",
            "capture_per_touched_trajectory": "bad rows deferred / touched trajectories",
            "first_failure_per_touched_trajectory": "first failures covered / touched trajectories",
            "row_trajectory_tradeoff": "vector(row risk, row deferral, trajectory burden, first-failure coverage)",
        },
        "calibration_and_test_roles": {
            "calibration": "used only to select thresholds, policy family, and declared operating point",
            "test": "used only for final evaluation of the selected policy",
            "no_test_tuning": True,
        },
        "admissible_policy_classes": [
            "global_row_threshold",
            "trajectory_budgeted_first_crossing",
            "top_trajectory_first_crossing",
            "yield_optimized_top_k_rows",
            "first_failure_oriented_selection",
            "dual_budget_pareto_policy",
            "conservative_fallback",
            "no_safe_recommendation",
        ],
        "optimization_templates": [
            {
                "name": "max_capture_under_dual_budget",
                "objective": "maximize bad_row_capture",
                "constraints": ["row_deferral_rate <= rho", "trajectory_burden <= beta"],
            },
            {
                "name": "min_allowed_bad_under_trajectory_budget",
                "objective": "minimize allowed_bad_rate",
                "constraints": ["trajectory_burden <= beta"],
            },
            {
                "name": "max_first_failure_under_dual_budget",
                "objective": "maximize first_failure_coverage",
                "constraints": ["trajectory_burden <= beta", "row_deferral_rate <= rho"],
            },
            {
                "name": "calibration_pareto_point",
                "objective": "select non-dominated calibration point",
                "frontier_axes": ["bad_row_capture", "first_failure_coverage", "allowed_bad_rate", "row_deferral_rate", "trajectory_burden"],
            },
            {
                "name": "no_safe_recommendation",
                "triggers": [
                    "calibration support is insufficient",
                    "no calibration policy satisfies constraints",
                    "held-out shift is high and target-domain calibration unavailable",
                    "target is too sparse for the requested objective",
                ],
            },
        ],
        "guarantee_statement": "This batch implements calibration-based policy selection and empirical risk-control proxies only; no formal conformal guarantee is claimed.",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9I Dual-Unit Formulation",
        "",
        "Exploratory benchmark-level formulation on CodeTraceBench-derived trajectories. This is an offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "## Units",
        "",
        f"- Prediction unit: {report['prediction_unit']}",
        f"- Control unit: {report['control_unit']}",
        f"- Risk units: {', '.join(report['risk_units'])}",
        f"- Trajectory set: {report['trajectory_set']}",
        f"- Prefix-row set: {report['prefix_row_set']}",
        "",
        "## Row-Level Risk",
        "",
        *[f"- `{key}`: {value}" for key, value in report["row_level_quantities"].items()],
        "",
        "## Trajectory-Level Burden",
        "",
        *[f"- `{key}`: {value}" for key, value in report["trajectory_level_quantities"].items()],
        "",
        "## Dual-Unit Quantities",
        "",
        *[f"- `{key}`: {value}" for key, value in report["dual_unit_quantities"].items()],
        "",
        "## Calibration Data And Test Data",
        "",
        f"- Calibration: {report['calibration_and_test_roles']['calibration']}",
        f"- Test: {report['calibration_and_test_roles']['test']}",
        "- Test tuning: not allowed.",
        "",
        "## Optimization Templates",
        "",
    ]
    for template in report["optimization_templates"]:
        lines.append(f"### {template['name']}")
        if "objective" in template:
            lines.append(f"- Objective: {template['objective']}")
        if "constraints" in template:
            lines.extend(f"- Constraint: {item}" for item in template["constraints"])
        if "frontier_axes" in template:
            lines.append(f"- Frontier axes: {', '.join(template['frontier_axes'])}")
        if "triggers" in template:
            lines.extend(f"- Trigger: {item}" for item in template["triggers"])
        lines.append("")
    lines.extend([
        "## Claim Boundary",
        "",
        report["guarantee_statement"],
        "Domain shift and calibration support remain explicit caveats.",
    ])
    return "\n".join(lines)


def main() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report = formulation()
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"written": [str(REPORT_JSON), str(REPORT_MD)]}, indent=2))


if __name__ == "__main__":
    main()
