#!/usr/bin/env python3
"""Build Batch 9L first-failure targets from frozen v0.4 prefix rows."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
INTERVENTION_DIR = WORKSPACE / "data" / "intervention_outputs"
REPORTS_DIR = WORKSPACE / "reports"

PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
TARGET_JSONL = INTERVENTION_DIR / "first_failure_prefix_targets.jsonl"
SUMMARY_JSON = REPORTS_DIR / "batch_9l_first_failure_target_summary.json"
SUMMARY_MD = REPORTS_DIR / "batch_9l_first_failure_target_summary.md"

TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
WINDOWS = (1, 2, 3, 5)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "terminal_output"}


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9L input: {path}")


def load_prefix_rows() -> list[dict[str, Any]]:
    require(PREFIX_PATH)
    rows = []
    with PREFIX_PATH.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def ordinal_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["trajectory_id"])].append(row)
    out = []
    for tid, vals in grouped.items():
        ordered = sorted(vals, key=lambda row: int(row.get("step_index", row.get("prefix_length", 0))))
        for ordinal, row in enumerate(ordered):
            enriched = dict(row)
            enriched["trajectory_row_ordinal"] = ordinal
            enriched["trajectory_decision_row_count"] = len(ordered)
            out.append(enriched)
    return out


def add_first_failure_targets(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in ordinal_rows(rows):
        grouped[str(row["trajectory_id"])].append(row)
    output = []
    for tid, vals in grouped.items():
        vals.sort(key=lambda row: int(row["trajectory_row_ordinal"]))
        for target in TARGETS:
            positives = [int(row["trajectory_row_ordinal"]) for row in vals if int(row.get(target, 0)) == 1]
            first = positives[0] if positives else None
            repeated = len(positives) > 1
            for row in vals:
                ordinal = int(row["trajectory_row_ordinal"])
                count = int(row["trajectory_decision_row_count"])
                prefix = target.replace("next_step_", "")
                row[f"{prefix}_first_bad_row_index"] = first
                row[f"{prefix}_normalized_first_bad_position"] = (first + 1) / count if first is not None and count else None
                row[f"{prefix}_trajectory_has_any_bad_row"] = int(first is not None)
                row[f"{prefix}_trajectory_has_repeated_bad_rows"] = int(repeated)
                row[f"{prefix}_first_bad_next_step"] = int(first is not None and ordinal == first)
                row[f"{prefix}_before_first_failure"] = int(first is not None and ordinal < first)
                row[f"{prefix}_after_first_failure"] = int(first is not None and ordinal > first)
                row[f"{prefix}_distance_to_first_bad"] = (first - ordinal) if first is not None and ordinal <= first else None
                for k in WINDOWS:
                    row[f"{prefix}_pre_first_failure_window_{k}"] = int(first is not None and max(0, first - k) <= ordinal <= first)
                row[f"{prefix}_first_failure_warning_candidate"] = row[f"{prefix}_pre_first_failure_window_3"]
        output.extend(vals)
    output.sort(key=lambda row: (str(row["trajectory_id"]), int(row["trajectory_row_ordinal"])))
    return output


def safe_record(row: dict[str, Any]) -> dict[str, Any]:
    keep = {
        "trajectory_id",
        "step_index",
        "trajectory_row_ordinal",
        "trajectory_decision_row_count",
        "source_bucket",
        "layout_family",
        "parser_adapter",
        "prefix_length",
        "next_step_bad",
        "next_step_incorrect",
        "next_step_unuseful",
    }
    keep.update(key for key in row if key.startswith(("bad_", "incorrect_", "unuseful_")))
    return {key: row.get(key) for key in sorted(keep) if key in row}


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_traj: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_traj[str(row["trajectory_id"])].append(row)
    summary: dict[str, Any] = {
        "total_prefix_rows": len(rows),
        "trajectory_count": len(by_traj),
        "targets": {},
    }
    for prefix, target in [("bad", "next_step_bad"), ("incorrect", "next_step_incorrect"), ("unuseful", "next_step_unuseful")]:
        first_positions = []
        repeated = 0
        any_bad = 0
        warning_opportunities = 0
        for vals in by_traj.values():
            ordered = sorted(vals, key=lambda row: int(row["trajectory_row_ordinal"]))
            positives = [int(row["trajectory_row_ordinal"]) for row in ordered if int(row.get(target, 0)) == 1]
            if positives:
                any_bad += 1
                first_positions.append((positives[0] + 1) / len(ordered))
                warning_opportunities += positives[0] + 1
            if len(positives) > 1:
                repeated += 1
        target_summary = {
            "trajectories_with_any_bad_row": any_bad,
            "trajectories_with_repeated_bad_rows": repeated,
            "first_bad_position_mean": statistics.mean(first_positions) if first_positions else None,
            "first_bad_position_median": statistics.median(first_positions) if first_positions else None,
            "warning_opportunities_before_or_at_first_failure": warning_opportunities,
            "target_prevalence": {},
        }
        for name in ["first_bad_next_step", *(f"pre_first_failure_window_{k}" for k in WINDOWS), "first_failure_warning_candidate"]:
            key = f"{prefix}_{name}"
            positives = sum(int(row.get(key, 0)) for row in rows)
            target_summary["target_prevalence"][name] = {"positives": positives, "prevalence": positives / len(rows) if rows else 0.0}
        summary["targets"][prefix] = target_summary
    return summary


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9L First-Failure Target Summary",
        "",
        "Exploratory benchmark-level first-failure target construction on CodeTraceBench-derived frozen v0.4 prefix rows. This is an offline proxy for row-level risk and trajectory-level burden analysis, with calibration support and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| target | trajectories with any target row | repeated target trajectories | first_bad_next_step prevalence | warning k=3 prevalence |",
        "|---|---:|---:|---:|---:|",
    ]
    for prefix, item in report["summary"]["targets"].items():
        lines.append(
            f"| `{prefix}` | `{item['trajectories_with_any_bad_row']}` | `{item['trajectories_with_repeated_bad_rows']}` | "
            f"`{item['target_prevalence']['first_bad_next_step']['prevalence']:.4f}` | "
            f"`{item['target_prevalence']['first_failure_warning_candidate']['prevalence']:.4f}` |"
        )
    lines.extend([
        "",
        "The `unuseful` target is sparse/secondary. Window targets include the first bad next-step row, so they are warning-or-at-intervention-opportunity labels rather than causal-prevention labels.",
    ])
    return "\n".join(lines)


def main() -> None:
    rows = add_first_failure_targets(load_prefix_rows())
    serialized = "\n".join(json.dumps(safe_record(row), sort_keys=True) for row in rows)
    raw_hits = [key for key in RAW_KEYS if key in serialized]
    INTERVENTION_DIR.mkdir(parents=True, exist_ok=True)
    TARGET_JSONL.write_text(serialized + "\n")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(PREFIX_PATH)],
        "output_file": str(TARGET_JSONL),
        "window_definition": "pre_first_failure_window_k includes rows with ordinal in [first_bad-k, first_bad], clipped at trajectory start",
        "summary": summarize(rows),
        "guard_results": {"raw_marker_hits": raw_hits, "metadata_as_model_features": False},
    }
    SUMMARY_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    SUMMARY_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"rows": len(rows), "trajectories": report["summary"]["trajectory_count"]}, indent=2))


if __name__ == "__main__":
    main()
