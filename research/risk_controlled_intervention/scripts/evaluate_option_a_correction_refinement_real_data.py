#!/usr/bin/env python3
"""Compare Option A correction refinements on existing real-data policy grid."""

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
T3_REAL = REPORTS / "batch_T3_option_A_real_data_results.json"
OUT_JSON = REPORTS / "batch_T4_option_A_correction_real_data.json"
OUT_MD = REPORTS / "batch_T4_option_A_correction_real_data.md"
OUT_CSV = REPORTS / "batch_T4_option_A_correction_real_data.csv"
BY_ALPHA = REPORTS / "batch_T4_option_A_correction_by_alpha.csv"
BY_SCORE = REPORTS / "batch_T4_option_A_correction_by_score.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
DELTAS = [0.10, 0.05]
CORRECTIONS = [
    "hoeffding_union_bound",
    "clopper_pearson_union",
    "plus_one_empirical_proxy",
    "pointwise_clopper_pearson_no_union",
]
GRID_PROTOCOLS = ["calibration_score_quantiles", "predeclared_quantile_grid"]


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


def split_counts() -> dict[int, dict[str, int]]:
    flags: dict[str, bool] = {}
    with require(TARGETS).open() as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                flags[row["trajectory_id"]] = flags.get(row["trajectory_id"], False) or bool(int(row.get("bad_trajectory_has_any_bad_row", 0)))
    obj = json.loads(require(SPLITS).read_text())
    counts = {}
    for split in obj["splits"]:
        seed_counts = defaultdict(int)
        for tid, assignment in split["assignments"].items():
            seed_counts[f"{assignment}_trajectories"] += 1
            if flags.get(tid, False):
                seed_counts[f"{assignment}_positive_trajectories"] += 1
        counts[int(split["seed"])] = dict(seed_counts)
    return counts


def run() -> list[dict[str, Any]]:
    rows = read_csv(POLICY_TABLE)
    counts = split_counts()
    groups = defaultdict(list)
    for row in rows:
        groups[(row["split_seed"], row["score_family"], row["policy_variant"])].append(row)
    outputs = []
    for protocol in GRID_PROTOCOLS:
        for correction in CORRECTIONS:
            for (seed_s, score_family, policy_variant), group_rows in sorted(groups.items()):
                seed = int(seed_s)
                n_risk = counts[seed].get("calibration_positive_trajectories", 0)
                threshold_grid = sorted({float(r["threshold_quantile"]) for r in group_rows if r.get("threshold_quantile")})
                calibration_table = []
                for order, r in enumerate(sorted(group_rows, key=lambda x: float(x["threshold_quantile"]))):
                    calibration_table.append({
                        "threshold": float(r["threshold_quantile"]),
                        "threshold_quantile": float(r["threshold_quantile"]),
                        "threshold_order": order,
                        "n_risk": n_risk,
                        "empirical_miss_rate": f(r, "calibration_missed_first_failure_rate"),
                        "empirical_burden": f(r, "calibration_trajectory_burden"),
                        "empirical_false_alarm_rate": f(r, "calibration_false_alarm_trajectory_rate"),
                        "empirical_pre_failure_coverage": f(r, "calibration_pre_failure_warning_coverage"),
                        "source_row": r,
                    })
                for alpha in ALPHAS:
                    for delta in DELTAS:
                        selected = option_a_select_threshold(calibration_table, alpha, delta, threshold_grid, correction_name=correction)
                        out = {
                            "grid_protocol": protocol,
                            "correction_name": correction,
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
                            "is_empirical_proxy": correction in {"plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"},
                            "is_uniform_over_grid": correction in {"hoeffding_union_bound", "clopper_pearson_union"},
                        }
                        if not selected["no_safe"]:
                            src = selected["selected_row"]["source_row"]
                            out.update({
                                "selected_threshold_quantile": selected["selected_threshold"],
                                "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                                "calibration_upper_bound": selected["selected_calibration_upper_bound"],
                                "calibration_trajectory_burden": selected["selected_calibration_burden"],
                                "calibration_false_alarm_rate": selected["selected_calibration_false_alarm_rate"],
                                "calibration_pre_failure_coverage": selected["selected_calibration_pre_failure_coverage"],
                                "test_missed_first_failure_rate": f(src, "test_missed_first_failure_rate"),
                                "test_first_failure_coverage": f(src, "test_first_failure_coverage"),
                                "test_pre_failure_warning_coverage": f(src, "test_pre_failure_warning_coverage"),
                                "test_trajectory_burden": f(src, "test_trajectory_burden"),
                                "test_false_alarm_trajectory_rate": f(src, "test_false_alarm_trajectory_rate"),
                                "test_late_warning_rate": f(src, "test_late_warning_rate"),
                                "test_row_deferral_rate": f(src, "test_row_deferral_rate"),
                                "test_mean_lead_time": f(src, "test_mean_lead_time", default=None),
                                "test_median_lead_time": f(src, "test_median_lead_time", default=None),
                                "calibration_to_test_gap": f(src, "test_missed_first_failure_rate") - selected["selected_calibration_miss_rate"],
                                "test_miss_le_alpha": f(src, "test_missed_first_failure_rate") <= alpha,
                            })
                        outputs.append(out)
    return outputs


def aggregate(rows: list[dict[str, Any]], keys: list[str]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[k] for k in keys)].append(row)
    out = []
    for vals, group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        feasible = [r for r in group if not r["no_safe"]]
        row = {k: v for k, v in zip(keys, vals)}
        row.update({
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"]) / len(group),
            "mean_test_miss_rate_feasible": mean([r["test_missed_first_failure_rate"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["test_trajectory_burden"] for r in feasible]) if feasible else None,
            "test_alpha_success_rate_feasible": mean([1.0 if r["test_miss_le_alpha"] else 0.0 for r in feasible]) if feasible else None,
        })
        out.append(row)
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    outputs = run()
    by_alpha = aggregate(outputs, ["correction_name", "grid_protocol", "alpha"])
    by_score = aggregate(outputs, ["correction_name", "grid_protocol", "score_family"])
    by_corr = aggregate(outputs, ["correction_name", "grid_protocol"])
    t3 = json.loads(require(T3_REAL).read_text())["summary"]
    best_uniform = min(
        [r for r in by_corr if r["correction_name"] in {"hoeffding_union_bound", "clopper_pearson_union"}],
        key=lambda r: (r["no_safe_rate"], r["mean_test_burden_feasible"] if r["mean_test_burden_feasible"] is not None else 9),
    )
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "correction refinement; theory candidate; trajectory-level loss; first-event; missed first failure; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "corrections": CORRECTIONS,
        "grid_protocols": GRID_PROTOCOLS,
        "summary_by_correction": by_corr,
        "best_uniform_correction_grid": best_uniform,
        "t3_hoeffding_reference": t3,
        "guard_results": {"test_tuning": False, "raw_text_used": False, "metadata_as_model_features": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, outputs)
    write_csv(BY_ALPHA, by_alpha)
    write_csv(BY_SCORE, by_score)
    OUT_MD.write_text("\n".join([
        "# Batch T-4 Option A Correction Real-Data Comparison",
        "",
        report["claim_boundary"],
        "",
        f"- Best uniform correction/grid: `{best_uniform['correction_name']} / {best_uniform['grid_protocol']}`",
        f"- No-safe rate: `{best_uniform['no_safe_rate']}`",
        f"- Mean feasible burden: `{best_uniform['mean_test_burden_feasible']}`",
        f"- Test alpha success feasible: `{best_uniform['test_alpha_success_rate_feasible']}`",
        "",
        "Clopper-Pearson union and Hoeffding are uniform finite-grid candidates. Plus-one and pointwise Clopper-Pearson are empirical diagnostics only.",
    ]) + "\n")
    print(json.dumps({"rows": len(outputs), "best_uniform": best_uniform}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
