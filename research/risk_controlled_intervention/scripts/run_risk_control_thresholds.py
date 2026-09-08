#!/usr/bin/env python3
"""Calibration-based ALLOW/DEFER thresholding for saved Batch 7 scores."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPORTS_DIR = WORKSPACE / "reports"
SCORE_SCHEMA = REPORTS_DIR / "model_score_schema.json"
HEURISTIC_SCORES = MODEL_OUTPUT_DIR / "heuristic_scores.jsonl"
LIGHTWEIGHT_SCORES = MODEL_OUTPUT_DIR / "lightweight_model_scores.jsonl"
DECISIONS_PATH = MODEL_OUTPUT_DIR / "risk_control_decisions.jsonl"
REPORT_JSON = REPORTS_DIR / "risk_control_thresholds.json"
REPORT_MD = REPORTS_DIR / "risk_control_thresholds.md"
METRICS_SCRIPT = Path(__file__).resolve().with_name("risk_control_metrics.py")

ALPHAS = (0.05, 0.10, 0.20)
VARIANTS = ("empirical_calibration_threshold", "conservative_calibration_threshold")
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code"}
REQUIRED_SCORE_FIELDS = {"trajectory_id", "step_index", "split", "baseline_name", "score", "target", "higher_means_riskier"}


def _load_metrics():
    spec = importlib.util.spec_from_file_location("risk_control_metrics", METRICS_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


rcm = _load_metrics()


def parse_args() -> argparse.Namespace:
    return argparse.ArgumentParser(description="Run calibration-based risk-control thresholding.").parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_score_rows(paths: tuple[Path, ...] = (HEURISTIC_SCORES, LIGHTWEIGHT_SCORES)) -> list[dict[str, Any]]:
    rows = []
    for path in paths:
        with path.open() as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                row = json.loads(line)
                row["_score_file"] = str(path.relative_to(WORKSPACE))
                rows.append(row)
    return rows


def validate_score_schema(rows: list[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    errors = []
    raw_hits = []
    split_values = set()
    for index, row in enumerate(rows, start=1):
        missing = REQUIRED_SCORE_FIELDS - set(row)
        if missing:
            errors.append({"row": index, "reason": f"missing fields {sorted(missing)}"})
        raw = sorted(RAW_KEYS & set(row))
        if raw:
            raw_hits.append({"row": index, "keys": raw})
        split_values.add(row.get("split"))
        if row.get("target") != row.get("next_step_bad"):
            errors.append({"row": index, "reason": "target does not equal next_step_bad"})
        if row.get("higher_means_riskier") is not True:
            errors.append({"row": index, "reason": "higher_means_riskier is not true"})
        score = row.get("score")
        if not isinstance(score, (int, float)) or not 0.0 <= float(score) <= 1.0:
            errors.append({"row": index, "reason": "score outside [0,1]"})
    schema_ok = schema.get("raw_text_fields_allowed") is False and schema.get("higher_means_riskier") is True
    return {
        "schema_ok": schema_ok,
        "error_count": len(errors),
        "errors": errors[:50],
        "raw_text_key_hit_count": len(raw_hits),
        "raw_text_key_hits": raw_hits[:50],
        "split_values": sorted(str(value) for value in split_values),
        "valid_splits": split_values <= {"train", "calibration", "test"},
    }


def group_by_baseline(rows: list[dict[str, Any]]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        grouped[str(row["baseline_name"])][str(row["split"])].append(row)
    return grouped


def rows_to_scores_labels(rows: list[dict[str, Any]]) -> tuple[list[float], list[int], list[str]]:
    return [float(row["score"]) for row in rows], [int(row["target"]) for row in rows], [str(row["trajectory_id"]) for row in rows]


def fixed_policy_threshold(baseline_name: str, scores: list[float]) -> float | None:
    """Keep policy extremes as fixed policies instead of tunable constant scores."""
    if not scores:
        return None
    eps = max(1e-12, max(abs(min(scores)), abs(max(scores)), 1.0) * 1e-12)
    if baseline_name == "always_allow":
        return max(scores) + eps
    if baseline_name == "always_review":
        return min(scores) - eps
    return None


def evaluate_rows(rows: list[dict[str, Any]], tau: float, alpha: float) -> dict[str, Any]:
    scores, labels, trajectories = rows_to_scores_labels(rows)
    result = rcm.decision_metrics(scores, labels, tau, alpha, trajectories)
    decision_rows = []
    for row in rows:
        allow = float(row["score"]) <= tau
        decision_rows.append({"score": float(row["score"]), "target": int(row["target"]), "tau": tau, "alpha": alpha, "trajectory_id": row.get("trajectory_id")})
    for metric_name in ("allowed_bad_rate", "deferral_rate", "false_deferral_rate", "useful_allowed_rate"):
        result[f"{metric_name}_ci"] = rcm.bootstrap_metric_ci(decision_rows, metric_name)
    return result


def decision_record(row: dict[str, Any], alpha: float, variant: str, tau: float) -> dict[str, Any]:
    allow = float(row["score"]) <= tau
    return {
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "split": row.get("split"),
        "baseline_name": row.get("baseline_name"),
        "model_family": row.get("model_family"),
        "alpha": alpha,
        "thresholding_variant": variant,
        "tau": tau,
        "score": float(row["score"]),
        "target": int(row["target"]),
        "next_step_bad": int(row["next_step_bad"]),
        "decision": "ALLOW" if allow else "DEFER",
        "source_bucket": row.get("source_bucket"),
        "agent": row.get("agent"),
        "layout_family": row.get("layout_family"),
        "difficulty": row.get("difficulty"),
        "category": row.get("category"),
    }


def run_thresholding(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    grouped = group_by_baseline(rows)
    results = []
    decisions = []
    for baseline_name, by_split in sorted(grouped.items()):
        calibration_rows = by_split.get("calibration", [])
        test_rows = by_split.get("test", [])
        if not calibration_rows or not test_rows:
            continue
        cal_scores, cal_labels, _ = rows_to_scores_labels(calibration_rows)
        for alpha in ALPHAS:
            for variant in VARIANTS:
                conservative = variant == "conservative_calibration_threshold"
                fixed_tau = fixed_policy_threshold(baseline_name, cal_scores)
                if fixed_tau is None:
                    selected = rcm.select_threshold(cal_scores, cal_labels, alpha, conservative=conservative)
                else:
                    selected = {
                        "tau": fixed_tau,
                        "fixed_policy": baseline_name,
                        "selected_on": "policy_definition",
                        "conservative": conservative,
                    }
                tau = float(selected["tau"])
                for split_name, split_rows in (("calibration", calibration_rows), ("test", test_rows)):
                    metrics = evaluate_rows(split_rows, tau, alpha)
                    results.append(
                        {
                            "baseline_name": baseline_name,
                            "alpha": alpha,
                            "thresholding_variant": variant,
                            "split": split_name,
                            "selection": selected if split_name == "calibration" else {"tau_selected_on": "calibration"},
                            **metrics,
                        }
                    )
                    decisions.extend(decision_record(row, alpha, variant, tau) for row in split_rows)
    report = {
        "schema_version": "risk-controlled-intervention-risk-thresholds.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 8 calibration-based benchmark thresholding only; not production CodingActionGate validation, "
            "not a production conformal claim, and not a production statistical guarantee."
        ),
        "scope": "Frozen v0.4 extraction-supported verified subset only.",
        "alpha_values": list(ALPHAS),
        "thresholding_variants": list(VARIANTS),
        "threshold_results": results,
        "decision_file": str(DECISIONS_PATH.relative_to(WORKSPACE)),
    }
    return report, decisions


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Risk-Control Thresholds",
        "",
        "Calibration-based ALLOW/DEFER thresholding on saved Batch 7 scores. These are benchmark results, not production guarantees.",
        "",
        "| baseline | variant | alpha | split | tau | allowed bad | deferral | violation |",
        "|---|---|---:|---|---:|---:|---:|---:|",
    ]
    for row in report["threshold_results"]:
        if row["split"] not in {"calibration", "test"}:
            continue
        lines.append(
            f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['alpha']}` | `{row['split']}` | "
            f"`{row['tau']}` | `{row['allowed_bad_rate']}` | `{row['deferral_rate']}` | `{row['risk_violation']}` |"
        )
    lines.extend(["", "Allowed-bad rate is `null` when no rows are allowed."])
    return "\n".join(lines)


def main() -> int:
    schema = load_json(SCORE_SCHEMA)
    rows = load_score_rows()
    validation = validate_score_schema(rows, schema)
    if validation["error_count"] or validation["raw_text_key_hit_count"] or not validation["schema_ok"] or not validation["valid_splits"]:
        raise SystemExit(f"ERROR: invalid score files: {json.dumps(validation, indent=2)}")
    report, decisions = run_thresholding(rows)
    report["score_validation"] = validation
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DECISIONS_PATH.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in decisions))
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"threshold_rows": len(report["threshold_results"]), "decision_rows": len(decisions), "baselines": sorted(group_by_baseline(rows))}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
