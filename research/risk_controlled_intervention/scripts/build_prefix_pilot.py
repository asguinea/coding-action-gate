#!/usr/bin/env python3
"""Build leakage-safe prefix examples for the bounded pilot artifact sample."""

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
REPORTS_DIR = WORKSPACE / "reports"
PROCESSED_DIR = WORKSPACE / "data" / "processed"
PILOT_MANIFEST = REPORTS_DIR / "pilot_artifact_manifest.json"
PREFIX_PILOT_PATH = PROCESSED_DIR / "prefix_pilot.jsonl"
AUDIT_REPORT_PATH = REPORTS_DIR / "prefix_pilot_audit.json"
AUDIT_MARKDOWN_PATH = REPORTS_DIR / "prefix_pilot_audit.md"
PREFIX_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")


def _load_prefix_module():
    spec = importlib.util.spec_from_file_location("prefix_parsing", PREFIX_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


prefix = _load_prefix_module()
audit = prefix.audit
inspect = prefix.inspect


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build pilot prefix examples from sampled pilot artifacts.")
    parser.add_argument(
        "--pilot-manifest",
        default=str(PILOT_MANIFEST),
        help="Path to reports/pilot_artifact_manifest.json.",
    )
    return parser.parse_args()


def pct(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return float(numerator) / float(denominator) * 100.0


def counter_for(examples: list[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(Counter(str(example.get(key)) for example in examples))


def counter_for_samples(samples: list[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(Counter(str(sample.get(key)) for sample in samples))


def distribution(values: list[int]) -> dict[str, Any]:
    return audit.distribution_summary(values)


def sample_artifact_exists(sample: dict[str, Any]) -> bool:
    local_path = sample.get("local_path")
    return isinstance(local_path, str) and (WORKSPACE / local_path).exists()


def build_for_samples(samples: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    all_examples: list[dict[str, Any]] = []
    trajectory_reports: list[dict[str, Any]] = []
    parse_failures: list[dict[str, Any]] = []
    truncated_examples: list[dict[str, Any]] = []
    for sample in samples:
        if not sample_artifact_exists(sample):
            parse_failures.append(
                {
                    "trajectory_id": sample.get("traj_id"),
                    "artifact_path": sample.get("local_path"),
                    "reason": "local artifact file missing",
                }
            )
            continue
        try:
            steps, recovery = prefix.recover_steps(sample)
            examples = prefix.build_prefix_examples(sample, steps)
        except Exception as exc:
            parse_failures.append(
                {
                    "trajectory_id": sample.get("traj_id"),
                    "artifact_path": sample.get("local_path"),
                    "reason": str(exc),
                }
            )
            continue

        validation_failures = prefix.validate_positive_targets_traceable(examples, steps)
        raw_text_failures = [example for example in examples if not prefix.validate_no_raw_text(example)]
        leakage_failures = [example for example in examples if not prefix.validate_no_future_leakage(example)]
        mapped_label_count = sum(1 for step in steps if step.incorrect or step.unuseful)
        label_count = int(recovery.get("label_count") or 0)
        trajectory_reports.append(
            {
                "trajectory_id": sample.get("traj_id"),
                "artifact_path": sample.get("local_path"),
                "source_bucket": sample.get("source_bucket"),
                "difficulty": sample.get("difficulty"),
                "category": sample.get("category"),
                "agent": sample.get("agent"),
                "model": sample.get("model"),
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
                "raw_text_failure_count": len(raw_text_failures),
                "leakage_failure_count": len(leakage_failures),
                **recovery,
            }
        )
        all_examples.extend(examples)
        if steps:
            truncated_examples.append(
                {
                    "trajectory_id": sample.get("traj_id"),
                    "step_index": steps[0].step_index,
                    "action_preview": inspect.safe_truncate_text(steps[0].action_text, 160),
                    "observation_preview": inspect.safe_truncate_text(steps[0].observation_text, 160),
                }
            )
    return all_examples, trajectory_reports, parse_failures, truncated_examples


def summarize(
    manifest: dict[str, Any],
    samples: list[dict[str, Any]],
    examples: list[dict[str, Any]],
    trajectory_reports: list[dict[str, Any]],
    parse_failures: list[dict[str, Any]],
) -> dict[str, Any]:
    selected_count = int(manifest.get("artifacts", {}).get("selected") or len(samples))
    downloaded_count = int(manifest.get("artifacts", {}).get("downloaded_or_cached") or len(samples))
    label_count = sum(int(report.get("label_count") or 0) for report in trajectory_reports)
    mapped_label_count = sum(int(report.get("mapped_label_count") or 0) for report in trajectory_reports)
    positive_count = sum(int(example["next_step_bad"]) for example in examples)
    trajectories_with_prefix = sum(1 for report in trajectory_reports if int(report.get("prefix_examples") or 0) > 0)
    corrupted_or_unreadable = sum(
        1
        for failure in parse_failures
        if "Unsupported sampled artifact format" in str(failure.get("reason"))
        or "tar:" in str(failure.get("reason"))
        or "Unsupported" in str(failure.get("reason"))
    )
    return {
        "selected_manifest_rows": selected_count,
        "artifacts_successfully_downloaded": downloaded_count,
        "artifacts_successfully_listed": len(trajectory_reports),
        "artifacts_parsed": len(trajectory_reports),
        "artifacts_parsed_with_prefix_examples": trajectories_with_prefix,
        "trajectories_parsed": len(trajectory_reports),
        "trajectories_with_prefix_examples": trajectories_with_prefix,
        "zero_prefix_trajectories": len(trajectory_reports) - trajectories_with_prefix,
        "unsupported_layouts": sum(1 for report in trajectory_reports if report.get("layout_family") == "unsupported_layout"),
        "corrupted_or_unreadable_archives": corrupted_or_unreadable,
        "ordered_steps_recovered": sum(int(report["ordered_steps_recovered"]) for report in trajectory_reports),
        "prefix_examples_created": len(examples),
        "next_step_bad_positives": positive_count,
        "next_step_bad_positive_percent": pct(positive_count, len(examples)),
        "next_step_incorrect_positives": sum(int(example["next_step_incorrect"]) for example in examples),
        "next_step_unuseful_positives": sum(int(example["next_step_unuseful"]) for example in examples),
        "current_step_bad_positives": sum(int(example["current_step_bad"]) for example in examples),
        "malformed_or_unmapped_step_parts": sum(
            int(report.get("malformed_or_unmapped_step_parts") or 0) for report in trajectory_reports
        ),
        "missing_artifact_path_rows": int(manifest.get("unresolved_artifact_path_rows", {}).get("count") or 0),
        "parse_failures": len(parse_failures),
        "label_mapping_success_rate": mapped_label_count / label_count if label_count else 1.0,
        "label_mapping_success_percent": pct(mapped_label_count, label_count),
        "raw_text_excluded_from_jsonl": all(prefix.validate_no_raw_text(example) for example in examples),
        "no_future_leakage_guard_passed": all(prefix.validate_no_future_leakage(example) for example in examples),
        "positive_targets_traceable": all(not report.get("validation_failures") for report in trajectory_reports),
    }


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


def audit_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Prefix Pilot Audit",
        "",
        "Bounded pilot extraction over selected verified CodeTraceBench artifacts.",
        "",
        "This is extraction and evaluation scaffolding only. It is not production StepHarbor validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Summary",
        "",
    ]
    for key, value in summary.items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Distributions", ""])
    for key in ("source", "difficulty", "category", "agent", "model"):
        lines.append(f"- `{key}`: `{report['distributions'][key]}`")
    lines.extend(["", "## Prefix Examples Per Trajectory", ""])
    for key, value in report["prefix_examples_per_trajectory"].items():
        lines.append(f"- `{key}`: `{value}`")
    if report["parse_failures"]:
        lines.extend(["", "## Parse Failures", ""])
        for failure in report["parse_failures"][:20]:
            lines.append(f"- `{failure.get('trajectory_id')}`: {failure.get('reason')}")
    lines.extend(["", "## Parser Coverage", ""])
    for key, value in report["parser_coverage"].items():
        lines.append(f"- `{key}`: `{value}`")
    if report["remaining_blockers_for_full_verified_extraction"]:
        lines.extend(["", "## Remaining Blockers", ""])
        for blocker in report["remaining_blockers_for_full_verified_extraction"]:
            lines.append(f"- {blocker}")
    lines.extend(["", "## Truncated Human Examples", ""])
    for example in report.get("truncated_human_examples", [])[:5]:
        lines.append(f"### {example['trajectory_id']} step {example['step_index']}")
        lines.append("")
        lines.append(f"- Action preview: `{example['action_preview']}`")
        lines.append(f"- Observation preview: `{example['observation_preview']}`")
        lines.append("")
    lines.extend(
        [
            "## Privacy And Leakage",
            "",
            "`data/processed/prefix_pilot.jsonl` excludes full raw action, observation, prompt, response, content, and code text. It stores structured metadata, hashes, lengths, keyword counts, coarse kind guesses, and labels.",
            "",
            "The no-future-leakage guard checks that every prefix row predicts a strictly later `next_step_index` and that positive targets map to recovered labeled steps.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    pilot_manifest_path = Path(args.pilot_manifest)
    if not pilot_manifest_path.exists():
        raise SystemExit(f"ERROR: Pilot artifact manifest not found: {pilot_manifest_path}")
    manifest = json.loads(pilot_manifest_path.read_text())
    samples = list(manifest.get("samples", []))
    examples, trajectory_reports, parse_failures, truncated_examples = build_for_samples(samples)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PREFIX_PILOT_PATH.write_text("".join(json.dumps(example, sort_keys=True) + "\n" for example in examples))

    summary = summarize(manifest, samples, examples, trajectory_reports, parse_failures)
    report = {
        "schema_version": "risk-controlled-intervention-prefix-pilot.v2",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": "NJU-LINK/CodeTraceBench",
        "claim_boundary": (
            "Batch 4 hardened bounded pilot extraction only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "processed_path": str(PREFIX_PILOT_PATH.relative_to(WORKSPACE)),
        "pilot_manifest_path": str(pilot_manifest_path.relative_to(WORKSPACE)),
        "summary": summary,
        "distributions": {
            "source": counter_for_samples(samples, "source_bucket"),
            "difficulty": counter_for_samples(samples, "difficulty"),
            "category": counter_for_samples(samples, "category"),
            "agent": counter_for_samples(samples, "agent"),
            "model": counter_for_samples(samples, "model"),
        },
        "target_distribution": dict(Counter(str(example["next_step_bad"]) for example in examples)),
        "prefix_examples_per_trajectory": distribution([int(report["prefix_examples"]) for report in trajectory_reports]),
        "parser_coverage": {
            "by_layout_family": coverage_by(trajectory_reports, "layout_family"),
            "by_agent": coverage_by(trajectory_reports, "agent"),
            "by_inferred_source": coverage_by(trajectory_reports, "source_bucket"),
            "by_category": coverage_by(trajectory_reports, "category"),
            "by_difficulty": coverage_by(trajectory_reports, "difficulty"),
        },
        "parser_documentation": prefix.parser_documentation(),
        "remaining_blockers_for_full_verified_extraction": [
            "Manually inspect any parse failures or unreadable archives.",
            "Review zero-prefix causes before full verified extraction.",
            "Source inference remains heuristic.",
        ],
        "trajectories": trajectory_reports,
        "parse_failures": parse_failures,
        "truncated_human_examples": truncated_examples[:5],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    AUDIT_MARKDOWN_PATH.write_text(audit_markdown(report) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"Saved pilot prefix JSONL: {PREFIX_PILOT_PATH}")
    print(f"Saved JSON audit: {AUDIT_REPORT_PATH}")
    print(f"Saved markdown audit: {AUDIT_MARKDOWN_PATH}")
    should_fail = not summary["raw_text_excluded_from_jsonl"] or not summary["no_future_leakage_guard_passed"]
    return 1 if should_fail else 0


if __name__ == "__main__":
    sys.exit(main())
