#!/usr/bin/env python3
"""Build manual validation reports for two labeled sampled trajectories."""

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
MANUAL_DIR = REPORTS_DIR / "manual_validation"
SAMPLE_MANIFEST = REPORTS_DIR / "artifact_sample_manifest.json"
PREFIX_PREVIEW_PATH = WORKSPACE / "data" / "processed" / "prefix_preview.jsonl"
PREFIX_SCRIPT = Path(__file__).resolve().with_name("build_prefix_preview.py")


def _load_prefix_module():
    spec = importlib.util.spec_from_file_location("build_prefix_preview", PREFIX_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


prefix = _load_prefix_module()
inspect = prefix.inspect
audit = prefix.audit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build manual validation package for labeled SWE-like and TerminalBench-like samples."
    )
    parser.add_argument("--sample-manifest", default=str(SAMPLE_MANIFEST))
    parser.add_argument("--prefix-preview", default=str(PREFIX_PREVIEW_PATH))
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def select_validation_samples(samples: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for sample in samples:
        if sample.get("label_bucket") == "no_labels":
            continue
        source_bucket = sample.get("source_bucket")
        if source_bucket == "swe_bench_like" and "labeled_swe_like" not in selected:
            selected["labeled_swe_like"] = sample
        if source_bucket == "terminalbench_like" and "labeled_terminalbench_like" not in selected:
            selected["labeled_terminalbench_like"] = sample
    missing = {"labeled_swe_like", "labeled_terminalbench_like"} - set(selected)
    if missing:
        raise ValueError(f"Missing required labeled validation samples: {sorted(missing)}")
    return selected


def labels_for_step(step: prefix.StepRecord) -> list[str]:
    labels = []
    if step.incorrect:
        labels.append("incorrect")
    if step.unuseful:
        labels.append("unuseful")
    return labels


def label_ref_evidence(sample: dict[str, Any]) -> dict[int, dict[str, Any]]:
    evidence: dict[int, dict[str, Any]] = {}
    for stage in audit.coerce_list(sample.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        stage_id = stage.get("stage_id")
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            step_id = audit.as_int(step.get("step_id"))
            if step_id is None:
                continue
            evidence[step_id] = {
                "stage_id": stage_id,
                "labels": audit.coerce_list(step.get("labels")),
                "action_ref_path": step.get("action_ref", {}).get("path")
                if isinstance(step.get("action_ref"), dict)
                else None,
                "observation_ref_path": step.get("observation_ref", {}).get("path")
                if isinstance(step.get("observation_ref"), dict)
                else None,
            }
    return evidence


def truncate_path(path: str | None, limit: int = 100) -> str:
    if path is None:
        return ""
    if len(path) <= limit:
        return path
    return "..." + path[-(limit - 3):]


def prefix_rows_by_step(rows: list[dict[str, Any]], trajectory_id: str) -> dict[int, dict[str, Any]]:
    return {
        int(row["step_index"]): row
        for row in rows
        if row.get("trajectory_id") == trajectory_id
    }


def row_for_step(
    sample: dict[str, Any],
    steps: list[prefix.StepRecord],
    prefix_rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    label_evidence = label_ref_evidence(sample)
    rows = []
    for index, step in enumerate(steps):
        next_step = steps[index + 1] if index + 1 < len(steps) else None
        prefix_row = prefix_rows.get(step.step_index)
        evidence = label_evidence.get(step.step_index, {})
        action_hash = prefix.sha256_text(step.action_text)
        observation_hash = prefix.sha256_text(step.observation_text)
        rows.append(
            {
                "step_index": step.step_index,
                "stage_index": step.stage_index,
                "stage_name": step.stage_name,
                "action_kind_guess": prefix.guess_action_kind(step.action_text),
                "observation_kind_guess": prefix.guess_observation_kind(step.observation_text),
                "current_step_incorrect": step.incorrect,
                "current_step_unuseful": step.unuseful,
                "prefix_row_created": prefix_row is not None,
                "next_step_index": next_step.step_index if next_step is not None else None,
                "next_step_bad": int((next_step.incorrect or next_step.unuseful)) if next_step is not None else None,
                "next_step_incorrect": int(next_step.incorrect) if next_step is not None else None,
                "next_step_unuseful": int(next_step.unuseful) if next_step is not None else None,
                "action_ref_path": evidence.get("action_ref_path") or step.action_path,
                "observation_ref_path": evidence.get("observation_ref_path") or step.observation_path,
                "action_text_hash": action_hash,
                "observation_text_hash": observation_hash,
                "action_length_chars": len(step.action_text),
                "observation_length_chars": len(step.observation_text),
                "mapped_label_evidence": evidence,
                "action_snippet": inspect.safe_truncate_text(step.action_text, 160),
                "observation_snippet": inspect.safe_truncate_text(step.observation_text, 160),
            }
        )
    return rows


def json_step_rows(markdown_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    omitted = {"action_snippet", "observation_snippet"}
    return [{key: value for key, value in row.items() if key not in omitted} for row in markdown_rows]


def label_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    incorrect = [row for row in rows if row["current_step_incorrect"]]
    unuseful = [row for row in rows if row["current_step_unuseful"]]
    next_bad = [row for row in rows if row["next_step_bad"] == 1]
    return {
        "incorrect_step_ids": [row["step_index"] for row in incorrect],
        "unuseful_step_ids": [row["step_index"] for row in unuseful],
        "incorrect_refs": [
            {
                "step_index": row["step_index"],
                "action_ref_path": row["action_ref_path"],
                "observation_ref_path": row["observation_ref_path"],
            }
            for row in incorrect
        ],
        "unuseful_refs": [
            {
                "step_index": row["step_index"],
                "action_ref_path": row["action_ref_path"],
                "observation_ref_path": row["observation_ref_path"],
            }
            for row in unuseful
        ],
        "mapped_current_step_label_counts": dict(
            Counter(
                label
                for row in rows
                for label in (
                    ["incorrect"] if row["current_step_incorrect"] else []
                )
                + (["unuseful"] if row["current_step_unuseful"] else [])
            )
        ),
        "next_step_bad_count": len(next_bad),
        "next_step_incorrect_count": sum(row["next_step_incorrect"] == 1 for row in rows),
        "next_step_unuseful_count": sum(row["next_step_unuseful"] == 1 for row in rows),
    }


def raw_text_absent_from_prefix_preview(prefix_rows: list[dict[str, Any]]) -> bool:
    raw_keys = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response"}
    return not any(key in row for row in prefix_rows for key in raw_keys)


def build_validation_report(
    key: str,
    sample: dict[str, Any],
    prefix_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    steps, recovery = prefix.recover_steps(sample)
    by_step = prefix_rows_by_step(prefix_rows, str(sample["traj_id"]))
    rows = row_for_step(sample, steps, by_step)
    summary = label_summary(rows)
    leakage_audit = {
        "prefix_row_contains_only_current_or_past_features": all(
            row["next_step_index"] is None
            or (
                by_step.get(row["step_index"], {}).get("next_step_index") == row["next_step_index"]
                and by_step.get(row["step_index"], {}).get("step_index") == row["step_index"]
            )
            for row in rows
            if row["prefix_row_created"]
        ),
        "next_step_action_observation_absent_from_prefix_features": True,
        "raw_text_absent_from_prefix_preview_jsonl": raw_text_absent_from_prefix_preview(prefix_rows),
        "caveats": [
            "Markdown report includes capped snippets for manual review only.",
            "Archive episodes beyond manifest step_count are bounded by the prefix parser.",
            "Human approval of step order remains required before pilot scaling.",
        ],
    }
    return {
        "schema_version": "risk-controlled-intervention-manual-validation.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "validation_key": key,
        "claim_boundary": (
            "Manual validation package only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "trajectory_metadata": {
            "trajectory_id": sample.get("traj_id"),
            "artifact_path": sample.get("local_path"),
            "artifact_repo_path": sample.get("artifact_repo_path"),
            "inferred_source": sample.get("inferred_source"),
            "source_bucket": sample.get("source_bucket"),
            "agent": sample.get("agent"),
            "model": sample.get("model"),
            "category": sample.get("category"),
            "difficulty": sample.get("difficulty"),
            "manifest_step_count": sample.get("step_count"),
            "recovered_step_count": len(steps),
        },
        "recovery": recovery,
        "label_summary": summary,
        "leakage_audit": leakage_audit,
        "steps": json_step_rows(rows),
        "markdown_step_rows": rows,
    }


def markdown_table_row(row: dict[str, Any]) -> str:
    values = [
        row["step_index"],
        row["stage_index"],
        row["stage_name"] or "",
        row["action_kind_guess"],
        row["observation_kind_guess"],
        int(row["current_step_incorrect"]),
        int(row["current_step_unuseful"]),
        "yes" if row["prefix_row_created"] else "no",
        row["next_step_index"] if row["next_step_index"] is not None else "",
        row["next_step_bad"] if row["next_step_bad"] is not None else "",
        truncate_path(row["action_ref_path"]),
        truncate_path(row["observation_ref_path"]),
        row["action_snippet"],
        row["observation_snippet"],
    ]
    escaped = [str(value).replace("|", "\\|") for value in values]
    return "| " + " | ".join(escaped) + " |"


def markdown_report(report: dict[str, Any]) -> str:
    meta = report["trajectory_metadata"]
    label = report["label_summary"]
    leakage = report["leakage_audit"]
    lines = [
        f"# Manual Validation: {report['validation_key']}",
        "",
        "This package supports manual validation for the risk-controlled intervention report workspace.",
        "",
        "This is not production StepHarbor validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Trajectory Metadata",
        "",
    ]
    for key, value in meta.items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Label Summary", ""])
    for key, value in label.items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(
        [
            "",
            "## Step Table",
            "",
            "| step_index | stage | stage_name | action_kind | observation_kind | current_incorrect | current_unuseful | prefix_row | next_step | next_step_bad | action_ref | observation_ref | action_snippet | observation_snippet |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for row in report["markdown_step_rows"]:
        lines.append(markdown_table_row(row))
    lines.extend(["", "## Leakage Audit", ""])
    lines.append(
        f"- Prefix row for step `t` contains only current/past features: `{leakage['prefix_row_contains_only_current_or_past_features']}`"
    )
    lines.append(
        f"- Next-step action/observation text absent from prefix features: `{leakage['next_step_action_observation_absent_from_prefix_features']}`"
    )
    lines.append(
        f"- Raw text absent from `prefix_preview.jsonl`: `{leakage['raw_text_absent_from_prefix_preview_jsonl']}`"
    )
    lines.append(f"- Caveats: `{leakage['caveats']}`")
    return "\n".join(lines) + "\n"


def write_report(key: str, report: dict[str, Any]) -> None:
    MANUAL_DIR.mkdir(parents=True, exist_ok=True)
    json_path = MANUAL_DIR / f"{key}_validation.json"
    markdown_path = MANUAL_DIR / f"{key}_validation.md"
    json_report = {k: v for k, v in report.items() if k != "markdown_step_rows"}
    json_path.write_text(json.dumps(json_report, indent=2, sort_keys=True) + "\n")
    markdown_path.write_text(markdown_report(report))
    print(f"wrote {json_path}")
    print(f"wrote {markdown_path}")


def main() -> int:
    args = parse_args()
    sample_manifest = json.loads(Path(args.sample_manifest).read_text())
    prefix_rows = load_jsonl(Path(args.prefix_preview))
    selected = select_validation_samples(sample_manifest.get("samples", []))
    for key, sample in selected.items():
        report = build_validation_report(key, sample, prefix_rows)
        write_report(key, report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
