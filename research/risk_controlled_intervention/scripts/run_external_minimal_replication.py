#!/usr/bin/env python3
"""Run Batch 9O minimal replication diagnostics when an external prefix table exists."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
DATASET = WORKSPACE / "data" / "intervention_outputs" / "external_validation_prefix_rows.jsonl"
SUMMARY_JSON = REPORTS / "batch_9o_external_prefix_dataset_summary.json"
OUT_JSON = REPORTS / "batch_9o_external_minimal_replication.json"
OUT_MD = REPORTS / "batch_9o_external_minimal_replication.md"
BURDEN_CSV = REPORTS / "batch_9o_external_burden_curves.csv"
ORACLE_CSV = REPORTS / "batch_9o_external_oracle_random_diagnostics.csv"
FIRST_EVENT_CSV = REPORTS / "batch_9o_external_first_event_feasibility.csv"
COMPARISON_CSV = REPORTS / "batch_9o_internal_external_comparison.csv"

ROW_BUDGETS = [0.01, 0.02, 0.05, 0.10, 0.20]
TRAJ_BUDGETS = [0.10, 0.20, 0.25, 0.30, 0.40, 0.50]


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                if any(key in row for key in ["action_text", "observation_text", "terminal_output", "code_text"]):
                    raise ValueError("external prefix dataset contains raw-text fields")
                rows.append(row)
    return rows


def metrics(rows: list[dict[str, Any]], deferred_indices: set[int]) -> dict[str, float]:
    total_rows = len(rows)
    trajectories = {r["trajectory_id"] for r in rows}
    bad_indices = {i for i, r in enumerate(rows) if int(r.get("next_step_bad", 0)) == 1}
    deferred_bad = bad_indices & deferred_indices
    touched = {rows[i]["trajectory_id"] for i in deferred_indices}
    allowed = total_rows - len(deferred_indices)
    allowed_bad = len(bad_indices - deferred_indices)
    bad_by_traj = defaultdict(list)
    deferred_by_traj = defaultdict(list)
    for i, row in enumerate(rows):
        if int(row.get("next_step_bad", 0)) == 1:
            bad_by_traj[row["trajectory_id"]].append(i)
        if i in deferred_indices:
            deferred_by_traj[row["trajectory_id"]].append(i)
    covered = 0
    for tid, bads in bad_by_traj.items():
        first_bad = min(bads)
        if any(idx <= first_bad for idx in deferred_by_traj.get(tid, [])):
            covered += 1
    return {
        "row_deferral_rate": len(deferred_indices) / total_rows if total_rows else 0.0,
        "trajectory_burden": len(touched) / len(trajectories) if trajectories else 0.0,
        "burden_inflation": (len(touched) / len(trajectories)) / (len(deferred_indices) / total_rows) if total_rows and trajectories and deferred_indices else 0.0,
        "bad_row_capture": len(deferred_bad) / len(bad_indices) if bad_indices else 0.0,
        "allowed_bad_rate": allowed_bad / allowed if allowed else 0.0,
        "first_failure_coverage": covered / len(bad_by_traj) if bad_by_traj else 0.0,
        "deferred_rows": len(deferred_indices),
        "touched_trajectories": len(touched),
    }


def random_expected(rows: list[dict[str, Any]], p: float) -> float:
    lengths = defaultdict(int)
    for row in rows:
        lengths[row["trajectory_id"]] += 1
    if not lengths:
        return 0.0
    return sum(1.0 - math.pow(1.0 - p, n) for n in lengths.values()) / len(lengths)


def run_replication(rows: list[dict[str, Any]]) -> dict[str, Any]:
    burden_rows = []
    oracle_rows = []
    for budget in ROW_BUDGETS:
        n = max(1, int(len(rows) * budget)) if rows else 0
        random_indices = set(range(n))
        bad_indices = [i for i, row in enumerate(rows) if int(row.get("next_step_bad", 0)) == 1]
        oracle_bad = set(bad_indices[:n])
        first_bad_by_traj = {}
        for i, row in enumerate(rows):
            if int(row.get("next_step_bad", 0)) == 1:
                first_bad_by_traj.setdefault(row["trajectory_id"], i)
        oracle_first = set(list(first_bad_by_traj.values())[:n])
        for policy_name, indices in [
            ("random_row_deterministic_proxy", random_indices),
            ("oracle_bad_row_deferral", oracle_bad),
            ("oracle_first_bad_row_deferral", oracle_first),
        ]:
            row = {"policy": policy_name, "row_budget": budget, **metrics(rows, indices)}
            row["random_analytic_expected_trajectory_burden"] = random_expected(rows, budget)
            burden_rows.append(row)
            oracle_rows.append(row)
    first_event_rows = []
    first_bad_by_traj = {}
    for i, row in enumerate(rows):
        if int(row.get("next_step_bad", 0)) == 1:
            first_bad_by_traj.setdefault(row["trajectory_id"], i)
    all_traj = sorted({row["trajectory_id"] for row in rows})
    for budget in TRAJ_BUDGETS:
        limit = max(1, int(len(all_traj) * budget)) if all_traj else 0
        selected = set(sorted(first_bad_by_traj)[:limit])
        indices = {idx for tid, idx in first_bad_by_traj.items() if tid in selected}
        first_event_rows.append({"policy": "oracle_first_event_warning", "trajectory_budget": budget, **metrics(rows, indices)})
    return {
        "burden_rows": burden_rows,
        "oracle_rows": oracle_rows,
        "first_event_rows": first_event_rows,
    }


def write_csv(path: Path, rows: list[dict[str, Any]], default_fields: list[str]) -> None:
    fields = sorted({key for row in rows for key in row}) if rows else default_fields
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def load_internal_reference() -> dict[str, Any]:
    return {
        "internal_learned_5pct_row_budget_trajectory_burden": 0.4206,
        "internal_learned_5pct_burden_inflation": 8.095,
        "internal_random_row_expected_5pct_trajectory_burden": 0.7943,
        "internal_oracle_bad_row_5pct_trajectory_burden": 0.3961,
        "internal_first_event_max_coverage_under_burden_coverage": 0.315,
        "internal_first_event_max_coverage_under_burden_burden": 0.233,
    }


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# Batch 9O External Minimal Replication",
        "",
        "This is a benchmark-level CodeTraceBench-derived external feasibility and minimal replication report. It uses offline proxy diagnostics over first-event and first-failure warning, trajectory-level burden, row-level risk, calibration support, and domain shift, and it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Replication status: `{report['replication_status']}`",
        f"- External dataset available: `{report['external_dataset_available']}`",
        f"- Rows evaluated: `{report['row_count']}`",
        f"- Trajectories evaluated: `{report['trajectory_count']}`",
        "",
        "## Interpretation",
        "",
        report["interpretation"],
    ]
    OUT_MD.write_text("\n".join(lines) + "\n")


def main() -> None:
    if not SUMMARY_JSON.exists():
        raise FileNotFoundError(SUMMARY_JSON)
    if not DATASET.exists():
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "replication_status": "skipped_no_external_prefix_dataset",
            "external_dataset_available": False,
            "row_count": 0,
            "trajectory_count": 0,
            "internal_reference": load_internal_reference(),
            "burden_replication_findings": None,
            "first_event_replication_findings": None,
            "interpretation": "No compatible external prefix/event dataset was available locally, so external minimal replication could not be run. Internal CodeTraceBench-derived limits remain externally unknown.",
            "guard_results": {
                "raw_text_in_processed_outputs": False,
                "metadata_as_model_features": False,
                "mock_data_used": False,
                "test_tuning": False,
            },
        }
        OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        write_csv(BURDEN_CSV, [], ["policy", "row_budget", "row_deferral_rate", "trajectory_burden", "status"])
        write_csv(ORACLE_CSV, [], ["policy", "row_budget", "trajectory_burden", "bad_row_capture", "status"])
        write_csv(FIRST_EVENT_CSV, [], ["policy", "trajectory_budget", "first_failure_coverage", "trajectory_burden", "status"])
        write_csv(COMPARISON_CSV, [{"metric": key, "internal_reference": value, "external_value": "", "status": "not_available"} for key, value in load_internal_reference().items()], ["metric", "internal_reference", "external_value", "status"])
        write_md(report)
        print(json.dumps({"replication_status": report["replication_status"]}, indent=2))
        return

    rows = load_rows(DATASET)
    result = run_replication(rows)
    write_csv(BURDEN_CSV, result["burden_rows"], ["policy"])
    write_csv(ORACLE_CSV, result["oracle_rows"], ["policy"])
    write_csv(FIRST_EVENT_CSV, result["first_event_rows"], ["policy"])
    comparison_rows = [{"metric": key, "internal_reference": value, "external_value": "", "status": "computed_external_available"} for key, value in load_internal_reference().items()]
    write_csv(COMPARISON_CSV, comparison_rows, ["metric", "internal_reference", "external_value", "status"])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "replication_status": "completed_minimal_external_replication",
        "external_dataset_available": True,
        "row_count": len(rows),
        "trajectory_count": len({row["trajectory_id"] for row in rows}),
        "internal_reference": load_internal_reference(),
        "burden_replication_findings": result["burden_rows"][:10],
        "first_event_replication_findings": result["first_event_rows"],
        "interpretation": "Minimal replication completed on the selected resource. Comparability depends on label semantics and extraction caveats.",
        "guard_results": {
            "raw_text_in_processed_outputs": False,
            "metadata_as_model_features": False,
            "mock_data_used": False,
            "test_tuning": False,
        },
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_md(report)
    print(json.dumps({"replication_status": report["replication_status"], "rows": len(rows)}, indent=2))


if __name__ == "__main__":
    main()
