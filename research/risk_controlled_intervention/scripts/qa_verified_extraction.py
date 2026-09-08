#!/usr/bin/env python3
"""Automated QA gate for verified-split prefix extraction."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
PREFIX_AUDIT = REPORTS_DIR / "prefix_verified_audit.json"
TAXONOMY = REPORTS_DIR / "verified_failure_taxonomy.json"
SPLITS = PROCESSED_DIR / "verified_splits.json"
SPLIT_AUDIT = REPORTS_DIR / "verified_split_audit.json"
SCHEMA_LOCK = WORKSPACE / "SCHEMA_LOCK.md"
QUALITY_JSON = REPORTS_DIR / "verified_quality_gate.json"
QUALITY_MD = REPORTS_DIR / "verified_quality_gate.md"
FEATURE_JSON = REPORTS_DIR / "verified_prefix_feature_schema.json"
FEATURE_MD = REPORTS_DIR / "verified_prefix_feature_schema.md"
PILOT_QA_SCRIPT = Path(__file__).resolve().with_name("qa_pilot_extraction.py")
VERIFIED_SPLIT_SCRIPT = Path(__file__).resolve().with_name("make_verified_splits.py")


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pilot_qa = _load_module("qa_pilot_extraction", PILOT_QA_SCRIPT)
verified_splits = _load_module("make_verified_splits", VERIFIED_SPLIT_SCRIPT)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run verified-scale extraction QA.")
    parser.add_argument("--shard-dir", default=str(SHARD_DIR))
    return parser.parse_args()


def check(name: str, passed: bool, observed: Any, expected: str, critical: bool = False) -> dict[str, Any]:
    return pilot_qa.check(name, passed, observed, expected, critical)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_rows(shard_dir: Path) -> list[dict[str, Any]]:
    return verified_splits.load_shards(shard_dir)


def final_step_failures(prefix_audit: dict[str, Any]) -> list[str]:
    return pilot_qa.final_step_prefix_failures(prefix_audit)


def run_verified_gate(
    rows: list[dict[str, Any]],
    prefix_audit: dict[str, Any],
    taxonomy: dict[str, Any],
    splits: dict[str, Any],
    split_audit: dict[str, Any],
    schema_text: str,
) -> dict[str, Any]:
    summary = prefix_audit["summary"]
    raw_hits = pilot_qa.raw_text_key_hits(rows)
    future_step_failures = pilot_qa.no_future_step_failures(rows)
    target_failures = pilot_qa.target_integrity_failures(rows)
    split_issues = pilot_qa.split_assignment_issues(rows, splits, split_audit)
    source_count = len({row.get("source_bucket") for row in rows if row.get("source_bucket") is not None})
    agent_count = len({row.get("agent") for row in rows if row.get("agent") is not None})
    layout_count = len({row.get("layout_family") for row in rows if row.get("layout_family") is not None})
    positive_count = sum(int(row["next_step_bad"]) for row in rows)
    positive_rate = positive_count / len(rows) if rows else 0.0
    available = int(summary.get("artifacts_cached_found") or 0)
    parsed_with_prefix = int(summary.get("artifacts_parsed_with_prefix_examples") or 0)
    taxonomy_summary = taxonomy.get("summary", {})
    documented_unsupported_or_zero = int(taxonomy_summary.get("unsupported_layout", 0)) + int(taxonomy_summary.get("parsed_zero_prefix", 0))
    blocking_taxonomy = int(taxonomy.get("blocking_for_modeling_count") or 0)
    label_mapping_rate = float(summary.get("label_mapping_success_rate") or 0.0)
    label_mapping_acceptable = label_mapping_rate >= 0.90 or (documented_unsupported_or_zero > 0 and blocking_taxonomy == 0)
    checks_by_category = {
        "coverage": [
            check("verified manifest trajectories >= 1000", int(summary.get("verified_manifest_trajectories") or 0) >= 1000, summary.get("verified_manifest_trajectories"), ">= 1000"),
            check("parsed_with_prefix_examples / artifacts available >= 0.80", available > 0 and parsed_with_prefix / available >= 0.80, parsed_with_prefix / available if available else 0.0, ">= 0.80"),
            check("parse failures documented", "parse_failures" in summary, summary.get("parse_failures"), "present"),
            check("corrupted/unreadable archives documented", "corrupted_unreadable_archive_count" in summary, summary.get("corrupted_unreadable_archive_count"), "present"),
        ],
        "dataset_utility": [
            check("prefix examples >= 10000", len(rows) >= 10000, len(rows), ">= 10000"),
            check("next_step_bad positives >= 200", positive_count >= 200, positive_count, ">= 200"),
            check("positive rate between 1% and 50%", 0.01 <= positive_rate <= 0.50, positive_rate, "0.01 <= rate <= 0.50"),
            check("at least two source buckets represented", source_count >= 2, source_count, ">= 2"),
            check("multiple agents represented", agent_count >= 2, agent_count, ">= 2"),
            check("multiple layout families represented", layout_count >= 2, layout_count, ">= 2"),
        ],
        "leakage_privacy": [
            check("no forbidden raw-text keys", not raw_hits, raw_hits[:5], "[]", critical=True),
            check("next_step_index > step_index", not future_step_failures, future_step_failures[:5], "[]", critical=True),
            check("no target-step action/observation hash keys", pilot_qa.no_future_hash_keys(rows), "checked", "no future hash keys", critical=True),
            check("trajectory leakage across splits == false", not bool(split_audit.get("trajectory_leakage_across_splits")), split_audit.get("trajectory_leakage_across_splits"), "false", critical=True),
        ],
        "label_integrity": [
            check("positive targets traceable", bool(summary.get("positive_target_traceability_status")), summary.get("positive_target_traceability_status"), "true", critical=True),
            check("bad labels match components", not target_failures, target_failures[:5], "[]", critical=True),
            check("final step has no prefix row", not final_step_failures(prefix_audit), final_step_failures(prefix_audit)[:5], "[]", critical=True),
            check(
                "label mapping success rate >= 90% or lower rate explained by documented unsupported layouts",
                label_mapping_acceptable,
                {
                    "label_mapping_success_rate": label_mapping_rate,
                    "documented_unsupported_or_zero": documented_unsupported_or_zero,
                    "blocking_taxonomy_count": blocking_taxonomy,
                },
                ">= 0.90, or documented unsupported/zero-prefix cases with no blocking taxonomy",
                critical=True,
            ),
        ],
        "split_quality": [
            check("train/calibration/test splits exist", all(split in splits.get("split_trajectories", {}) for split in ("train", "calibration", "test")), sorted(splits.get("split_trajectories", {})), "train/calibration/test"),
            check(
                "every trajectory appears in exactly one split",
                not split_issues["missing_assignments_for_row_trajectories"]
                and not split_issues["split_overlaps"]
                and not split_issues["invalid_split_values"],
                split_issues,
                "no missing, overlaps, or invalid values",
                critical=True,
            ),
            check("calibration split has enough positives", split_audit["calibration_has_enough_positives_for_alpha_grid"], split_audit["splits"]["calibration"]["next_step_bad_positives"], ">= 50"),
            check("test split has enough positives", split_audit["test_has_enough_positives_for_evaluation"], split_audit["splits"]["test"]["next_step_bad_positives"], ">= 50"),
            check("split ratios approximately 60/20/20", split_issues["ratios_approximately_60_20_20"], split_issues["trajectory_ratios"], "within tolerance"),
        ],
        "schema_consistency": pilot_qa.schema_checks(schema_text),
    }
    all_checks = [item for checks in checks_by_category.values() for item in checks]
    critical_failures = [item for item in all_checks if item["critical"] and not item["passed"]]
    noncritical_failures = [item for item in all_checks if not item["critical"] and not item["passed"]]
    if critical_failures or blocking_taxonomy:
        decision = "NOT_READY"
    elif noncritical_failures:
        decision = "READY_WITH_CAVEATS"
    else:
        decision = "READY_FOR_BASELINE_MODELING"
    return {
        "schema_version": "risk-controlled-intervention-verified-quality-gate.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6 verified extraction QA only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "decision": decision,
        "checks_by_category": checks_by_category,
        "critical_failures": critical_failures,
        "noncritical_failures": noncritical_failures,
        "summary": {
            "verified_manifest_trajectories": summary.get("verified_manifest_trajectories"),
            "artifacts_available": available,
            "parsed_with_prefix_examples": parsed_with_prefix,
            "prefix_examples": len(rows),
            "next_step_bad_positives": positive_count,
            "next_step_bad_positive_rate": positive_rate,
            "label_mapping_success_rate": summary.get("label_mapping_success_rate"),
            "raw_text_key_hit_count": len(raw_hits),
            "future_step_failure_count": len(future_step_failures),
            "target_integrity_failure_count": len(target_failures),
            "split_leakage": bool(split_audit.get("trajectory_leakage_across_splits")),
            "blocking_taxonomy_count": blocking_taxonomy,
        },
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Verified Quality Gate",
        "",
        "Automated QA for verified-split extraction dry run.",
        "",
        "This is not production CodingActionGate validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        f"## Decision: `{report['decision']}`",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    for category, checks in report["checks_by_category"].items():
        lines.extend(["", f"## {category.replace('_', ' ').title()}", ""])
        for item in checks:
            lines.append(f"- `{'PASS' if item['passed'] else 'FAIL'}` `{item['name']}` observed `{item['observed']}` expected `{item['expected']}`")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_rows(Path(args.shard_dir))
    prefix_audit = load_json(PREFIX_AUDIT)
    taxonomy = load_json(TAXONOMY)
    splits = load_json(SPLITS)
    split_audit = load_json(SPLIT_AUDIT)
    schema_text = SCHEMA_LOCK.read_text()
    report = run_verified_gate(rows, prefix_audit, taxonomy, splits, split_audit, schema_text)
    feature_schema = pilot_qa.build_feature_schema(rows)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    QUALITY_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    QUALITY_MD.write_text(markdown(report) + "\n")
    FEATURE_JSON.write_text(json.dumps(feature_schema, indent=2, sort_keys=True) + "\n")
    FEATURE_MD.write_text(pilot_qa.feature_schema_markdown(feature_schema).replace("Prefix Feature Schema", "Verified Prefix Feature Schema") + "\n")
    print(json.dumps({"decision": report["decision"], "summary": report["summary"]}, indent=2, sort_keys=True))
    return 1 if report["decision"] == "NOT_READY" else 0


if __name__ == "__main__":
    raise SystemExit(main())
