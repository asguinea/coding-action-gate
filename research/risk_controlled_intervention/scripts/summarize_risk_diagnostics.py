#!/usr/bin/env python3
"""Summarize Batch 8.5 risk-control diagnostics."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import risk_diagnostic_utils as utils

STRICT = utils.REPORTS_DIR / "strict_alpha_thresholds.json"
RELATIVE = utils.REPORTS_DIR / "relative_risk_thresholds.json"
BUDGET = utils.REPORTS_DIR / "deferral_budget_analysis.json"
DECILE = utils.REPORTS_DIR / "score_decile_analysis.json"
MISMATCH = utils.REPORTS_DIR / "calibration_test_mismatch_audit.json"
PROTOCOL = utils.REPORTS_DIR / "repeated_split_protocol_recommendation.json"
OUTPUT_JSON = utils.REPORTS_DIR / "risk_diagnostics_summary.json"
OUTPUT_MD = utils.REPORTS_DIR / "risk_diagnostics_summary.md"

SUMMARY_STATEMENT = "These diagnostics refine the benchmark risk-control setup. They are not production CodingActionGate guarantees and do not establish validity under arbitrary distribution shift."


def best_rows_by_alpha(strict: dict[str, Any], split: str = "test") -> list[dict[str, Any]]:
    grouped: dict[float, list[dict[str, Any]]] = defaultdict(list)
    for row in strict.get("threshold_results", []):
        if row["split"] == split and row["thresholding_variant"] == "empirical_threshold":
            grouped[float(row["alpha"])].append(row)
    best = []
    for alpha, rows in sorted(grouped.items()):
        candidates = [row for row in rows if row["allowed_bad_rate"] is not None]
        if not candidates:
            continue
        best.append(
            min(
                candidates,
                key=lambda row: (
                    row["risk_violation"],
                    row["deferral_rate"],
                    row["allowed_bad_rate"] if row["allowed_bad_rate"] is not None else 1.0,
                ),
            )
        )
    return best


def strict_summary(strict: dict[str, Any]) -> dict[str, Any]:
    rows = strict.get("threshold_results", [])
    by_alpha: dict[str, dict[str, int]] = defaultdict(lambda: {"calibration_met": 0, "calibration_violated": 0, "test_met": 0, "test_violated": 0})
    meaningful = []
    for row in rows:
        alpha = str(row["alpha"])
        if row["allowed_bad_rate"] is None:
            continue
        key = f"{row['split']}_{'violated' if row['risk_violation'] else 'met'}"
        by_alpha[alpha][key] += 1
        if row["split"] == "calibration" and row["deferral_rate"] > 0.01 and not row["risk_violation"]:
            meaningful.append(row)
    return {
        "target_attainment_by_alpha": dict(by_alpha),
        "calibration_rows_with_nontrivial_deferral_and_met_target": len(meaningful),
        "best_test_rows_by_alpha": best_rows_by_alpha(strict, "test"),
    }


def relative_summary(relative: dict[str, Any]) -> dict[str, Any]:
    rows = [row for row in relative.get("threshold_results", []) if row["split"] == "test" and row["thresholding_variant"] == "empirical_threshold"]
    useful = [
        row for row in rows
        if row.get("relative_risk_reduction_vs_always_allow") is not None and row["relative_risk_reduction_vs_always_allow"] > 0.05 and row["deferral_rate"] <= 0.5
    ]
    return {
        "test_rows_with_positive_relative_risk_reduction_at_deferral_le_50pct": len(useful),
        "top_test_relative_reductions": sorted(useful, key=lambda row: row["relative_risk_reduction_vs_always_allow"], reverse=True)[:10],
    }


def budget_summary(budget: dict[str, Any]) -> dict[str, Any]:
    rows = [row for row in budget.get("budget_results", []) if row["split"] == "test" and row["baseline_name"] not in {"always_allow", "always_review"}]
    selected = [row for row in rows if row["requested_deferral_budget"] in {0.05, 0.10, 0.20, 0.30}]
    top_capture = sorted(selected, key=lambda row: row["fraction_of_bad_steps_deferred"], reverse=True)[:10]
    return {
        "top_bad_step_capture_rows": top_capture,
        "best_capture_at_each_budget": [
            max([row for row in rows if row["requested_deferral_budget"] == budget_value], key=lambda row: row["fraction_of_bad_steps_deferred"])
            for budget_value in sorted({row["requested_deferral_budget"] for row in rows})
        ],
    }


def decile_summary(decile: dict[str, Any]) -> dict[str, Any]:
    rows = [row for row in decile.get("ranking_summaries", []) if row["split"] == "test" and row.get("top_to_bottom_bad_rate_ratio") is not None]
    return {
        "ranked_baseline_count": len(rows),
        "best_top_to_bottom_ratios": sorted(rows, key=lambda row: row["top_to_bottom_bad_rate_ratio"], reverse=True)[:10],
    }


def build_summary() -> dict[str, Any]:
    strict = utils.load_json(STRICT)
    relative = utils.load_json(RELATIVE)
    budget = utils.load_json(BUDGET)
    decile = utils.load_json(DECILE)
    mismatch = utils.load_json(MISMATCH)
    protocol = utils.load_json(PROTOCOL)
    return {
        "schema_version": "risk-controlled-intervention-risk-diagnostics-summary.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": SUMMARY_STATEMENT,
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "strict_alpha_summary": strict_summary(strict),
        "relative_risk_summary": relative_summary(relative),
        "deferral_budget_summary": budget_summary(budget),
        "score_decile_summary": decile_summary(decile),
        "calibration_test_mismatch": {
            "split_prevalence": mismatch.get("split_prevalence"),
            "calibration_test_base_risk_gap": mismatch.get("calibration_test_base_risk_gap"),
            "recommendation": mismatch.get("recommendation"),
            "top_potential_contributors": mismatch.get("top_potential_contributors", [])[:10],
        },
        "repeated_split_recommendation": protocol,
        "next_batch_recommendation": (
            "Run repeated trajectory-level split experiments before final report tables; also consider stricter alpha and fixed-deferral-budget tables."
            if protocol.get("recommended")
            else "Proceed to draft diagnostic tables with current split caveats."
        ),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Risk Diagnostics Summary",
        "",
        SUMMARY_STATEMENT,
        "",
        "## Strict Alpha",
        "",
        f"- Nontrivial calibration interventions that met target: `{report['strict_alpha_summary']['calibration_rows_with_nontrivial_deferral_and_met_target']}`",
        "",
        "| alpha | best test baseline | allowed bad | deferral | violation |",
        "|---:|---|---:|---:|---:|",
    ]
    for row in report["strict_alpha_summary"]["best_test_rows_by_alpha"]:
        lines.append(f"| `{row['alpha']}` | `{row['baseline_name']}` | `{row['allowed_bad_rate']}` | `{row['deferral_rate']}` | `{row['risk_violation']}` |")
    lines.extend(
        [
            "",
            "## Relative Risk",
            "",
            f"- Test rows with >5% relative risk reduction at <=50% deferral: `{report['relative_risk_summary']['test_rows_with_positive_relative_risk_reduction_at_deferral_le_50pct']}`",
            "",
            "## Deferral Budget",
            "",
            "| budget | best capture baseline | test capture | allowed bad |",
            "|---:|---|---:|---:|",
        ]
    )
    for row in report["deferral_budget_summary"]["best_capture_at_each_budget"]:
        lines.append(f"| `{row['requested_deferral_budget']}` | `{row['baseline_name']}` | `{row['fraction_of_bad_steps_deferred']}` | `{row['allowed_bad_rate']}` |")
    lines.extend(
        [
            "",
            "## Score Ranking",
            "",
            "| baseline | top decile bad rate | bottom decile bad rate | ratio |",
            "|---|---:|---:|---:|",
        ]
    )
    for row in report["score_decile_summary"]["best_top_to_bottom_ratios"][:5]:
        lines.append(f"| `{row['baseline_name']}` | `{row['top_decile_bad_rate']}` | `{row['bottom_decile_bad_rate']}` | `{row['top_to_bottom_bad_rate_ratio']}` |")
    lines.extend(
        [
            "",
            "## Calibration/Test Mismatch",
            "",
            f"- Base-risk gap test minus calibration: `{report['calibration_test_mismatch']['calibration_test_base_risk_gap']}`",
            f"- Recommendation: {report['calibration_test_mismatch']['recommendation']}",
            "",
            f"## Next Recommendation\n\n{report['next_batch_recommendation']}",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    report = build_summary()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"next_batch": report["next_batch_recommendation"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
