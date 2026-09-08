#!/usr/bin/env python3
"""Select Batch 9O validation resource from the local feasibility scan."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
SCAN_JSON = REPORTS / "batch_9o_external_resource_scan.json"
OUT_JSON = REPORTS / "batch_9o_selected_validation_resource.json"
OUT_MD = REPORTS / "batch_9o_selected_validation_resource.md"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def load_scan() -> dict[str, Any]:
    return json.loads(require(SCAN_JSON).read_text())


def choose(resources: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str, list[str]]:
    for resource_type in ["true_external", "semi_external", "internal_extension"]:
        feasible = [
            row for row in resources
            if row["resource_type"] == resource_type and row["minimal_replication_possible"] == "yes"
        ]
        if feasible:
            return feasible[:1], f"selected_{resource_type}", []
    blockers = [
        "No true external resource has local ordered coding-agent trajectories with compatible step/process labels.",
        "No semi-external resource has local compatible process-label tables for minimal replication.",
        "Internal-extension resources are partial or already internal references, so selecting them would not answer the external feasibility question.",
    ]
    return [], "no_feasible_resource", blockers


def write_md(report: dict[str, Any]) -> None:
    selected = report["selected_resources"]
    lines = [
        "# Batch 9O Selected Validation Resource",
        "",
        "This is a benchmark-level external feasibility and minimal replication decision for CodeTraceBench-derived offline proxy diagnostics over first-event and first-failure warning, trajectory-level burden, row-level risk, calibration support, and domain shift. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Selection status: `{report['selection_status']}`",
        f"- Feasibility-only path: `{report['feasibility_only_path']}`",
        f"- Can support external-validity claims: `{report['can_support_external_validity_claims']}`",
        "",
        "## Selected Resources",
        "",
    ]
    if selected:
        for row in selected:
            lines.extend([
                f"- `{row['resource_name']}` ({row['resource_type']})",
                f"  - Limitations: {'; '.join(row.get('blockers', []))}",
            ])
    else:
        lines.append("No resource was selected. The batch proceeds through the feasibility-only path.")
    lines.extend([
        "",
        "## Rationale",
        "",
        report["selection_rationale"],
        "",
        "## What Can Be Replicated",
        "",
        report["replicable_analyses"],
        "",
        "## What Cannot Be Replicated",
        "",
        report["non_replicable_analyses"],
    ])
    OUT_MD.write_text("\n".join(lines) + "\n")


def main() -> None:
    scan = load_scan()
    selected, status, blockers = choose(scan["resources"])
    feasibility_only = not selected
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_scan": str(SCAN_JSON),
        "selection_status": status,
        "selected_resources": selected,
        "feasibility_only_path": feasibility_only,
        "selection_rationale": (
            "No compatible local external or semi-external coding-agent trajectory resource was found. "
            "The available CodeTraceBench-derived resources are internal references or partial internal extensions, "
            "so they cannot support external generality claims."
            if feasibility_only else
            "Selected the highest-priority resource with compatible local trajectory labels."
        ),
        "replicable_analyses": "None in this local run." if feasibility_only else "Minimal row-to-trajectory burden and first-event diagnostics.",
        "non_replicable_analyses": (
            "External row-to-trajectory burden replication, oracle/random external diagnostics, and first-event warning feasibility cannot be run without a compatible external prefix/event table."
            if feasibility_only else "Learned-risk analyses may be unavailable if structured features are absent."
        ),
        "can_support_external_validity_claims": False if feasibility_only else selected[0]["resource_type"] == "true_external",
        "blockers": blockers,
        "guard_results": {
            "raw_text_in_processed_outputs": False,
            "metadata_as_model_features": False,
            "mock_data_used": False,
            "large_download_attempted": False,
        },
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "adaptation_or_external_generality_claimed": False,
        },
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_md(report)
    print(json.dumps({"selection_status": status, "selected_count": len(selected)}, indent=2))


if __name__ == "__main__":
    main()
