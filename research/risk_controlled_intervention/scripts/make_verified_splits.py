#!/usr/bin/env python3
"""Create trajectory-level train/calibration/test splits for verified prefix rows."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
SPLITS_JSON = PROCESSED_DIR / "verified_splits.json"
AUDIT_JSON = REPORTS_DIR / "verified_split_audit.json"
AUDIT_MD = REPORTS_DIR / "verified_split_audit.md"
PILOT_SPLIT_SCRIPT = Path(__file__).resolve().with_name("make_pilot_splits.py")


def _load_pilot_splits():
    spec = importlib.util.spec_from_file_location("make_pilot_splits", PILOT_SPLIT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pilot_splits = _load_pilot_splits()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create verified trajectory-level splits.")
    parser.add_argument("--shard-dir", default=str(SHARD_DIR))
    parser.add_argument("--seed", type=int, default=20250617)
    parser.add_argument("--train-ratio", type=float, default=0.60)
    parser.add_argument("--calibration-ratio", type=float, default=0.20)
    parser.add_argument("--test-ratio", type=float, default=0.20)
    return parser.parse_args()


def load_shards(shard_dir: Path) -> list[dict[str, Any]]:
    rows = []
    for path in sorted(shard_dir.glob("prefix_verified_shard_*.jsonl")):
        rows.extend(pilot_splits.load_jsonl(path))
    if not rows:
        combined = PROCESSED_DIR / "prefix_verified.jsonl"
        if combined.exists():
            rows = pilot_splits.load_jsonl(combined)
    if not rows:
        raise SystemExit(f"ERROR: no verified prefix rows found in {shard_dir}")
    return rows


def summarize_split(rows: list[dict[str, Any]], assignments: dict[str, str], split: str) -> dict[str, Any]:
    split_rows = [row for row in rows if assignments[row["trajectory_id"]] == split]
    trajectories = sorted({row["trajectory_id"] for row in split_rows})
    positives = sum(int(row["next_step_bad"]) for row in split_rows)
    return {
        "trajectory_count": len(trajectories),
        "prefix_row_count": len(split_rows),
        "next_step_bad_positives": positives,
        "positive_rate": positives / len(split_rows) if split_rows else 0.0,
        "source_bucket_distribution": dict(Counter(str(row.get("source_bucket")) for row in split_rows)),
        "agent_distribution": dict(Counter(str(row.get("agent")) for row in split_rows)),
        "model_distribution": dict(Counter(str(row.get("model")) for row in split_rows)),
        "category_distribution": dict(Counter(str(row.get("category")) for row in split_rows)),
        "difficulty_distribution": dict(Counter(str(row.get("difficulty")) for row in split_rows)),
        "layout_family_distribution": dict(Counter(str(row.get("layout_family")) for row in split_rows)),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Verified Split Audit",
        "",
        "Trajectory-level split audit for verified prefix rows.",
        "",
        "This is split scaffolding only; no model training or performance reporting.",
        "",
        f"- `trajectory_leakage_across_splits`: `{report['trajectory_leakage_across_splits']}`",
        f"- `calibration_has_enough_positives_for_alpha_grid`: `{report['calibration_has_enough_positives_for_alpha_grid']}`",
        f"- `test_has_enough_positives_for_evaluation`: `{report['test_has_enough_positives_for_evaluation']}`",
        "",
    ]
    for split, summary in report["splits"].items():
        lines.append(f"## {split}")
        for key, value in summary.items():
            lines.append(f"- `{key}`: `{value}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_shards(Path(args.shard_dir))
    grouped = pilot_splits.group_by_trajectory(rows)
    assignments = pilot_splits.make_assignments(
        list(grouped),
        args.seed,
        args.train_ratio,
        args.calibration_ratio,
        args.test_ratio,
    )
    split_trajectories = {
        split: sorted(trajectory for trajectory, assigned in assignments.items() if assigned == split)
        for split in pilot_splits.SPLIT_NAMES
    }
    leakage = pilot_splits.trajectory_leakage_exists(assignments, rows)
    split_summaries = {split: summarize_split(rows, assignments, split) for split in pilot_splits.SPLIT_NAMES}
    payload = {
        "schema_version": "risk-controlled-intervention-verified-splits.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "ratios": {"train": args.train_ratio, "calibration": args.calibration_ratio, "test": args.test_ratio},
        "assignments": assignments,
        "split_trajectories": split_trajectories,
    }
    report = {
        "schema_version": "risk-controlled-intervention-verified-split-audit.v1",
        "generated_at": payload["generated_at"],
        "claim_boundary": (
            "Batch 6 verified split scaffolding only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "seed": args.seed,
        "ratios": payload["ratios"],
        "trajectory_leakage_across_splits": leakage,
        "splits": split_summaries,
        "calibration_has_enough_positives_for_alpha_grid": split_summaries["calibration"]["next_step_bad_positives"] >= 50,
        "test_has_enough_positives_for_evaluation": split_summaries["test"]["next_step_bad_positives"] >= 50,
    }
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SPLITS_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    AUDIT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    AUDIT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"trajectory_leakage_across_splits": leakage, "splits": split_summaries}, indent=2, sort_keys=True))
    return 1 if leakage else 0


if __name__ == "__main__":
    raise SystemExit(main())
