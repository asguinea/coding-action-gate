#!/usr/bin/env python3
"""Inspect sampled CodeTraceBench artifacts for step-level schema signals."""

from __future__ import annotations

import argparse
import importlib.util
import io
import json
import re
import subprocess
import sys
import tarfile
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
SAMPLE_MANIFEST = REPORTS_DIR / "artifact_sample_manifest.json"
AUDIT_SCRIPT = Path(__file__).resolve().with_name("audit_codetracebench.py")
TEXT_EXTENSIONS = {
    ".json",
    ".jsonl",
    ".txt",
    ".log",
    ".md",
    ".yaml",
    ".yml",
    ".py",
    ".sh",
    ".toml",
}
TEXT_MARKERS = ("action", "observation", "assistant", "user", "tool", "step", "trajectory")
RAW_CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".rb",
    ".php",
    ".cs",
    ".swift",
}


def _load_audit_module():
    spec = importlib.util.spec_from_file_location("audit_codetracebench", AUDIT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = _load_audit_module()


@dataclass(frozen=True)
class ArchiveMember:
    name: str
    size: int | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect sampled CodeTraceBench artifacts.")
    parser.add_argument(
        "--sample-manifest",
        default=str(SAMPLE_MANIFEST),
        help="Path to reports/artifact_sample_manifest.json.",
    )
    parser.add_argument(
        "--max-members",
        type=int,
        default=80,
        help="Maximum archive members to inspect per artifact.",
    )
    parser.add_argument(
        "--max-read-bytes",
        type=int,
        default=20000,
        help="Maximum bytes to read from any text member.",
    )
    return parser.parse_args()


def detect_artifact_format(path: Path) -> dict[str, Any]:
    suffixes = "".join(path.suffixes).lower()
    try:
        header = path.read_bytes()[:512]
    except OSError as exc:
        return {"format": "unreadable", "reason": str(exc)}
    if header.startswith(b"PK\x03\x04"):
        return {"format": "zip", "reason": "zip magic bytes"}
    if header.startswith(b"\x1f\x8b"):
        return {"format": "gzip", "reason": "gzip magic bytes"}
    if header.startswith(b"\x28\xb5\x2f\xfd"):
        if suffixes.endswith(".tar.zst"):
            return {"format": "tar.zst", "reason": "zstd magic bytes and .tar.zst suffix"}
        return {"format": "zst", "reason": "zstd magic bytes"}
    if len(header) > 265 and header[257:262] == b"ustar":
        return {"format": "tar", "reason": "ustar header"}
    if suffixes.endswith(".tar.zst"):
        return {"format": "tar.zst", "reason": ".tar.zst suffix"}
    if suffixes.endswith(".tar.gz") or suffixes.endswith(".tgz"):
        return {"format": "tar.gz", "reason": "compressed tar suffix"}
    if path.suffix.lower() == ".json":
        return {"format": "json", "reason": ".json suffix"}
    if path.suffix.lower() == ".jsonl":
        return {"format": "jsonl", "reason": ".jsonl suffix"}
    return {"format": "unknown", "reason": f"unrecognized suffix/header: {suffixes}"}


def safe_truncate_text(text: str, limit: int = 500) -> str:
    normalized = text.replace("\x00", "").replace("\r", "").replace("\n", "\\n")
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit] + "...[truncated]"


def list_tar_members(path: Path) -> list[ArchiveMember]:
    with tarfile.open(path, mode="r:*") as archive:
        return [
            ArchiveMember(member.name, member.size if member.isfile() else None)
            for member in archive.getmembers()
            if member.isfile()
        ]


def list_zip_members(path: Path) -> list[ArchiveMember]:
    with zipfile.ZipFile(path) as archive:
        return [
            ArchiveMember(member.filename, member.file_size)
            for member in archive.infolist()
            if not member.is_dir()
        ]


def run_tar_command(args: list[str], input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(
        ["tar", *args],
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0 and not result.stdout:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace").strip())
    return result.stdout


def list_external_tar_members(path: Path) -> list[ArchiveMember]:
    output = run_tar_command(["-tf", str(path)])
    return [
        ArchiveMember(line.strip(), None)
        for line in output.decode("utf-8", errors="replace").splitlines()
        if line.strip()
    ]


def list_members(path: Path, artifact_format: str) -> list[ArchiveMember]:
    if artifact_format in {"tar", "tar.gz"}:
        return list_tar_members(path)
    if artifact_format == "zip":
        return list_zip_members(path)
    if artifact_format == "tar.zst":
        return list_external_tar_members(path)
    if artifact_format in {"json", "jsonl"}:
        return [ArchiveMember(path.name, path.stat().st_size)]
    raise ValueError(f"Unsupported sampled artifact format: {artifact_format}")


def read_member(path: Path, artifact_format: str, member_name: str, max_bytes: int) -> str:
    raw: bytes
    if artifact_format in {"tar", "tar.gz"}:
        with tarfile.open(path, mode="r:*") as archive:
            extracted = archive.extractfile(member_name)
            if extracted is None:
                return ""
            raw = extracted.read(max_bytes)
    elif artifact_format == "zip":
        with zipfile.ZipFile(path) as archive:
            with archive.open(member_name) as handle:
                raw = handle.read(max_bytes)
    elif artifact_format == "tar.zst":
        raw = run_tar_command(["-xOf", str(path), member_name])[:max_bytes]
    elif artifact_format in {"json", "jsonl"}:
        raw = path.read_bytes()[:max_bytes]
    else:
        return ""
    return raw.decode("utf-8", errors="replace")


def is_text_candidate(member: ArchiveMember) -> bool:
    lower = member.name.lower()
    suffix = Path(lower).suffix
    return suffix in TEXT_EXTENSIONS or any(marker in lower for marker in TEXT_MARKERS)


def select_members_for_inspection(
    members: list[ArchiveMember],
    sample_record: dict[str, Any],
    max_members: int,
) -> list[ArchiveMember]:
    target_paths = set()
    for stage in audit.coerce_list(sample_record.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            for ref_key in ("action_ref", "observation_ref"):
                ref = step.get(ref_key)
                if isinstance(ref, dict) and isinstance(ref.get("path"), str):
                    target_paths.add(ref["path"])
    selected: list[ArchiveMember] = []
    for member in members:
        if member.name in target_paths or any(member.name.endswith(path) for path in target_paths):
            selected.append(member)
    for member in members:
        if len(selected) >= max_members:
            break
        if is_text_candidate(member) and member not in selected:
            selected.append(member)
    return selected[:max_members]


def label_steps_from_sample(sample_record: dict[str, Any]) -> dict[str, set[str]]:
    labels: dict[str, set[str]] = {}
    for stage in audit.coerce_list(sample_record.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        stage_id = stage.get("stage_id")
        for field, label in (("incorrect_step_ids", "incorrect"), ("unuseful_step_ids", "unuseful")):
            for step_id in audit.coerce_list(stage.get(field)):
                if step_id is not None:
                    labels.setdefault(str(step_id), set()).add(label)
                    if stage_id is not None:
                        labels.setdefault(str(step_id), set()).add(f"stage:{stage_id}")
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            step_id = step.get("step_id")
            if step_id is None:
                continue
            for label in audit.coerce_list(step.get("labels")):
                labels.setdefault(str(step_id), set()).add(str(label))
            if stage_id is not None:
                labels.setdefault(str(step_id), set()).add(f"stage:{stage_id}")
    return labels


def label_step_ref_paths(sample_record: dict[str, Any]) -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    for stage in audit.coerce_list(sample_record.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict) or step.get("step_id") is None:
                continue
            step_id = str(step["step_id"])
            for ref_key in ("action_ref", "observation_ref"):
                ref = step.get(ref_key)
                if isinstance(ref, dict) and isinstance(ref.get("path"), str):
                    refs.setdefault(step_id, []).append(ref["path"])
    return refs


def ref_path_exists_in_members(ref_path: str, member_names: set[str]) -> bool:
    normalized = ref_path.replace("\\", "/").lstrip("/")
    candidates = {normalized}
    if normalized.startswith("traj/"):
        candidates.add(normalized.removeprefix("traj/"))
    parts = normalized.split("/")
    if len(parts) > 1:
        candidates.add("/".join(parts[1:]))
    return any(
        candidate in member_names or any(name.endswith(candidate) for name in member_names)
        for candidate in candidates
    )


def mapped_label_steps_by_ref_path(
    sample_record: dict[str, Any],
    members: list[ArchiveMember],
) -> dict[str, list[str]]:
    member_names = {member.name for member in members}
    mapped: dict[str, list[str]] = {}
    for step_id, ref_paths in label_step_ref_paths(sample_record).items():
        matched = [ref_path for ref_path in ref_paths if ref_path_exists_in_members(ref_path, member_names)]
        if matched:
            mapped[step_id] = matched
    return mapped


def reconcile_labels_to_steps(
    label_map: dict[str, set[str]],
    detected_step_ids: Iterable[str],
    ref_path_mapped_step_ids: Iterable[str] = (),
) -> dict[str, Any]:
    detected = {str(value) for value in detected_step_ids}
    ref_mapped = {str(value) for value in ref_path_mapped_step_ids}
    labeled = set(label_map)
    mapped_set = labeled & (detected | ref_mapped)
    mapped = sorted(mapped_set, key=lambda value: int(value) if value.isdigit() else value)
    missing = sorted(labeled - mapped_set, key=lambda value: int(value) if value.isdigit() else value)
    return {
        "labeled_step_ids": sorted(labeled, key=lambda value: int(value) if value.isdigit() else value),
        "detected_step_ids_count": len(detected),
        "ref_path_mapped_step_ids": sorted(
            labeled & ref_mapped,
            key=lambda value: int(value) if value.isdigit() else value,
        ),
        "mapped_labeled_step_ids": mapped,
        "missing_labeled_step_ids": missing,
        "all_labeled_steps_mapped": len(labeled) > 0 and len(missing) == 0,
    }


STEP_ID_PATTERNS = (
    re.compile(r'"step_id"\s*:\s*(\d+)'),
    re.compile(r"\bstep[_ -]?id\b[^0-9]{0,8}(\d+)", re.IGNORECASE),
    re.compile(r"\bstep\s+(\d+)\b", re.IGNORECASE),
)


def detect_step_ids(text: str) -> set[str]:
    ids: set[str] = set()
    for pattern in STEP_ID_PATTERNS:
        ids.update(pattern.findall(text))
    return ids


def text_signals(text: str) -> dict[str, Any]:
    lower = text.lower()
    return {
        "has_action_text": any(term in lower for term in ("action_ref", "assistant", '"role": "assistant"', "thought:")),
        "has_observation_text": any(term in lower for term in ("observation_ref", '"role": "user"', "<output>", "<returncode>", "tool")),
        "contains_raw_code_signals": any(term in lower for term in ("```", "def ", "class ", "function ", "import ", "const ", "let ")),
        "step_ids": sorted(detect_step_ids(text), key=lambda value: int(value) if value.isdigit() else value),
    }


def inspect_sample(sample: dict[str, Any], max_members: int, max_read_bytes: int) -> dict[str, Any]:
    path = WORKSPACE / sample["local_path"]
    format_info = detect_artifact_format(path)
    artifact_format = format_info["format"]
    label_map = label_steps_from_sample(sample)
    report: dict[str, Any] = {
        "traj_id": sample.get("traj_id"),
        "artifact_repo_path": sample.get("artifact_repo_path"),
        "local_path": sample.get("local_path"),
        "format": format_info,
        "sample_metadata": {
            "split": sample.get("split"),
            "label_bucket": sample.get("label_bucket"),
            "source_bucket": sample.get("source_bucket"),
            "agent": sample.get("agent"),
            "model": sample.get("model"),
            "category": sample.get("category"),
            "difficulty": sample.get("difficulty"),
        },
        "errors": [],
    }
    try:
        members = list_members(path, artifact_format)
    except Exception as exc:
        report["errors"].append(f"Could not list artifact members: {exc}")
        report["label_to_step_reconciliation"] = reconcile_labels_to_steps(label_map, [])
        return report

    ref_path_matches = mapped_label_steps_by_ref_path(sample, members)
    selected_members = select_members_for_inspection(members, sample, max_members)
    combined_step_ids: set[str] = set()
    text_member_reports = []
    raw_code_member_count = 0
    action_available = False
    observation_available = False
    for member in selected_members:
        suffix = Path(member.name.lower()).suffix
        if suffix in RAW_CODE_EXTENSIONS:
            raw_code_member_count += 1
        if not is_text_candidate(member):
            continue
        try:
            text = read_member(path, artifact_format, member.name, max_read_bytes)
        except Exception as exc:
            text_member_reports.append({"name": member.name, "error": str(exc)})
            continue
        signals = text_signals(text)
        combined_step_ids.update(signals["step_ids"])
        action_available = action_available or bool(signals["has_action_text"])
        observation_available = observation_available or bool(signals["has_observation_text"])
        text_member_reports.append(
            {
                "name": member.name,
                "size": member.size,
                "signals": signals,
                "truncated_preview": safe_truncate_text(text, 500),
            }
        )

    member_suffixes = Counter(Path(member.name.lower()).suffix or "(none)" for member in members)
    reconciliation = reconcile_labels_to_steps(
        label_map,
        combined_step_ids,
        ref_path_matches.keys(),
    )
    stage_ids_in_labels = sorted(
        {
            label.split(":", 1)[1]
            for labels in label_map.values()
            for label in labels
            if label.startswith("stage:")
        },
        key=lambda value: int(value) if value.isdigit() else value,
    )

    report.update(
        {
            "member_count": len(members),
            "member_suffix_distribution": dict(member_suffixes.most_common(25)),
            "selected_member_count": len(selected_members),
            "selected_text_members": text_member_reports,
            "step_ordering": {
                "detected_step_ids_sample": sorted(
                    combined_step_ids,
                    key=lambda value: int(value) if value.isdigit() else value,
                )[:100],
                "step_order_inferred_from_numeric_ids": len(combined_step_ids) > 0,
            },
            "stage_mapping": {
                "stage_ids_from_manifest_labels": stage_ids_in_labels,
                "stage_to_step_mapping_available_from_manifest": bool(stage_ids_in_labels),
                "stage_mapping_note": (
                    "Batch 1 maps stages through manifest incorrect_stages and stages ranges; "
                    "artifact-level independent stage IDs are inspected only if present in text members."
                ),
            },
            "label_to_step_reconciliation": reconciliation,
            "label_ref_path_matches": {
                step_id: audit.truncate_value(paths, 180)
                for step_id, paths in ref_path_matches.items()
            },
            "action_observation_availability": {
                "action_text_available_in_inspected_members": action_available,
                "observation_text_available_in_inspected_members": observation_available,
            },
            "raw_code_assessment": {
                "raw_code_member_count_by_extension": raw_code_member_count,
                "raw_code_signals_in_text_members": any(
                    item.get("signals", {}).get("contains_raw_code_signals")
                    for item in text_member_reports
                ),
                "derived_artifact_guidance": (
                    "Released derived artifacts should avoid storing raw code or full action/observation text; "
                    "store schema facts, aggregate features, hashes, offsets, or short reviewed excerpts only."
                ),
            },
        }
    )
    return report


def aggregate_findings(artifact_reports: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "artifact_count": len(artifact_reports),
        "formats": dict(Counter(report.get("format", {}).get("format", "unknown") for report in artifact_reports)),
        "action_text_available_any": any(
            report.get("action_observation_availability", {}).get("action_text_available_in_inspected_members")
            for report in artifact_reports
        ),
        "observation_text_available_any": any(
            report.get("action_observation_availability", {}).get("observation_text_available_in_inspected_members")
            for report in artifact_reports
        ),
        "all_labeled_steps_mapped_for_labeled_samples": all(
            report.get("label_to_step_reconciliation", {}).get("all_labeled_steps_mapped", True)
            for report in artifact_reports
            if report.get("label_to_step_reconciliation", {}).get("labeled_step_ids")
        ),
        "artifacts_with_errors": sum(1 for report in artifact_reports if report.get("errors")),
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Artifact Schema Audit",
        "",
        "Batch 1 artifact schema sampling for `NJU-LINK/CodeTraceBench`.",
        "",
        "This is not production StepHarbor validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Artifacts", ""])
    for artifact in report["artifacts"]:
        availability = artifact.get("action_observation_availability", {})
        reconciliation = artifact.get("label_to_step_reconciliation", {})
        lines.extend(
            [
                f"### {artifact.get('traj_id')}",
                "",
                f"- Format: `{artifact.get('format', {}).get('format')}` ({artifact.get('format', {}).get('reason')})",
                f"- Local path: `{artifact.get('local_path')}`",
                f"- Members inspected: `{artifact.get('selected_member_count')}` of `{artifact.get('member_count')}`",
                f"- Action text available: `{availability.get('action_text_available_in_inspected_members')}`",
                f"- Observation text available: `{availability.get('observation_text_available_in_inspected_members')}`",
                f"- Labeled step IDs: `{reconciliation.get('labeled_step_ids')}`",
                f"- Mapped labeled step IDs: `{reconciliation.get('mapped_labeled_step_ids')}`",
                f"- Missing labeled step IDs: `{reconciliation.get('missing_labeled_step_ids')}`",
                "",
            ]
        )
        if artifact.get("errors"):
            lines.append(f"- Errors: `{artifact.get('errors')}`")
            lines.append("")
    lines.extend(
        [
            "## Guidance",
            "",
            "Do not publish raw artifact contents or full action/observation text in derived releases. Use leakage-safe features, hashes, offsets, labels, and short manually reviewed excerpts only.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.sample_manifest)
    if not manifest_path.exists():
        raise SystemExit(
            f"ERROR: Sample manifest not found: {manifest_path}. Run sample_artifacts.py first."
        )
    sample_manifest = json.loads(manifest_path.read_text())
    artifact_reports = [
        inspect_sample(sample, args.max_members, args.max_read_bytes)
        for sample in sample_manifest.get("samples", [])
    ]
    report = {
        "schema_version": "risk-controlled-intervention-artifact-schema-audit.v1",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": "NJU-LINK/CodeTraceBench",
        "claim_boundary": (
            "Batch 1 artifact schema sampling only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_manifest": str(manifest_path),
        "summary": aggregate_findings(artifact_reports),
        "artifacts": artifact_reports,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORTS_DIR / "artifact_schema_audit.json"
    markdown_path = REPORTS_DIR / "artifact_schema_audit.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    markdown_path.write_text(markdown_report(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    print(f"Saved JSON audit: {json_path}")
    print(f"Saved markdown audit: {markdown_path}")
    return 1 if report["summary"]["artifacts_with_errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
