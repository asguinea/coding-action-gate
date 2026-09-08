#!/usr/bin/env python3
"""Oracle feasible-region analysis for Option C infeasibility diagnosis."""

from __future__ import annotations

import csv
import json
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
DATA = WORKSPACE / "data"
REPORTS = WORKSPACE / "reports"
TARGETS = DATA / "intervention_outputs" / "first_failure_prefix_targets.jsonl"
OUT_JSON = REPORTS / "batch_T6_option_C_oracle_feasible_region.json"
OUT_MD = REPORTS / "batch_T6_option_C_oracle_feasible_region.md"
OUT_CSV = REPORTS / "batch_T6_option_C_oracle_feasible_region.csv"
HEATMAP = REPORTS / "batch_T6_option_C_oracle_heatmap.csv"

ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]


def load_trajectories() -> dict[str, dict[str, Any]]:
    if not TARGETS.exists():
        raise FileNotFoundError(TARGETS)
    traj: dict[str, dict[str, Any]] = {}
    with TARGETS.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            tid = row["trajectory_id"]
            item = traj.setdefault(tid, {
                "trajectory_id": tid,
                "length": int(row["trajectory_decision_row_count"]),
                "has_bad": bool(int(row["bad_trajectory_has_any_bad_row"])),
                "repeated_bad": bool(int(row["bad_trajectory_has_repeated_bad_rows"])),
                "first_bad": int(row["bad_first_bad_row_index"]) if int(row["bad_trajectory_has_any_bad_row"]) else None,
            })
            item["length"] = max(item["length"], int(row["trajectory_decision_row_count"]))
    return traj


def metrics_for_warnings(traj: dict[str, dict[str, Any]], warnings: dict[str, int | None], policy: str) -> dict[str, Any]:
    n = len(traj)
    bad = [t for t in traj.values() if t["has_bad"]]
    clean = [t for t in traj.values() if not t["has_bad"]]
    warned = [tid for tid, w in warnings.items() if w is not None]
    covered = 0
    pre = 0
    late = 0
    false = 0
    leads = []
    for t in traj.values():
        w = warnings.get(t["trajectory_id"])
        if t["has_bad"]:
            f = t["first_bad"]
            if w is not None and w <= f:
                covered += 1
                if w < f:
                    pre += 1
                leads.append(f - w)
            elif w is not None and w > f:
                late += 1
        elif w is not None:
            false += 1
    return {
        "policy": policy,
        "trajectory_count": n,
        "bad_trajectories": len(bad),
        "clean_trajectories": len(clean),
        "missed_first_failure_rate": 1.0 - (covered / len(bad) if bad else 0.0),
        "first_failure_coverage": covered / len(bad) if bad else 0.0,
        "pre_failure_coverage": pre / len(bad) if bad else 0.0,
        "trajectory_burden": len(warned) / n if n else 0.0,
        "false_alarm_trajectory_rate": false / len(clean) if clean else 0.0,
        "late_warning_rate": late / len(bad) if bad else 0.0,
        "row_deferral_rate": len(warned) / sum(t["length"] for t in traj.values()),
        "mean_lead_time": mean(leads) if leads else None,
        "median_lead_time": median(leads) if leads else None,
    }


def build_policy_warnings(traj: dict[str, dict[str, Any]]) -> list[tuple[str, dict[str, int | None]]]:
    policies = []
    policies.append(("oracle_first_bad_warning", {tid: t["first_bad"] if t["has_bad"] else None for tid, t in traj.items()}))
    for k in [1, 2, 3, 5]:
        policies.append((f"oracle_pre_first_failure_window_{k}", {
            tid: max(0, int(t["first_bad"]) - k) if t["has_bad"] else None for tid, t in traj.items()
        }))
    bad_items = [t for t in traj.values() if t["has_bad"]]
    n_total = len(traj)
    for beta in BETAS:
        cap = int(beta * n_total)
        strategies = {
            "earliest_first_failures": sorted(bad_items, key=lambda t: (t["first_bad"], t["trajectory_id"])),
            "latest_first_failures": sorted(bad_items, key=lambda t: (-t["first_bad"], t["trajectory_id"])),
            "longest_trajectories": sorted(bad_items, key=lambda t: (-t["length"], t["trajectory_id"])),
            "repeated_bad_trajectories": sorted(bad_items, key=lambda t: (not t["repeated_bad"], t["trajectory_id"])),
        }
        rng = random.Random(20260621 + int(beta * 100))
        shuffled = list(bad_items)
        rng.shuffle(shuffled)
        strategies["random_bad_trajectories"] = shuffled
        for name, ordered in strategies.items():
            selected = {t["trajectory_id"] for t in ordered[:cap]}
            policies.append((f"oracle_budgeted_{name}_beta_{beta}", {
                tid: t["first_bad"] if tid in selected else None for tid, t in traj.items()
            }))
    return policies


def feasibility_rows(metric_rows: list[dict[str, Any]], bad_prevalence: float) -> list[dict[str, Any]]:
    rows = []
    for m in metric_rows:
        for alpha in ALPHAS:
            for beta in BETAS:
                rows.append({
                    "policy": m["policy"],
                    "alpha": alpha,
                    "beta": beta,
                    "missed_first_failure_rate": m["missed_first_failure_rate"],
                    "trajectory_burden": m["trajectory_burden"],
                    "empirically_feasible": m["missed_first_failure_rate"] <= alpha and m["trajectory_burden"] <= beta,
                    "analytic_oracle_max_coverage": min(1.0, beta / bad_prevalence) if bad_prevalence else 0.0,
                    "analytic_oracle_min_miss": max(0.0, 1.0 - (min(1.0, beta / bad_prevalence) if bad_prevalence else 0.0)),
                    "analytic_oracle_feasible": max(0.0, 1.0 - (min(1.0, beta / bad_prevalence) if bad_prevalence else 0.0)) <= alpha,
                })
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for r in rows for k in r})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    traj = load_trajectories()
    metric_rows = [metrics_for_warnings(traj, warnings, name) for name, warnings in build_policy_warnings(traj)]
    bad_prev = sum(1 for t in traj.values() if t["has_bad"]) / len(traj)
    feas = feasibility_rows(metric_rows, bad_prev)
    heat = []
    for alpha in ALPHAS:
        for beta in BETAS:
            upper_cov = min(1.0, beta / bad_prev) if bad_prev else 0.0
            heat.append({
                "alpha": alpha,
                "beta": beta,
                "bad_trajectory_prevalence": bad_prev,
                "analytic_oracle_max_coverage": upper_cov,
                "analytic_oracle_min_miss": max(0.0, 1.0 - upper_cov),
                "analytic_oracle_feasible": max(0.0, 1.0 - upper_cov) <= alpha,
            })
    feasible_cells = sum(1 for r in heat if r["analytic_oracle_feasible"])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "infeasibility diagnosis; feasible-region expansion; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "trajectory_count": len(traj),
        "bad_trajectory_count": sum(1 for t in traj.values() if t["has_bad"]),
        "bad_trajectory_prevalence": bad_prev,
        "oracle_policy_count": len(metric_rows),
        "analytic_feasible_cells": feasible_cells,
        "metric_rows": metric_rows,
        "interpretation": "Beta below bad-trajectory prevalence is structurally incompatible with high first-failure coverage unless missed-first-failure alpha is loose.",
        "guard_results": {"raw_text_used": False, "test_tuning": False},
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    write_csv(OUT_CSV, metric_rows)
    write_csv(HEATMAP, heat)
    OUT_MD.write_text("\n".join([
        "# Batch T-6 Option C Oracle Feasible Region",
        "",
        report["claim_boundary"],
        "",
        f"- Trajectories: `{len(traj)}`",
        f"- Bad-trajectory prevalence: `{bad_prev}`",
        f"- Analytic oracle-feasible alpha/beta cells: `{feasible_cells}` of `{len(heat)}`",
        "",
        report["interpretation"],
    ]) + "\n")
    print(json.dumps({"trajectories": len(traj), "bad_prevalence": bad_prev, "analytic_feasible_cells": feasible_cells}, indent=2))


if __name__ == "__main__":
    main()
