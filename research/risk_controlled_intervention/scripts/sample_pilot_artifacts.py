#!/usr/bin/env python3
"""Select and download a bounded stratified pilot artifact sample."""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ID = "NJU-LINK/CodeTraceBench"
WORKSPACE = Path(__file__).resolve().parents[1]
PILOT_DIR = WORKSPACE / "data" / "pilot_artifacts"
REPORTS_DIR = WORKSPACE / "reports"
SAMPLE_SCRIPT = Path(__file__).resolve().with_name("sample_artifacts.py")


def _load_sample_module():
    spec = importlib.util.spec_from_file_location("sample_artifacts", SAMPLE_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


sample = _load_sample_module()
audit = sample.audit


@dataclass(frozen=True)
class PilotCandidate:
    row: dict[str, Any]
    split: str
    row_index: int
    label_bucket: str
    source_bucket: str
    artifact_path: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Select and download a deterministic stratified pilot sample from the verified manifest."
    )
    parser.add_argument(
        "--max-trajectories",
        type=int,
        default=50,
        help="Maximum verified trajectories to select.",
    )
    parser.add_argument("--seed", type=int, default=20250617, help="Deterministic sampling seed.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing local pilot artifacts.")
    return parser.parse_args()


def fail_setup(message: str) -> None:
    setup = (
        "\nSetup instructions:\n"
        "  python3 -m venv research/risk_controlled_intervention/.venv\n"
        "  research/risk_controlled_intervention/.venv/bin/python -m pip install huggingface_hub\n"
        "\nThis script does not use mock data and downloads only selected pilot artifacts."
    )
    raise SystemExit(f"ERROR: {message}{setup}")


def import_huggingface_hub():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        fail_setup("Missing dependency: huggingface_hub.")
    return hf_hub_download


def length_bucket(step_count: Any) -> str:
    parsed = audit.as_int(step_count)
    if parsed is None:
        return "unknown"
    if parsed <= 15:
        return "short"
    if parsed <= 50:
        return "medium"
    return "long"


def label_presence(label_bucket: str) -> str:
    return "unlabeled" if label_bucket == "no_labels" else "labeled"


def pilot_candidate_from_row(row: dict[str, Any], row_index: int) -> tuple[PilotCandidate | None, dict[str, Any] | None]:
    try:
        artifact_path = sample.resolve_artifact_repo_path(row)
    except ValueError as exc:
        return None, {
            "split": "verified",
            "row_index": row_index,
            "traj_id": row.get("traj_id"),
            "reason": str(exc),
        }
    label_bucket = sample.label_bucket_for_row(row)
    source_bucket = sample.source_bucket_for_row(row)
    return (
        PilotCandidate(
            row=row,
            split="verified",
            row_index=row_index,
            label_bucket=label_bucket,
            source_bucket=source_bucket,
            artifact_path=artifact_path,
        ),
        None,
    )


def load_verified_candidates() -> tuple[list[PilotCandidate], list[dict[str, Any]]]:
    manifest_paths = audit.discover_cached_manifests(["verified"])
    if not manifest_paths:
        raise SystemExit(
            "ERROR: Cached verified manifest not found. Run scripts/download_manifests.py --split verified first."
        )
    rows = audit.load_manifest(manifest_paths[0])
    candidates: list[PilotCandidate] = []
    unresolved: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows):
        candidate, error = pilot_candidate_from_row(row, row_index)
        if candidate is None:
            assert error is not None
            unresolved.append(error)
        else:
            candidates.append(candidate)
    return candidates, unresolved


def stratification_key(candidate: PilotCandidate) -> tuple[str, str, str, str, str, str]:
    return (
        label_presence(candidate.label_bucket),
        candidate.source_bucket,
        str(candidate.row.get("category") or "unknown"),
        str(candidate.row.get("difficulty") or "unknown"),
        length_bucket(candidate.row.get("step_count")),
        str(candidate.row.get("agent") or "unknown"),
    )


def diversity_signature(candidate: PilotCandidate) -> tuple[str, str, str, str, str, str, str]:
    return (
        label_presence(candidate.label_bucket),
        candidate.source_bucket,
        str(candidate.row.get("category") or ""),
        str(candidate.row.get("difficulty") or ""),
        length_bucket(candidate.row.get("step_count")),
        str(candidate.row.get("agent") or ""),
        str(candidate.row.get("model") or ""),
    )


def deterministic_stratified_select(
    candidates: Iterable[PilotCandidate],
    max_trajectories: int,
    seed: int,
) -> list[PilotCandidate]:
    if max_trajectories <= 0:
        raise ValueError("--max-trajectories must be positive.")
    ordered_candidates = sorted(candidates, key=lambda item: (item.artifact_path, str(item.row.get("traj_id") or "")))
    groups: dict[tuple[str, str, str, str, str, str], list[PilotCandidate]] = defaultdict(list)
    for candidate in ordered_candidates:
        groups[stratification_key(candidate)].append(candidate)

    rng = random.Random(seed)
    for group in groups.values():
        rng.shuffle(group)

    group_keys = sorted(groups)
    rng.shuffle(group_keys)
    selected: list[PilotCandidate] = []
    selected_paths: set[str] = set()
    selected_signatures: set[tuple[str, str, str, str, str, str, str]] = set()

    # Coverage pass: take one item from as many distinct strata as the budget allows.
    for key in group_keys:
        if len(selected) >= max_trajectories:
            break
        for candidate in groups[key]:
            signature = diversity_signature(candidate)
            if candidate.artifact_path not in selected_paths and signature not in selected_signatures:
                selected.append(candidate)
                selected_paths.add(candidate.artifact_path)
                selected_signatures.add(signature)
                break

    # Fill pass: round-robin remaining candidates across strata.
    made_progress = True
    while len(selected) < max_trajectories and made_progress:
        made_progress = False
        for key in group_keys:
            if len(selected) >= max_trajectories:
                break
            while groups[key]:
                candidate = groups[key].pop(0)
                if candidate.artifact_path in selected_paths:
                    continue
                selected.append(candidate)
                selected_paths.add(candidate.artifact_path)
                made_progress = True
                break
    return selected


def local_artifact_path(repo_path: str) -> Path:
    return PILOT_DIR / Path(repo_path).name


def copy_downloaded_file(downloaded_path: str, destination: Path, force: bool) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not force:
        print(f"cached: {destination}")
        return False
    shutil.copy2(downloaded_path, destination)
    print(f"wrote: {destination}")
    return True


def pilot_record(candidate: PilotCandidate, local_path: Path, downloaded: bool) -> dict[str, Any]:
    counts = audit.count_label_ids(candidate.row)
    source, source_heuristic = audit.infer_source_value(candidate.row)
    return {
        "traj_id": candidate.row.get("traj_id"),
        "task_name": candidate.row.get("task_name"),
        "task_slug": candidate.row.get("task_slug"),
        "split": candidate.split,
        "manifest_row_index": candidate.row_index,
        "artifact_repo_path": candidate.artifact_path,
        "local_path": str(local_path.relative_to(WORKSPACE)),
        "downloaded_this_run": downloaded,
        "label_bucket": candidate.label_bucket,
        "label_presence": label_presence(candidate.label_bucket),
        "source_bucket": candidate.source_bucket,
        "inferred_source": source,
        "source_heuristic": source_heuristic,
        "agent": candidate.row.get("agent"),
        "model": candidate.row.get("model"),
        "category": candidate.row.get("category"),
        "difficulty": candidate.row.get("difficulty"),
        "step_count": candidate.row.get("step_count"),
        "length_bucket": length_bucket(candidate.row.get("step_count")),
        "stage_count": candidate.row.get("stage_count"),
        "stages": candidate.row.get("stages"),
        "label_counts": counts,
        "manifest_fields": {
            "source_relpath": candidate.row.get("source_relpath"),
            "annotation_relpath": candidate.row.get("annotation_relpath"),
            "artifact_path": candidate.row.get("artifact_path"),
        },
        "incorrect_stages": candidate.row.get("incorrect_stages"),
    }


def summarize_selection(selected: list[PilotCandidate]) -> dict[str, Any]:
    return {
        "count": len(selected),
        "label_presence": dict(Counter(label_presence(candidate.label_bucket) for candidate in selected)),
        "label_buckets": dict(Counter(candidate.label_bucket for candidate in selected)),
        "source_buckets": dict(Counter(candidate.source_bucket for candidate in selected)),
        "length_buckets": dict(Counter(length_bucket(candidate.row.get("step_count")) for candidate in selected)),
        "agents": dict(Counter(str(candidate.row.get("agent")) for candidate in selected)),
        "models": dict(Counter(str(candidate.row.get("model")) for candidate in selected)),
        "categories": dict(Counter(str(candidate.row.get("category")) for candidate in selected)),
        "difficulties": dict(Counter(str(candidate.row.get("difficulty")) for candidate in selected)),
        "step_count": audit.distribution_summary(
            value for value in (audit.as_int(candidate.row.get("step_count")) for candidate in selected) if value is not None
        ),
    }


def main() -> int:
    args = parse_args()
    hf_hub_download = import_huggingface_hub()
    candidates, unresolved = load_verified_candidates()
    selected = deterministic_stratified_select(candidates, args.max_trajectories, args.seed)
    if not selected:
        raise SystemExit("ERROR: No pilot artifact candidates could be selected from verified manifest rows.")
    if unresolved:
        print(f"warning: skipped {len(unresolved)} verified rows with unresolved artifact_path values", file=sys.stderr)

    records = []
    download_failures = []
    for candidate in selected:
        destination = local_artifact_path(candidate.artifact_path)
        try:
            downloaded_path = hf_hub_download(
                repo_id=REPO_ID,
                repo_type="dataset",
                filename=candidate.artifact_path,
            )
            downloaded = copy_downloaded_file(downloaded_path, destination, args.force)
            records.append(pilot_record(candidate, destination, downloaded))
        except Exception as exc:  # pragma: no cover - depends on local HF setup.
            download_failures.append(
                {
                    "traj_id": candidate.row.get("traj_id"),
                    "artifact_repo_path": candidate.artifact_path,
                    "reason": str(exc),
                }
            )
    if download_failures:
        fail_setup(f"Could not download {len(download_failures)} selected pilot artifacts. First failure: {download_failures[0]}")

    report = {
        "schema_version": "risk-controlled-intervention-pilot-artifact-sample.v1",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": REPO_ID,
        "claim_boundary": (
            "Batch 3 bounded pilot artifact sampling only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection_policy": {
            "split_source": "verified",
            "max_trajectories": args.max_trajectories,
            "seed": args.seed,
            "rules": [
                "deterministic round-robin over label/source/category/difficulty/length/agent strata",
                "prefer coverage of labeled and unlabeled trajectories when present",
                "prefer coverage of SWE-like and TerminalBench-like inferred sources when present",
                "download only selected artifact_path files",
            ],
        },
        "summary": summarize_selection(selected),
        "artifacts": {
            "selected": len(selected),
            "downloaded_or_cached": len(records),
            "downloaded_this_run": sum(1 for record in records if record["downloaded_this_run"]),
        },
        "unresolved_artifact_path_rows": {
            "count": len(unresolved),
            "examples": unresolved[:20],
        },
        "samples": records,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / "pilot_artifact_manifest.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    print(f"Saved pilot artifact manifest: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
