#!/usr/bin/env python3
"""Deep-inspect one unsupported verified layout cluster without raw text output."""

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
CLUSTERS_JSON = REPORTS_DIR / "unsupported_verified_layout_clusters.json"
OUTPUT_PREFIX = REPORTS_DIR / "unsupported_cluster_deep_inspection"
CLUSTER_SCRIPT = Path(__file__).resolve().with_name("cluster_unsupported_verified_layouts.py")


def _load_cluster_module():
    spec = importlib.util.spec_from_file_location("cluster_unsupported_verified_layouts", CLUSTER_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


cluster_mod = _load_cluster_module()
parser = cluster_mod.parser
inspect = cluster_mod.inspect
audit = cluster_mod.audit


def parse_args() -> argparse.Namespace:
    arg_parser = argparse.ArgumentParser(description="Deep-inspect one unsupported verified layout cluster.")
    arg_parser.add_argument("--cluster-id", required=True)
    arg_parser.add_argument("--max-examples", type=int, default=5)
    return arg_parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def member_names(members: list[inspect.ArchiveMember]) -> list[str]:
    return [member.name for member in members]


def candidate_authoritative_files(members: list[inspect.ArchiveMember]) -> dict[str, list[str]]:
    names = member_names(members)
    return {
        "trajectory_files": [
            name
            for name in names
            if name.endswith((".traj", ".traj.json", "mini.traj.json", "trajectory.json", "history.json"))
            or name.endswith(("agent.log", "run_instance.log"))
        ][:80],
        "event_files": [
            name
            for name in names
            if "/events/" in name
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith((".jsonl", "event_stream.json", "events.json"))
        ][:80],
        "episode_files": [
            name
            for name in names
            if re.search(r"/episode-\d+/", name)
        ][:80],
        "action_candidates": [
            name
            for name in names
            if name.endswith("/response.txt")
            or re.search(r"/events/[^/]+\.json$", name)
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith((".traj", ".traj.json", "agent.log", "run_instance.log"))
        ][:80],
        "observation_candidates": [
            name
            for name in names
            if name.endswith("/prompt.txt")
            or re.search(r"/events/[^/]+\.json$", name)
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith(("agent.log", "run_instance.log"))
        ][:80],
    }


def json_schema_summary(path: Path, artifact_format: str, member_name: str) -> dict[str, Any]:
    text = inspect.read_member(path, artifact_format, member_name, 200_000)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None
    try:
        parsed = json.loads(text)
    except Exception as exc:
        return {
            "member": member_name,
            "read_chars": len(text),
            "sha256_prefix": digest[:16] if digest else None,
            "json_valid": False,
            "parse_error_type": type(exc).__name__,
        }
    if isinstance(parsed, dict):
        keys = sorted(parsed.keys())
        nested = [
            {"object_key": key, "child_keys": sorted(value.keys())[:30]}
            for key, value in parsed.items()
            if isinstance(value, dict)
        ]
        list_lengths = {
            key: len(value)
            for key, value in parsed.items()
            if isinstance(value, list)
        }
        return {
            "member": member_name,
            "read_chars": len(text),
            "sha256_prefix": digest[:16] if digest else None,
            "json_valid": True,
            "json_type": "object",
            "top_level_keys": keys[:50],
            "nested_object_keys": nested,
            "list_lengths": list_lengths,
        }
    if isinstance(parsed, list):
        item_types = dict(Counter(type(item).__name__ for item in parsed[:100]))
        first_keys = sorted(parsed[0].keys())[:50] if parsed and isinstance(parsed[0], dict) else []
        return {
            "member": member_name,
            "read_chars": len(text),
            "sha256_prefix": digest[:16] if digest else None,
            "json_valid": True,
            "json_type": "array",
            "array_length": len(parsed),
            "first_object_keys": first_keys,
            "first_100_item_types": item_types,
        }
    return {
        "member": member_name,
        "read_chars": len(text),
        "sha256_prefix": digest[:16] if digest else None,
        "json_valid": True,
        "json_type": type(parsed).__name__,
    }


def summarize_json_candidates(path: Path, artifact_format: str, members: list[inspect.ArchiveMember], limit: int = 20) -> list[dict[str, Any]]:
    summaries = []
    prioritized = [
        member
        for member in members
        if member.name.endswith(".json")
        and (
            "/events/" in member.name
            or member.name.endswith((".traj.json", "trajectory.json", "history.json", "report.json", "results.json"))
            or "tensorblock__" in member.name
        )
    ]
    for member in prioritized[:limit]:
        try:
            summaries.append(json_schema_summary(path, artifact_format, member.name))
        except Exception as exc:
            summaries.append({"member": member.name, "read_error_type": type(exc).__name__, "read_error": str(exc)[:160]})
    return summaries


def detect_step_order_rule(files: dict[str, list[str]], json_summaries: list[dict[str, Any]]) -> dict[str, str]:
    if files["episode_files"] and all(any(part in name for name in files["episode_files"]) for part in ("/response.txt", "/prompt.txt")):
        return {"available": "yes", "rule": "episode number ordering", "confidence": "high"}
    numeric_events = [name for name in files["event_files"] if re.search(r"/events/\d+\.json$", name)]
    if numeric_events:
        return {"available": "yes", "rule": "numeric event id ordering", "confidence": "high"}
    tensorblocks = [name for name in files["event_files"] if re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)]
    if tensorblocks:
        return {"available": "yes", "rule": "timestamped tensorblock request/response ordering", "confidence": "high"}
    timestamp_json = [name for name in files["event_files"] if re.search(r"\d{10,}(?:\.\d+)?\.json$", name)]
    if timestamp_json:
        return {"available": "unknown", "rule": "timestamp-like file ordering; action/observation contract unverified", "confidence": "low"}
    arrays = [item for item in json_summaries if item.get("json_type") == "array" and item.get("array_length", 0) > 1]
    if arrays:
        return {"available": "unknown", "rule": "array order in JSON candidate; semantic step role unverified", "confidence": "low"}
    return {"available": "no", "rule": "no deterministic step-order signal found", "confidence": "low"}


def detect_action_observation_sources(files: dict[str, list[str]], json_summaries: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, str]]:
    keys = set()
    for item in json_summaries:
        keys.update(item.get("top_level_keys", []))
        keys.update(item.get("first_object_keys", []))
    action_yes = bool(files["action_candidates"]) and bool(keys & {"action", "message", "messages", "command", "thought", "response", "choices"})
    observation_yes = bool(files["observation_candidates"]) and bool(keys & {"observation", "content", "message", "messages", "result", "response", "choices"})
    action = {
        "available": "yes" if action_yes else "unknown" if files["action_candidates"] else "no",
        "source": "candidate action files plus action/message-like JSON keys" if action_yes else "candidate files require schema review",
    }
    observation = {
        "available": "yes" if observation_yes else "unknown" if files["observation_candidates"] else "no",
        "source": "candidate observation files plus observation/content-like JSON keys" if observation_yes else "candidate files require schema review",
    }
    return action, observation


def label_ref_mapping(sample: dict[str, Any], members: list[inspect.ArchiveMember]) -> dict[str, Any]:
    member_set = set(member_names(members))
    refs = cluster_mod.manifest_label_ref_patterns(sample, member_set)
    return {
        "label_ref_count": refs["label_ref_count"],
        "label_ref_exists_count": refs["label_ref_exists_count"],
        "label_ref_all_exist": refs["label_ref_all_exist"],
        "label_ref_suffix_examples": refs["label_ref_suffix_examples"],
    }


def inspect_example(example: dict[str, Any]) -> dict[str, Any]:
    path = WORKSPACE / example["artifact_path"]
    format_info = inspect.detect_artifact_format(path)
    artifact_format = format_info["format"]
    members = inspect.list_members(path, artifact_format)
    files = candidate_authoritative_files(members)
    json_summaries = summarize_json_candidates(path, artifact_format, members)
    order_rule = detect_step_order_rule(files, json_summaries)
    action_source, observation_source = detect_action_observation_sources(files, json_summaries)
    label_mapping = label_ref_mapping(example, members)
    step_count = audit.as_int(example.get("step_count"))
    recoverable_signal_count = max(len(files["action_candidates"]), len(files["event_files"]), len(files["episode_files"]), len(files["trajectory_files"]))
    return {
        "trajectory_id": example.get("trajectory_id"),
        "artifact_path": example.get("artifact_path"),
        "agent": example.get("agent"),
        "model": example.get("model"),
        "source_bucket": example.get("source_bucket"),
        "category": example.get("category"),
        "difficulty": example.get("difficulty"),
        "manifest_step_count": step_count,
        "artifact_format": artifact_format,
        "archive_member_count": len(members),
        "candidate_authoritative_files": files,
        "json_schema_summaries": json_summaries,
        "possible_step_ordering_rule": order_rule,
        "possible_action_source": action_source,
        "possible_observation_source": observation_source,
        "label_reference_mapping": label_mapping,
        "step_count_alignment": {
            "manifest_step_count": step_count,
            "recoverable_signal_count": recoverable_signal_count,
            "aligned_exactly": step_count == recoverable_signal_count if step_count is not None else None,
        },
        "action_observation_recoverable_without_future_state": (
            order_rule["available"] == "yes"
            and action_source["available"] == "yes"
            and observation_source["available"] == "yes"
        ),
    }


def no_raw_text_leak(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code"}:
                return False
            if not no_raw_text_leak(child):
                return False
    elif isinstance(value, list):
        return all(no_raw_text_leak(item) for item in value)
    return True


def markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Unsupported Cluster Deep Inspection: {report['cluster_id']}",
        "",
        "No full raw action, observation, prompt, response, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Examples", ""])
    for example in report["examples"]:
        lines.append(f"### `{example['trajectory_id']}`")
        lines.append(f"- `member_count`: `{example['archive_member_count']}`")
        lines.append(f"- `step_ordering`: `{example['possible_step_ordering_rule']}`")
        lines.append(f"- `action_source`: `{example['possible_action_source']}`")
        lines.append(f"- `observation_source`: `{example['possible_observation_source']}`")
        lines.append(f"- `label_mapping`: `{example['label_reference_mapping']}`")
        lines.append("")
    return "\n".join(lines)


def build_report(cluster_id: str, max_examples: int) -> dict[str, Any]:
    clusters = load_json(CLUSTERS_JSON)
    matches = [cluster for cluster in clusters["clusters"] if cluster["cluster_id"] == cluster_id]
    if not matches:
        raise SystemExit(f"ERROR: cluster not found: {cluster_id}")
    cluster = matches[0]
    examples = [inspect_example(example) for example in cluster["examples"][:max_examples]]
    report = {
        "schema_version": "risk-controlled-intervention-unsupported-cluster-deep-inspection.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.5 deep cluster inspection only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "cluster_id": cluster_id,
        "summary": {
            "cluster_artifact_count": cluster["artifact_count"],
            "cluster_label_positive_count": cluster["label_positive_count"],
            "examples_inspected": len(examples),
            "all_examples_have_deterministic_order": all(item["possible_step_ordering_rule"]["available"] == "yes" for item in examples),
            "all_examples_have_action_source": all(item["possible_action_source"]["available"] == "yes" for item in examples),
            "all_examples_have_observation_source": all(item["possible_observation_source"]["available"] == "yes" for item in examples),
            "all_label_refs_exist": all(item["label_reference_mapping"]["label_ref_all_exist"] in {True, None} for item in examples),
        },
        "cluster_signature": cluster["signature"],
        "examples": examples,
    }
    if not no_raw_text_leak(report):
        raise SystemExit("ERROR: raw-text-like key detected in deep inspection report.")
    return report


def main() -> int:
    args = parse_args()
    report = build_report(args.cluster_id, args.max_examples)
    safe_cluster_id = re.sub(r"[^A-Za-z0-9_.-]", "_", args.cluster_id)
    json_path = OUTPUT_PREFIX.with_name(f"{OUTPUT_PREFIX.name}_{safe_cluster_id}.json")
    md_path = OUTPUT_PREFIX.with_name(f"{OUTPUT_PREFIX.name}_{safe_cluster_id}.md")
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    md_path.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
