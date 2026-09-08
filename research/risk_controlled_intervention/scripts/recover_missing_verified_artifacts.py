#!/usr/bin/env python3
"""Investigate missing verified artifact paths without guessing ambiguous names."""

from __future__ import annotations

import argparse
import fnmatch
import importlib.util
import json
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ID = "NJU-LINK/CodeTraceBench"
WORKSPACE = Path(__file__).resolve().parents[1]
RAW_MANIFEST = WORKSPACE / "data" / "raw" / "bench_manifest.verified.jsonl"
VERIFIED_DIR = WORKSPACE / "data" / "verified_artifacts"
REPORTS_DIR = WORKSPACE / "reports"
DOWNLOAD_MANIFEST = REPORTS_DIR / "verified_artifact_download_manifest.json"
TAXONOMY = REPORTS_DIR / "verified_failure_taxonomy.json"
OUTPUT_JSON = REPORTS_DIR / "missing_artifact_recovery.json"
OUTPUT_MD = REPORTS_DIR / "missing_artifact_recovery.md"
DOWNLOAD_SCRIPT = Path(__file__).resolve().with_name("download_verified_artifacts.py")


def _load_download_module():
    spec = importlib.util.spec_from_file_location("download_verified_artifacts", DOWNLOAD_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


download = _load_download_module()
audit = download.audit
sample = download.sample


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recover missing verified artifacts only when exact.")
    parser.add_argument("--use-hf-listing", action="store_true", help="Use Hugging Face repo listing if network is permitted.")
    parser.add_argument("--download", action="store_true", help="Download exact/deterministic recovered artifacts.")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def import_hf_tools():
    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError as exc:
        raise SystemExit(
            "ERROR: Missing huggingface_hub. Install with "
            "research/risk_controlled_intervention/.venv/bin/python -m pip install huggingface_hub"
        ) from exc
    return hf_hub_download, list_repo_files


def unresolved_rows(download_manifest: dict[str, Any], raw_rows: list[dict[str, Any]]) -> list[tuple[int | None, dict[str, Any], dict[str, Any]]]:
    rows = []
    by_traj = {row.get("traj_id"): row for row in raw_rows}
    for item in download_manifest.get("missing_unresolved_artifact_path_rows", {}).get("examples", []):
        row_index = item.get("row_index")
        row = raw_rows[row_index] if isinstance(row_index, int) and 0 <= row_index < len(raw_rows) else by_traj.get(item.get("traj_id"), {})
        rows.append((row_index if isinstance(row_index, int) else None, item, row))
    return rows


def nearby_artifact_patterns(row_index: int | None, raw_rows: list[dict[str, Any]], row: dict[str, Any]) -> dict[str, Any]:
    if row_index is None:
        return {"nearby_paths": [], "deterministic_prefix": None, "can_infer_filename": False}
    task_name = str(row.get("task_name") or "")
    agent = str(row.get("agent") or "").lower()
    model_token = str(row.get("model") or "").replace("/", "__")
    nearby = []
    for other in raw_rows[max(0, row_index - 8) : min(len(raw_rows), row_index + 9)]:
        path = other.get("artifact_path")
        if isinstance(path, str) and path:
            nearby.append(path)
    deterministic_prefix = None
    if agent == "openhands" and model_token and task_name:
        deterministic_prefix = f"bench_artifacts/full/openhands-{model_token}-{task_name}-"
    return {
        "nearby_paths": nearby[:12],
        "deterministic_prefix": deterministic_prefix,
        "can_infer_filename": False,
        "inference_note": "Nearby rows establish prefix convention only; random/hash suffix is not present in manifest fields.",
    }


def local_candidates(row: dict[str, Any]) -> list[dict[str, Any]]:
    task_name = str(row.get("task_name") or "")
    model_token = str(row.get("model") or "").replace("/", "__")
    patterns = []
    if task_name:
        patterns.append(f"*{task_name}*.tar.zst")
    if model_token and task_name:
        patterns.append(f"openhands-{model_token}-{task_name}-*.tar.zst")
    matches = []
    seen = set()
    for pattern in patterns:
        for path in VERIFIED_DIR.glob(pattern):
            if path.name in seen or not path.is_file() or path.stat().st_size <= 0:
                continue
            seen.add(path.name)
            matches.append({"path": str(path.relative_to(WORKSPACE)), "size_bytes": path.stat().st_size})
    return matches[:20]


def remote_matches(row: dict[str, Any], repo_files: list[str] | None, deterministic_prefix: str | None) -> list[str] | None:
    if repo_files is None or not deterministic_prefix:
        return None
    pattern = f"{deterministic_prefix}*.tar.zst"
    return sorted(name for name in repo_files if fnmatch.fnmatch(name, pattern))


def classify_recovery(row: dict[str, Any], local: list[dict[str, Any]], remote: list[str] | None) -> tuple[str, str, str | None]:
    artifact_path = row.get("artifact_path")
    if isinstance(artifact_path, str) and artifact_path.strip():
        return "recovered_exact", "manifest contains exact artifact_path", artifact_path
    if remote is not None:
        if len(remote) == 1:
            return "recovered_by_deterministic_path_inference", "unique remote file matched deterministic prefix", remote[0]
        if len(remote) > 1:
            return "not_recoverable_ambiguous", "multiple remote files matched deterministic prefix", None
        return "not_recoverable_missing_remote", "no remote file matched deterministic prefix", None
    if local:
        if len(local) == 1:
            return "recovered_by_deterministic_path_inference", "unique local cached file matched deterministic prefix", local[0]["path"].removeprefix("data/verified_artifacts/")
        return "not_recoverable_ambiguous", "multiple local cached files matched task/model pattern", None
    return "not_recoverable_no_path_evidence", "manifest lacks exact path and remote listing was not used", None


def download_recovered(recovered_repo_path: str, hf_hub_download) -> dict[str, Any]:
    destination = VERIFIED_DIR / Path(recovered_repo_path).name
    if destination.exists() and destination.stat().st_size > 0:
        return {"download_status": "cached", "local_path": str(destination.relative_to(WORKSPACE))}
    downloaded_path = hf_hub_download(repo_id=REPO_ID, repo_type="dataset", filename=recovered_repo_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(downloaded_path, destination)
    return {"download_status": "downloaded", "local_path": str(destination.relative_to(WORKSPACE))}


def report_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Missing Verified Artifact Recovery",
        "",
        "Machine-readable recovery pass for manifest rows without resolved artifact paths. No raw artifact contents are included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Decisions", ""])
    for item in report["artifacts"]:
        lines.append(
            f"- `{item['trajectory_id']}`: `{item['recovery_decision']}`; include `{item['include_in_verified_extraction']}`; {item['rationale']}"
        )
    return "\n".join(lines)


def build_report(use_hf_listing: bool, do_download: bool) -> dict[str, Any]:
    raw_rows = audit.load_manifest(RAW_MANIFEST)
    download_manifest = load_json(DOWNLOAD_MANIFEST)
    taxonomy = load_json(TAXONOMY)
    repo_files = None
    hf_hub_download = None
    listing_error = None
    if use_hf_listing or do_download:
        hf_hub_download, list_repo_files = import_hf_tools()
        if use_hf_listing:
            try:
                repo_files = list_repo_files(repo_id=REPO_ID, repo_type="dataset")
            except Exception as exc:  # pragma: no cover - depends on network.
                listing_error = str(exc)
                repo_files = None
    taxonomy_missing = {item.get("trajectory_id"): item for item in taxonomy.get("artifacts", []) if item.get("classification") == "missing_or_unresolved_artifact"}
    artifacts = []
    for row_index, unresolved, row in unresolved_rows(download_manifest, raw_rows):
        source, source_heuristic = audit.infer_source_value(row)
        source_bucket = sample.source_bucket_for_row(row)
        nearby = nearby_artifact_patterns(row_index, raw_rows, row)
        local = local_candidates(row)
        remote = remote_matches(row, repo_files, nearby["deterministic_prefix"])
        decision, rationale, recovered_repo_path = classify_recovery(row, local, remote)
        download_info = {}
        include = decision in {"recovered_exact", "recovered_by_deterministic_path_inference"}
        if do_download and include and recovered_repo_path:
            if hf_hub_download is None:
                hf_hub_download, _ = import_hf_tools()
            if not recovered_repo_path.startswith("bench_artifacts/"):
                recovered_repo_path = f"bench_artifacts/full/{recovered_repo_path}"
            download_info = download_recovered(recovered_repo_path, hf_hub_download)
        artifacts.append(
            {
                "trajectory_id": row.get("traj_id") or unresolved.get("traj_id"),
                "source_relpath": row.get("source_relpath"),
                "annotation_relpath": row.get("annotation_relpath"),
                "artifact_path": row.get("artifact_path"),
                "trial_name": row.get("trial_name"),
                "inferred_source": source,
                "source_heuristic": source_heuristic,
                "source_bucket": source_bucket,
                "agent": row.get("agent"),
                "model": row.get("model"),
                "category": row.get("category"),
                "difficulty": row.get("difficulty"),
                "step_count": row.get("step_count"),
                "taxonomy_reason": taxonomy_missing.get(row.get("traj_id"), {}).get("likely_reason_uncovered"),
                "nearby_inference": nearby,
                "remote_listing_used": repo_files is not None,
                "matching_remote_files": remote,
                "matching_local_cached_artifacts": local,
                "recovery_decision": decision,
                "rationale": rationale,
                "recovered_artifact_repo_path": recovered_repo_path,
                "download_info": download_info,
                "include_in_verified_extraction": include and (not do_download or bool(download_info)),
            }
        )
    decisions = Counter(item["recovery_decision"] for item in artifacts)
    return {
        "schema_version": "risk-controlled-intervention-missing-artifact-recovery.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.75 missing artifact recovery only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "hf_listing": {"used": repo_files is not None, "error": listing_error},
        "summary": {
            "missing_rows_inspected": len(artifacts),
            "recovered_exact": decisions.get("recovered_exact", 0),
            "recovered_by_deterministic_path_inference": decisions.get("recovered_by_deterministic_path_inference", 0),
            "not_recoverable_missing_remote": decisions.get("not_recoverable_missing_remote", 0),
            "not_recoverable_ambiguous": decisions.get("not_recoverable_ambiguous", 0),
            "not_recoverable_no_path_evidence": decisions.get("not_recoverable_no_path_evidence", 0),
            "included_for_verified_extraction": sum(1 for item in artifacts if item["include_in_verified_extraction"]),
        },
        "artifacts": artifacts,
    }


def main() -> int:
    args = parse_args()
    report = build_report(args.use_hf_listing, args.download)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(report_markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
