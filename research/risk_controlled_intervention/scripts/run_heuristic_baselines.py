#!/usr/bin/env python3
"""Run deterministic uncalibrated heuristic risk baselines."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import baseline_metrics as metrics
import model_features

WORKSPACE = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPORTS_DIR = WORKSPACE / "reports"
SCORES_PATH = OUTPUT_DIR / "heuristic_scores.jsonl"
METRICS_JSON = REPORTS_DIR / "heuristic_baseline_metrics.json"
METRICS_MD = REPORTS_DIR / "heuristic_baseline_metrics.md"
SEED = 20250617


def parse_args() -> argparse.Namespace:
    return argparse.ArgumentParser(description="Run Batch 7 heuristic baselines.").parse_args()


def train_quantiles(rows: list[dict[str, Any]]) -> dict[str, float]:
    prefix_lengths = [float(row.get("prefix_length") or 0.0) for row in rows]
    stage_steps = [float(row.get("current_stage_step_count_so_far") or 0.0) for row in rows]
    return {
        "prefix_p75": metrics.quantile(prefix_lengths, 0.75),
        "prefix_p95": max(metrics.quantile(prefix_lengths, 0.95), 1.0),
        "stage_steps_p75": metrics.quantile(stage_steps, 0.75),
    }


def clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def heuristic_functions(train_rows: list[dict[str, Any]]) -> dict[str, tuple[Callable[[dict[str, Any]], float], float | None, str]]:
    q = train_quantiles(train_rows)
    return {
        "always_allow": (lambda row: 0.0, 0.5, "score is always 0; default threshold defers no rows"),
        "always_review": (lambda row: 1.0, 0.5, "score is always 1; default threshold defers all rows"),
        "observation_error_keyword_heuristic": (
            lambda row: 1.0
            if int(row.get("recent_error_keyword_count") or 0)
            or int(row.get("recent_exception_keyword_count") or 0)
            or str(row.get("observation_kind_guess")) in {"error", "test_failure", "timeout"}
            else 0.0,
            0.5,
            "score is high when current/past observation error, exception, timeout, or test-failure signals are present",
        ),
        "timeout_or_failure_heuristic": (
            lambda row: 1.0
            if int(row.get("recent_timeout_keyword_count") or 0)
            or int(row.get("recent_failure_keyword_count") or 0)
            or str(row.get("observation_kind_guess")) in {"timeout", "test_failure", "error"}
            else 0.0,
            0.5,
            "score is high when current/past timeout or failure signals are present",
        ),
        "repeated_action_or_observation_heuristic": (
            lambda row: 1.0
            if int(row.get("repeated_action_indicator") or 0)
            or int(row.get("repeated_observation_indicator") or 0)
            else 0.0,
            0.5,
            "score is high when current action or observation hash repeats within the prefix",
        ),
        "long_prefix_heuristic": (
            lambda row: clip01(float(row.get("prefix_length") or 0.0) / q["prefix_p95"]),
            clip01(q["prefix_p75"] / q["prefix_p95"]),
            "score increases with prefix_length using train-split quantiles only",
        ),
        "stage_transition_or_retry_heuristic": (
            lambda row: 1.0
            if int(row.get("total_stage_transitions_so_far") or 0) > 0
            or float(row.get("current_stage_step_count_so_far") or 0.0) >= q["stage_steps_p75"]
            else 0.0,
            0.5,
            "score is high after stage transitions or long within-stage prefixes, using train-split quantiles only",
        ),
    }


def score_record(split: str, name: str, row: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "split": split,
        "baseline_name": name,
        "model_family": "heuristic",
        "score": score,
        "target": int(row["next_step_bad"]),
        "next_step_bad": int(row["next_step_bad"]),
        "higher_means_riskier": True,
        "source_bucket": row.get("source_bucket"),
        "agent": row.get("agent"),
        "layout_family": row.get("layout_family"),
        "difficulty": row.get("difficulty"),
        "category": row.get("category"),
    }


def run() -> dict[str, Any]:
    prepared = model_features.prepare_matrices()
    split_rows = {split: data["rows"] for split, data in prepared["splits"].items()}
    funcs = heuristic_functions(split_rows["train"])
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_score_records = []
    baseline_reports = {}
    for name, (fn, threshold, description) in funcs.items():
        baseline_reports[name] = {"description": description, "default_threshold": threshold, "splits": {}}
        for split, rows in split_rows.items():
            scores = [float(fn(row)) for row in rows]
            labels = [int(row["next_step_bad"]) for row in rows]
            metas = [{key: row.get(key) for key in model_features.EVAL_METADATA_FIELDS} for row in rows]
            split_threshold = threshold if threshold is not None else metrics.threshold_from_train(scores, labels)
            baseline_reports[name]["splits"][split] = metrics.split_metrics(scores, labels, split_threshold)
            if split in {"calibration", "test"}:
                baseline_reports[name]["splits"][split]["subgroups"] = metrics.subgroup_metrics(scores, labels, metas, split_threshold)
            all_score_records.extend(score_record(split, name, row, score) for row, score in zip(rows, scores))
    SCORES_PATH.write_text("".join(json.dumps(record, sort_keys=True) + "\n" for record in all_score_records))
    report = {
        "schema_version": "risk-controlled-intervention-heuristic-baselines.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 7 uncalibrated heuristic scores only; not production CodingActionGate validation, "
            "not conformal calibration, and not a production statistical guarantee."
        ),
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "score_file": str(SCORES_PATH.relative_to(WORKSPACE)),
        "baseline_count": len(baseline_reports),
        "baselines": baseline_reports,
        "no_risk_control_claim": True,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    METRICS_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    METRICS_MD.write_text(markdown(report) + "\n")
    return report


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Heuristic Baseline Metrics",
        "",
        "Uncalibrated deterministic baselines only. No conformal or risk-control thresholding is performed.",
        "",
        "| baseline | split | AUROC | AP | deferral rate | allowed-bad rate |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for name, baseline in report["baselines"].items():
        for split in ("train", "calibration", "test"):
            item = baseline["splits"][split]
            lines.append(
                f"| `{name}` | `{split}` | `{item['auroc']}` | `{item['average_precision']}` | "
                f"`{item['deferral_rate']}` | `{item['allowed_bad_rate']}` |"
            )
    lines.extend(["", "Results apply only to the v0.4 extraction-supported verified subset."])
    return "\n".join(lines)


def main() -> int:
    report = run()
    print(json.dumps({"baselines": list(report["baselines"]), "score_file": report["score_file"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
