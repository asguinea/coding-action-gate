#!/usr/bin/env python3
"""Inspect pilot artifact parser failures and zero-prefix cases."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PILOT_MANIFEST = REPORTS_DIR / "pilot_artifact_manifest.json"
PREFIX_PILOT_AUDIT = REPORTS_DIR / "prefix_pilot_audit.json"
TAXONOMY_JSON = REPORTS_DIR / "pilot_failure_taxonomy.json"
TAXONOMY_MD = REPORTS_DIR / "pilot_failure_taxonomy.md"
PARSER_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")


def _load_parser_module():
    spec = importlib.util.spec_from_file_location("prefix_parsing", PARSER_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser = _load_parser_module()
inspect = parser.inspect
audit = parser.audit


def parse_args() -> argparse.Namespace:
    arg_parser = argparse.ArgumentParser(description="Inspect pilot parse failures and zero-prefix artifacts.")
    arg_parser.add_argument("--pilot-manifest", default=str(PILOT_MANIFEST))
    arg_parser.add_argument("--prefix-audit", default=str(PREFIX_PILOT_AUDIT))
    arg_parser.add_argument("--max-listed-members", type=int, default=80)
    return arg_parser.parse_args()


def zstd_test(path: Path) -> bool:
    result = subprocess.run(["zstd", "-t", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    return result.returncode == 0


def decompressed_tar_probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(["zstd", "-dc", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    head = result.stdout[:512]
    return {
        "zstd_decompress_returncode": result.returncode,
        "decompressed_size": len(result.stdout),
        "decompressed_has_ustar_magic": len(head) > 265 and head[257:262] == b"ustar",
        "decompressed_first_16_hex": head[:16].hex(),
    }


def archive_diagnosis(path: Path) -> dict[str, Any]:
    exists = path.exists()
    data = path.read_bytes()[:64] if exists else b""
    diagnosis = {
        "exists": exists,
        "local_file_size": path.stat().st_size if exists else None,
        "first_bytes_hex": data.hex(),
        "appears_zstd_compressed": data.startswith(b"\x28\xb5\x2f\xfd"),
        "zstd_test_passed": False,
        "valid_tar_zst_probe": False,
        "likely_failure_type": "missing_or_unresolved_artifact" if not exists else "unknown",
    }
    if not exists:
        return diagnosis
    diagnosis["sha256_first_64k"] = hashlib.sha256(path.read_bytes()[:65536]).hexdigest()
    if diagnosis["appears_zstd_compressed"]:
        diagnosis["zstd_test_passed"] = zstd_test(path)
        probe = decompressed_tar_probe(path) if diagnosis["zstd_test_passed"] else {}
        diagnosis.update(probe)
        diagnosis["valid_tar_zst_probe"] = bool(probe.get("decompressed_has_ustar_magic"))
    if not diagnosis["appears_zstd_compressed"]:
        diagnosis["likely_failure_type"] = "unsupported compression/archive format"
    elif not diagnosis["zstd_test_passed"]:
        diagnosis["likely_failure_type"] = "corrupted local cache"
    elif diagnosis["valid_tar_zst_probe"]:
        diagnosis["likely_failure_type"] = "script/tooling issue"
    else:
        diagnosis["likely_failure_type"] = "remote artifact issue"
    return diagnosis


def candidate_files(members: list[inspect.ArchiveMember]) -> dict[str, list[str]]:
    names = [member.name for member in members]
    return {
        "trajectory_or_log_files": [
            name
            for name in names
            if name.endswith((".traj", ".traj.json", "mini.traj.json", "agent.log", "trace.log"))
            or "/events/" in name
            or "/agent-logs/" in name
        ][:80],
        "event_files": [name for name in names if "/events/" in name and name.endswith(".json")][:20],
        "episode_files": [name for name in names if "/episode-" in name][:20],
    }


def label_ref_mapping(sample: dict[str, Any], members: list[inspect.ArchiveMember]) -> dict[str, Any]:
    refs = inspect.label_step_ref_paths(sample)
    member_names = {member.name for member in members}
    total_refs = sum(len(paths) for paths in refs.values())
    matched_refs = 0
    matched_steps = 0
    for step_id, paths in refs.items():
        step_matched = False
        for path in paths:
            if inspect.ref_path_exists_in_members(path, member_names):
                matched_refs += 1
                step_matched = True
        if step_matched:
            matched_steps += 1
    return {
        "labeled_steps_with_refs": len(refs),
        "total_label_ref_paths": total_refs,
        "matched_label_ref_paths": matched_refs,
        "matched_labeled_steps_by_ref": matched_steps,
        "all_ref_paths_mapped": total_refs == matched_refs if total_refs else True,
    }


def text_presence(layout_family: str, members: list[inspect.ArchiveMember]) -> dict[str, Any]:
    names = [member.name for member in members]
    return {
        "action_text_appears_present": layout_family
        in {"mini_swe_mini_traj", "mini_swe_generic_traj_json", "swe_agent_traj", "openhands_events", "terminus_episode"},
        "observation_text_appears_present": layout_family
        in {"mini_swe_mini_traj", "mini_swe_generic_traj_json", "swe_agent_traj", "openhands_events", "terminus_episode"},
        "candidate_text_file_count": sum(1 for name in names if inspect.is_text_candidate(inspect.ArchiveMember(name))),
    }


def classify_sample(sample: dict[str, Any], audit_by_traj: dict[str, dict[str, Any]], max_members: int) -> dict[str, Any]:
    local_path = sample.get("local_path")
    path = WORKSPACE / str(local_path) if isinstance(local_path, str) else None
    base_record: dict[str, Any] = {
        "trajectory_id": sample.get("traj_id"),
        "agent": sample.get("agent"),
        "model": sample.get("model"),
        "category": sample.get("category"),
        "difficulty": sample.get("difficulty"),
        "source_bucket": sample.get("source_bucket"),
        "local_path": local_path,
    }
    if path is None or not path.exists():
        return {
            **base_record,
            "classification": "missing_or_unresolved_artifact",
            "layout_family": None,
            "archive_diagnosis": archive_diagnosis(path or Path("")),
        }
    archive_info = archive_diagnosis(path)
    try:
        format_info = inspect.detect_artifact_format(path)
        artifact_format = format_info["format"]
        members = inspect.list_members(path, artifact_format)
    except Exception as exc:
        classification = "corrupted_or_unreadable_archive" if archive_info["likely_failure_type"] != "script/tooling issue" else "parse_failure"
        return {
            **base_record,
            "classification": classification,
            "layout_family": None,
            "archive_diagnosis": archive_info,
            "failure_reason": str(exc),
        }
    layout_family = parser.detect_layout_family(members, sample)
    try:
        steps, recovery = parser.recover_steps(sample)
        examples = parser.build_prefix_examples(sample, steps)
    except Exception as exc:
        return {
            **base_record,
            "classification": "parse_failure",
            "layout_family": layout_family,
            "archive_diagnosis": archive_info,
            "failure_reason": str(exc),
            "member_count": len(members),
            "members_for_review": [member.name for member in members[:max_members]],
            "candidate_files": candidate_files(members),
            "label_ref_mapping": label_ref_mapping(sample, members),
            "text_presence": text_presence(layout_family, members),
        }
    if examples:
        classification = "parsed_with_prefix_examples"
    elif layout_family == "unsupported_layout":
        classification = "unsupported_layout"
    else:
        classification = "parsed_zero_prefix"
    audit_record = audit_by_traj.get(str(sample.get("traj_id")), {})
    include_members = classification != "parsed_with_prefix_examples"
    return {
        **base_record,
        "classification": classification,
        "layout_family": layout_family,
        "archive_diagnosis": archive_info,
        "member_count": len(members),
        "members_for_review": [member.name for member in members[:max_members]] if include_members else [],
        "candidate_files": candidate_files(members) if include_members else {},
        "ordered_steps_recovered": len(steps),
        "prefix_examples": len(examples),
        "zero_prefix_cause": recovery.get("zero_prefix_cause"),
        "label_ref_mapping": label_ref_mapping(sample, members),
        "text_presence": text_presence(layout_family, members),
        "previous_audit": {
            "prefix_examples": audit_record.get("prefix_examples"),
            "ordered_steps_recovered": audit_record.get("ordered_steps_recovered"),
            "layout_family": audit_record.get("layout_family"),
        },
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Pilot Failure Taxonomy",
        "",
        "Batch 4 parser hardening taxonomy for the existing bounded 50-artifact pilot.",
        "",
        "This is pre-modeling infrastructure only. It is not production StepHarbor validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Layout Families", ""])
    for key, value in report["layout_family_counts"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Non-Prefix Or Failure Cases", ""])
    for item in report["artifacts"]:
        if item["classification"] == "parsed_with_prefix_examples":
            continue
        lines.append(f"### {item['trajectory_id']}")
        lines.append("")
        lines.append(f"- classification: `{item['classification']}`")
        lines.append(f"- layout_family: `{item.get('layout_family')}`")
        lines.append(f"- zero_prefix_cause: `{item.get('zero_prefix_cause')}`")
        lines.append(f"- archive_failure_type: `{item.get('archive_diagnosis', {}).get('likely_failure_type')}`")
        if item.get("failure_reason"):
            lines.append(f"- failure_reason: `{item['failure_reason']}`")
        candidates = item.get("candidate_files", {}).get("trajectory_or_log_files", [])
        if candidates:
            lines.append("- candidate files:")
            for path in candidates[:12]:
                lines.append(f"  - `{path}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    manifest = json.loads(Path(args.pilot_manifest).read_text())
    prefix_audit_path = Path(args.prefix_audit)
    prefix_audit = json.loads(prefix_audit_path.read_text()) if prefix_audit_path.exists() else {}
    audit_by_traj = {item["trajectory_id"]: item for item in prefix_audit.get("trajectories", [])}
    artifacts = [
        classify_sample(sample, audit_by_traj, args.max_listed_members)
        for sample in manifest.get("samples", [])
    ]
    summary = {
        "total_pilot_artifacts": len(artifacts),
        **dict(Counter(item["classification"] for item in artifacts)),
    }
    report = {
        "schema_version": "risk-controlled-intervention-pilot-failure-taxonomy.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 4 failure taxonomy only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": summary,
        "layout_family_counts": dict(Counter(str(item.get("layout_family")) for item in artifacts)),
        "parser_documentation": parser.parser_documentation(),
        "artifacts": artifacts,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    TAXONOMY_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    TAXONOMY_MD.write_text(markdown_report(report) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"Saved taxonomy JSON: {TAXONOMY_JSON}")
    print(f"Saved taxonomy markdown: {TAXONOMY_MD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
