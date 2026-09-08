#!/usr/bin/env python3
"""Compare Batch 7 uncalibrated heuristic and lightweight baselines."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
HEURISTIC_METRICS = REPORTS_DIR / "heuristic_baseline_metrics.json"
LIGHTWEIGHT_METRICS = REPORTS_DIR / "lightweight_baseline_metrics.json"
COMPARISON_JSON = REPORTS_DIR / "baseline_comparison.json"
COMPARISON_MD = REPORTS_DIR / "baseline_comparison.md"
SCORE_SCHEMA_JSON = REPORTS_DIR / "model_score_schema.json"
SCORE_SCHEMA_MD = REPORTS_DIR / "model_score_schema.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def extract_rows(report: dict[str, Any], group: str) -> list[dict[str, Any]]:
    model_key = "baselines" if group == "heuristic" else "models"
    rows = []
    for name, item in report.get(model_key, {}).items():
        if item.get("skipped"):
            rows.append({"group": group, "baseline_name": name, "skipped": True, "reason": item.get("reason")})
            continue
        calib = item["splits"]["calibration"]
        test = item["splits"]["test"]
        rows.append(
            {
                "group": group,
                "baseline_name": name,
                "skipped": False,
                "calibration_auroc": calib.get("auroc"),
                "calibration_average_precision": calib.get("average_precision"),
                "test_auroc": test.get("auroc"),
                "test_average_precision": test.get("average_precision"),
                "calibration_deferral_rate": calib.get("deferral_rate"),
                "test_deferral_rate": test.get("deferral_rate"),
                "calibration_allowed_bad_rate": calib.get("allowed_bad_rate"),
                "test_allowed_bad_rate": test.get("allowed_bad_rate"),
                "calibration_false_deferral_rate": calib.get("false_deferral_rate"),
                "test_false_deferral_rate": test.get("false_deferral_rate"),
                "default_threshold": item.get("default_threshold"),
            }
        )
    return rows


def score_schema() -> dict[str, Any]:
    fields = [
        {"name": "trajectory_id", "role": "row_identifier", "raw_text": False},
        {"name": "step_index", "role": "row_identifier", "raw_text": False},
        {"name": "split", "role": "split", "raw_text": False},
        {"name": "baseline_name", "role": "model_identifier", "raw_text": False},
        {"name": "model_family", "role": "model_identifier", "raw_text": False},
        {"name": "score", "role": "risk_score", "score_range": "[0, 1]", "higher_means_riskier": True, "raw_text": False},
        {"name": "target", "role": "target", "definition": "next_step_bad", "raw_text": False},
        {"name": "next_step_bad", "role": "target_duplicate_for_audit", "raw_text": False},
        {"name": "source_bucket", "role": "evaluation_metadata", "raw_text": False},
        {"name": "agent", "role": "evaluation_metadata", "raw_text": False},
        {"name": "layout_family", "role": "evaluation_metadata", "raw_text": False},
        {"name": "difficulty", "role": "evaluation_metadata", "raw_text": False},
        {"name": "category", "role": "evaluation_metadata", "raw_text": False},
        {"name": "higher_means_riskier", "role": "score_semantics", "raw_text": False},
    ]
    return {
        "schema_version": "risk-controlled-intervention-model-score-schema.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 7 score schema only; scores are uncalibrated and are not conformal/risk-controlled results."
        ),
        "score_meaning": "Estimated or heuristic risk that allowing continuation into step t+1 would allow incorrect or unuseful behavior.",
        "score_range": "[0, 1]",
        "higher_means_riskier": True,
        "raw_text_fields_allowed": False,
        "intended_downstream_use": "Batch 8 conformal/risk-control thresholding on calibration data.",
        "fields": fields,
    }


def build_report() -> dict[str, Any]:
    heuristic = load_json(HEURISTIC_METRICS)
    lightweight = load_json(LIGHTWEIGHT_METRICS)
    rows = extract_rows(heuristic, "heuristic") + extract_rows(lightweight, "lightweight")
    sortable = [row for row in rows if not row.get("skipped") and row.get("test_average_precision") is not None]
    best_by_test_ap = sorted(sortable, key=lambda row: row["test_average_precision"], reverse=True)[:5]
    return {
        "schema_version": "risk-controlled-intervention-baseline-comparison.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 7 baseline comparison only; uncalibrated scores, no conformal calibration, "
            "no risk-control guarantee, and no final report result claim."
        ),
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "baseline_rows": rows,
        "best_by_test_average_precision": best_by_test_ap,
        "caveats": [
            "Default thresholds are uncalibrated and should not be interpreted as risk-control thresholds.",
            "Results apply only to trajectories supported by the v0.4 extraction schema.",
            "Calibration and test splits were not used for fitting lightweight supervised models.",
        ],
    }


def comparison_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Baseline Comparison",
        "",
        "Uncalibrated Batch 7 baseline scores only. No conformal or risk-control thresholding is performed.",
        "",
        "| group | baseline | calib AUROC | calib AP | test AUROC | test AP | test deferral | test allowed-bad |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["baseline_rows"]:
        if row.get("skipped"):
            lines.append(f"| `{row['group']}` | `{row['baseline_name']}` | skipped | skipped | skipped | skipped | skipped | skipped |")
            continue
        lines.append(
            f"| `{row['group']}` | `{row['baseline_name']}` | `{row['calibration_auroc']}` | "
            f"`{row['calibration_average_precision']}` | `{row['test_auroc']}` | `{row['test_average_precision']}` | "
            f"`{row['test_deferral_rate']}` | `{row['test_allowed_bad_rate']}` |"
        )
    lines.extend(["", "## Caveats", ""])
    for caveat in report["caveats"]:
        lines.append(f"- {caveat}")
    return "\n".join(lines)


def schema_markdown(schema: dict[str, Any]) -> str:
    lines = [
        "# Model Score Schema",
        "",
        schema["score_meaning"],
        "",
        f"- `score_range`: `{schema['score_range']}`",
        f"- `higher_means_riskier`: `{schema['higher_means_riskier']}`",
        f"- `raw_text_fields_allowed`: `{schema['raw_text_fields_allowed']}`",
        f"- `intended_downstream_use`: {schema['intended_downstream_use']}",
        "",
        "| field | role | raw text |",
        "|---|---|---:|",
    ]
    for field in schema["fields"]:
        lines.append(f"| `{field['name']}` | `{field['role']}` | `{field.get('raw_text', False)}` |")
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    schema = score_schema()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    COMPARISON_MD.write_text(comparison_markdown(report) + "\n")
    SCORE_SCHEMA_JSON.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    SCORE_SCHEMA_MD.write_text(schema_markdown(schema) + "\n")
    print(json.dumps({"baseline_count": len(report["baseline_rows"]), "score_schema_fields": len(schema["fields"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
