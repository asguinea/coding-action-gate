#!/usr/bin/env python3
"""Real-data Option C dual-constraint evaluation over existing policy grid."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from option_c_dual_constraint_calibration import option_c_select_threshold

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
DATA = WORKSPACE / "data"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
SPLITS = DATA / "processed" / "repeated_verified_splits.json"
TARGETS = DATA / "intervention_outputs" / "first_failure_prefix_targets.jsonl"
OUT_JSON = REPORTS / "batch_T5_option_C_real_data_results.json"
OUT_MD = REPORTS / "batch_T5_option_C_real_data_results.md"
OUT_CSV = REPORTS / "batch_T5_option_C_real_data_results.csv"
BY_ALPHA_BETA = REPORTS / "batch_T5_option_C_real_data_by_alpha_beta.csv"
BY_SCORE = REPORTS / "batch_T5_option_C_real_data_by_score.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]
DELTAS = [0.10, 0.05]
CORRECTIONS = ["clopper_pearson_union", "hoeffding_union_bound", "plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"]
GRID_PROTOCOLS = ["calibration_score_quantiles", "predeclared_quantile_grid"]


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def read_csv(path: Path) -> list[dict[str, str]]:
    with require(path).open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str, default: float | None = 0.0) -> float | None:
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
    outputs: list[dict[str, Any]] = []
    for protocol in GRID_PROTOCOLS:
        for correction in CORRECTIONS:
            for (seed_s, score_family, policy_variant), group_rows in sorted(groups.items()):
                seed = int(seed_s)
                n_miss = counts[seed].get("calibration_positive_trajectories", 0)
                n_burden = counts[seed].get("calibration_trajectories", 0)
                threshold_grid = sorted({float(r["threshold_quantile"]) for r in group_rows if r.get("threshold_quantile")})
                calibration_table = []
                for order, r in enumerate(sorted(group_rows, key=lambda x: float(x["threshold_quantile"]))):
                    calibration_table.append({
                        "threshold": float(r["threshold_quantile"]),
                        "threshold_quantile": float(r["threshold_quantile"]),
                        "threshold_order": order,
                        "n_miss": n_miss,
                        "n_burden": n_burden,
                        "empirical_miss_rate": f(r, "calibration_missed_first_failure_rate"),
                        "empirical_burden": f(r, "calibration_trajectory_burden"),
                        "empirical_false_alarm_rate": f(r, "calibration_false_alarm_trajectory_rate"),
                        "empirical_pre_failure_coverage": f(r, "calibration_pre_failure_warning_coverage"),
                        "empirical_mean_lead_time": f(r, "calibration_mean_lead_time", default=0.0),
                        "source_row": r,
                    })
                for alpha in ALPHAS:
                    for beta in BETAS:
                        for delta in DELTAS:
                            selected = option_c_select_threshold(calibration_table, alpha, beta, delta, threshold_grid, correction=correction)
                            out: dict[str, Any] = {
                                "grid_protocol": protocol,
                                "correction_name": correction,
                                "split_seed": seed,
                                "score_family": score_family,
                                "policy_variant": policy_variant,
                                "alpha": alpha,
                                "beta": beta,
                                "delta": delta,
                                "no_safe": selected["no_safe"],
                                "feasible_count": selected["feasible_count"],
                                "M": selected["M"],
                                "n_calibration_trajectories": n_burden,
                                "n_calibration_positive_trajectories": n_miss,
                                "selection_split": "calibration",
                                "evaluation_split": "test",
                                "test_tuning": False,
                                "is_empirical_proxy": correction in {"plus_one_empirical_proxy", "pointwise_clopper_pearson_no_union"},
                                "is_uniform_over_grid_and_losses": correction in {"clopper_pearson_union", "hoeffding_union_bound"},
                            }
                            if not selected["no_safe"]:
                                src = selected["selected_row"]["source_row"]
                                test_miss = f(src, "test_missed_first_failure_rate")
                                test_burden = f(src, "test_trajectory_burden")
                                out.update({
                                    "selected_threshold_quantile": selected["selected_threshold"],
                                    "calibration_miss_rate": selected["selected_calibration_miss_rate"],
                                    "calibration_burden": selected["selected_calibration_burden"],
                                    "calibration_miss_upper": selected["selected_calibration_miss_upper"],
                                    "calibration_burden_upper": selected["selected_calibration_burden_upper"],
                                    "calibration_false_alarm_rate": selected["selected_calibration_false_alarm_rate"],
                                    "calibration_pre_failure_coverage": selected["selected_calibration_pre_failure_coverage"],
                                    "test_missed_first_failure_rate": test_miss,
                                    "test_trajectory_burden": test_burden,
                                    "test_first_failure_coverage": f(src, "test_first_failure_coverage"),
                                    "test_pre_failure_warning_coverage": f(src, "test_pre_failure_warning_coverage"),
                                    "test_false_alarm_trajectory_rate": f(src, "test_false_alarm_trajectory_rate"),
                                    "test_late_warning_rate": f(src, "test_late_warning_rate"),
                                    "test_row_deferral_rate": f(src, "test_row_deferral_rate"),
                                    "test_mean_lead_time": f(src, "test_mean_lead_time", default=None),
                                    "test_median_lead_time": f(src, "test_median_lead_time", default=None),
                                    "calibration_to_test_miss_gap": test_miss - selected["selected_calibration_miss_rate"],
                                    "calibration_to_test_burden_gap": test_burden - selected["selected_calibration_burden"],
                                    "test_alpha_success": test_miss <= alpha,
                                    "test_beta_success": test_burden <= beta,
                                    "test_joint_success": test_miss <= alpha and test_burden <= beta,
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
        item = {k: v for k, v in zip(keys, vals)}
        item.update({
            "rows": len(group),
            "no_safe_rate": sum(1 for r in group if r["no_safe"]) / len(group),
            "mean_test_miss_rate_feasible": mean([r["test_missed_first_failure_rate"] for r in feasible]) if feasible else None,
            "mean_test_burden_feasible": mean([r["test_trajectory_burden"] for r in feasible]) if feasible else None,
            "mean_first_failure_coverage_feasible": mean([r["test_first_failure_coverage"] for r in feasible]) if feasible else None,
            "mean_pre_failure_coverage_feasible": mean([r["test_pre_failure_warning_coverage"] for r in feasible]) if feasible else None,
            "joint_success_rate_feasible": mean([1.0 if r["test_joint_success"] else 0.0 for r in feasible]) if feasible else None,
        })
        out.append(item)
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    outputs = run()
    by_alpha_beta = aggregate(outputs, ["correction_name", "grid_protocol", "alpha", "beta"])
    by_score = aggregate(outputs, ["correction_name", "grid_protocol", "score_family"])
    by_corr = aggregate(outputs, ["correction_name", "grid_protocol"])
    cp = [r for r in by_corr if r["correction_name"] == "clopper_pearson_union"]
    best_uniform = min(cp, key=lambda r: (r["no_safe_rate"], r["mean_test_burden_feasible"] if r["mean_test_burden_feasible"] is not None else 9.0))
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "dual-constraint feasible set; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "alphas": ALPHAS,
        "betas": BETAS,
        "deltas": DELTAS,
        "corrections": CORRECTIONS,
        "grid_protocols": GRID_PROTOCOLS,
        "summary_by_correction": by_corr,
        "best_default_correction_grid": best_uniform,
        "result_rows": len(outputs),
        "guard_results": {"test_tuning": False, "raw_text_used": False, "metadata_as_model_features": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, outputs)
    write_csv(BY_ALPHA_BETA, by_alpha_beta)
    write_csv(BY_SCORE, by_score)
    OUT_MD.write_text("\n".join([
        "# Batch T-5 Option C Real-Data Results",
        "",
        report["claim_boundary"],
        "",
        f"- Result rows: `{len(outputs)}`",
        f"- Best default correction/grid: `{best_uniform['correction_name']} / {best_uniform['grid_protocol']}`",
        f"- No-safe rate: `{best_uniform['no_safe_rate']}`",
        f"- Mean feasible miss rate: `{best_uniform['mean_test_miss_rate_feasible']}`",
        f"- Mean feasible trajectory burden: `{best_uniform['mean_test_burden_feasible']}`",
        f"- Joint success feasible: `{best_uniform['joint_success_rate_feasible']}`",
        "",
        "Option C explicitly controls burden through a corrected trajectory-level burden bound. A high no_safe_recommendation rate is expected when alpha and beta conflict.",
    ]) + "\n")
    print(json.dumps({"rows": len(outputs), "best_default": best_uniform}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
