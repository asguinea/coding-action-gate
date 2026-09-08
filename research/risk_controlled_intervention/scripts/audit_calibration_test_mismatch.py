#!/usr/bin/env python3
"""Audit calibration/test composition mismatch for the verified prefix dataset."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import risk_diagnostic_utils as utils

SPLITS = utils.WORKSPACE / "data" / "processed" / "verified_splits.json"
REPORT_JSON = utils.REPORTS_DIR / "calibration_test_mismatch_audit.json"
REPORT_MD = utils.REPORTS_DIR / "calibration_test_mismatch_audit.md"

CATEGORICAL_FIELDS = ("source_bucket", "agent", "layout_family", "difficulty", "category", "action_kind_guess", "observation_kind_guess")
NUMERIC_FIELDS = (
    "prefix_length",
    "current_stage_index",
    "current_stage_step_count_so_far",
    "total_stage_transitions_so_far",
    "recent_error_keyword_count",
    "recent_failure_keyword_count",
    "recent_timeout_keyword_count",
    "recent_test_keyword_count",
    "recent_exception_keyword_count",
    "action_length_chars",
    "observation_length_chars",
)


def load_prefix_rows() -> list[dict[str, Any]]:
    split_data = utils.load_json(SPLITS)
    assignments = split_data.get("assignments", {})
    rows = []
    for row in utils.load_jsonl(utils.PREFIX_VERIFIED):
        split = assignments.get(row.get("trajectory_id"))
        if split:
            row = dict(row)
            row["split"] = split
            rows.append(row)
    return rows


def split_prevalence(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_split: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_split[str(row["split"])].append(row)
    result = {}
    for split, split_rows in sorted(by_split.items()):
        positives = sum(int(row["next_step_bad"]) for row in split_rows)
        result[split] = {"rows": len(split_rows), "positives": positives, "base_risk": positives / len(split_rows) if split_rows else 0.0}
    return result


def categorical_distribution(rows: list[dict[str, Any]], field: str) -> dict[str, dict[str, Any]]:
    by_split: dict[str, Counter] = defaultdict(Counter)
    totals: Counter = Counter()
    positives: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        split = str(row["split"])
        value = str(row.get(field, "unknown"))
        by_split[split][value] += 1
        totals[split] += 1
        positives[(split, value)] += int(row["next_step_bad"])
    values = sorted({value for counter in by_split.values() for value in counter})
    result = {}
    for value in values:
        entry = {}
        for split in sorted(by_split):
            count = by_split[split][value]
            entry[split] = {
                "count": count,
                "share": count / totals[split] if totals[split] else 0.0,
                "positive_rate": positives[(split, value)] / count if count else None,
            }
        if "calibration" in entry and "test" in entry:
            entry["calibration_test_share_diff"] = entry["test"]["share"] - entry["calibration"]["share"]
            cal_rate = entry["calibration"]["positive_rate"]
            test_rate = entry["test"]["positive_rate"]
            entry["calibration_test_positive_rate_diff"] = (test_rate - cal_rate) if cal_rate is not None and test_rate is not None else None
        result[value] = entry
    return result


def numeric_shift(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        values[str(row["split"])].append(utils.safe_float(row.get(field)))
    result = {split: utils.summarize_distribution(split_values) for split, split_values in sorted(values.items())}
    cal = values.get("calibration", [])
    test = values.get("test", [])
    if cal and test:
        cal_mean = sum(cal) / len(cal)
        test_mean = sum(test) / len(test)
        pooled = cal + test
        mean = sum(pooled) / len(pooled)
        variance = sum((value - mean) ** 2 for value in pooled) / len(pooled)
        sd = variance ** 0.5
        result["calibration_test_mean_diff"] = test_mean - cal_mean
        result["calibration_test_standardized_diff"] = (test_mean - cal_mean) / sd if sd else 0.0
    return result


def top_contributors(categorical: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for field, values in categorical.items():
        for value, entry in values.items():
            if "calibration_test_share_diff" not in entry:
                continue
            rows.append(
                {
                    "field": field,
                    "value": value,
                    "share_diff_test_minus_calibration": entry["calibration_test_share_diff"],
                    "positive_rate_diff_test_minus_calibration": entry.get("calibration_test_positive_rate_diff"),
                    "test_share": entry.get("test", {}).get("share"),
                    "test_positive_rate": entry.get("test", {}).get("positive_rate"),
                }
            )
    return sorted(rows, key=lambda row: abs(row["share_diff_test_minus_calibration"]) * abs(row["positive_rate_diff_test_minus_calibration"] or 0.0), reverse=True)[:25]


def build_audit(rows: list[dict[str, Any]]) -> dict[str, Any]:
    categorical = {field: categorical_distribution(rows, field) for field in CATEGORICAL_FIELDS}
    numeric = {field: numeric_shift(rows, field) for field in NUMERIC_FIELDS}
    prevalence = split_prevalence(rows)
    cal_risk = prevalence.get("calibration", {}).get("base_risk")
    test_risk = prevalence.get("test", {}).get("base_risk")
    return {
        "schema_version": "risk-controlled-intervention-calibration-test-mismatch.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8.5 mismatch diagnostic only; not production CodingActionGate guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "split_prevalence": prevalence,
        "calibration_test_base_risk_gap": (test_risk - cal_risk) if cal_risk is not None and test_risk is not None else None,
        "categorical_distributions": categorical,
        "numeric_shifts": numeric,
        "top_potential_contributors": top_contributors(categorical),
        "recommendation": (
            "Use repeated trajectory-level splits with stratification by source bucket, agent/layout family, and trajectory-level target presence."
            if test_risk is not None and cal_risk is not None and abs(test_risk - cal_risk) > 0.005
            else "Current calibration/test base-risk gap is small; repeated splits are still useful for uncertainty."
        ),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Calibration/Test Mismatch Audit",
        "",
        "This compares split composition and base next-step-bad rates. It does not use raw text.",
        "",
        "## Split Prevalence",
        "",
        "| split | rows | positives | base risk |",
        "|---|---:|---:|---:|",
    ]
    for split, row in report["split_prevalence"].items():
        lines.append(f"| `{split}` | `{row['rows']}` | `{row['positives']}` | `{row['base_risk']}` |")
    lines.extend(["", f"- Calibration/test base-risk gap: `{report['calibration_test_base_risk_gap']}`", f"- Recommendation: {report['recommendation']}", "", "## Top Potential Contributors", "", "| field | value | share diff | positive-rate diff |", "|---|---|---:|---:|"])
    for row in report["top_potential_contributors"][:15]:
        lines.append(f"| `{row['field']}` | `{row['value']}` | `{row['share_diff_test_minus_calibration']}` | `{row['positive_rate_diff_test_minus_calibration']}` |")
    return "\n".join(lines)


def main() -> int:
    report = build_audit(load_prefix_rows())
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"rows": sum(item["rows"] for item in report["split_prevalence"].values()), "base_risk_gap": report["calibration_test_base_risk_gap"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
