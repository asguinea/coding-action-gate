#!/usr/bin/env python3
"""Build or explicitly skip a minimal external prefix dataset for Batch 9O."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
DATA = WORKSPACE / "data" / "intervention_outputs"
SELECTION_JSON = REPORTS / "batch_9o_selected_validation_resource.json"
OUT_DATA = DATA / "external_validation_prefix_rows.jsonl"
OUT_JSON = REPORTS / "batch_9o_external_prefix_dataset_summary.json"
OUT_MD = REPORTS / "batch_9o_external_prefix_dataset_summary.md"

RAW_FIELD_FRAGMENTS = ["action_text", "observation_text", "raw_action", "raw_observation", "terminal_output", "code_text"]


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def load_selection() -> dict[str, Any]:
    return json.loads(require(SELECTION_JSON).read_text())


def assert_no_raw_fields(row: dict[str, Any]) -> None:
    keys = " ".join(row.keys()).lower()
    hits = [term for term in RAW_FIELD_FRAGMENTS if term in keys]
    if hits:
        raise ValueError(f"raw-text fields are not allowed in external prefix rows: {hits}")


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# Batch 9O External Prefix Dataset Summary",
        "",
        "This is a benchmark-level CodeTraceBench-derived external feasibility output for minimal replication of offline proxy diagnostics over first-event and first-failure warning, trajectory-level burden, row-level risk, calibration support, and domain shift. It is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Extraction status: `{report['extraction_status']}`",
        f"- Dataset written: `{report['dataset_written']}`",
        f"- External feasibility path: `{report['external_feasibility_path']}`",
        f"- Trajectories: `{report['summary']['trajectory_count']}`",
        f"- Prefix rows: `{report['summary']['prefix_row_count']}`",
        f"- Bad rows: `{report['summary']['bad_row_count']}`",
        f"- First-failure trajectories: `{report['summary']['first_failure_trajectory_count']}`",
        "",
        "## Caveats",
        "",
    ]
    lines.extend(f"- {item}" for item in report["caveats"])
    OUT_MD.write_text("\n".join(lines) + "\n")


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    selection = load_selection()
    selected = selection.get("selected_resources", [])
    if not selected:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "input_selection": str(SELECTION_JSON),
            "extraction_status": "skipped_no_selected_resource",
            "dataset_written": False,
            "dataset_path": str(OUT_DATA),
            "external_feasibility_path": True,
            "summary": {
                "trajectory_count": 0,
                "prefix_row_count": 0,
                "bad_row_count": 0,
                "first_failure_trajectory_count": 0,
                "prevalence": None,
            },
            "label_semantics": "not_available",
            "raw_text_exclusion_status": "passed_no_rows_written",
            "leakage_checks_possible": False,
            "caveats": [
                "No compatible external or semi-external resource was selected.",
                "No mock rows were created.",
                "The main frozen v0.4 internal extraction was not changed.",
            ],
            "guard_results": {
                "raw_text_in_processed_outputs": False,
                "metadata_as_model_features": False,
                "mock_data_used": False,
                "frozen_v04_changed": False,
            },
        }
        OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        write_md(report)
        print(json.dumps({"extraction_status": report["extraction_status"], "dataset_written": False}, indent=2))
        return
    raise SystemExit(
        "A selected external resource exists, but no resource-specific extractor is implemented. "
        "Add a conservative extractor for that schema rather than using mock data."
    )


if __name__ == "__main__":
    main()
