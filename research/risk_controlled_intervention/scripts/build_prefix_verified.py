#!/usr/bin/env python3
"""Build leakage-safe prefix examples for the full verified split."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
COMBINED_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
REPORTS_DIR = WORKSPACE / "reports"
DOWNLOAD_MANIFEST = REPORTS_DIR / "verified_artifact_download_manifest.json"
AUDIT_JSON = REPORTS_DIR / "prefix_verified_audit.json"
AUDIT_MD = REPORTS_DIR / "prefix_verified_audit.md"
PARSER_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")


def _load_parser():
    spec = importlib.util.spec_from_file_location("prefix_parsing", PARSER_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser = _load_parser()
audit = parser.audit
inspect = parser.inspect


def parse_args() -> argparse.Namespace:
    arg_parser = argparse.ArgumentParser(description="Build verified prefix shards from cached verified artifacts.")
    arg_parser.add_argument("--download-manifest", default=str(DOWNLOAD_MANIFEST))
    arg_parser.add_argument("--shard-size", type=int, default=50000)
    arg_parser.add_argument("--no-combined", action="store_true", help="Do not write combined prefix_verified.jsonl.")
    return arg_parser.parse_args()


def pct(numerator: int | float, denominator: int | float) -> float:
    return 0.0 if denominator == 0 else float(numerator) / float(denominator) * 100.0


def distribution(values: list[int]) -> dict[str, Any]:
    return audit.distribution_summary(values)


def coverage_by(trajectory_reports: list[dict[str, Any]], key: str) -> dict[str, dict[str, int]]:
    coverage: dict[str, dict[str, int]] = {}
    for report in trajectory_reports:
        value = str(report.get(key))
        item = coverage.setdefault(value, {"total": 0, "with_prefix": 0, "zero_prefix": 0})
        item["total"] += 1
        if int(report.get("prefix_examples") or 0) > 0:
            item["with_prefix"] += 1
        else:
            item["zero_prefix"] += 1
    return coverage


def artifact_exists(sample: dict[str, Any]) -> bool:
    local_path = sample.get("local_path")
    path = WORKSPACE / str(local_path) if isinstance(local_path, str) else None
    return path is not None and path.exists() and path.stat().st_size > 0


def write_shards(examples: list[dict[str, Any]], shard_size: int) -> list[dict[str, Any]]:
    if shard_size <= 0:
        raise ValueError("--shard-size must be positive.")
    SHARD_DIR.mkdir(parents=True, exist_ok=True)
    for old in SHARD_DIR.glob("prefix_verified_shard_*.jsonl"):
        old.unlink()
    manifests = []
    for shard_index, start in enumerate(range(0, len(examples), shard_size)):
        shard_examples = examples[start : start + shard_size]
        path = SHARD_DIR / f"prefix_verified_shard_{shard_index:03d}.jsonl"
        path.write_text("".join(json.dumps(example, sort_keys=True) + "\n" for example in shard_examples))
        manifests.append(
            {
                "shard_index": shard_index,
                "path": str(path.relative_to(WORKSPACE)),
                "row_count": len(shard_examples),
            }
        )
    if not examples:
        path = SHARD_DIR / "prefix_verified_shard_000.jsonl"
        path.write_text("")
        manifests.append({"shard_index": 0, "path": str(path.relative_to(WORKSPACE)), "row_count": 0})
    return manifests


def build_for_samples(samples: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    all_examples: list[dict[str, Any]] = []
    trajectory_reports: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for sample in samples:
        if not artifact_exists(sample):
            failures.append({"trajectory_id": sample.get("traj_id"), "artifact_path": sample.get("local_path"), "reason": "local artifact missing"})
            continue
        try:
            steps, recovery = parser.recover_steps(sample)
            examples = parser.build_prefix_examples(sample, steps)
        except Exception as exc:
            failures.append({"trajectory_id": sample.get("traj_id"), "artifact_path": sample.get("local_path"), "reason": str(exc)})
            continue
        for example in examples:
            example["layout_family"] = recovery.get("layout_family")
            example["parser_adapter"] = recovery.get("parser_adapter")
        validation_failures = parser.validate_positive_targets_traceable(examples, steps)
        label_count = int(recovery.get("label_count") or 0)
        mapped_label_count = sum(1 for step in steps if step.incorrect or step.unuseful)
        trajectory_reports.append(
            {
                "trajectory_id": sample.get("traj_id"),
                "artifact_path": sample.get("local_path"),
                "source_bucket": sample.get("source_bucket"),
                "agent": sample.get("agent"),
                "model": sample.get("model"),
                "category": sample.get("category"),
                "difficulty": sample.get("difficulty"),
                "ordered_steps_recovered": len(steps),
                "prefix_examples": len(examples),
                "extraction_status": "parsed_with_prefix_examples" if examples else "parsed_zero_prefix",
                "next_step_bad_positives": sum(example["next_step_bad"] for example in examples),
                "next_step_incorrect_positives": sum(example["next_step_incorrect"] for example in examples),
                "next_step_unuseful_positives": sum(example["next_step_unuseful"] for example in examples),
                "current_step_bad_positives": sum(example["current_step_bad"] for example in examples),
                "mapped_label_count": mapped_label_count,
                "label_mapping_success_rate": mapped_label_count / label_count if label_count else 1.0,
                "validation_failures": validation_failures,
                "raw_text_failure_count": sum(1 for example in examples if not parser.validate_no_raw_text(example)),
                "leakage_failure_count": sum(1 for example in examples if not parser.validate_no_future_leakage(example)),
                **recovery,
            }
        )
        all_examples.extend(examples)
    return all_examples, trajectory_reports, failures


def summarize(download_manifest: dict[str, Any], examples: list[dict[str, Any]], reports: list[dict[str, Any]], failures: list[dict[str, Any]]) -> dict[str, Any]:
    label_count = sum(int(report.get("label_count") or 0) for report in reports)
    mapped_label_count = sum(int(report.get("mapped_label_count") or 0) for report in reports)
    with_prefix = sum(1 for report in reports if int(report.get("prefix_examples") or 0) > 0)
    corrupted = sum(1 for failure in failures if "tar:" in str(failure.get("reason")) or "Unsupported" in str(failure.get("reason")))
    return {
        "verified_manifest_trajectories": int(download_manifest.get("summary", {}).get("verified_manifest_rows") or 0),
        "selected_artifacts": int(download_manifest.get("summary", {}).get("artifacts_planned") or 0),
        "artifacts_cached_found": int(download_manifest.get("summary", {}).get("artifacts_cached_after") or 0),
        "artifacts_successfully_listed": len(reports),
        "artifacts_parsed_total": len(reports),
        "artifacts_parsed_with_prefix_examples": with_prefix,
        "parsed_zero_prefix_trajectories": len(reports) - with_prefix,
        "unsupported_layouts": sum(1 for report in reports if report.get("layout_family") == "unsupported_layout"),
        "parse_failures": len(failures),
        "corrupted_unreadable_archive_count": corrupted,
        "ordered_steps_recovered": sum(int(report.get("ordered_steps_recovered") or 0) for report in reports),
        "prefix_examples_created": len(examples),
        "next_step_bad_positives": sum(int(example["next_step_bad"]) for example in examples),
        "next_step_bad_positive_percent": pct(sum(int(example["next_step_bad"]) for example in examples), len(examples)),
        "next_step_incorrect_positives": sum(int(example["next_step_incorrect"]) for example in examples),
        "next_step_unuseful_positives": sum(int(example["next_step_unuseful"]) for example in examples),
        "current_step_bad_positives": sum(int(example["current_step_bad"]) for example in examples),
        "malformed_unmapped_step_parts": sum(int(report.get("malformed_or_unmapped_step_parts") or 0) for report in reports),
        "label_mapping_success_rate": mapped_label_count / label_count if label_count else 1.0,
        "label_mapping_success_percent": pct(mapped_label_count, label_count),
        "raw_text_exclusion_status": all(parser.validate_no_raw_text(example) for example in examples),
        "no_future_leakage_guard_status": all(parser.validate_no_future_leakage(example) for example in examples),
        "positive_target_traceability_status": all(not report.get("validation_failures") for report in reports),
        "missing_unresolved_artifact_path_rows": int(download_manifest.get("summary", {}).get("missing_unresolved_artifact_path_rows") or 0),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Verified Prefix Extraction Audit",
        "",
        "Full verified-split dry-run extraction using the locked v0.2 schema.",
        "",
        "This is infrastructure and data validation only. It is not production StepHarbor validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Parser Coverage", ""])
    for key, value in report["parser_coverage"].items():
        lines.append(f"- `{key}`: `{value}`")
    if report["remaining_blockers_for_modeling"]:
        lines.extend(["", "## Remaining Blockers For Modeling", ""])
        for blocker in report["remaining_blockers_for_modeling"]:
            lines.append(f"- {blocker}")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    download_manifest = json.loads(Path(args.download_manifest).read_text())
    samples = list(download_manifest.get("samples", []))
    examples, trajectory_reports, failures = build_for_samples(samples)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    shard_manifest = write_shards(examples, args.shard_size)
    if not args.no_combined:
        COMBINED_PATH.write_text("".join(json.dumps(example, sort_keys=True) + "\n" for example in examples))
    summary = summarize(download_manifest, examples, trajectory_reports, failures)
    report = {
        "schema_version": "risk-controlled-intervention-prefix-verified.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6 verified extraction dry run only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "processed_shards": shard_manifest,
        "combined_path": str(COMBINED_PATH.relative_to(WORKSPACE)) if not args.no_combined else None,
        "summary": summary,
        "parser_coverage": {
            "by_layout_family": coverage_by(trajectory_reports, "layout_family"),
            "by_agent": coverage_by(trajectory_reports, "agent"),
            "by_source_bucket": coverage_by(trajectory_reports, "source_bucket"),
            "by_category": coverage_by(trajectory_reports, "category"),
            "by_difficulty": coverage_by(trajectory_reports, "difficulty"),
        },
        "prefix_examples_per_trajectory_distribution": distribution([int(report.get("prefix_examples") or 0) for report in trajectory_reports]),
        "unsupported_zero_prefix_case_summary": {
            "unsupported": [report for report in trajectory_reports if report.get("layout_family") == "unsupported_layout"][:100],
            "zero_prefix": [report for report in trajectory_reports if int(report.get("prefix_examples") or 0) == 0][:100],
        },
        "remaining_blockers_for_modeling": [
            "Review verified quality gate before baseline modeling.",
            "Do not treat extraction QA as model performance.",
            "Unsupported layouts remain documented exclusions if present.",
        ],
        "trajectories": trajectory_reports,
        "parse_failures": failures,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    AUDIT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"Saved verified prefix audit: {AUDIT_JSON}")
    return 1 if not summary["raw_text_exclusion_status"] or not summary["no_future_leakage_guard_status"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
