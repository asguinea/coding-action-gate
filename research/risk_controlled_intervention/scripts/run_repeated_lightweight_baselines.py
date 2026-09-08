#!/usr/bin/env python3
"""Fit and score repeated-split lightweight baselines."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "repeated_baseline_metrics.json"
REPORT_MD = utils.REPORTS_DIR / "repeated_baseline_metrics.md"


def run_repeated_scoring(rows: list[dict[str, Any]], splits: dict[str, Any], schema: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    score_records: list[dict[str, Any]] = []
    seed_reports = []
    leakage_ok = True
    raw_text_ok = True
    for split_item in splits["splits"]:
        seed = int(split_item["seed"])
        assignments = split_item["assignments"]
        prepared = utils.prepare_for_assignments(rows, schema, assignments)
        split_rows = {split: data["rows"] for split, data in prepared["splits"].items()}
        heuristic_records, heuristic_reports = utils.score_heuristics(seed, split_rows)
        lightweight_records, lightweight_reports = utils.score_lightweight(seed, prepared)
        score_records.extend(heuristic_records)
        score_records.extend(lightweight_records)
        leakage_ok = leakage_ok and not utils.model_features.trajectory_split_leakage(utils.split_dict(assignments))
        raw_text_ok = raw_text_ok and utils.model_features.raw_text_feature_guard(prepared["plan"]) and utils.model_features.leakage_guard(prepared["plan"])
        seed_reports.append(
            {
                "seed": seed,
                "feature_count": len(prepared["encoder"]["encoded_feature_names"]),
                "encoded_feature_names": prepared["encoder"]["encoded_feature_names"],
                "models": {**heuristic_reports, **lightweight_reports},
            }
        )
    report = {
        "schema_version": "risk-controlled-intervention-repeated-baselines.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Repeated lightweight benchmark scoring only; not production CodingActionGate validation or guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "seeds": splits["seeds"],
        "score_file": str(utils.REPEATED_SCORES_PATH.relative_to(utils.WORKSPACE)),
        "baseline_names": list(utils.MAIN_BASELINES),
        "no_test_fitting": True,
        "no_calibration_fitting": True,
        "raw_text_feature_guard_status": raw_text_ok,
        "split_leakage_guard_status": leakage_ok,
        "seed_reports": seed_reports,
    }
    return report, score_records


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Repeated Baseline Metrics",
        "",
        "Lightweight models are fit independently per repeated split using train rows only.",
        "",
        "| seed | model | split | AUROC | AP | positives |",
        "|---:|---|---|---:|---:|---:|",
    ]
    for seed_report in report["seed_reports"]:
        for name, model in seed_report["models"].items():
            for split in ("train", "calibration", "test"):
                item = model["splits"][split]
                lines.append(f"| `{seed_report['seed']}` | `{name}` | `{split}` | `{item['auroc']}` | `{item['average_precision']}` | `{item['positives']}` |")
    return "\n".join(lines)


def main() -> int:
    rows = utils.load_prefix_rows()
    splits = utils.load_json(utils.REPEATED_SPLITS_PATH)
    schema = utils.load_json(utils.FEATURE_SCHEMA_PATH)
    report, score_records = run_repeated_scoring(rows, splits, schema)
    utils.MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    utils.REPEATED_SCORES_PATH.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in score_records))
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"seeds": len(report["seeds"]), "score_rows": len(score_records), "baselines": report["baseline_names"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
