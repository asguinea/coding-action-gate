#!/usr/bin/env python3
"""Audit row-level score artifacts for cleaner Option C theory grids."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
DATA = WORKSPACE / "data"
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T6_row_level_score_artifact_audit.json"
OUT_MD = REPORTS / "batch_T6_row_level_score_artifact_audit.md"
OUT_CSV = REPORTS / "batch_T6_row_level_score_artifact_audit.csv"

RAW_MARKERS = ["action_text", "observation_text", "raw_action", "raw_observation", "terminal_output", "code_text"]
SCORE_MARKERS = ["score", "probability", "risk", "prediction"]
ROW_MARKERS = ["trajectory_id", "trajectory_row_ordinal", "row_index", "prefix_row_index", "step_index"]
SPLIT_MARKERS = ["split", "split_seed", "assignment", "calibration", "test"]


def sample_keys(path: Path) -> set[str]:
    try:
        if path.suffix == ".jsonl":
            with path.open() as handle:
                for line in handle:
                    if line.strip():
                        return set(json.loads(line).keys())
        if path.suffix == ".json":
            obj = json.loads(path.read_text())
            if isinstance(obj, dict):
                return set(obj.keys())
            if isinstance(obj, list) and obj and isinstance(obj[0], dict):
                return set(obj[0].keys())
        if path.suffix == ".csv":
            with path.open() as handle:
                reader = csv.DictReader(handle)
                return set(reader.fieldnames or [])
    except Exception:
        return set()
    return set()


def classify(path: Path) -> dict[str, Any]:
    keys = sample_keys(path)
    name = path.name.lower()
    has_score = any(any(marker in key.lower() for marker in SCORE_MARKERS) for key in keys)
    has_tid = "trajectory_id" in keys
    has_prefix = any(marker in keys for marker in ROW_MARKERS if marker != "trajectory_id")
    has_split = any(any(marker in key.lower() for marker in SPLIT_MARKERS) for key in keys)
    raw_absent = not any(marker in key.lower() for marker in RAW_MARKERS for key in keys)
    first_event_like = any(marker in name for marker in ["first_failure", "first_event", "hybrid", "failure_onset", "9l", "9m"])
    row_level = has_score and has_tid and has_prefix
    supports_clean = row_level and has_split and raw_absent and first_event_like
    return {
        "artifact_path": str(path),
        "artifact_name": path.name,
        "artifact_kind": path.suffix.lstrip("."),
        "score_family": "unknown_from_artifact_name",
        "target": "first_event_or_hybrid" if first_event_like else "generic_or_unknown",
        "split_seed_availability": has_split,
        "row_level_score_availability": row_level,
        "trajectory_id_availability": has_tid,
        "prefix_index_availability": has_prefix,
        "calibration_test_split_availability": has_split,
        "train_score_availability": any("train" in key.lower() for key in keys),
        "raw_text_absent": raw_absent,
        "supports_fixed_score_threshold_grid": supports_clean,
        "supports_train_score_quantiles": supports_clean and any("train" in key.lower() for key in keys),
        "supports_split_calibration_grid_then_risk": supports_clean,
        "supports_calibration_score_quantiles": row_level and has_split and raw_absent,
        "limitations": "usable_for_clean_option_c_grids" if supports_clean else "does_not_provide row-level first-event or hybrid scores with split support",
    }


def main() -> None:
    candidates = []
    for root in [DATA, REPORTS]:
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in {".jsonl", ".json", ".csv"} and any(token in path.name.lower() for token in ["score", "scores", "first_failure", "first_event", "hybrid", "option_c"]):
                candidates.append(classify(path))
    usable = [row for row in candidates if row["supports_split_calibration_grid_then_risk"] or row["supports_fixed_score_threshold_grid"]]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "artifact_count": len(candidates),
        "usable_clean_grid_artifact_count": len(usable),
        "artifacts": candidates,
        "regeneration_plan": "Regenerate row-level first-event and hybrid scores with trajectory_id, prefix index, split seed, train/calibration/test assignment, and no retained raw trajectory content.",
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    fields = sorted({k for row in candidates for k in row}) if candidates else ["artifact_path"]
    with OUT_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(candidates)
    OUT_MD.write_text("\n".join([
        "# Batch T-6 Row-Level Score Artifact Audit",
        "",
        report["claim_boundary"],
        "",
        f"- Candidate artifacts scanned: `{len(candidates)}`",
        f"- Usable clean-grid artifacts: `{len(usable)}`",
        "",
        report["regeneration_plan"],
    ]) + "\n")
    print(json.dumps({"artifacts": len(candidates), "usable_clean_grid_artifacts": len(usable)}, indent=2))


if __name__ == "__main__":
    main()
