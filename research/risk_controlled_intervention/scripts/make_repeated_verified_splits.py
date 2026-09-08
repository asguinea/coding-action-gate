#!/usr/bin/env python3
"""Create repeated stratified trajectory-level splits for verified prefix rows."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import repeated_split_utils as utils

REPORT_JSON = utils.REPORTS_DIR / "repeated_verified_split_audit.json"
REPORT_MD = utils.REPORTS_DIR / "repeated_verified_split_audit.md"


def create_repeated_splits(rows: list[dict[str, Any]], seeds: tuple[int, ...] = utils.SEEDS) -> dict[str, Any]:
    grouped = utils.group_rows_by_trajectory(rows)
    trajectory_meta = {tid: utils.trajectory_metadata(tid, trajectory_rows) for tid, trajectory_rows in grouped.items()}
    split_records = []
    for seed in seeds:
        assignments = utils.make_assignments(trajectory_meta, seed)
        audit = utils.split_audit(rows, assignments, trajectory_meta)
        split_records.append({"seed": seed, "assignments": assignments, "audit": audit})
    return {
        "schema_version": "risk-controlled-intervention-repeated-splits.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Repeated benchmark split scaffolding only; not production CodingActionGate validation.",
        "seeds": list(seeds),
        "split_ratio": {"train": 0.60, "calibration": 0.20, "test": 0.20},
        "stratification_fields": ["trajectory_has_any_next_step_bad", "source_bucket", "agent_or_layout_family"],
        "trajectory_count": len(trajectory_meta),
        "row_count": len(rows),
        "trajectory_metadata": trajectory_meta,
        "splits": split_records,
    }


def audit_report(splits: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "risk-controlled-intervention-repeated-split-audit.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seeds": splits["seeds"],
        "trajectory_count": splits["trajectory_count"],
        "row_count": splits["row_count"],
        "split_audits": [{"seed": item["seed"], **item["audit"]} for item in splits["splits"]],
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Repeated Verified Split Audit",
        "",
        "Repeated trajectory-level splits for benchmark robustness diagnostics.",
        "",
        "| seed | train rows | calibration rows | test rows | cal risk | test risk | gap | leakage |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["split_audits"]:
        lines.append(
            f"| `{row['seed']}` | `{row['row_counts']['train']}` | `{row['row_counts']['calibration']}` | `{row['row_counts']['test']}` | "
            f"`{row['positive_rates']['calibration']}` | `{row['positive_rates']['test']}` | `{row['calibration_test_base_risk_gap']}` | `{row['trajectory_leakage']}` |"
        )
    return "\n".join(lines)


def main() -> int:
    rows = utils.load_prefix_rows()
    splits = create_repeated_splits(rows)
    audit = audit_report(splits)
    utils.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    utils.REPEATED_SPLITS_PATH.write_text(json.dumps(splits, indent=2, sort_keys=True) + "\n")
    REPORT_JSON.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(audit) + "\n")
    print(json.dumps({"seeds": len(splits["seeds"]), "trajectories": splits["trajectory_count"], "rows": splits["row_count"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
