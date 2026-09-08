#!/usr/bin/env python3
"""Create trajectory-level pilot train/calibration/test split scaffolding."""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
PREFIX_PILOT_PATH = PROCESSED_DIR / "prefix_pilot.jsonl"
SPLITS_PATH = PROCESSED_DIR / "pilot_splits.json"
AUDIT_REPORT_PATH = REPORTS_DIR / "pilot_split_audit.json"
AUDIT_MARKDOWN_PATH = REPORTS_DIR / "pilot_split_audit.md"
SPLIT_NAMES = ("train", "calibration", "test")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create trajectory-level pilot splits without training models.")
    parser.add_argument("--input", default=str(PREFIX_PILOT_PATH), help="Path to prefix_pilot.jsonl.")
    parser.add_argument("--seed", type=int, default=20250617, help="Deterministic split seed.")
    parser.add_argument("--train-ratio", type=float, default=0.60)
    parser.add_argument("--calibration-ratio", type=float, default=0.20)
    parser.add_argument("--test-ratio", type=float, default=0.20)
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"ERROR: Prefix pilot JSONL not found: {path}")
    rows = []
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"ERROR: Malformed JSONL at {path}:{line_number}: {exc}") from exc
    return rows


def group_by_trajectory(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        trajectory_id = row.get("trajectory_id")
        if not isinstance(trajectory_id, str) or not trajectory_id:
            raise ValueError("Every prefix row must include a non-empty trajectory_id.")
        grouped[trajectory_id].append(row)
    return dict(grouped)


def split_counts(total: int, train_ratio: float, calibration_ratio: float, test_ratio: float) -> tuple[int, int, int]:
    if total < 0:
        raise ValueError("total must be non-negative.")
    ratio_sum = train_ratio + calibration_ratio + test_ratio
    if total and abs(ratio_sum - 1.0) > 1e-6:
        raise ValueError("Split ratios must sum to 1.0.")
    train_count = int(round(total * train_ratio))
    calibration_count = int(round(total * calibration_ratio))
    if total >= 3:
        train_count = max(1, train_count)
        calibration_count = max(1, calibration_count)
    if train_count + calibration_count > total:
        calibration_count = max(0, total - train_count)
    test_count = total - train_count - calibration_count
    if total >= 3 and test_count == 0:
        if train_count >= calibration_count and train_count > 1:
            train_count -= 1
        elif calibration_count > 1:
            calibration_count -= 1
        test_count = total - train_count - calibration_count
    return train_count, calibration_count, test_count


def make_assignments(
    trajectory_ids: list[str],
    seed: int,
    train_ratio: float = 0.60,
    calibration_ratio: float = 0.20,
    test_ratio: float = 0.20,
) -> dict[str, str]:
    ordered = sorted(trajectory_ids)
    rng = random.Random(seed)
    rng.shuffle(ordered)
    train_count, calibration_count, _test_count = split_counts(
        len(ordered),
        train_ratio,
        calibration_ratio,
        test_ratio,
    )
    assignments: dict[str, str] = {}
    for index, trajectory_id in enumerate(ordered):
        if index < train_count:
            split = "train"
        elif index < train_count + calibration_count:
            split = "calibration"
        else:
            split = "test"
        assignments[trajectory_id] = split
    return assignments


def trajectory_leakage_exists(assignments: dict[str, str], rows: list[dict[str, Any]]) -> bool:
    seen: dict[str, str] = {}
    for row in rows:
        trajectory_id = str(row["trajectory_id"])
        split = assignments[trajectory_id]
        if trajectory_id in seen and seen[trajectory_id] != split:
            return True
        seen[trajectory_id] = split
    return False


def summarize_split(rows: list[dict[str, Any]], assignments: dict[str, str], split: str) -> dict[str, Any]:
    split_rows = [row for row in rows if assignments[row["trajectory_id"]] == split]
    split_trajectory_ids = sorted({row["trajectory_id"] for row in split_rows})
    return {
        "trajectory_count": len(split_trajectory_ids),
        "prefix_example_count": len(split_rows),
        "next_step_bad_positives": sum(int(row["next_step_bad"]) for row in split_rows),
        "source_distribution": dict(Counter(str(row.get("source_bucket")) for row in split_rows)),
        "difficulty_distribution": dict(Counter(str(row.get("difficulty")) for row in split_rows)),
        "category_distribution": dict(Counter(str(row.get("category")) for row in split_rows)),
    }


def audit_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Pilot Split Audit",
        "",
        "Trajectory-level split scaffolding for the bounded pilot extraction.",
        "",
        "This creates train/calibration/test assignments only. It does not train a model, run final experiments, or make production statistical guarantees.",
        "",
        "## Summary",
        "",
        f"- `trajectory_leakage_across_splits`: `{report['trajectory_leakage_across_splits']}`",
        f"- `seed`: `{report['seed']}`",
        f"- `ratios`: `{report['ratios']}`",
        "",
        "## Splits",
        "",
    ]
    for split in SPLIT_NAMES:
        summary = report["splits"][split]
        lines.append(f"### {split}")
        lines.append("")
        for key, value in summary.items():
            lines.append(f"- `{key}`: `{value}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_jsonl(Path(args.input))
    grouped = group_by_trajectory(rows)
    assignments = make_assignments(
        list(grouped),
        args.seed,
        args.train_ratio,
        args.calibration_ratio,
        args.test_ratio,
    )
    splits = {split: summarize_split(rows, assignments, split) for split in SPLIT_NAMES}
    split_trajectories = {
        split: sorted(trajectory_id for trajectory_id, assigned in assignments.items() if assigned == split)
        for split in SPLIT_NAMES
    }
    leakage = trajectory_leakage_exists(assignments, rows)
    payload = {
        "schema_version": "risk-controlled-intervention-pilot-splits.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "ratios": {
            "train": args.train_ratio,
            "calibration": args.calibration_ratio,
            "test": args.test_ratio,
        },
        "assignments": assignments,
        "split_trajectories": split_trajectories,
    }
    audit_report = {
        "schema_version": "risk-controlled-intervention-pilot-split-audit.v1",
        "claim_boundary": (
            "Pilot split scaffolding only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": payload["generated_at"],
        "seed": args.seed,
        "ratios": payload["ratios"],
        "split_file": str(SPLITS_PATH.relative_to(WORKSPACE)),
        "input_path": str(Path(args.input).relative_to(WORKSPACE)),
        "trajectory_leakage_across_splits": leakage,
        "splits": splits,
    }
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SPLITS_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    AUDIT_REPORT_PATH.write_text(json.dumps(audit_report, indent=2, sort_keys=True) + "\n")
    AUDIT_MARKDOWN_PATH.write_text(audit_markdown(audit_report) + "\n")
    print(json.dumps({"trajectory_leakage_across_splits": leakage, "splits": splits}, indent=2, sort_keys=True))
    print(f"Saved split assignments: {SPLITS_PATH}")
    print(f"Saved split audit: {AUDIT_REPORT_PATH}")
    return 1 if leakage else 0


if __name__ == "__main__":
    sys.exit(main())
