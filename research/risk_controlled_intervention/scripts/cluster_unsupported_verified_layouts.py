#!/usr/bin/env python3
"""Cluster unsupported verified artifacts by non-raw archive layout signatures."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
TAXONOMY_PATH = REPORTS_DIR / "verified_failure_taxonomy.json"
PREFIX_AUDIT_PATH = REPORTS_DIR / "prefix_verified_audit.json"
DOWNLOAD_MANIFEST_PATH = REPORTS_DIR / "verified_artifact_download_manifest.json"
CLUSTERS_JSON = REPORTS_DIR / "unsupported_verified_layout_clusters.json"
CLUSTERS_MD = REPORTS_DIR / "unsupported_verified_layout_clusters.md"
DECISIONS_JSON = REPORTS_DIR / "v03_parser_candidate_decisions.json"
DECISIONS_MD = REPORTS_DIR / "v03_parser_candidate_decisions.md"
PARSER_SCRIPT = Path(__file__).resolve().with_name("prefix_parsing.py")


def _load_parser():
    spec = importlib.util.spec_from_file_location("prefix_parsing", PARSER_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser = _load_parser()
inspect = parser.inspect
audit = parser.audit


def parse_args() -> argparse.Namespace:
    arg_parser = argparse.ArgumentParser(description="Cluster unsupported verified layouts.")
    arg_parser.add_argument("--taxonomy", default=str(TAXONOMY_PATH))
    arg_parser.add_argument("--prefix-audit", default=str(PREFIX_AUDIT_PATH))
    arg_parser.add_argument("--download-manifest", default=str(DOWNLOAD_MANIFEST_PATH))
    return arg_parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def sample_by_id(download_manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(sample.get("traj_id")): sample for sample in download_manifest.get("samples", [])}


def audit_by_id(prefix_audit: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item.get("trajectory_id")): item for item in prefix_audit.get("trajectories", [])}


def normalize_ref_path(ref_path: str) -> list[str]:
    normalized = ref_path.replace("\\", "/").lstrip("/")
    candidates = [normalized]
    if normalized.startswith("traj/"):
        candidates.append(normalized.removeprefix("traj/"))
    parts = normalized.split("/")
    if len(parts) > 1:
        candidates.append("/".join(parts[1:]))
    return list(dict.fromkeys(candidates))


def ref_path_exists(ref_path: str, member_names: set[str]) -> bool:
    for candidate in normalize_ref_path(ref_path):
        if candidate in member_names or any(name.endswith(candidate) for name in member_names):
            return True
    return False


def manifest_label_ref_patterns(sample: dict[str, Any], member_names: set[str]) -> dict[str, Any]:
    refs = []
    exists = 0
    for stage in audit.coerce_list(sample.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            for ref_key in ("action_ref", "observation_ref"):
                ref = step.get(ref_key)
                if not isinstance(ref, dict) or not isinstance(ref.get("path"), str):
                    continue
                ref_path = ref["path"].replace("\\", "/").lstrip("/")
                refs.append(
                    {
                        "ref_key": ref_key,
                        "suffix": "/".join(ref_path.split("/")[-3:]),
                        "extension": Path(ref_path).suffix.lower() or "<none>",
                        "contains_events": "/events/" in ref_path,
                        "contains_episode": "/episode-" in ref_path,
                    }
                )
                exists += int(ref_path_exists(ref_path, member_names))
    return {
        "label_ref_count": len(refs),
        "label_ref_exists_count": exists,
        "label_ref_all_exist": exists == len(refs) if refs else None,
        "label_ref_extensions": sorted(dict(Counter(item["extension"] for item in refs)).items()),
        "label_ref_markers": {
            "events": sum(1 for item in refs if item["contains_events"]),
            "episode": sum(1 for item in refs if item["contains_episode"]),
        },
        "label_ref_suffix_examples": [item["suffix"] for item in refs[:12]],
    }


def extension_counts(members: list[inspect.ArchiveMember]) -> dict[str, int]:
    counter = Counter()
    for member in members:
        suffix = Path(member.name).suffix.lower() or "<none>"
        counter[suffix] += 1
    return dict(sorted(counter.items()))


def top_level_dirs(members: list[inspect.ArchiveMember]) -> list[str]:
    return sorted({member.name.split("/", 1)[0] for member in members if member.name})


def path_patterns(members: list[inspect.ArchiveMember]) -> dict[str, Any]:
    names = [member.name for member in members]
    lower_names = [name.lower() for name in names]
    return {
        "has_agent_logs": any("/agent-logs/" in name or name.startswith("agent-logs/") for name in names),
        "has_sessions": any("/sessions/" in name or name.startswith("sessions/") for name in names),
        "has_events_dir": any("/events/" in name for name in names),
        "has_event_json_numeric": any(re.search(r"/events/\d+\.json$", name) for name in names),
        "has_event_json_any": any("/events/" in name and name.endswith(".json") for name in names),
        "has_episode_response": any(re.search(r"/episode-\d+/response\.txt$", name) for name in names),
        "has_episode_prompt": any(re.search(r"/episode-\d+/prompt\.txt$", name) for name in names),
        "has_traj_json": any(name.endswith(".traj.json") for name in names),
        "has_mini_traj_json": any(name.endswith("mini.traj.json") for name in names),
        "has_traj": any(name.endswith(".traj") for name in names),
        "has_agent_log": any(name.endswith("agent.log") for name in names),
        "has_run_instance_log": any(name.endswith("run_instance.log") for name in names),
        "has_jsonl": any(name.endswith(".jsonl") for name in names),
        "has_tensorblock_json": any(re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name) for name in names),
        "openhands_marker": any("openhands" in name for name in lower_names),
        "swe_agent_marker": any("swe-agent" in name or "sweagent" in name for name in lower_names),
        "terminus_marker": any("terminus" in name or "episode-" in name for name in lower_names),
        "miniswe_marker": any("mini" in name and "traj" in name for name in lower_names),
    }


def candidate_counts(members: list[inspect.ArchiveMember]) -> dict[str, int]:
    names = [member.name for member in members]
    return {
        "candidate_action_files": sum(
            1
            for name in names
            if name.endswith("/response.txt")
            or re.search(r"/events/[^/]+\.json$", name)
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith((".traj", ".traj.json", "agent.log", "run_instance.log"))
        ),
        "candidate_observation_files": sum(
            1
            for name in names
            if name.endswith("/prompt.txt")
            or re.search(r"/events/[^/]+\.json$", name)
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith(("agent.log", "run_instance.log"))
        ),
        "candidate_event_state_log_files": sum(
            1
            for name in names
            if "/events/" in name
            or "/event_cache/" in name
            or re.search(r"(?:^|/)tensorblock__[^/]+-\d+(?:\.\d+)?\.json$", name)
            or name.endswith(("agent.log", "run_instance.log", "report.json", "results.json", ".jsonl"))
        ),
    }


def likely_layout_marker(patterns: dict[str, Any], sample: dict[str, Any]) -> str:
    agent = str(sample.get("agent") or "").lower()
    if patterns["has_episode_response"] or patterns["has_episode_prompt"]:
        return "episode_like"
    if patterns["has_event_json_numeric"]:
        return "openhands_numeric_events"
    if patterns["has_tensorblock_json"]:
        return "openhands_tensorblock"
    if patterns["has_events_dir"] or patterns["has_event_json_any"]:
        return "openhands_non_numeric_events"
    if patterns["has_traj"] or patterns["has_traj_json"]:
        return "trajectory_file"
    if patterns["has_run_instance_log"]:
        return "run_instance_log"
    if "openhands" in agent:
        return "openhands_other"
    if "swe" in agent:
        return "swe_other"
    if "terminus" in agent:
        return "terminus_other"
    return "unknown_other"


def signature_for_artifact(sample: dict[str, Any], members: list[inspect.ArchiveMember]) -> dict[str, Any]:
    member_names = {member.name for member in members}
    patterns = path_patterns(members)
    counts = candidate_counts(members)
    refs = manifest_label_ref_patterns(sample, member_names)
    marker = likely_layout_marker(patterns, sample)
    top_dirs = top_level_dirs(members)
    signature_parts = {
        "agent": sample.get("agent"),
        "source_bucket": sample.get("source_bucket"),
        "layout_marker": marker,
        "top_dirs": top_dirs[:8],
        "patterns": patterns,
        "extension_counts": extension_counts(members),
        "candidate_counts": counts,
        "label_ref_extensions": refs["label_ref_extensions"],
        "label_ref_markers": refs["label_ref_markers"],
        "label_ref_all_exist": refs["label_ref_all_exist"],
    }
    signature_text = json.dumps(signature_parts, sort_keys=True)
    cluster_id = f"cluster_{hashlib.sha256(signature_text.encode('utf-8')).hexdigest()[:12]}"
    return {
        "cluster_id": cluster_id,
        "signature": signature_parts,
        "patterns": patterns,
        "candidate_counts": counts,
        "label_ref_summary": refs,
        "top_level_dirs": top_dirs,
        "member_count": len(members),
    }


def feasibility_for_cluster(cluster: dict[str, Any]) -> tuple[str, str, str, bool]:
    sig = cluster["signature"]
    patterns = sig["patterns"]
    counts = sig["candidate_counts"]
    label_refs = cluster["aggregate"]["label_ref_count"]
    label_ref_exists = cluster["aggregate"]["label_ref_exists_count"]
    label_ref_all_or_unlabeled = label_refs == 0 or label_ref_exists == label_refs
    artifact_count = cluster["artifact_count"]
    if patterns["has_episode_response"] and patterns["has_episode_prompt"]:
        return "easy", "add_v0.3_adapter", "episode prompt/response pairs provide deterministic ordering", False
    if patterns["has_event_json_numeric"]:
        return "easy", "add_v0.3_adapter", "numeric event stream resembles existing OpenHands event layout", False
    if patterns["has_tensorblock_json"]:
        return "easy", "add_v0.3_adapter", "timestamped tensorblock request/response JSON files provide deterministic response ordering", False
    if patterns["has_events_dir"] and counts["candidate_event_state_log_files"] > 0 and label_ref_all_or_unlabeled:
        return "moderate", "inspect_more", "event files exist but ordering/action/observation schema needs deep inspection", False
    if patterns["has_run_instance_log"] and counts["candidate_event_state_log_files"] > 0:
        return "hard", "inspect_more", "log files may contain ordered text but parser contract is not established", False
    if artifact_count >= 20:
        return "hard", "inspect_more", "high-frequency unsupported layout without an established deterministic parser contract", False
    return "unknown", "keep_excluded_documented", "low-frequency or unclear layout; nonblocking documented exclusion", False


def candidate_decision(cluster: dict[str, Any]) -> dict[str, Any]:
    feasibility, action, reason, blocks = feasibility_for_cluster(cluster)
    patterns = cluster["signature"]["patterns"]
    counts = cluster["signature"]["candidate_counts"]
    label_refs = cluster["aggregate"]["label_ref_count"]
    label_ref_exists = cluster["aggregate"]["label_ref_exists_count"]
    deterministic = (
        "yes"
        if patterns["has_episode_response"] or patterns["has_event_json_numeric"] or patterns["has_tensorblock_json"]
        else "unknown"
        if patterns["has_events_dir"] or patterns["has_run_instance_log"]
        else "no"
    )
    action_source = "yes" if counts["candidate_action_files"] else "unknown"
    observation_source = "yes" if counts["candidate_observation_files"] else "unknown"
    label_mapping = "yes" if label_refs == 0 or label_ref_exists == label_refs else "unknown" if label_ref_exists else "no"
    leakage_risk = "low" if deterministic == "yes" and action_source == "yes" and observation_source == "yes" else "unknown"
    meaningful_gain = cluster["artifact_count"] >= 10 or patterns["has_tensorblock_json"]
    if action == "add_v0.3_adapter" and deterministic == "yes" and action_source == "yes" and observation_source == "yes" and label_mapping == "yes" and leakage_risk == "low" and meaningful_gain:
        decision = "implement_now"
    elif action == "inspect_more":
        decision = "defer_optional"
    elif leakage_risk in {"high", "unknown"} and deterministic == "no":
        decision = "exclude_documented"
    else:
        decision = "exclude_documented"
    return {
        "cluster_id": cluster["cluster_id"],
        "artifact_count": cluster["artifact_count"],
        "label_positive_count": cluster["label_positive_count"],
        "expected_coverage_gain": cluster["artifact_count"],
        "parser_feasibility": feasibility,
        "deterministic_ordering_available": deterministic,
        "action_source_available": action_source,
        "observation_source_available": observation_source,
        "label_mapping_available": label_mapping,
        "leakage_risk": leakage_risk,
        "recommended_decision": decision,
        "rationale": reason,
    }


def should_analyze_case(item: dict[str, Any], audit_report: dict[str, Any] | None) -> bool:
    if item.get("classification") in {"unsupported_layout", "parsed_zero_prefix"}:
        return True
    if audit_report and float(audit_report.get("label_mapping_success_rate") or 1.0) < 0.90:
        return True
    return False


def label_positive(sample: dict[str, Any]) -> bool:
    counts = sample.get("label_counts") or {}
    return bool(
        int(counts.get("incorrect_or_unuseful_count") or 0)
        or int(counts.get("incorrect_count") or 0)
        or int(counts.get("unuseful_count") or 0)
        or int(counts.get("incorrect_step_ids") or 0)
        or int(counts.get("unuseful_step_ids") or 0)
    )


def inspect_artifact_signature(sample: dict[str, Any]) -> dict[str, Any]:
    path = WORKSPACE / str(sample["local_path"])
    format_info = inspect.detect_artifact_format(path)
    artifact_format = format_info["format"]
    members = inspect.list_members(path, artifact_format)
    signature = signature_for_artifact(sample, members)
    return {
        "trajectory_id": sample.get("traj_id"),
        "artifact_path": sample.get("local_path"),
        "agent": sample.get("agent"),
        "model": sample.get("model"),
        "source_bucket": sample.get("source_bucket"),
        "category": sample.get("category"),
        "difficulty": sample.get("difficulty"),
        "step_count": audit.as_int(sample.get("step_count")) or 0,
        "label_presence": sample.get("label_presence"),
        "label_positive": label_positive(sample),
        "artifact_format": artifact_format,
        **signature,
    }


def build_clusters(
    taxonomy_report: dict[str, Any],
    prefix_audit: dict[str, Any],
    download_manifest: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    samples = sample_by_id(download_manifest)
    audits = audit_by_id(prefix_audit)
    analyzed: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in taxonomy_report.get("artifacts", []):
        trajectory_id = str(item.get("trajectory_id"))
        sample = samples.get(trajectory_id)
        audit_report = audits.get(trajectory_id)
        if sample is None or not should_analyze_case(item, audit_report):
            continue
        try:
            record = inspect_artifact_signature(sample)
            record["previous_classification"] = item.get("classification")
            record["previous_layout_family"] = item.get("layout_family")
            record["previous_zero_prefix_cause"] = item.get("likely_reason_uncovered")
            if audit_report is not None:
                record["previous_label_mapping_success_rate"] = audit_report.get("label_mapping_success_rate")
                record["previous_mapped_label_count"] = audit_report.get("mapped_label_count")
                record["previous_label_count"] = audit_report.get("label_count")
            analyzed.append(record)
        except Exception as exc:
            errors.append({"trajectory_id": trajectory_id, "reason": str(exc)})
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in analyzed:
        grouped[item["cluster_id"]].append(item)
    clusters = []
    for cluster_id, items in grouped.items():
        first = items[0]
        aggregate = {
            "label_ref_count": sum(int(item["label_ref_summary"]["label_ref_count"]) for item in items),
            "label_ref_exists_count": sum(int(item["label_ref_summary"]["label_ref_exists_count"]) for item in items),
            "step_count_total": sum(int(item.get("step_count") or 0) for item in items),
        }
        cluster = {
            "cluster_id": cluster_id,
            "artifact_count": len(items),
            "label_positive_count": sum(1 for item in items if item["label_positive"]),
            "total_manifest_step_count": aggregate["step_count_total"],
            "signature": first["signature"],
            "aggregate": aggregate,
            "candidate_parser_feasibility": None,
            "recommended_action": None,
            "recommendation_reason": None,
            "estimated_coverage_gain_if_supported": len(items),
            "should_block_baseline_modeling": False,
            "examples": [
                {
                    "trajectory_id": item["trajectory_id"],
                    "artifact_path": item["artifact_path"],
                    "agent": item["agent"],
                    "model": item["model"],
                    "source_bucket": item["source_bucket"],
                    "category": item["category"],
                    "difficulty": item["difficulty"],
                    "step_count": item["step_count"],
                    "label_presence": item["label_presence"],
                    "label_positive": item["label_positive"],
                    "member_count": item["member_count"],
                    "label_ref_summary": item["label_ref_summary"],
                    "previous_classification": item["previous_classification"],
                }
                for item in items[:20]
            ],
        }
        feasibility, action, reason, blocks = feasibility_for_cluster(cluster)
        cluster["candidate_parser_feasibility"] = feasibility
        cluster["recommended_action"] = action
        cluster["recommendation_reason"] = reason
        cluster["should_block_baseline_modeling"] = blocks
        clusters.append(cluster)
    clusters.sort(key=lambda cluster: (-cluster["artifact_count"], -cluster["label_positive_count"], cluster["cluster_id"]))
    return clusters, errors


def decisions_from_clusters(clusters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [candidate_decision(cluster) for cluster in clusters]


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


def cluster_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Unsupported Verified Layout Clusters",
        "",
        "Machine-generated non-raw layout clustering for unsupported and zero-prefix verified artifacts.",
        "",
        "No full raw action, observation, prompt, response, or code text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Top Clusters", ""])
    for cluster in report["clusters"][:25]:
        lines.append(
            f"- `{cluster['cluster_id']}` artifacts `{cluster['artifact_count']}` labels `{cluster['label_positive_count']}` "
            f"marker `{cluster['signature']['layout_marker']}` feasibility `{cluster['candidate_parser_feasibility']}` "
            f"action `{cluster['recommended_action']}`"
        )
    return "\n".join(lines)


def decisions_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# v0.3 Parser Candidate Decisions",
        "",
        "Decision list generated before parser expansion. This is pre-modeling infrastructure only.",
        "",
        "| cluster | artifacts | label-positive | feasibility | order | action | observation | labels | leakage | decision |",
        "|---|---:|---:|---|---|---|---|---|---|---|",
    ]
    for item in report["decisions"]:
        lines.append(
            "| {cluster_id} | {artifact_count} | {label_positive_count} | {parser_feasibility} | "
            "{deterministic_ordering_available} | {action_source_available} | {observation_source_available} | "
            "{label_mapping_available} | {leakage_risk} | {recommended_decision} |".format(**item)
        )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    taxonomy_report = load_json(Path(args.taxonomy))
    prefix_audit = load_json(Path(args.prefix_audit))
    download_manifest = load_json(Path(args.download_manifest))
    clusters, errors = build_clusters(taxonomy_report, prefix_audit, download_manifest)
    decisions = decisions_from_clusters(clusters)
    cluster_report = {
        "schema_version": "risk-controlled-intervention-unsupported-verified-layout-clusters.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.5 unsupported-layout clustering only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": {
            "unsupported_zero_prefix_or_poor_mapping_artifacts_analyzed": sum(cluster["artifact_count"] for cluster in clusters),
            "cluster_count": len(clusters),
            "analysis_error_count": len(errors),
        },
        "analysis_errors": errors,
        "clusters": clusters,
    }
    decision_report = {
        "schema_version": "risk-controlled-intervention-v03-parser-candidate-decisions.v1",
        "generated_at": cluster_report["generated_at"],
        "claim_boundary": cluster_report["claim_boundary"],
        "summary": {
            "candidate_cluster_count": len(decisions),
            "implement_now_count": sum(1 for item in decisions if item["recommended_decision"] == "implement_now"),
            "defer_optional_count": sum(1 for item in decisions if item["recommended_decision"] == "defer_optional"),
            "exclude_documented_count": sum(1 for item in decisions if item["recommended_decision"] == "exclude_documented"),
            "reject_unsafe_count": sum(1 for item in decisions if item["recommended_decision"] == "reject_unsafe"),
        },
        "decisions": decisions,
    }
    if not no_raw_text_leak(cluster_report) or not no_raw_text_leak(decision_report):
        raise SystemExit("ERROR: raw-text-like key detected in cluster reports.")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    CLUSTERS_JSON.write_text(json.dumps(cluster_report, indent=2, sort_keys=True) + "\n")
    CLUSTERS_MD.write_text(cluster_markdown(cluster_report) + "\n")
    DECISIONS_JSON.write_text(json.dumps(decision_report, indent=2, sort_keys=True) + "\n")
    DECISIONS_MD.write_text(decisions_markdown(decision_report) + "\n")
    print(json.dumps({"clusters": cluster_report["summary"], "decisions": decision_report["summary"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
