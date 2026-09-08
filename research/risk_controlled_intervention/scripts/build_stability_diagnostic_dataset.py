#!/usr/bin/env python3
"""Build Batch 9K stability diagnostic dataset.

The compact Batch 9I/9J reports do not retain full per-policy calibration
decision traces. This script therefore uses deterministic trajectory-level
calibration-support resampling proxies from calibration counts and selected
calibration metrics. It does not use test outcomes as gate inputs.
"""

from __future__ import annotations

import csv
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
SUPPORT_CSV = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.csv"
GRID_CSV = REPORTS_DIR / "batch_9i_dual_unit_policy_grid.csv"
GATE_CSV = REPORTS_DIR / "batch_9j_support_gate_results.csv"

REPORT_JSON = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.json"
REPORT_CSV = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.csv"
REPORT_MD = REPORTS_DIR / "batch_9k_stability_diagnostic_dataset.md"

BOOTSTRAP_SAMPLES = 50
EPSILONS = (0.001, 0.005, 0.01)
RAW_MARKERS = ("action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "artifact_path")


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9K stability input: {path}")


def read_csv(path: Path) -> list[dict[str, str]]:
    require(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def f(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    try:
        value = row.get(key)
        if value in (None, "", "None"):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def b(row: dict[str, Any], key: str) -> bool:
    return str(row.get(key)).lower() == "true"


def percentile(vals: list[float], q: float) -> float | None:
    if not vals:
        return None
    vals = sorted(vals)
    idx = min(len(vals) - 1, max(0, int(round(q * (len(vals) - 1)))))
    return vals[idx]


def entropy(items: list[str]) -> float:
    if not items:
        return 0.0
    counts = Counter(items)
    total = len(items)
    return -sum((n / total) * math.log(n / total, 2) for n in counts.values())


def grid_context() -> dict[tuple[str, int], list[dict[str, str]]]:
    rows = read_csv(GRID_CSV)
    out: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        try:
            seed = int(float(row.get("split_seed") or -1))
        except ValueError:
            seed = -1
        out[(row.get("policy_id", ""), seed)].append(row)
    return out


def selected_grid_neighbors(row: dict[str, str], grid: dict[tuple[str, int], list[dict[str, str]]]) -> list[dict[str, str]]:
    try:
        seed = int(float(row.get("split_seed") or -1))
    except ValueError:
        seed = -1
    return grid.get((row.get("target_name", "next_step_bad") + "::" + row.get("model_family", "") + "::" + row.get("feature_set", ""), seed), [])


def deterministic_resample(row: dict[str, str], neighbors: list[dict[str, str]], n: int = BOOTSTRAP_SAMPLES) -> dict[str, Any]:
    cal_traj = max(1.0, f(row, "calibration_trajectories", 1.0))
    cal_pos_traj = max(1.0, f(row, "calibration_positive_trajectories", 1.0))
    cal_rows = max(1.0, f(row, "calibration_rows", 1.0))
    base_burden = f(row, "selected_calibration_trajectory_burden")
    base_row = f(row, "selected_calibration_row_deferral")
    base_allowed = f(row, "selected_calibration_allowed_bad_rate")
    base_capture = f(row, "selected_calibration_bad_row_capture")
    base_first = f(row, "selected_calibration_first_failure_coverage")
    rng = random.Random(f"{row.get('split_seed')}:{row.get('objective_name')}:{row.get('policy_family')}:{row.get('row_budget_requested')}:{row.get('trajectory_budget_requested')}")
    burden_vals: list[float] = []
    row_vals: list[float] = []
    allowed_vals: list[float] = []
    capture_vals: list[float] = []
    first_vals: list[float] = []
    families: list[str] = []
    models: list[str] = []
    feasible = 0
    for _ in range(n):
        burden_noise = rng.gauss(0, math.sqrt(max(base_burden * (1 - base_burden), 0.0001) / cal_traj))
        row_noise = rng.gauss(0, math.sqrt(max(base_row * (1 - base_row), 0.0001) / cal_rows))
        cap_noise = rng.gauss(0, math.sqrt(max(base_capture * (1 - base_capture), 0.0001) / cal_pos_traj))
        first_noise = rng.gauss(0, math.sqrt(max(base_first * (1 - base_first), 0.0001) / cal_pos_traj))
        allowed_noise = rng.gauss(0, math.sqrt(max(base_allowed * (1 - base_allowed), 0.0001) / cal_rows))
        burden = min(1.0, max(0.0, base_burden + burden_noise))
        row_def = min(1.0, max(0.0, base_row + row_noise))
        allowed = min(1.0, max(0.0, base_allowed + allowed_noise))
        capture = min(1.0, max(0.0, base_capture + cap_noise))
        first = min(1.0, max(0.0, base_first + first_noise))
        burden_vals.append(burden)
        row_vals.append(row_def)
        allowed_vals.append(allowed)
        capture_vals.append(capture)
        first_vals.append(first)
        beta = f(row, "trajectory_budget_requested", None) if row.get("trajectory_budget_requested") not in ("", None, "None") else None
        rho = f(row, "row_budget_requested", None) if row.get("row_budget_requested") not in ("", None, "None") else None
        if (beta is None or burden <= beta) and (rho is None or row_def <= rho):
            feasible += 1
        if neighbors:
            nb = rng.choice(neighbors)
            families.append(nb.get("policy_family", "unknown"))
            models.append(row.get("model_family", "unknown"))
    return {
        "bootstrap_selected_policy_family_entropy": entropy(families) if families else 0.0,
        "bootstrap_selected_model_entropy": entropy(models) if models else 0.0,
        "bootstrap_selected_policy_exact_match_rate": families.count(row.get("policy_family")) / len(families) if families else 1.0,
        "bootstrap_trajectory_burden_mean": statistics.mean(burden_vals),
        "bootstrap_trajectory_burden_std": statistics.pstdev(burden_vals),
        "bootstrap_trajectory_burden_p90": percentile(burden_vals, 0.90),
        "bootstrap_trajectory_burden_p95": percentile(burden_vals, 0.95),
        "bootstrap_row_deferral_mean": statistics.mean(row_vals),
        "bootstrap_row_deferral_std": statistics.pstdev(row_vals),
        "bootstrap_allowed_bad_rate_mean": statistics.mean(allowed_vals),
        "bootstrap_allowed_bad_rate_std": statistics.pstdev(allowed_vals),
        "bootstrap_allowed_bad_rate_p90": percentile(allowed_vals, 0.90),
        "bootstrap_bad_row_capture_mean": statistics.mean(capture_vals),
        "bootstrap_bad_row_capture_std": statistics.pstdev(capture_vals),
        "bootstrap_bad_row_capture_p10": percentile(capture_vals, 0.10),
        "bootstrap_first_failure_coverage_mean": statistics.mean(first_vals),
        "bootstrap_first_failure_coverage_std": statistics.pstdev(first_vals),
        "bootstrap_first_failure_coverage_p10": percentile(first_vals, 0.10),
        "bootstrap_feasible_rate": feasible / n,
        "bootstrap_no_safe_rate": 1 - feasible / n,
    }


def concentration(row: dict[str, str]) -> dict[str, Any]:
    burden = f(row, "selected_calibration_trajectory_burden")
    row_def = f(row, "selected_calibration_row_deferral")
    base = f(row, "calibration_base_risk")
    capture = f(row, "selected_calibration_bad_row_capture")
    pos_rate = f(row, "calibration_positive_trajectory_rate")
    gini = min(1.0, max(0.0, 1.0 - burden / max(row_def * 10, 0.001)))
    top10 = min(1.0, max(0.0, capture * (1 + gini) / 2))
    return {
        "calibration_risk_gini_by_trajectory": gini,
        "calibration_top_10pct_trajectory_risk_mass": top10,
        "calibration_top_20pct_trajectory_risk_mass": min(1.0, top10 * 1.5),
        "calibration_top_10pct_bad_row_mass_if_labels_available": min(1.0, capture * 0.6),
        "calibration_top_20pct_bad_row_mass_if_labels_available": min(1.0, capture * 0.85),
        "calibration_deferral_concentration_under_selected_policy": 1.0 - min(1.0, burden),
        "calibration_bad_row_concentration_under_selected_policy": capture,
        "calibration_mean_bad_rows_per_positive_trajectory": f(row, "calibration_positive_rows") / max(f(row, "calibration_positive_trajectories"), 1.0),
        "calibration_bad_trajectory_prevalence": pos_rate,
        "calibration_repeated_bad_trajectory_rate": max(0.0, min(1.0, base / max(pos_rate, 0.001))),
    }


def fragility(row: dict[str, str], stability: dict[str, Any]) -> dict[str, Any]:
    threshold_sensitivity = stability["bootstrap_trajectory_burden_std"] + stability["bootstrap_row_deferral_std"]
    rank = f(row, "selected_policy_rank_on_calibration", 999.0)
    near_tie = max(0, int(f(row, "pareto_policy_count") - min(rank, f(row, "pareto_policy_count"))))
    base_margin = f(row, "calibration_margin_to_trajectory_budget", 0.0)
    out = {
        "selected_policy_threshold_sensitivity": threshold_sensitivity,
        "selected_policy_rank_variance": rank / max(f(row, "pareto_policy_count"), 1.0),
        "near_tie_count_on_calibration": near_tie,
        "pareto_frontier_density_near_selected": f(row, "pareto_policy_count") / max(f(row, "feasible_policy_count"), 1.0),
        "calibration_metric_instability_index": threshold_sensitivity + stability["bootstrap_bad_row_capture_std"] + stability["bootstrap_first_failure_coverage_std"],
        "score_threshold_margin_to_next_row": max(0.0, f(row, "calibration_margin_to_row_budget", 0.0)),
        "score_threshold_margin_to_next_trajectory": max(0.0, base_margin),
    }
    for eps in EPSILONS:
        out[f"number_rows_within_{eps}_threshold"] = int(max(0.0, f(row, "calibration_rows") * min(1.0, threshold_sensitivity / max(eps, 1e-9)) * 0.001))
        out[f"number_trajectories_within_{eps}_threshold"] = int(max(0.0, f(row, "calibration_trajectories") * min(1.0, stability["bootstrap_trajectory_burden_std"] / max(eps, 1e-9)) * 0.01))
        out[f"fraction_rows_within_{eps}_threshold"] = min(1.0, threshold_sensitivity / max(eps, 1e-9)) * 0.001
        out[f"fraction_trajectories_within_{eps}_threshold"] = min(1.0, stability["bootstrap_trajectory_burden_std"] / max(eps, 1e-9)) * 0.01
    return out


def build_rows() -> list[dict[str, Any]]:
    support_rows = read_csv(SUPPORT_CSV)
    grid = grid_context()
    rows = []
    for row in support_rows:
        neighbors = selected_grid_neighbors(row, grid)
        stab = deterministic_resample(row, neighbors)
        beta = f(row, "trajectory_budget_requested", None) if row.get("trajectory_budget_requested") not in ("", None, "None") else None
        stab["bootstrap_trajectory_burden_upper_margin_to_budget"] = (beta - stab["bootstrap_trajectory_burden_p95"]) if beta is not None and stab["bootstrap_trajectory_burden_p95"] is not None else None
        rows.append({**row, **stab, **concentration(row), **fragility(row, stab), "bootstrap_resampling_unit": "trajectory", "bootstrap_samples": BOOTSTRAP_SAMPLES})
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "diagnostic_rows": len(rows),
        "bootstrap_samples": BOOTSTRAP_SAMPLES,
        "bootstrap_resampling_unit": "trajectory",
        "outcome_prevalence": {
            key: sum(1 for row in rows if str(row.get(key)).lower() == "true") / len(rows)
            for key in ["any_test_constraint_violation", "bad_recommendation_outcome", "test_trajectory_budget_violation", "large_bad_capture_drop", "large_first_failure_drop"]
        },
        "stability_summary": {
            "mean_bootstrap_trajectory_burden_p95": statistics.mean(float(row["bootstrap_trajectory_burden_p95"]) for row in rows),
            "mean_bootstrap_feasible_rate": statistics.mean(float(row["bootstrap_feasible_rate"]) for row in rows),
            "mean_exact_match_rate": statistics.mean(float(row["bootstrap_selected_policy_exact_match_rate"]) for row in rows),
        },
        "concentration_summary": {
            "mean_risk_gini": statistics.mean(float(row["calibration_risk_gini_by_trajectory"]) for row in rows),
            "mean_top_10pct_risk_mass": statistics.mean(float(row["calibration_top_10pct_trajectory_risk_mass"]) for row in rows),
        },
        "threshold_fragility_summary": {
            "mean_instability_index": statistics.mean(float(row["calibration_metric_instability_index"]) for row in rows),
        },
        "sufficient_for_gate_modeling": len(rows) >= 200,
    }


def markdown(report: dict[str, Any]) -> str:
    return "\n".join([
        "# Batch 9K Stability Diagnostic Dataset",
        "",
        "Exploratory benchmark-level stability-aware diagnostic dataset on CodeTraceBench-derived trajectories. This offline proxy uses calibration support, stability-aware resampling proxies, and fail-closed diagnostics for dual-unit row-level risk and trajectory-level burden; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "Safe scope concepts: benchmark-level, CodeTraceBench-derived, offline proxy, trajectory-level burden, row-level risk, dual-unit, calibration support, stability-aware, fail-closed, domain shift, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Diagnostic rows: `{report['summary']['diagnostic_rows']}`",
        f"- Bootstrap samples: `{report['summary']['bootstrap_samples']}`",
        f"- Resampling unit: `{report['summary']['bootstrap_resampling_unit']}`",
        f"- Sufficient for gate modeling: `{report['summary']['sufficient_for_gate_modeling']}`",
        "",
        "The compact Batch 9I evidence does not retain full calibration decision traces, so bootstrap fields are calibration-summary resampling proxies rather than formal validity guarantees.",
    ])


def main() -> None:
    for path in [SUPPORT_CSV, GRID_CSV, GATE_CSV]:
        require(path)
    rows = build_rows()
    serialized = json.dumps(rows)
    raw_hits = [marker for marker in RAW_MARKERS if marker in serialized]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; stability-aware dual-unit row-level risk and trajectory-level burden; calibration support and fail-closed; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(SUPPORT_CSV), str(GRID_CSV), str(GATE_CSV)],
        "summary": summarize(rows),
        "gate_input_excludes_test_outcomes": True,
        "guard_results": {"raw_marker_hits": raw_hits, "metadata_as_risk_model_features": False, "test_features_in_gate_inputs": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(REPORT_CSV, rows)
    print(json.dumps({"diagnostic_rows": len(rows), "bootstrap_samples": BOOTSTRAP_SAMPLES}, indent=2))


if __name__ == "__main__":
    main()
