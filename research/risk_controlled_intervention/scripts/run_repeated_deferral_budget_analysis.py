#!/usr/bin/env python3
"""Repeated fixed deferral-budget diagnostics."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "repeated_deferral_budget_analysis.json"
REPORT_MD = utils.REPORTS_DIR / "repeated_deferral_budget_analysis.md"
BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50)


def run_budget(score_rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = utils.group_scores(score_rows)
    results = []
    for seed, by_model in sorted(grouped.items()):
        for baseline, by_split in sorted(by_model.items()):
            calibration_rows = by_split.get("calibration", [])
            test_rows = by_split.get("test", [])
            if not calibration_rows or not test_rows:
                continue
            cal_scores, _, _ = utils.rows_to_scores_labels(calibration_rows)
            for budget in BUDGETS:
                if baseline == "always_allow":
                    tau = max(cal_scores) + 1e-12
                    selection = {"selected_on": "policy_definition", "fixed_policy": baseline}
                elif baseline == "always_review":
                    tau = min(cal_scores) - 1e-12
                    selection = {"selected_on": "policy_definition", "fixed_policy": baseline}
                else:
                    tau = utils.threshold_for_budget(cal_scores, budget)
                    selection = {"selected_on": "calibration_score_budget", "requested_deferral_budget": budget, "tau": tau}
                for split, rows in (("calibration", calibration_rows), ("test", test_rows)):
                    metrics = utils.evaluate_threshold(rows, tau)
                    results.append({"seed": seed, "baseline_name": baseline, "requested_deferral_budget": budget, "split": split, "selection": selection if split == "calibration" else {"tau_selected_on": "calibration"}, **metrics})
    return {
        "schema_version": "risk-controlled-intervention-repeated-deferral-budget.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Repeated fixed-budget diagnostic only; not production or conformal risk control.",
        "deferral_budgets": list(BUDGETS),
        "budget_results": results,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# Repeated Deferral Budget Analysis", "", "| budget | model | mean test deferral | mean bad capture | mean allowed bad |", "|---:|---|---:|---:|---:|"]
    by_key: dict[tuple[float, str], list[dict[str, Any]]] = {}
    for row in report["budget_results"]:
        if row["split"] == "test":
            by_key.setdefault((row["requested_deferral_budget"], row["baseline_name"]), []).append(row)
    for (budget, baseline), rows in sorted(by_key.items()):
        mean_def = sum(row["deferral_rate"] for row in rows) / len(rows)
        mean_capture = sum(row["fraction_of_bad_steps_deferred"] for row in rows) / len(rows)
        risks = [row["allowed_bad_rate"] for row in rows if row["allowed_bad_rate"] is not None]
        mean_risk = sum(risks) / len(risks) if risks else None
        lines.append(f"| `{budget}` | `{baseline}` | `{mean_def}` | `{mean_capture}` | `{mean_risk}` |")
    return "\n".join(lines)


def main() -> int:
    report = run_budget(utils.load_repeated_scores())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"budget_rows": len(report["budget_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
