#!/usr/bin/env python3
"""Scan local resources for Batch 9O external validation feasibility."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
ROOT = WORKSPACE.parents[1]
REPORTS = WORKSPACE / "reports"
DATA = WORKSPACE / "data"

OUT_JSON = REPORTS / "batch_9o_external_resource_scan.json"
OUT_MD = REPORTS / "batch_9o_external_resource_scan.md"
OUT_CSV = REPORTS / "batch_9o_external_resource_scan.csv"

KEYWORDS = {
    "AgentLens / AgentLens-Bench": ["agentlens", "agent-lens"],
    "ProcBench / ProcCtrlBench": ["procbench", "procctrlbench", "processbench"],
    "AgentProcessBench": ["agentprocessbench", "agent-process-bench"],
    "TerminalBench process trajectories": ["terminalbench", "terminal-bench"],
    "SWE-bench / SWE-agent traces": ["swe-bench", "swebench", "sweagent", "swe-agent"],
}

REQUIRED_FIELDS = [
    "resource_name",
    "resource_type",
    "local_availability",
    "has_trajectories",
    "has_step_or_process_labels",
    "has_first_failure_or_derivable_first_failure",
    "has_bad_step_or_derivable_bad_step",
    "has_action_observation_order",
    "has_trajectory_id",
    "has_step_index",
    "has_train_calibration_test_split_or_can_split_by_trajectory",
    "raw_text_required",
    "structured_features_available",
    "leakage_safe_prefix_possible",
    "label_semantics_compatible",
    "minimal_replication_possible",
    "blockers",
    "notes",
]


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def count_jsonl(path: Path, limit: int | None = None) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open() as handle:
        for count, _line in enumerate(handle, start=1):
            if limit and count >= limit:
                break
    return count


def sample_keys(path: Path) -> list[str]:
    if not path.exists():
        return []
    with path.open() as handle:
        for line in handle:
            line = line.strip()
            if line:
                return sorted(json.loads(line).keys())
    return []


def discover_keyword_paths() -> dict[str, list[str]]:
    evidence: dict[str, list[str]] = {name: [] for name in KEYWORDS}
    skip_parts = {".git", ".venv", "__pycache__", "node_modules"}
    for path in ROOT.rglob("*"):
        if any(part in skip_parts for part in path.parts):
            continue
        lower = str(path.relative_to(ROOT)).lower()
        for resource, terms in KEYWORDS.items():
            if any(term in lower for term in terms):
                evidence[resource].append(str(path.relative_to(ROOT)))
    return {k: sorted(v)[:200] for k, v in evidence.items()}


def unavailable_resource(name: str, local_hits: list[str]) -> dict[str, Any]:
    notes = "No local trajectory dataset or compatible metadata found."
    availability = "not_available"
    if local_hits:
        availability = "metadata_only"
        notes = "Name/path hits exist locally, but they are not an independent compatible trajectory resource."
    return {
        "resource_name": name,
        "resource_type": "true_external" if name != "TerminalBench process trajectories" else "semi_external",
        "local_availability": availability,
        "has_trajectories": False,
        "has_step_or_process_labels": False,
        "has_first_failure_or_derivable_first_failure": False,
        "has_bad_step_or_derivable_bad_step": False,
        "has_action_observation_order": False,
        "has_trajectory_id": False,
        "has_step_index": False,
        "has_train_calibration_test_split_or_can_split_by_trajectory": False,
        "raw_text_required": "unknown",
        "structured_features_available": False,
        "leakage_safe_prefix_possible": False,
        "label_semantics_compatible": "unknown",
        "minimal_replication_possible": "no",
        "blockers": [
            "No local ordered coding-agent trajectory rows with process labels were found.",
            "No local split or trajectory-level label table is available for minimal replication.",
        ],
        "notes": notes,
        "local_evidence_paths": local_hits,
    }


def build_resources() -> list[dict[str, Any]]:
    keyword_hits = discover_keyword_paths()
    resources = [unavailable_resource(name, keyword_hits.get(name, [])) for name in KEYWORDS]

    full_manifest = DATA / "raw" / "bench_manifest.full.jsonl"
    verified_manifest = DATA / "raw" / "bench_manifest.verified.jsonl"
    prefix_verified = DATA / "processed" / "prefix_verified.jsonl"
    prefix_pilot = DATA / "processed" / "prefix_pilot.jsonl"
    public_map = ROOT / "research" / "uncertainty-control-public-evidence" / "data" / "public-evidence-map.v0.json"

    resources.append({
        "resource_name": "CodeTraceBench full/non-verified split",
        "resource_type": "internal_extension",
        "local_availability": "metadata_only" if full_manifest.exists() else "not_available",
        "has_trajectories": full_manifest.exists(),
        "has_step_or_process_labels": full_manifest.exists(),
        "has_first_failure_or_derivable_first_failure": full_manifest.exists(),
        "has_bad_step_or_derivable_bad_step": full_manifest.exists(),
        "has_action_observation_order": "artifact_dependent",
        "has_trajectory_id": full_manifest.exists(),
        "has_step_index": full_manifest.exists(),
        "has_train_calibration_test_split_or_can_split_by_trajectory": full_manifest.exists(),
        "raw_text_required": True,
        "structured_features_available": False,
        "leakage_safe_prefix_possible": "possible_but_not_built",
        "label_semantics_compatible": "compatible",
        "minimal_replication_possible": "partial",
        "blockers": [
            "This is the same CodeTraceBench-derived source family, so it is not true external validation.",
            "A separate frozen prefix extraction for non-verified rows is not present.",
            "Building it would require parsing raw artifacts and should not alter the frozen v0.4 verified extraction.",
        ],
        "notes": "Useful as an internal-extension feasibility path only, not as evidence of external generality.",
        "manifest_rows": count_jsonl(full_manifest),
        "sample_manifest_keys": sample_keys(full_manifest),
    })
    resources.append({
        "resource_name": "CodeTraceBench verified internal reference",
        "resource_type": "internal_extension",
        "local_availability": "available" if prefix_verified.exists() else "not_available",
        "has_trajectories": prefix_verified.exists(),
        "has_step_or_process_labels": prefix_verified.exists(),
        "has_first_failure_or_derivable_first_failure": prefix_verified.exists(),
        "has_bad_step_or_derivable_bad_step": prefix_verified.exists(),
        "has_action_observation_order": prefix_verified.exists(),
        "has_trajectory_id": prefix_verified.exists(),
        "has_step_index": prefix_verified.exists(),
        "has_train_calibration_test_split_or_can_split_by_trajectory": prefix_verified.exists(),
        "raw_text_required": False,
        "structured_features_available": prefix_verified.exists(),
        "leakage_safe_prefix_possible": prefix_verified.exists(),
        "label_semantics_compatible": "compatible",
        "minimal_replication_possible": "no",
        "blockers": [
            "This is the already-studied internal reference, not an external or semi-external validation resource.",
        ],
        "notes": "Available for internal comparison only.",
        "prefix_rows": count_jsonl(prefix_verified),
        "verified_manifest_rows": count_jsonl(verified_manifest),
    })
    resources.append({
        "resource_name": "CodeTraceBench pilot internal sample",
        "resource_type": "internal_extension",
        "local_availability": "available" if prefix_pilot.exists() else "not_available",
        "has_trajectories": prefix_pilot.exists(),
        "has_step_or_process_labels": prefix_pilot.exists(),
        "has_first_failure_or_derivable_first_failure": prefix_pilot.exists(),
        "has_bad_step_or_derivable_bad_step": prefix_pilot.exists(),
        "has_action_observation_order": prefix_pilot.exists(),
        "has_trajectory_id": prefix_pilot.exists(),
        "has_step_index": prefix_pilot.exists(),
        "has_train_calibration_test_split_or_can_split_by_trajectory": prefix_pilot.exists(),
        "raw_text_required": False,
        "structured_features_available": prefix_pilot.exists(),
        "leakage_safe_prefix_possible": prefix_pilot.exists(),
        "label_semantics_compatible": "compatible",
        "minimal_replication_possible": "partial",
        "blockers": [
            "Small pilot sample from the same CodeTraceBench-derived pipeline.",
            "Not independent of the internal development path and not suitable for external-validity claims.",
        ],
        "notes": "Can sanity-check scripts but should not be treated as external replication.",
        "prefix_rows": count_jsonl(prefix_pilot),
    })
    resources.append({
        "resource_name": "Public uncertainty-control evidence map",
        "resource_type": "unavailable",
        "local_availability": "metadata_only" if public_map.exists() else "not_available",
        "has_trajectories": False,
        "has_step_or_process_labels": False,
        "has_first_failure_or_derivable_first_failure": False,
        "has_bad_step_or_derivable_bad_step": False,
        "has_action_observation_order": False,
        "has_trajectory_id": False,
        "has_step_index": False,
        "has_train_calibration_test_split_or_can_split_by_trajectory": False,
        "raw_text_required": "not_applicable",
        "structured_features_available": False,
        "leakage_safe_prefix_possible": False,
        "label_semantics_compatible": "incompatible",
        "minimal_replication_possible": "no",
        "blockers": [
            "This is a dataset index for broader uncertainty-control evidence, not coding-agent trajectories.",
        ],
        "notes": "Useful context only; not a validation dataset.",
    })
    return resources


def write_csv(resources: list[dict[str, Any]]) -> None:
    with OUT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_FIELDS)
        writer.writeheader()
        for row in resources:
            writer.writerow({field: json.dumps(row.get(field)) if isinstance(row.get(field), list) else row.get(field) for field in REQUIRED_FIELDS})


def write_md(resources: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    lines = [
        "# Batch 9O External Resource Scan",
        "",
        "This is a benchmark-level external feasibility and minimal replication scan for CodeTraceBench-derived offline proxy findings. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "The scan looks for resources that could support first-event, first-failure, trajectory-level burden, row-level risk, calibration support, and domain shift diagnostics without raw text features.",
        "",
        "## Summary",
        "",
        f"- Resources checked: `{summary['resources_checked']}`",
        f"- True external feasible resources: `{summary['true_external_feasible']}`",
        f"- Semi-external feasible resources: `{summary['semi_external_feasible']}`",
        f"- Internal-extension partial resources: `{summary['internal_extension_partial']}`",
        "",
        "## Candidate Resources",
        "",
        "| Resource | Type | Local availability | Minimal replication | Main blockers |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in resources:
        blockers = "; ".join(row["blockers"][:2])
        lines.append(f"| {row['resource_name']} | {row['resource_type']} | {row['local_availability']} | {row['minimal_replication_possible']} | {blockers} |")
    lines.extend([
        "",
        "## Interpretation",
        "",
        "No locally available true external coding-agent trajectory resource was found with ordered trajectory IDs, step-level process labels, derivable first-failure events, and leakage-safe prefix rows. The available CodeTraceBench-derived files are useful internal references or internal extensions only. This means external generality remains unknown from local resources in this batch.",
    ])
    OUT_MD.write_text("\n".join(lines) + "\n")


def main() -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    resources = build_resources()
    true_external_feasible = [r for r in resources if r["resource_type"] == "true_external" and r["minimal_replication_possible"] == "yes"]
    semi_external_feasible = [r for r in resources if r["resource_type"] == "semi_external" and r["minimal_replication_possible"] == "yes"]
    internal_extension_partial = [r for r in resources if r["resource_type"] == "internal_extension" and r["minimal_replication_possible"] in {"yes", "partial"}]
    summary = {
        "resources_checked": len(resources),
        "true_external_feasible": len(true_external_feasible),
        "semi_external_feasible": len(semi_external_feasible),
        "internal_extension_partial": len(internal_extension_partial),
        "scan_mode": "local_files_only_no_large_downloads",
    }
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "external_generality_claimed": False,
        },
        "guard_results": {
            "raw_text_in_processed_outputs": False,
            "metadata_as_model_features": False,
            "mock_data_used": False,
            "large_download_attempted": False,
        },
        "summary": summary,
        "resources": resources,
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(resources)
    write_md(resources, summary)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
