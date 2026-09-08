#!/usr/bin/env python3
"""Download/cache CodeTraceBench verified-split artifacts only."""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ID = "NJU-LINK/CodeTraceBench"
WORKSPACE = Path(__file__).resolve().parents[1]
DATASET_REVISION = json.loads((WORKSPACE / "data-source.json").read_text())["revision"]
RAW_DIR = WORKSPACE / "data" / "raw"
VERIFIED_DIR = WORKSPACE / "data" / "verified_artifacts"
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "verified_artifact_download_manifest.json"
REPORT_MD = REPORTS_DIR / "verified_artifact_download_manifest.md"
SAMPLE_PILOT_SCRIPT = Path(__file__).resolve().with_name("sample_pilot_artifacts.py")


def _load_sample_pilot():
    spec = importlib.util.spec_from_file_location("sample_pilot_artifacts", SAMPLE_PILOT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pilot = _load_sample_pilot()
sample = pilot.sample
audit = pilot.audit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download/cache verified CodeTraceBench artifacts.")
    parser.add_argument("--limit", type=int, default=None, help="Optional debug limit. Omit for full verified split.")
    parser.add_argument("--seed", type=int, default=20250617, help="Seed used only when --limit samples rows.")
    parser.add_argument("--force", action="store_true", help="Redownload and overwrite existing local artifacts.")
    parser.add_argument("--manifest-only", action="store_true", help="Plan and report downloads without downloading files.")
    return parser.parse_args()


def fail_setup(message: str) -> None:
    setup = (
        "\nSetup instructions:\n"
        "  python3 -m venv research/risk_controlled_intervention/.venv\n"
        "  research/risk_controlled_intervention/.venv/bin/python -m pip install huggingface_hub\n"
        "\nThis script does not use mock data and downloads only verified artifact_path files."
    )
    raise SystemExit(f"ERROR: {message}{setup}")


def import_huggingface_hub():
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        fail_setup("Missing dependency: huggingface_hub.")
    return hf_hub_download


def load_verified_rows() -> list[dict[str, Any]]:
    path = RAW_DIR / "bench_manifest.verified.jsonl"
    if not path.exists():
        raise SystemExit("ERROR: cached verified manifest not found. Run download_manifests.py --split verified first.")
    return audit.load_manifest(path)


def local_artifact_path(repo_path: str) -> Path:
    return VERIFIED_DIR / Path(repo_path).name


def candidate_record(row: dict[str, Any], row_index: int) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    try:
        artifact_repo_path = sample.resolve_artifact_repo_path(row)
    except ValueError as exc:
        return None, {"row_index": row_index, "traj_id": row.get("traj_id"), "reason": str(exc)}
    label_bucket = sample.label_bucket_for_row(row)
    source_bucket = sample.source_bucket_for_row(row)
    source, source_heuristic = audit.infer_source_value(row)
    local_path = local_artifact_path(artifact_repo_path)
    return (
        {
            "traj_id": row.get("traj_id"),
            "task_name": row.get("task_name"),
            "task_slug": row.get("task_slug"),
            "split": "verified",
            "manifest_row_index": row_index,
            "artifact_repo_path": artifact_repo_path,
            "local_path": str(local_path.relative_to(WORKSPACE)),
            "label_bucket": label_bucket,
            "label_presence": pilot.label_presence(label_bucket),
            "source_bucket": source_bucket,
            "inferred_source": source,
            "source_heuristic": source_heuristic,
            "agent": row.get("agent"),
            "model": row.get("model"),
            "category": row.get("category"),
            "difficulty": row.get("difficulty"),
            "step_count": row.get("step_count"),
            "length_bucket": pilot.length_bucket(row.get("step_count")),
            "stage_count": row.get("stage_count"),
            "stages": row.get("stages"),
            "label_counts": audit.count_label_ids(row),
            "manifest_fields": {
                "source_relpath": row.get("source_relpath"),
                "annotation_relpath": row.get("annotation_relpath"),
                "artifact_path": row.get("artifact_path"),
            },
            "incorrect_stages": row.get("incorrect_stages"),
        },
        None,
    )


def select_records(records: list[dict[str, Any]], limit: int | None, seed: int) -> list[dict[str, Any]]:
    if limit is None or limit >= len(records):
        return records
    rng = random.Random(seed)
    chosen = list(records)
    rng.shuffle(chosen)
    return sorted(chosen[:limit], key=lambda item: int(item["manifest_row_index"]))


def file_size_summary(paths: list[Path]) -> dict[str, Any]:
    sizes = [path.stat().st_size for path in paths if path.exists()]
    return audit.distribution_summary(sizes)


def summarize_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "source_buckets": dict(Counter(str(item.get("source_bucket")) for item in records)),
        "agents": dict(Counter(str(item.get("agent")) for item in records)),
        "models": dict(Counter(str(item.get("model")) for item in records)),
        "categories": dict(Counter(str(item.get("category")) for item in records)),
        "difficulties": dict(Counter(str(item.get("difficulty")) for item in records)),
        "label_presence": dict(Counter(str(item.get("label_presence")) for item in records)),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Verified Artifact Download Manifest",
        "",
        "Verified-split artifact cache report. No raw artifact contents are included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Distributions", ""])
    for key, value in report["distributions"].items():
        lines.append(f"- `{key}`: `{value}`")
    if report["failed_downloads"]:
        lines.extend(["", "## Failed Downloads", ""])
        for failure in report["failed_downloads"][:50]:
            lines.append(f"- `{failure.get('traj_id')}`: {failure.get('reason')}")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_verified_rows()
    records = []
    unresolved = []
    for row_index, row in enumerate(rows):
        record, error = candidate_record(row, row_index)
        if record is None:
            unresolved.append(error)
        else:
            records.append(record)
    planned = select_records(records, args.limit, args.seed)
    cached_before = [item for item in planned if (WORKSPACE / item["local_path"]).exists() and (WORKSPACE / item["local_path"]).stat().st_size > 0]
    downloaded = []
    failed = []
    if not args.manifest_only:
        hf_hub_download = import_huggingface_hub()
        for item in planned:
            destination = WORKSPACE / item["local_path"]
            if destination.exists() and destination.stat().st_size > 0 and not args.force:
                item["download_status"] = "cached"
                continue
            try:
                downloaded_path = hf_hub_download(repo_id=REPO_ID, repo_type="dataset", filename=item["artifact_repo_path"], revision=DATASET_REVISION)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(downloaded_path, destination)
                item["download_status"] = "downloaded"
                downloaded.append(item)
                print(f"wrote: {destination}")
            except Exception as exc:  # pragma: no cover - depends on network/HF state.
                item["download_status"] = "failed"
                failed.append({"traj_id": item.get("traj_id"), "artifact_repo_path": item["artifact_repo_path"], "reason": str(exc)})
                print(f"failed: {item.get('traj_id')}: {exc}", file=sys.stderr)
    else:
        for item in planned:
            item["download_status"] = "planned_only"

    cached_after = [item for item in planned if (WORKSPACE / item["local_path"]).exists() and (WORKSPACE / item["local_path"]).stat().st_size > 0]
    local_paths = [WORKSPACE / item["local_path"] for item in planned]
    report = {
        "schema_version": "risk-controlled-intervention-verified-download-manifest.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": REPO_ID,
        "claim_boundary": (
            "Batch 6 verified artifact caching only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "selection": {"split": "verified", "limit": args.limit, "seed": args.seed, "manifest_only": args.manifest_only},
        "summary": {
            "verified_manifest_rows": len(rows),
            "artifacts_planned": len(planned),
            "artifacts_already_cached_before": len(cached_before),
            "artifacts_cached_after": len(cached_after),
            "artifacts_downloaded": len(downloaded),
            "missing_unresolved_artifact_path_rows": len(unresolved),
            "failed_downloads": len(failed),
        },
        "local_byte_size_summary": file_size_summary(local_paths),
        "distributions": summarize_records(planned),
        "missing_unresolved_artifact_path_rows": {"count": len(unresolved), "examples": unresolved[:50]},
        "failed_downloads": failed,
        "samples": planned,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    print(f"Saved verified download manifest: {REPORT_JSON}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
