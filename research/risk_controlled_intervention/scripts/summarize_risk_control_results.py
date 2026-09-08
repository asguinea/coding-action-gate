#!/usr/bin/env python3
"""Create the combined Batch 8 risk-control summary report."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
THRESHOLDS = REPORTS_DIR / "risk_control_thresholds.json"
FRONTIER = REPORTS_DIR / "risk_cost_frontier.json"
EARLY = REPORTS_DIR / "early_intervention_metrics.json"
SUBGROUPS = REPORTS_DIR / "risk_control_subgroups.json"
BASELINE_COMPARISON = REPORTS_DIR / "baseline_comparison.json"
FEATURE_AUDIT = REPORTS_DIR / "model_feature_preparation_audit.json"
OUTPUT_JSON = REPORTS_DIR / "risk_control_summary.json"
OUTPUT_MD = REPORTS_DIR / "risk_control_summary.md"

SUMMARY_STATEMENT = "These are calibration-based benchmark results on CodeTraceBench-derived trajectories, not production CodingActionGate guarantees."


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def best_by_calibration_ap(comparison: dict[str, Any]) -> dict[str, Any] | None:
    rows = [row for row in comparison.get("baseline_rows", []) if not row.get("skipped")]
    if not rows:
        return None
    return max(rows, key=lambda row: row.get("calibration_average_precision") or -1.0)


def main_table_rows(thresholds: dict[str, Any], best_heuristic: str | None) -> list[dict[str, Any]]:
    keep = {"logistic_regression", "class_weighted_logistic_regression", "always_allow", "always_review"}
    if best_heuristic:
        keep.add(best_heuristic)
    rows = []
    for row in thresholds.get("threshold_results", []):
        if row["baseline_name"] in keep and row["split"] in {"calibration", "test"}:
            rows.append(
                {
                    "baseline_name": row["baseline_name"],
                    "thresholding_variant": row["thresholding_variant"],
                    "alpha": row["alpha"],
                    "split": row["split"],
                    "tau": row["tau"],
                    "allowed_bad_rate": row["allowed_bad_rate"],
                    "allowed_bad_rate_ci": row.get("allowed_bad_rate_ci"),
                    "deferral_rate": row["deferral_rate"],
                    "deferral_rate_ci": row.get("deferral_rate_ci"),
                    "risk_violation": row["risk_violation"],
                    "allowed_count": row["allowed_count"],
                    "deferred_count": row["deferred_count"],
                }
            )
    return rows


def target_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {"met": 0, "violated": 0, "undefined_allowed_risk": 0})
    for row in rows:
        key = row["split"]
        if row["allowed_bad_rate"] is None:
            grouped[key]["undefined_allowed_risk"] += 1
        elif row["risk_violation"]:
            grouped[key]["violated"] += 1
        else:
            grouped[key]["met"] += 1
    return dict(grouped)


def best_heuristic_name(comparison: dict[str, Any]) -> str | None:
    candidates = [
        row for row in comparison.get("baseline_rows", [])
        if row.get("group") == "heuristic" and not row.get("skipped") and not row.get("baseline_name", "").startswith("always_")
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda row: row.get("calibration_average_precision") or -1.0)["baseline_name"]


def split_summary(feature_audit: dict[str, Any]) -> dict[str, Any]:
    if "row_counts_by_split" in feature_audit:
        return feature_audit["row_counts_by_split"]
    splits = feature_audit.get("split_summary", {})
    if splits:
        return splits
    return {
        "train": feature_audit.get("row_counts", {}).get("train"),
        "calibration": feature_audit.get("row_counts", {}).get("calibration"),
        "test": feature_audit.get("row_counts", {}).get("test"),
    }


def build_report() -> dict[str, Any]:
    thresholds = load_json(THRESHOLDS)
    frontier = load_json(FRONTIER)
    early = load_json(EARLY)
    subgroups = load_json(SUBGROUPS)
    comparison = load_json(BASELINE_COMPARISON)
    feature_audit = load_json(FEATURE_AUDIT)
    best_model = best_by_calibration_ap(comparison)
    best_heuristic = best_heuristic_name(comparison)
    table = main_table_rows(thresholds, best_heuristic)
    return {
        "schema_version": "risk-controlled-intervention-risk-control-summary.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": SUMMARY_STATEMENT,
        "scope": "Frozen v0.4 extraction-supported verified subset only; unsupported layouts and missing artifact paths remain documented caveats.",
        "target_definition": "next_step_bad = next_step_incorrect OR next_step_unuseful",
        "decision_rule": "ALLOW if score <= tau; DEFER/REVIEW if score > tau. Higher score means higher estimated risk.",
        "alpha_values": thresholds.get("alpha_values", []),
        "thresholding_variants": thresholds.get("thresholding_variants", []),
        "dataset_split_summary": split_summary(feature_audit),
        "best_baseline_by_calibration_average_precision": best_model,
        "best_heuristic_by_calibration_average_precision": best_heuristic,
        "main_risk_control_table": table,
        "target_attainment_summary": target_summary(table),
        "risk_cost_frontier_points": len(frontier.get("frontier_points", [])),
        "early_intervention_available": early.get("available", False),
        "early_intervention_summary_count": len(early.get("summaries", [])),
        "subgroup_selected_baselines": subgroups.get("selected_baselines", []),
        "subgroup_result_rows": len(subgroups.get("subgroup_results", [])),
        "caveats": [
            "Thresholds are selected with calibration data only and evaluated on held-out test data.",
            "Conservative thresholds use a binomial upper confidence bound on calibration allowed-bad rate.",
            "Test outcomes are empirical benchmark measurements, not deployment guarantees.",
            "Early-intervention metrics are exploratory and do not establish causal prevention.",
        ],
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Risk-Control Summary",
        "",
        SUMMARY_STATEMENT,
        "",
        f"- Scope: {report['scope']}",
        f"- Target: `{report['target_definition']}`",
        f"- Alpha values: `{report['alpha_values']}`",
        f"- Variants: `{report['thresholding_variants']}`",
        f"- Best baseline by calibration AP: `{(report['best_baseline_by_calibration_average_precision'] or {}).get('baseline_name')}`",
        "",
        "## Main Risk-Control Table",
        "",
        "| baseline | variant | alpha | split | allowed bad | deferral | violation |",
        "|---|---|---:|---|---:|---:|---:|",
    ]
    for row in report["main_risk_control_table"]:
        lines.append(
            f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['alpha']}` | `{row['split']}` | "
            f"`{row['allowed_bad_rate']}` | `{row['deferral_rate']}` | `{row['risk_violation']}` |"
        )
    lines.extend(
        [
            "",
            "## Caveats",
            "",
            *[f"- {caveat}" for caveat in report["caveats"]],
            "",
            "Allowed-bad rate is `null` when a policy allows zero rows.",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"main_table_rows": len(report["main_risk_control_table"]), "frontier_points": report["risk_cost_frontier_points"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
