#!/usr/bin/env python3
"""Option A empirical prototype on existing CodeTraceBench-derived first-event grid."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from option_a_first_event_calibration import option_a_select_threshold

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
DATA = WORKSPACE / "data"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
SPLITS = DATA / "processed" / "repeated_verified_splits.json"
TARGETS = DATA / "intervention_outputs" / "first_failure_prefix_targets.jsonl"

OUT_JSON = REPORTS / "batch_T3_option_A_real_data_results.json"
OUT_MD = REPORTS / "batch_T3_option_A_real_data_results.md"
OUT_CSV = REPORTS / "batch_T3_option_A_real_data_results.csv"
BY_SCORE = REPORTS / "batch_T3_option_A_real_data_by_score.csv"
BY_ALPHA = REPORTS / "batch_T3_option_A_real_data_by_alpha.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
DELTAS = [0.10, 0.05]
REQUIRED_FIRST_FAILURE_PREFIXES = ("ff_", "hybrid_")
REQUIRED_GENERIC_PREFIXES = ("generic_bad_",)


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = row.get(key)
    if value in (None, ""):
        return default
    return float(value)


def trajectory_bad_flags() -> dict[str, bool]:
    flags: dict[str, bool] = {}
    with require(TARGETS).open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            tid = row["trajectory_id"]
            flags[tid] = flags.get(tid, False) or bool(int(row.get("bad_trajectory_has_any_bad_row", 0)))
    return flags


def split_counts() -> dict[int, dict[str, int]]:
    flags = trajectory_bad_flags()
    obj = json.loads(require(SPLITS).read_text())
    counts: dict[int, dict[str, int]] = {}
    for split in obj["splits"]:
        seed = int(split["seed"])
        seed_counts = defaultdict(int)
        for tid, assignment in split["assignments"].items():
            seed_counts[f"{assignment}_trajectories"] += 1
            if flags.get(tid, False):
                seed_counts[f"{assignment}_positive_trajectories"] += 1
        counts[seed] = dict(seed_counts)
    return counts


def validate_scores(rows: list[dict[str, str]]) -> None:
    families = {row["score_family"] for row in rows}
    has_ff = any(fam.startswith(REQUIRED_FIRST_FAILURE_PREFIXES) for fam in families)
    has_generic = any(fam.startswith(REQUIRED_GENERIC_PREFIXES) for fam in families)
    if not has_ff:
        raise RuntimeError("Required minimum missing: at least one first-failure-specific or hybrid score family.")
    if not has_generic:
        raise RuntimeError("Required minimum missing: at least one generic next-step-bad score family.")


def option_a_on_policy_grid(rows: list[dict[str, str]], counts: dict[int, dict[str, int]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[(row["split_seed"], row["score_family"], row["policy_variant"])].append(row)
    outputs = []
    for (seed_s, score_family, policy_variant), group_rows in sorted(groups.items()):
        seed = int(seed_s)
        n_risk = counts.get(seed, {}).get("calibration_positive_trajectories", 0)
        threshold_grid = sorted({float(row["threshold_quantile"]) for row in group_rows if row.get("threshold_quantile")})
        calibration_table = []
        for order, row in enumerate(sorted(group_rows, key=lambda r: float(r["threshold_quantile"]))):
            calibration_table.append({
                "threshold": float(row["threshold_quantile"]),
                "threshold_quantile": float(row["threshold_quantile"]),
                "threshold_order": order,
                "n_risk": n_risk,
                "empirical_miss_rate": f(row, "calibration_missed_first_failure_rate"),
                "empirical_burden": f(row, "calibration_trajectory_burden"),
                "empirical_false_alarm_rate": f(row, "calibration_false_alarm_trajectory_rate"),
                "empirical_pre_failure_coverage": f(row, "calibration_pre_failure_warning_coverage"),
                "source_row": row,
            })
        for alpha in ALPHAS:
            for delta in DELTAS:
                selected = option_a_select_threshold(calibration_table, alpha, delta, threshold_grid)
                out = {
                    "split_seed": seed,
                    "score_family": score_family,
                    "policy_variant": policy_variant,
                    "alpha": alpha,
                    "delta": delta,
                    "no_safe": selected["no_safe"],
                    "feasible_count": selected["feasible_count"],
                    "M": selected["M"],
                    "n_calibration_positive_trajectories": n_risk,
                    "selection_split": "calibration",
                    "evaluation_split": "test",
                    "test_tuning": False,
                }
                if not selected["no_safe"]:
                    source = selected["selected_row"]["source_row"]
                    out.update({
                        "selected_threshold_quantile": selected["selected_threshold"],
                        "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                        "calibration_upper_bound": selected["selected_calibration_upper_bound"],
                        "calibration_trajectory_burden": selected["selected_calibration_burden"],
                        "calibration_false_alarm_rate": selected["selected_calibration_false_alarm_rate"],
                        "calibration_pre_failure_coverage": selected["selected_calibration_pre_failure_coverage"],
                        "test_missed_first_failure_rate": f(source, "test_missed_first_failure_rate"),
                        "test_first_failure_coverage": f(source, "test_first_failure_coverage"),
                        "test_pre_failure_warning_coverage": f(source, "test_pre_failure_warning_coverage"),
                        "test_trajectory_burden": f(source, "test_trajectory_burden"),
                        "test_false_alarm_trajectory_rate": f(source, "test_false_alarm_trajectory_rate"),
                        "test_late_warning_rate": f(source, "test_late_warning_rate"),
                        "test_mean_lead_time": f(source, "test_mean_lead_time", default=None),
                        "test_median_lead_time": f(source, "test_median_lead_time", default=None),
                        "test_row_deferral_rate": f(source, "test_row_deferral_rate"),
                        "calibration_to_test_miss_gap": f(source, "test_missed_first_failure_rate") - selected["selected_calibration_miss_rate"],
                        "test_miss_le_alpha": f(source, "test_missed_first_failure_rate") <= alpha,
                    })
                outputs.append(out)
    return outputs


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def aggregate(rows: list[dict[str, Any]], by: str) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[row[by]].append(row)
    out = []
    for key, group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        feasible = [r for r in group if not r["no_safe"]]
        out.append({
            by: key,
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"]) / len(group),
            "mean_test_miss_rate_feasible": mean([r["test_missed_first_failure_rate"] for r in feasible]) if feasible else None,
            "mean_test_first_failure_coverage_feasible": mean([r["test_first_failure_coverage"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["test_trajectory_burden"] for r in feasible]) if feasible else None,
            "test_alpha_success_rate_feasible": mean([1.0 if r["test_miss_le_alpha"] else 0.0 for r in feasible]) if feasible else None,
        })
    return out


def main() -> None:
    rows = read_csv(POLICY_TABLE)
    validate_scores(rows)
    counts = split_counts()
    outputs = option_a_on_policy_grid(rows, counts)
    by_score = aggregate(outputs, "score_family")
    by_alpha = aggregate(outputs, "alpha")
    feasible = [row for row in outputs if not row["no_safe"]]
    summary = {
        "result_rows": len(outputs),
        "feasible_rows": len(feasible),
        "no_safe_rate": sum(1 for row in outputs if row["no_safe"]) / len(outputs),
        "mean_test_miss_rate_feasible": mean([r["test_missed_first_failure_rate"] for r in feasible]) if feasible else None,
        "mean_test_burden_feasible": mean([r["test_trajectory_burden"] for r in feasible]) if feasible else None,
        "test_alpha_success_rate_feasible": mean([1.0 if r["test_miss_le_alpha"] else 0.0 for r in feasible]) if feasible else None,
    }
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "empirical prototype; theory candidate; trajectory-level loss; first-event; missed first failure; Hoeffding union-bound correction; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "input_files": [str(POLICY_TABLE), str(SPLITS), str(TARGETS)],
        "alphas": ALPHAS,
        "deltas": DELTAS,
        "summary": summary,
        "score_family_summary": by_score,
        "alpha_summary": by_alpha,
        "guard_results": {"raw_text_used": False, "metadata_as_model_features": False, "test_tuning": False, "mock_scores_used": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, outputs)
    write_csv(BY_SCORE, by_score)
    write_csv(BY_ALPHA, by_alpha)
    lines = [
        "# Batch T-3 Option A Real-Data Results",
        "",
        report["claim_boundary"],
        "",
        "## Summary",
        "",
        f"- Result rows: `{summary['result_rows']}`",
        f"- No-safe rate: `{summary['no_safe_rate']:.3f}`",
        f"- Mean test missed first failure among feasible selections: `{summary['mean_test_miss_rate_feasible']}`",
        f"- Mean test trajectory burden among feasible selections: `{summary['mean_test_burden_feasible']}`",
        f"- Test alpha success rate among feasible selections: `{summary['test_alpha_success_rate_feasible']}`",
        "",
        "The prototype uses existing Batch 9N calibration/test policy-grid metrics. Thresholds are selected on calibration metrics only; test metrics are used only for final evaluation.",
    ]
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
