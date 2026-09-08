#!/usr/bin/env python3
"""Decompose Option C infeasibility into empirical and correction components."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

from evaluate_option_c_real_data import ALPHAS, BETAS, CORRECTIONS, GRID_PROTOCOLS, f, read_csv, split_counts
from option_c_dual_constraint_calibration import compute_dual_loss_bounds

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS = WORKSPACE / "reports"
POLICY_TABLE = REPORTS / "batch_9n_first_event_policy_table.csv"
OUT_JSON = REPORTS / "batch_T6_option_C_correction_conservatism.json"
OUT_MD = REPORTS / "batch_T6_option_C_correction_conservatism.md"
OUT_CSV = REPORTS / "batch_T6_option_C_correction_conservatism.csv"
BREAKDOWN = REPORTS / "batch_T6_option_C_correction_loss_breakdown.csv"


def candidate_rows() -> list[dict[str, Any]]:
    rows = read_csv(POLICY_TABLE)
    counts = split_counts()
    groups = defaultdict(list)
    for row in rows:
        groups[(row["split_seed"], row["score_family"], row["policy_variant"])].append(row)
    out = []
    for protocol in GRID_PROTOCOLS:
        for correction in CORRECTIONS:
            for (seed_s, score_family, policy_variant), group_rows in sorted(groups.items()):
                seed = int(seed_s)
                n_miss = counts[seed].get("calibration_positive_trajectories", 0)
                n_burden = counts[seed].get("calibration_trajectories", 0)
                grid = sorted({float(r["threshold_quantile"]) for r in group_rows if r.get("threshold_quantile")})
                for r in group_rows:
                    miss = f(r, "calibration_missed_first_failure_rate")
                    burden = f(r, "calibration_trajectory_burden")
                    bounds = compute_dual_loss_bounds({
                        "n_miss": n_miss,
                        "n_burden": n_burden,
                        "miss_rate": miss,
                        "burden_rate": burden,
                    }, grid, correction, 0.10)
                    for alpha in ALPHAS:
                        for beta in BETAS:
                            emp = miss <= alpha and burden <= beta
                            corr = bounds["miss_upper"] <= alpha and bounds["burden_upper"] <= beta
                            out.append({
                                "grid_protocol": protocol,
                                "correction_name": correction,
                                "split_seed": seed,
                                "score_family": score_family,
                                "policy_variant": policy_variant,
                                "threshold_quantile": f(r, "threshold_quantile"),
                                "alpha": alpha,
                                "beta": beta,
                                "empirical_calibration_miss_rate": miss,
                                "corrected_miss_upper": bounds["miss_upper"],
                                "miss_correction_slack": bounds["miss_upper"] - miss,
                                "empirical_calibration_burden": burden,
                                "corrected_burden_upper": bounds["burden_upper"],
                                "burden_correction_slack": bounds["burden_upper"] - burden,
                                "empirical_feasible": emp,
                                "corrected_feasible": corr,
                                "lost_due_to_miss_correction": emp and bounds["miss_upper"] > alpha and bounds["burden_upper"] <= beta,
                                "lost_due_to_burden_correction": emp and bounds["miss_upper"] <= alpha and bounds["burden_upper"] > beta,
                                "lost_due_to_both_corrections": emp and bounds["miss_upper"] > alpha and bounds["burden_upper"] > beta,
                                "selection_split": "calibration",
                                "test_tuning": False,
                            })
    return out


def summarize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for r in rows:
        groups[(r["correction_name"], r["grid_protocol"], r["alpha"], r["beta"])].append(r)
    out = []
    for vals, group in sorted(groups.items(), key=lambda kv: str(kv[0])):
        empirical = [r for r in group if r["empirical_feasible"]]
        corrected = [r for r in group if r["corrected_feasible"]]
        item = {
            "correction_name": vals[0],
            "grid_protocol": vals[1],
            "alpha": vals[2],
            "beta": vals[3],
            "candidate_rows": len(group),
            "empirical_feasible_rate": len(empirical) / len(group),
            "corrected_feasible_rate": len(corrected) / len(group),
            "feasibility_lost_rate": (len(empirical) - len(corrected)) / len(group),
            "mean_miss_slack": mean([r["miss_correction_slack"] for r in group]),
            "mean_burden_slack": mean([r["burden_correction_slack"] for r in group]),
            "lost_due_to_miss_rate": sum(1 for r in group if r["lost_due_to_miss_correction"]) / len(group),
            "lost_due_to_burden_rate": sum(1 for r in group if r["lost_due_to_burden_correction"]) / len(group),
            "lost_due_to_both_rate": sum(1 for r in group if r["lost_due_to_both_corrections"]) / len(group),
        }
        out.append(item)
    return out


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for r in rows for k in r})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows = candidate_rows()
    summary = summarize(rows)
    cp = [r for r in summary if r["correction_name"] == "clopper_pearson_union"]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "candidate_rows": len(rows),
        "summary_rows": len(summary),
        "clopper_pearson_mean_empirical_feasible_rate": mean([r["empirical_feasible_rate"] for r in cp]) if cp else None,
        "clopper_pearson_mean_corrected_feasible_rate": mean([r["corrected_feasible_rate"] for r in cp]) if cp else None,
        "clopper_pearson_mean_feasibility_lost_rate": mean([r["feasibility_lost_rate"] for r in cp]) if cp else None,
        "summary": summary,
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, rows)
    write_csv(BREAKDOWN, summary)
    OUT_MD.write_text("\n".join([
        "# Batch T-6 Option C Correction Conservatism",
        "",
        report["claim_boundary"],
        "",
        f"- Candidate rows: `{len(rows)}`",
        f"- CP mean empirical feasible rate: `{report['clopper_pearson_mean_empirical_feasible_rate']}`",
        f"- CP mean corrected feasible rate: `{report['clopper_pearson_mean_corrected_feasible_rate']}`",
        f"- CP mean feasibility lost rate: `{report['clopper_pearson_mean_feasibility_lost_rate']}`",
        "",
        "This decomposition separates empirical infeasibility from finite-grid correction slack. It is an offline proxy diagnosis, not production validation.",
    ]) + "\n")
    print(json.dumps({"candidate_rows": len(rows), "summary_rows": len(summary)}, indent=2))


if __name__ == "__main__":
    main()
