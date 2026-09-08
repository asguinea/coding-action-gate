#!/usr/bin/env python3
"""Compare Option A prototype outputs to existing first-event baselines."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
REAL_CSV = REPORTS / "batch_T3_option_A_real_data_results.csv"
NINE_N = REPORTS / "batch_9n_first_event_calibration_selectors.json"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
OUT_JSON = REPORTS / "batch_T3_option_A_baseline_comparison.json"
OUT_MD = REPORTS / "batch_T3_option_A_baseline_comparison.md"
OUT_CSV = REPORTS / "batch_T3_option_A_baseline_comparison.csv"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def flt(row: dict[str, Any], key: str) -> float | None:
    value = row.get(key)
    if value in (None, ""):
        return None
    return float(value)


def mean_key(rows: list[dict[str, Any]], key: str) -> float | None:
    vals = [flt(row, key) for row in rows if flt(row, key) is not None]
    return mean(vals) if vals else None


def option_a_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    feasible = [row for row in rows if row["no_safe"] == "False"]
    by_alpha = defaultdict(list)
    for row in feasible:
        by_alpha[row["alpha"]].append(row)
    out = []
    for alpha, group in by_alpha.items():
        out.append({
            "baseline": "option_a_hoeffding",
            "comparison_type": "alpha_target",
            "alpha": alpha,
            "available": True,
            "rows": len(group),
            "missed_first_failure_rate": mean_key(group, "test_missed_first_failure_rate"),
            "first_failure_coverage": mean_key(group, "test_first_failure_coverage"),
            "pre_failure_coverage": mean_key(group, "test_pre_failure_warning_coverage"),
            "trajectory_burden": mean_key(group, "test_trajectory_burden"),
            "false_alarm_rate": mean_key(group, "test_false_alarm_trajectory_rate"),
            "row_deferral": mean_key(group, "test_row_deferral_rate"),
            "lead_time": mean_key(group, "test_mean_lead_time"),
            "no_safe_rate": 1.0 - len(group) / max(1, sum(1 for row in rows if row["alpha"] == alpha)),
            "notes": "T-3 Option A selected on calibration metrics with Hoeffding union-bound correction.",
        })
    return out


def nine_n_rows() -> list[dict[str, Any]]:
    obj = json.loads(require(NINE_N).read_text())
    out = []
    for row in obj["aggregate_results"]:
        out.append({
            "baseline": f"batch_9n::{row['selector']}",
            "comparison_type": "existing_event_selector",
            "alpha": "",
            "available": True,
            "rows": row["count"],
            "missed_first_failure_rate": row.get("test_missed_first_failure_rate_mean"),
            "first_failure_coverage": row.get("test_first_failure_coverage_mean"),
            "pre_failure_coverage": row.get("test_pre_failure_warning_coverage_mean"),
            "trajectory_burden": row.get("test_trajectory_burden_mean"),
            "false_alarm_rate": row.get("test_false_alarm_trajectory_rate_mean"),
            "row_deferral": row.get("test_row_deferral_rate_mean"),
            "lead_time": row.get("test_mean_lead_time_mean"),
            "no_safe_rate": obj.get("no_safe_recommendation_rate"),
            "notes": "Existing Batch 9N event-level selector aggregate.",
        })
    return out


def policy_table_baselines() -> list[dict[str, Any]]:
    rows = read_csv(POLICY_TABLE)
    out = []
    for label, predicate in [
        ("global_row_threshold_generic", lambda r: r["policy_variant"] == "single_threshold_first_crossing" and r["score_family"].startswith("generic_bad_")),
        ("global_row_threshold_first_failure", lambda r: r["policy_variant"] == "single_threshold_first_crossing" and r["score_family"].startswith("ff_")),
        ("cora_like_step_abstention_adaptation", lambda r: r["policy_variant"] == "single_threshold_first_crossing"),
        ("toolchain_crc_like_trajectory_aggregation_adaptation", lambda r: r["policy_variant"] in {"top_k_trajectory_first_warning", "cumulative_hazard_threshold"}),
    ]:
        subset = [row for row in rows if predicate(row)]
        if not subset:
            continue
        # Use rows in a comparable lower-burden band when possible.
        band = [row for row in subset if float(row["test_trajectory_burden"]) <= 0.50]
        group = band or subset
        out.append({
            "baseline": label,
            "comparison_type": "adapted_existing_policy_grid",
            "alpha": "",
            "available": True,
            "rows": len(group),
            "missed_first_failure_rate": mean_key(group, "test_missed_first_failure_rate"),
            "first_failure_coverage": mean_key(group, "test_first_failure_coverage"),
            "pre_failure_coverage": mean_key(group, "test_pre_failure_warning_coverage"),
            "trajectory_burden": mean_key(group, "test_trajectory_burden"),
            "false_alarm_rate": mean_key(group, "test_false_alarm_trajectory_rate"),
            "row_deferral": mean_key(group, "test_row_deferral_rate"),
            "lead_time": mean_key(group, "test_mean_lead_time"),
            "no_safe_rate": "",
            "notes": "Derived from existing Batch 9N policy grid; not a new tuned baseline.",
        })
    for unavailable in ["oracle_first_bad_warning", "oracle_pre_first_failure_warning", "random_row_warning", "random_trajectory_warning", "always_no_warning", "always_warning", "batch_9m_best_hybrid_intervention"]:
        out.append({
            "baseline": unavailable,
            "comparison_type": "unavailable_or_prior_summary_only",
            "alpha": "",
            "available": False,
            "rows": 0,
            "missed_first_failure_rate": "",
            "first_failure_coverage": "",
            "pre_failure_coverage": "",
            "trajectory_burden": "",
            "false_alarm_rate": "",
            "row_deferral": "",
            "lead_time": "",
            "no_safe_rate": "",
            "notes": "Not recomputed in T-3 to avoid new unsupported evaluation; use prior reports or future matched implementation.",
        })
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["baseline", "comparison_type", "alpha", "available", "rows", "missed_first_failure_rate", "first_failure_coverage", "pre_failure_coverage", "trajectory_burden", "false_alarm_rate", "row_deferral", "lead_time", "no_safe_rate", "notes"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    real_rows = read_csv(REAL_CSV)
    rows = option_a_rows(real_rows) + nine_n_rows() + policy_table_baselines()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "empirical prototype; theory candidate; trajectory-level loss; first-event; missed first failure; Hoeffding union-bound correction; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "input_files": [str(REAL_CSV), str(NINE_N), str(POLICY_TABLE)],
        "comparison_rows": len(rows),
        "available_rows": sum(1 for row in rows if row["available"]),
        "interpretation": "Option A mainly adds calibration/no_safe_recommendation behavior; raw tradeoff should be interpreted against existing first-event selectors and policy grids.",
        "guard_results": {"test_tuning": False, "raw_text_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-3 Option A Baseline Comparison",
        "",
        report["claim_boundary"],
        "",
        f"- Comparison rows: `{len(rows)}`",
        f"- Available metric rows: `{report['available_rows']}`",
        "",
        report["interpretation"],
        "",
        "Some oracle/random baselines are marked unavailable in this matched T-3 comparison rather than silently recomputed with incompatible assumptions.",
    ]) + "\n")
    print(json.dumps({"comparison_rows": len(rows)}, indent=2))


if __name__ == "__main__":
    main()
