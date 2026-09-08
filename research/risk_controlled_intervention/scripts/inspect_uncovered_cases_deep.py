#!/usr/bin/env python3
"""Focused machine inspection for uncovered pilot cases."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
UNCOVERED_PATH = REPORTS_DIR / "uncovered_pilot_cases.json"
PILOT_MANIFEST = REPORTS_DIR / "pilot_artifact_manifest.json"
VERIFIED_MANIFEST = WORKSPACE / "data" / "raw" / "bench_manifest.verified.jsonl"
DEEP_JSON = REPORTS_DIR / "uncovered_cases_deep_inspection.json"
DEEP_MD = REPORTS_DIR / "uncovered_cases_deep_inspection.md"
PARSER_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")
FAILURE_SCRIPT = Path(__file__).resolve().with_name("inspect_pilot_failures.py")


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser = _load_module("prefix_parsing", PARSER_SCRIPT)
failure = _load_module("inspect_pilot_failures", FAILURE_SCRIPT)
inspect = parser.inspect
audit = parser.audit


def parse_args() -> argparse.Namespace:
    arg_parser = argparse.ArgumentParser(description="Deep-inspect the four uncovered pilot cases.")
    arg_parser.add_argument("--uncovered", default=str(UNCOVERED_PATH))
    arg_parser.add_argument("--pilot-manifest", default=str(PILOT_MANIFEST))
    arg_parser.add_argument("--verified-manifest", default=str(VERIFIED_MANIFEST))
    return arg_parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_verified_rows(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    rows = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        rows[str(row.get("traj_id"))] = row
    return rows


def normalize_ref_path(ref_path: str) -> list[str]:
    normalized = ref_path.replace("\\", "/").lstrip("/")
    candidates = [normalized]
    if normalized.startswith("traj/"):
        candidates.append(normalized.removeprefix("traj/"))
    parts = normalized.split("/")
    if len(parts) > 1:
        candidates.append("/".join(parts[1:]))
    return list(dict.fromkeys(candidates))


def top_level_dirs(members: list[inspect.ArchiveMember]) -> list[str]:
    dirs = sorted({member.name.split("/", 1)[0] for member in members if member.name})
    return dirs


def member_names(members: list[inspect.ArchiveMember]) -> list[str]:
    return [member.name for member in members]


def candidate_paths(members: list[inspect.ArchiveMember]) -> dict[str, list[str]]:
    names = member_names(members)
    return {
        "trajectory_log_files": [
            name
            for name in names
            if name.endswith((".traj", ".traj.json", "mini.traj.json", "agent.log", "trace.log", "run_instance.log"))
            or "/agent-logs/" in name
        ][:80],
        "action_files": [
            name
            for name in names
            if name.endswith("/response.txt")
            or re.search(r"/events/\d+\.json$", name)
            or re.search(r"(gpt|tensorblock).*\.json$", Path(name).name)
        ][:80],
        "observation_files": [
            name
            for name in names
            if name.endswith("/prompt.txt")
            or re.search(r"/events/\d+\.json$", name)
            or name.endswith(("agent.log", "trace.log", "run_instance.log"))
        ][:80],
        "event_state_files": [
            name
            for name in names
            if "/events/" in name
            or "/event_cache/" in name
            or name.endswith(("agent_state.pkl", "report.json", "results.json"))
        ][:80],
    }


def member_lookup(members: list[inspect.ArchiveMember]) -> dict[str, inspect.ArchiveMember]:
    return {member.name: member for member in members}


def path_exists_after_normalization(ref_path: str, members: list[inspect.ArchiveMember]) -> bool:
    names = set(member_names(members))
    for candidate in normalize_ref_path(ref_path):
        if candidate in names or any(name.endswith(candidate) for name in names):
            return True
    return False


def manifest_label_refs(sample: dict[str, Any], members: list[inspect.ArchiveMember]) -> list[dict[str, Any]]:
    refs = []
    for stage in audit.coerce_list(sample.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            step_id = step.get("step_id")
            labels = audit.coerce_list(step.get("labels"))
            for ref_key in ("action_ref", "observation_ref"):
                ref = step.get(ref_key)
                if isinstance(ref, dict) and isinstance(ref.get("path"), str):
                    refs.append(
                        {
                            "step_id": step_id,
                            "labels": labels,
                            "ref_key": ref_key,
                            "path": ref["path"],
                            "normalized_candidates": normalize_ref_path(ref["path"]),
                            "exists_after_normalization": path_exists_after_normalization(ref["path"], members),
                        }
                    )
    return refs


def hash_member_text(path: Path, artifact_format: str, member_name: str, max_bytes: int = 20000) -> dict[str, Any]:
    text = inspect.read_member(path, artifact_format, member_name, max_bytes)
    return {
        "member": member_name,
        "read_chars": len(text),
        "sha256_prefix": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
        "json_keys": sorted(json.loads(text).keys()) if text.strip().startswith("{") and _json_object(text) else [],
    }


def _json_object(text: str) -> bool:
    try:
        return isinstance(json.loads(text), dict)
    except Exception:
        return False


def json_member_summaries(path: Path, artifact_format: str, members: list[inspect.ArchiveMember], limit: int = 12) -> list[dict[str, Any]]:
    summaries = []
    for member in members:
        if len(summaries) >= limit:
            break
        if not member.name.endswith(".json"):
            continue
        try:
            summaries.append(hash_member_text(path, artifact_format, member.name))
        except Exception as exc:
            summaries.append({"member": member.name, "read_error": str(exc)})
    return summaries


def deterministic_order_possible(layout: str, candidates: dict[str, list[str]], json_summaries: list[dict[str, Any]]) -> tuple[bool, str]:
    if layout in {"swe_agent_traj", "terminus_episode", "openhands_events", "mini_swe_generic_traj_json", "mini_swe_mini_traj"}:
        return True, f"known v0.2 layout rule: {layout}"
    if any("/episode-" in path for path in candidates["trajectory_log_files"] + candidates["action_files"]):
        return True, "episode-numbered files suggest deterministic order, but action/observation pairs are incomplete"
    timestamp_like = [item for item in json_summaries if re.search(r"\d{10,}(?:\.\d+)?\.json$", item.get("member", ""))]
    if timestamp_like:
        return True, "timestamped JSON files can be ordered, but action/observation schema is not established"
    return False, "no known ordered trajectory, episode, event, or timestamped action sequence"


def text_recoverability(layout: str, candidates: dict[str, list[str]], json_summaries: list[dict[str, Any]]) -> tuple[bool, bool, str]:
    if layout in {"swe_agent_traj", "terminus_episode", "openhands_events", "mini_swe_generic_traj_json", "mini_swe_mini_traj"}:
        return True, True, f"known v0.2 text sources for {layout}"
    action_keys = {"action", "message", "messages", "choices"}
    observation_keys = {"observation", "content", "messages"}
    json_keys = [set(item.get("json_keys", [])) for item in json_summaries]
    action = bool(candidates["action_files"]) or any(keys & action_keys for keys in json_keys)
    observation = bool(candidates["observation_files"]) or any(keys & observation_keys for keys in json_keys)
    reason = "inferred from candidate paths/JSON keys, not an established parser contract"
    return action, observation, reason


def label_mapping_possible(label_refs: list[dict[str, Any]], sample: dict[str, Any], layout: str) -> tuple[bool, str]:
    if not label_refs and sample.get("label_presence") == "unlabeled":
        return True, "unlabeled trajectory"
    if label_refs:
        mapped = sum(1 for ref in label_refs if ref["exists_after_normalization"])
        return mapped == len(label_refs), f"{mapped}/{len(label_refs)} label ref paths map after normalization"
    if layout == "unsupported_layout":
        return False, "labeled manifest has no path evidence for unsupported layout"
    return True, "step-id labels can map if ordered steps are recovered"


def classify_recommendation(
    case: dict[str, Any],
    layout: str,
    order_possible: bool,
    action_recoverable: bool,
    observation_recoverable: bool,
    label_possible: bool,
) -> tuple[str, str, str, bool]:
    classification = case.get("classification")
    cause = case.get("likely_reason_not_covered")
    if classification in {"parse_failure", "corrupted_or_unreadable_archive"}:
        return "unknown", "block_scaling_until_resolved", "archive/read failure should be resolved before scaling", True
    if layout == "swe_agent_traj" and cause == "manifest/artifact step_count mismatch":
        return (
            "hard",
            "keep_excluded_documented",
            "v0.2 parser exists, but artifact rows do not match manifest step_count; adding rows would require manifest reconciliation, not a parser adapter",
            False,
        )
    if layout == "unsupported_layout" and order_possible and action_recoverable and observation_recoverable and label_possible:
        return (
            "moderate",
            "keep_excluded_documented",
            "signals exist, but no authoritative action/observation contract is established for a non-speculative v0.3 adapter",
            False,
        )
    if layout == "unsupported_layout":
        return (
            "not_feasible",
            "keep_excluded_documented",
            "no clear authoritative action/observation files with deterministic label mapping",
            False,
        )
    return "unknown", "keep_excluded_documented", "no v0.2 schema bug detected", False


def inspect_case(case: dict[str, Any], sample: dict[str, Any], verified_row: dict[str, Any] | None) -> dict[str, Any]:
    local_path = WORKSPACE / str(case["artifact_path"])
    archive_info = failure.archive_diagnosis(local_path)
    artifact_format = inspect.detect_artifact_format(local_path)["format"] if local_path.exists() else "missing"
    members: list[inspect.ArchiveMember] = []
    read_error = None
    if local_path.exists():
        try:
            members = inspect.list_members(local_path, artifact_format)
        except Exception as exc:
            read_error = str(exc)
    layout = parser.detect_layout_family(members, sample) if members else None
    candidates = candidate_paths(members)
    labels = manifest_label_refs(sample, members)
    json_summaries = json_member_summaries(local_path, artifact_format, members) if members else []
    order_possible, order_reason = deterministic_order_possible(str(layout), candidates, json_summaries)
    action_recoverable, observation_recoverable, text_reason = text_recoverability(str(layout), candidates, json_summaries)
    label_possible, label_reason = label_mapping_possible(labels, sample, str(layout))
    feasibility, recommended_action, recommendation_reason, blocks = classify_recommendation(
        case, str(layout), order_possible, action_recoverable, observation_recoverable, label_possible
    )
    return {
        "trajectory_id": case.get("trajectory_id"),
        "artifact_path": sample.get("artifact_repo_path"),
        "local_artifact_path": case.get("artifact_path"),
        "inferred_source": case.get("inferred_source"),
        "source_bucket": case.get("source_bucket"),
        "agent": case.get("agent"),
        "model": case.get("model"),
        "category": case.get("category"),
        "difficulty": case.get("difficulty"),
        "manifest_step_count": sample.get("step_count"),
        "verified_manifest_step_count": verified_row.get("step_count") if verified_row else None,
        "manifest_label_presence": sample.get("label_presence"),
        "current_uncovered_classification": case.get("classification"),
        "local_file_size": archive_info.get("local_file_size"),
        "archive_readability_status": {
            "artifact_format": artifact_format,
            "read_error": read_error,
            "diagnosis": archive_info,
        },
        "archive_member_count": len(members),
        "top_level_archive_directories": top_level_dirs(members),
        "candidate_trajectory_log_files": candidates["trajectory_log_files"],
        "candidate_action_files": candidates["action_files"],
        "candidate_observation_files": candidates["observation_files"],
        "candidate_event_state_files": candidates["event_state_files"],
        "json_member_summaries": json_summaries,
        "manifest_label_reference_paths": labels,
        "label_reference_paths_mapped": sum(1 for ref in labels if ref["exists_after_normalization"]),
        "deterministic_step_order_rule_appears_possible": order_possible,
        "deterministic_step_order_reason": order_reason,
        "action_text_appears_recoverable": action_recoverable,
        "observation_text_appears_recoverable": observation_recoverable,
        "text_recoverability_reason": text_reason,
        "label_to_step_mapping_appears_possible": label_possible,
        "label_mapping_reason": label_reason,
        "likely_cause_of_uncovered_status": case.get("likely_reason_not_covered"),
        "parser_feasibility": feasibility,
        "recommended_action": recommended_action,
        "recommendation_reason": recommendation_reason,
        "should_block_full_verified_extraction": blocks,
        "indicates_v0_2_schema_bug": recommended_action == "fix_v0.2_bug",
    }


def no_raw_text_leak(report: dict[str, Any]) -> bool:
    serialized = json.dumps(report)
    forbidden = ("raw_action", "raw_observation", "action_text\":", "observation_text\":", "```")
    return not any(term in serialized for term in forbidden)


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Deep Inspection Of Uncovered Pilot Cases",
        "",
        "Focused machine inspection of the four Batch 5 uncovered pilot cases.",
        "",
        "No full raw action, observation, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Cases", ""])
    for case in report["cases"]:
        lines.append(f"### {case['trajectory_id']}")
        lines.append("")
        for key in (
            "current_uncovered_classification",
            "agent",
            "source_bucket",
            "manifest_step_count",
            "archive_member_count",
            "deterministic_step_order_rule_appears_possible",
            "action_text_appears_recoverable",
            "observation_text_appears_recoverable",
            "label_to_step_mapping_appears_possible",
            "parser_feasibility",
            "recommended_action",
            "should_block_full_verified_extraction",
        ):
            lines.append(f"- `{key}`: `{case.get(key)}`")
        lines.append(f"- recommendation reason: {case['recommendation_reason']}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    uncovered = load_json(Path(args.uncovered))
    pilot_manifest = load_json(Path(args.pilot_manifest))
    verified_rows = load_verified_rows(Path(args.verified_manifest))
    samples = {sample.get("traj_id"): sample for sample in pilot_manifest.get("samples", [])}
    cases = []
    for case in uncovered.get("cases", []):
        sample = samples.get(case.get("trajectory_id"))
        if sample is None:
            continue
        cases.append(inspect_case(case, sample, verified_rows.get(str(case.get("trajectory_id")))))
    summary = {
        "case_count": len(cases),
        "add_v0_3_adapter_count": sum(1 for case in cases if case["recommended_action"] == "add_v0.3_adapter"),
        "keep_excluded_documented_count": sum(1 for case in cases if case["recommended_action"] == "keep_excluded_documented"),
        "fix_v0_2_bug_count": sum(1 for case in cases if case["recommended_action"] == "fix_v0.2_bug"),
        "blocking_case_count": sum(1 for case in cases if case["should_block_full_verified_extraction"]),
    }
    report = {
        "schema_version": "risk-controlled-intervention-uncovered-deep-inspection.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 5.5 focused uncovered-case inspection only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": summary,
        "cases": cases,
    }
    if not no_raw_text_leak(report):
        raise SystemExit("ERROR: deep inspection report appears to contain prohibited raw text keys")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DEEP_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    DEEP_MD.write_text(markdown(report) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"Saved deep inspection JSON: {DEEP_JSON}")
    print(f"Saved deep inspection markdown: {DEEP_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
