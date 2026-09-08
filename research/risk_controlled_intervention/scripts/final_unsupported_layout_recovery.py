#!/usr/bin/env python3
"""Final targeted recovery classification for remaining unsupported verified layouts."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
TAXONOMY = REPORTS_DIR / "verified_failure_taxonomy.json"
DOWNLOAD_MANIFEST = REPORTS_DIR / "verified_artifact_download_manifest.json"
OUTPUT_JSON = REPORTS_DIR / "final_unsupported_layout_recovery.json"
OUTPUT_MD = REPORTS_DIR / "final_unsupported_layout_recovery.md"
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
    return argparse.ArgumentParser(description="Classify remaining unsupported verified layouts.").parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def no_raw_text_leak(value: Any) -> bool:
    return cluster_mod.no_raw_text_leak(value)


def candidate_files(members: list[inspect.ArchiveMember]) -> dict[str, list[str]]:
    names = [member.name for member in members]
    return {
        "trajectory_or_log_files": [
            name for name in names if name.endswith((".traj", ".traj.json", "agent.log", "run_instance.log", "history.json", "trajectory.json"))
        ][:60],
        "event_state_files": [
            name for name in names if "/events/" in name or "tensorblock__" in name or name.endswith((".jsonl", "report.json", "results.json"))
        ][:60],
        "episode_files": [name for name in names if "/episode-" in name][:60],
    }


def availability_from_signature(signature: dict[str, Any], aggregate: dict[str, int]) -> dict[str, str]:
    patterns = signature["patterns"]
    counts = signature["candidate_counts"]
    label_refs = aggregate.get("label_ref_count", 0)
    label_ref_exists = aggregate.get("label_ref_exists_count", 0)
    deterministic = "yes" if patterns.get("has_episode_response") and patterns.get("has_episode_prompt") else "no"
    if patterns.get("has_event_json_numeric") or patterns.get("has_tensorblock_json"):
        deterministic = "yes"
    elif patterns.get("has_run_instance_log") or patterns.get("has_agent_log") or patterns.get("has_events_dir"):
        deterministic = "unknown"
    action = "yes" if counts.get("candidate_action_files", 0) > 0 else "no"
    observation = "yes" if counts.get("candidate_observation_files", 0) > 0 else "no"
    labels = "yes" if label_refs == 0 or label_ref_exists == label_refs else "unknown" if label_ref_exists else "no"
    leakage = "low" if deterministic == "yes" and action == "yes" and observation == "yes" else "unknown"
    return {
        "deterministic_ordering_available": deterministic,
        "action_source_available": action,
        "observation_source_available": observation,
        "label_mapping_available": labels,
        "leakage_risk": leakage,
    }


def classify_cluster(cluster: dict[str, Any]) -> tuple[str, str, str]:
    sig = cluster["layout_signature"]
    patterns = sig["patterns"]
    availability = availability_from_signature(sig, cluster["aggregate"])
    if availability["leakage_risk"] == "low":
        return "possible_existing_adapter_bug", "fix_existing_adapter", "layout appears to satisfy an already-supported deterministic contract"
    if patterns.get("has_run_instance_log") or patterns.get("has_agent_log"):
        return (
            "already_rejected_no_action_observation_contract",
            "keep_excluded_documented",
            "archive exposes logs but no verified step-level action/observation contract",
        )
    if patterns.get("has_events_dir"):
        return (
            "ambiguous",
            "defer_future_work",
            "event-like files exist but deterministic action/observation semantics are not established",
        )
    if cluster["aggregate"].get("label_ref_count", 0) and not cluster["aggregate"].get("label_ref_exists_count", 0):
        return "already_rejected_no_label_mapping", "keep_excluded_documented", "manifest label refs do not map to archive members"
    return "not_recoverable", "keep_excluded_documented", "no deterministic step-order or action/observation evidence"


def build_report() -> dict[str, Any]:
    taxonomy = load_json(TAXONOMY)
    samples = {str(item.get("traj_id")): item for item in load_json(DOWNLOAD_MANIFEST).get("samples", [])}
    unsupported_ids = {
        str(item.get("trajectory_id"))
        for item in taxonomy.get("artifacts", [])
        if item.get("classification") == "unsupported_layout"
    }
    records = []
    errors = []
    for trajectory_id in sorted(unsupported_ids):
        sample = samples.get(trajectory_id)
        if sample is None:
            errors.append({"trajectory_id": trajectory_id, "reason": "missing download manifest sample"})
            continue
        try:
            signature = cluster_mod.inspect_artifact_signature(sample)
            path = WORKSPACE / str(sample["local_path"])
            fmt = inspect.detect_artifact_format(path)["format"]
            members = inspect.list_members(path, fmt)
            signature["candidate_files"] = candidate_files(members)
            records.append(signature)
        except Exception as exc:
            errors.append({"trajectory_id": trajectory_id, "reason": str(exc)})
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["cluster_id"]].append(record)
    clusters = []
    for cluster_id, items in grouped.items():
        first = items[0]
        aggregate = {
            "label_ref_count": sum(int(item["label_ref_summary"]["label_ref_count"]) for item in items),
            "label_ref_exists_count": sum(int(item["label_ref_summary"]["label_ref_exists_count"]) for item in items),
        }
        cluster = {
            "cluster_id": cluster_id,
            "artifact_count": len(items),
            "label_positive_count": sum(1 for item in items if item["label_positive"]),
            "agent_distribution": dict(Counter(str(item.get("agent")) for item in items)),
            "source_bucket_distribution": dict(Counter(str(item.get("source_bucket")) for item in items)),
            "category_distribution": dict(Counter(str(item.get("category")) for item in items)),
            "difficulty_distribution": dict(Counter(str(item.get("difficulty")) for item in items)),
            "layout_signature": first["signature"],
            "candidate_files": first.get("candidate_files", {}),
            "aggregate": aggregate,
            "examples": [
                {
                    "trajectory_id": item["trajectory_id"],
                    "artifact_path": item["artifact_path"],
                    "step_count": item["step_count"],
                    "label_positive": item["label_positive"],
                }
                for item in items[:12]
            ],
        }
        cluster.update(availability_from_signature(cluster["layout_signature"], aggregate))
        classification, recommendation, rationale = classify_cluster(cluster)
        cluster["classification"] = classification
        cluster["recovery_recommendation"] = recommendation
        cluster["rationale"] = rationale
        clusters.append(cluster)
    clusters.sort(key=lambda item: (-item["artifact_count"], -item["label_positive_count"], item["cluster_id"]))
    report = {
        "schema_version": "risk-controlled-intervention-final-unsupported-layout-recovery.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 6.75 unsupported layout recovery only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "summary": {
            "unsupported_artifacts_inspected": sum(item["artifact_count"] for item in clusters),
            "cluster_count": len(clusters),
            "analysis_error_count": len(errors),
            "classification_counts": dict(Counter(item["classification"] for item in clusters)),
            "recommendation_counts": dict(Counter(item["recovery_recommendation"] for item in clusters)),
            "clusters_recommended_for_v0_4": sum(1 for item in clusters if item["recovery_recommendation"] == "add_v0.4_adapter"),
            "clusters_recommended_for_existing_fix": sum(1 for item in clusters if item["recovery_recommendation"] == "fix_existing_adapter"),
        },
        "analysis_errors": errors,
        "clusters": clusters,
    }
    if not no_raw_text_leak(report):
        raise SystemExit("ERROR: raw-text-like key detected in unsupported recovery report.")
    return report


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Final Unsupported Layout Recovery",
        "",
        "Machine-driven recovery classification for remaining unsupported verified artifacts. No raw artifact text is included.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Clusters", ""])
    for cluster in report["clusters"]:
        lines.append(
            f"- `{cluster['cluster_id']}` artifacts `{cluster['artifact_count']}` labels `{cluster['label_positive_count']}` "
            f"class `{cluster['classification']}` recommendation `{cluster['recovery_recommendation']}`: {cluster['rationale']}"
        )
    return "\n".join(lines)


def main() -> int:
    parse_args()
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps(report["summary"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
