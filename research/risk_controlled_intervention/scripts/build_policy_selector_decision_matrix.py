#!/usr/bin/env python3
"""Generate Batch 9G canonical cost-aware policy selector decisions."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from cost_aware_policy_selector import select_intervention_policy  # noqa: E402
from policy_selector_evidence import build_evidence_bundle  # noqa: E402

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9g_policy_selector_decision_matrix.json"
REPORT_MD = REPORTS_DIR / "batch_9g_policy_selector_decision_matrix.md"


SCENARIOS: list[dict[str, Any]] = [
    {
        "scenario": "iid_row_budget_5pct",
        "objective": "row_budget",
        "target_name": "next_step_bad",
        "deployment_context": "iid_repeated",
        "constraints": {"max_row_deferral": 0.05},
        "calibration_support": {"support_status": "sufficient", "calibration_positive_rows": 300},
    },
    {
        "scenario": "iid_row_budget_10pct",
        "objective": "row_budget",
        "target_name": "next_step_bad",
        "deployment_context": "iid_repeated",
        "constraints": {"max_row_deferral": 0.10},
        "calibration_support": {"support_status": "sufficient", "calibration_positive_rows": 300},
    },
    {
        "scenario": "iid_trajectory_budget_25pct",
        "objective": "trajectory_budget",
        "target_name": "next_step_bad",
        "deployment_context": "iid_repeated",
        "constraints": {"max_trajectory_deferral": 0.25},
        "calibration_support": {"support_status": "sufficient", "calibration_positive_rows": 300},
    },
    {
        "scenario": "iid_strict_alpha_0_03",
        "objective": "strict_alpha",
        "target_name": "next_step_bad",
        "deployment_context": "iid_repeated",
        "constraints": {"target_alpha": 0.03},
        "calibration_support": {"support_status": "sufficient", "calibration_positive_rows": 300},
    },
    {
        "scenario": "iid_strict_alpha_0_02",
        "objective": "strict_alpha",
        "target_name": "next_step_bad",
        "deployment_context": "iid_repeated",
        "constraints": {"target_alpha": 0.02},
        "calibration_support": {"support_status": "sufficient", "calibration_positive_rows": 300},
    },
    {
        "scenario": "heldout_openhands_no_target_calibration",
        "objective": "heldout_shift",
        "target_name": "next_step_bad",
        "deployment_context": "openhands_stress",
        "constraints": {"minimum_bad_row_capture": 0.30, "max_trajectory_deferral": 0.50},
        "calibration_support": {"support_status": "unavailable", "target_domain_calibration_available": False},
    },
    {
        "scenario": "heldout_openhands_with_10_target_trajectories",
        "objective": "target_domain_adaptation",
        "target_name": "next_step_bad",
        "deployment_context": "openhands_stress",
        "constraints": {"allow_adaptation": True, "max_row_deferral": 0.05},
        "calibration_support": {
            "support_status": "sufficient",
            "target_domain_calibration_available": True,
            "target_domain_calibration_size": 10,
            "calibration_positive_rows": 39,
        },
    },
    {
        "scenario": "terminalbench_to_swe_shift",
        "objective": "heldout_shift",
        "target_name": "next_step_bad",
        "deployment_context": "terminalbench_to_swe_shift",
        "constraints": {"max_row_deferral": 0.05},
        "calibration_support": {"support_status": "sufficient", "target_domain_calibration_available": False},
    },
    {
        "scenario": "swe_to_terminalbench_shift",
        "objective": "heldout_shift",
        "target_name": "next_step_bad",
        "deployment_context": "swe_to_terminalbench_shift",
        "constraints": {"max_row_deferral": 0.05},
        "calibration_support": {"support_status": "sufficient", "target_domain_calibration_available": False},
    },
    {
        "scenario": "sparse_unuseful_target",
        "objective": "row_budget",
        "target_name": "next_step_unuseful",
        "deployment_context": "iid_repeated",
        "constraints": {"max_row_deferral": 0.05},
        "calibration_support": {"support_status": "sparse", "calibration_positive_rows": 10},
    },
]


def fmt(value: Any) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def generate_decision_matrix() -> dict[str, Any]:
    evidence = build_evidence_bundle()
    rows = []
    for scenario in SCENARIOS:
        selection = select_intervention_policy(
            scenario["objective"],
            scenario["target_name"],
            scenario["deployment_context"],
            scenario["constraints"],
            scenario["calibration_support"],
            evidence_bundle=evidence,
        )
        rows.append({**scenario, "selection": selection})
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived method selection; not production StepHarbor validation; not a production guarantee; not causal prevention",
        "scenarios": rows,
        "evidence_reports_used": evidence["reports_used"],
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9G Policy Selector Decision Matrix",
        "",
        "Benchmark-level cost-aware selector diagnostics on CodeTraceBench-derived trajectories. This is not production StepHarbor validation, not a production guarantee, and not causal prevention.",
        "",
        "| scenario | recommended policy | model | feature set | calibration rule | row deferral | trajectory deferral | bad-row capture | first-failure coverage | no safe recommendation |",
        "|---|---|---|---|---|---:|---:|---:|---:|---|",
    ]
    for row in report["scenarios"]:
        sel = row["selection"]
        tradeoff = sel.get("expected_tradeoff", {})
        lines.append(
            "| `{scenario}` | `{policy}` | `{model}` | `{feature}` | {rule} | `{row_def}` | `{traj_def}` | `{capture}` | `{ff}` | `{unsafe}` |".format(
                scenario=row["scenario"],
                policy=sel.get("recommended_policy_family"),
                model=sel.get("recommended_base_model"),
                feature=sel.get("recommended_feature_set"),
                rule=sel.get("thresholding_rule"),
                row_def=fmt(tradeoff.get("row_deferral") or tradeoff.get("row_deferral_rate")),
                traj_def=fmt(tradeoff.get("trajectory_deferral") or tradeoff.get("trajectory_level_deferral_rate")),
                capture=fmt(tradeoff.get("bad_row_capture") or tradeoff.get("target_positive_row_capture")),
                ff=fmt(tradeoff.get("first_failure_coverage")),
                unsafe=sel.get("no_safe_recommendation"),
            )
        )
    lines.extend([
        "",
        "## Warnings And Rationale",
        "",
    ])
    for row in report["scenarios"]:
        sel = row["selection"]
        lines.append(f"### {row['scenario']}")
        lines.append("")
        lines.append("Warnings:")
        for warning in sel.get("warnings", []):
            lines.append(f"- {warning}")
        lines.append("Rationale:")
        for rationale in sel.get("rationale", []):
            lines.append(f"- {rationale}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = generate_decision_matrix()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"scenarios": len(report["scenarios"]), "json": str(REPORT_JSON), "md": str(REPORT_MD)}, indent=2))


if __name__ == "__main__":
    main()
