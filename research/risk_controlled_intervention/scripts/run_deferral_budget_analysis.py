#!/usr/bin/env python3
"""Fixed deferral-budget risk-cost diagnostics for saved Batch 7 scores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import risk_diagnostic_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "deferral_budget_analysis.json"
REPORT_MD = utils.REPORTS_DIR / "deferral_budget_analysis.md"
BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50)


def run_budget_analysis(rows: list[dict[str, Any]], budgets: tuple[float, ...] = BUDGETS) -> dict[str, Any]:
    validation = utils.validate_score_rows(rows)
    if validation["error_count"] or validation["raw_text_key_hit_count"] or not validation["schema_ok"]:
        raise SystemExit(f"ERROR: invalid score rows: {json.dumps(validation, indent=2)}")
    grouped = utils.group_by_baseline(rows)
    results = []
    for baseline, by_split in sorted(grouped.items()):
        calibration_rows = by_split.get("calibration", [])
        test_rows = by_split.get("test", [])
        if not calibration_rows or not test_rows:
            continue
        cal_scores, _cal_labels, _ = utils.rows_to_scores_labels(calibration_rows)
        split_base = {"calibration": utils.base_risk(calibration_rows), "test": utils.base_risk(test_rows)}
        for budget in budgets:
            if baseline == "always_allow":
                tau = max(cal_scores) + 1e-12
                selection = {"selected_on": "policy_definition", "fixed_policy": "always_allow", "requested_deferral_budget": budget}
            elif baseline == "always_review":
                tau = min(cal_scores) - 1e-12
                selection = {"selected_on": "policy_definition", "fixed_policy": "always_review", "requested_deferral_budget": budget}
            else:
                tau = utils.threshold_for_deferral_budget(cal_scores, budget)
                selection = {"selected_on": "calibration_score_quantile", "requested_deferral_budget": budget, "tau": tau}
            for split, split_rows in (("calibration", calibration_rows), ("test", test_rows)):
                metrics = utils.evaluate_rows(split_rows, tau, include_ci=False)
                utils.add_reduction_metrics(metrics, split_base[split])
                results.append(
                    {
                        "baseline_name": baseline,
                        "requested_deferral_budget": budget,
                        "split": split,
                        "selection": selection if split == "calibration" else {"tau_selected_on": "calibration"},
                        "split_base_risk": split_base[split],
                        **metrics,
                    }
                )
    return {
        "schema_version": "risk-controlled-intervention-deferral-budget.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8.5 fixed-budget diagnostic only; not conformal or production risk control.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "deferral_budgets": list(budgets),
        "score_validation": validation,
        "budget_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Deferral Budget Analysis",
        "",
        "Thresholds defer approximately the top score fraction on calibration. This is a diagnostic, not calibrated risk control.",
        "",
        "| baseline | budget | split | actual deferral | allowed bad | bad deferred | rel risk reduction |",
        "|---|---:|---|---:|---:|---:|---:|",
    ]
    keep = {"logistic_regression", "class_weighted_logistic_regression", "observation_error_keyword_heuristic", "always_allow"}
    for row in report["budget_results"]:
        if row["baseline_name"] not in keep:
            continue
        lines.append(
            f"| `{row['baseline_name']}` | `{row['requested_deferral_budget']}` | `{row['split']}` | `{row['deferral_rate']}` | "
            f"`{row['allowed_bad_rate']}` | `{row['bad_deferred']}` | `{row['relative_risk_reduction_vs_always_allow']}` |"
        )
    return "\n".join(lines)


def main() -> int:
    report = run_budget_analysis(utils.load_score_rows())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"budget_rows": len(report["budget_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
