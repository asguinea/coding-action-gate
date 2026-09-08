#!/usr/bin/env python3
"""Sample a small set of CodeTraceBench artifacts for Batch 1 inspection."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ID = "NJU-LINK/CodeTraceBench"
WORKSPACE = Path(__file__).resolve().parents[1]
RAW_DIR = WORKSPACE / "data" / "raw"
SAMPLE_DIR = WORKSPACE / "data" / "artifact_samples"
REPORTS_DIR = WORKSPACE / "reports"
AUDIT_SCRIPT = Path(__file__).resolve().with_name("audit_codetracebench.py")


def _load_audit_module():
    spec = importlib.util.spec_from_file_location("audit_codetracebench", AUDIT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = _load_audit_module()


@dataclass(frozen=True)
class SampleCandidate:
    row: dict[str, Any]
    split: str
    manifest_path: Path
    label_bucket: str
    source_bucket: str
    artifact_path: str
    score: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Select and download a small representative CodeTraceBench artifact sample."
    )
    parser.add_argument(
        "--split",
        choices=("verified", "full", "both"),
        default="both",
        help="Cached manifest split to sample from.",
    )
    parser.add_argument(
        "--max-artifacts",
        type=int,
        default=4,
        help="Maximum artifacts to download.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing sampled artifact files.",
    )
    return parser.parse_args()


def fail_setup(message: str) -> None:
    setup = (
        "\nSetup instructions:\n"
        "  python3 -m venv research/risk_controlled_intervention/.venv\n"
        "  research/risk_controlled_intervention/.venv/bin/python -m pip install huggingface_hub\n"
        "\nThis script does not use mock data and downloads only selected sample artifacts."
    )
    raise SystemExit(f"ERROR: {message}{setup}")


def import_huggingface_hub():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        fail_setup("Missing dependency: huggingface_hub.")
    return hf_hub_download


def requested_splits(split: str) -> list[str]:
    return ["verified", "full"] if split == "both" else [split]


def resolve_artifact_repo_path(row: dict[str, Any]) -> str:
    artifact_path = row.get("artifact_path")
    if not isinstance(artifact_path, str) or artifact_path.strip() == "":
        raise ValueError("Manifest row is missing a non-empty artifact_path.")
    normalized = artifact_path.strip().replace("\\", "/")
    if normalized.startswith("/") or ".." in Path(normalized).parts:
        raise ValueError(f"Unsafe artifact_path: {artifact_path}")
    return normalized


def source_bucket_for_row(row: dict[str, Any]) -> str:
    source, _heuristic = audit.infer_source_value(row)
    combined = " ".join(
        str(row.get(column, ""))
        for column in ("source_relpath", "annotation_relpath", "artifact_path", "agent")
    ).lower()
    if source is not None and "swe" in source.lower() or "swe" in combined:
        return "swe_bench_like"
    if (
        source is not None and "terminus" in source.lower()
    ) or "terminus" in combined or "terminal" in combined:
        return "terminalbench_like"
    if source is not None:
        return str(source)
    return "unknown"


def label_bucket_for_row(row: dict[str, Any]) -> str:
    counts = audit.count_label_ids(row)
    if counts["incorrect_or_unuseful_count"]:
        if counts["has_incorrect"] and counts["has_unuseful"]:
            return "incorrect_and_unuseful"
        if counts["has_incorrect"]:
            return "incorrect"
        return "unuseful"
    return "no_labels"


def row_score(row: dict[str, Any]) -> int:
    score = 0
    counts = audit.count_label_ids(row)
    if counts["incorrect_or_unuseful_count"]:
        score += 20
    if counts["has_unuseful"]:
        score += 5
    if source_bucket_for_row(row) in {"swe_bench_like", "terminalbench_like"}:
        score += 8
    if row.get("difficulty") in {"easy", "medium", "hard"}:
        score += 2
    if row.get("category"):
        score += 2
    if row.get("agent"):
        score += 1
    if row.get("model"):
        score += 1
    return score


def load_candidates(splits: list[str]) -> tuple[list[SampleCandidate], list[dict[str, Any]]]:
    manifest_paths = audit.discover_cached_manifests(splits)
    candidates: list[SampleCandidate] = []
    unresolved: list[dict[str, Any]] = []
    for manifest_path, split in zip(manifest_paths, splits):
        rows = audit.load_manifest(manifest_path)
        for row_index, row in enumerate(rows):
            try:
                artifact_path = resolve_artifact_repo_path(row)
            except ValueError as exc:
                unresolved.append(
                    {
                        "split": split,
                        "manifest_path": str(manifest_path),
                        "row_index": row_index,
                        "traj_id": row.get("traj_id"),
                        "reason": str(exc),
                    }
                )
                continue
            candidates.append(
                SampleCandidate(
                    row=row,
                    split=split,
                    manifest_path=manifest_path,
                    label_bucket=label_bucket_for_row(row),
                    source_bucket=source_bucket_for_row(row),
                    artifact_path=artifact_path,
                    score=row_score(row),
                )
            )
    return candidates, unresolved


def diversity_signature(candidate: SampleCandidate) -> tuple[str, str, str, str, str]:
    return (
        candidate.label_bucket,
        candidate.source_bucket,
        str(candidate.row.get("agent", "")),
        str(candidate.row.get("model", "")),
        str(candidate.row.get("category", "")),
    )


def choose_first_matching(
    candidates: list[SampleCandidate],
    selected: list[SampleCandidate],
    predicate,
) -> SampleCandidate | None:
    selected_paths = {candidate.artifact_path for candidate in selected}
    selected_signatures = {diversity_signature(candidate) for candidate in selected}
    for candidate in candidates:
        if candidate.artifact_path in selected_paths:
            continue
        if not predicate(candidate):
            continue
        if diversity_signature(candidate) not in selected_signatures:
            return candidate
    for candidate in candidates:
        if candidate.artifact_path not in selected_paths and predicate(candidate):
            return candidate
    return None


def select_representative_sample(
    candidates: list[SampleCandidate],
    max_artifacts: int,
) -> list[SampleCandidate]:
    if max_artifacts <= 0:
        raise ValueError("--max-artifacts must be positive.")
    ordered = sorted(candidates, key=lambda candidate: (-candidate.score, candidate.artifact_path))
    selected: list[SampleCandidate] = []
    predicates = [
        lambda c: c.label_bucket != "no_labels" and c.source_bucket == "swe_bench_like",
        lambda c: c.label_bucket != "no_labels" and c.source_bucket == "terminalbench_like",
        lambda c: c.label_bucket == "no_labels" and c.source_bucket == "swe_bench_like",
        lambda c: c.label_bucket == "no_labels" and c.source_bucket == "terminalbench_like",
        lambda c: c.label_bucket != "no_labels",
        lambda c: c.label_bucket == "no_labels",
    ]
    for predicate in predicates:
        if len(selected) >= max_artifacts:
            break
        match = choose_first_matching(ordered, selected, predicate)
        if match is not None:
            selected.append(match)

    selected_paths = {candidate.artifact_path for candidate in selected}
    for candidate in ordered:
        if len(selected) >= max_artifacts:
            break
        if candidate.artifact_path not in selected_paths:
            selected.append(candidate)
            selected_paths.add(candidate.artifact_path)
    return selected


def local_artifact_path(repo_path: str) -> Path:
    return SAMPLE_DIR / Path(repo_path).name


def copy_downloaded_file(downloaded_path: str, destination: Path, force: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not force:
        print(f"cached: {destination}")
        return
    shutil.copy2(downloaded_path, destination)
    print(f"wrote: {destination}")


def sample_record(candidate: SampleCandidate, local_path: Path) -> dict[str, Any]:
    counts = audit.count_label_ids(candidate.row)
    source, source_heuristic = audit.infer_source_value(candidate.row)
    return {
        "traj_id": candidate.row.get("traj_id"),
        "task_name": candidate.row.get("task_name"),
        "split": candidate.split,
        "artifact_repo_path": candidate.artifact_path,
        "local_path": str(local_path.relative_to(WORKSPACE)),
        "label_bucket": candidate.label_bucket,
        "source_bucket": candidate.source_bucket,
        "inferred_source": source,
        "source_heuristic": source_heuristic,
        "agent": candidate.row.get("agent"),
        "model": candidate.row.get("model"),
        "category": candidate.row.get("category"),
        "difficulty": candidate.row.get("difficulty"),
        "step_count": candidate.row.get("step_count"),
        "stage_count": candidate.row.get("stage_count"),
        "stages": candidate.row.get("stages"),
        "label_counts": counts,
        "manifest_fields": {
            "source_relpath": candidate.row.get("source_relpath"),
            "annotation_relpath": candidate.row.get("annotation_relpath"),
            "artifact_path": candidate.row.get("artifact_path"),
        },
        "incorrect_stages": audit.truncate_value(candidate.row.get("incorrect_stages"), 240),
    }


def summarize_selection(selected: list[SampleCandidate]) -> dict[str, Any]:
    return {
        "count": len(selected),
        "label_buckets": dict(Counter(candidate.label_bucket for candidate in selected)),
        "source_buckets": dict(Counter(candidate.source_bucket for candidate in selected)),
        "agents": dict(Counter(str(candidate.row.get("agent")) for candidate in selected)),
        "models": dict(Counter(str(candidate.row.get("model")) for candidate in selected)),
        "categories": dict(Counter(str(candidate.row.get("category")) for candidate in selected)),
        "difficulties": dict(Counter(str(candidate.row.get("difficulty")) for candidate in selected)),
    }


def main() -> int:
    args = parse_args()
    hf_hub_download = import_huggingface_hub()
    splits = requested_splits(args.split)
    candidates, unresolved = load_candidates(splits)
    selected = select_representative_sample(candidates, args.max_artifacts)
    if not selected:
        raise SystemExit(
            "ERROR: No artifact sample candidates could be selected from rows with resolved artifact_path values."
        )
    if unresolved:
        print(
            f"warning: skipped {len(unresolved)} manifest rows with unresolved artifact_path values",
            file=sys.stderr,
        )

    records = []
    for candidate in selected:
        try:
            downloaded = hf_hub_download(
                repo_id=REPO_ID,
                repo_type="dataset",
                filename=candidate.artifact_path,
            )
        except Exception as exc:  # pragma: no cover - depends on local HF setup.
            fail_setup(f"Could not download sampled artifact {candidate.artifact_path}: {exc}")
        destination = local_artifact_path(candidate.artifact_path)
        copy_downloaded_file(downloaded, destination, args.force)
        records.append(sample_record(candidate, destination))

    report = {
        "schema_version": "risk-controlled-intervention-artifact-sample.v1",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": REPO_ID,
        "claim_boundary": (
            "Batch 1 artifact sampling only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection_policy": {
            "max_artifacts": args.max_artifacts,
            "split": args.split,
            "criteria": [
                "include labeled and unlabeled trajectories when possible",
                "include SWE-bench-like and TerminalBench-like inferred sources when possible",
                "diversify agent, model, category, and difficulty when possible",
                "download only selected artifact_path files",
            ],
        },
        "summary": summarize_selection(selected),
        "unresolved_artifact_path_rows": {
            "count": len(unresolved),
            "examples": unresolved[:20],
        },
        "samples": records,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / "artifact_sample_manifest.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, indent=2, sort_keys=True))
    print(f"\nSaved artifact sample manifest: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
