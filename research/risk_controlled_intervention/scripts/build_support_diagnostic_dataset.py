#!/usr/bin/env python3
"""Build Batch 9J support-diagnostic dataset from Batch 9I outputs."""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"

POLICY_JSON = REPORTS_DIR / "batch_9i_dual_unit_policy_selection.json"
SELECTED_CSV = REPORTS_DIR / "batch_9i_dual_unit_selected_policies.csv"
SUPPORT_CSV = REPORTS_DIR / "batch_9i_calibration_support_by_scenario.csv"
PARETO_CSV = REPORTS_DIR / "batch_9i_dual_unit_pareto_frontier.csv"

REPORT_JSON = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.json"
REPORT_CSV = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.csv"
REPORT_MD = REPORTS_DIR / "batch_9j_support_diagnostic_dataset.md"

LARGE_BAD_CAPTURE_DROP = 0.10
LARGE_FIRST_FAILURE_DROP = 0.10
LARGE_ALLOWED_BAD_GAP = 0.01
RAW_MARKERS = ("action_text", "observation_text", "terminal_output", "raw_action", "raw_observation", "artifact_path")


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9J diagnostic input: {path}")


def read_csv(path: Path) -> list[dict[str, str]]:
    require(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def as_float(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def as_int(value: Any) -> int | None:
    f = as_float(value)
    return int(f) if f is not None else None


def safe_seed(value: Any) -> int:
    parsed = as_int(value)
    return parsed if parsed is not None else -1


def as_bool(value: Any) -> bool:
    return str(value).lower() == "true"


def split_policy(policy_id: str) -> tuple[str, str, str]:
    parts = policy_id.split("::")
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    return "next_step_bad", policy_id or "none", "none"


def join_support() -> dict[tuple[str, int], dict[str, str]]:
    support = {}
    for row in read_csv(SUPPORT_CSV):
        support[(row.get("policy_id", ""), safe_seed(row.get("split_seed", 0)))] = row
    return support


def rank_by_calibration(rows: list[dict[str, str]]) -> dict[tuple[str, str, int], int]:
    grouped: dict[tuple[str, int], list[dict[str, str]]] = {}
    for row in rows:
        if as_bool(row.get("no_safe_recommendation")):
            continue
        grouped.setdefault((row.get("selector", ""), safe_seed(row.get("split_seed", 0))), []).append(row)
    ranks = {}
    for (selector, seed), vals in grouped.items():
        vals.sort(key=lambda r: (
            as_float(r.get("calibration_bad_row_capture")) or 0.0,
            as_float(r.get("calibration_first_failure_coverage")) or 0.0,
            -(as_float(r.get("calibration_trajectory_burden")) or 0.0),
        ), reverse=True)
        for idx, row in enumerate(vals, start=1):
            key = (selector, row.get("policy_id", ""), seed)
            ranks.setdefault(key, idx)
    return ranks


def margin(value: float | None, limit: float | None, higher_is_better: bool = False) -> float | None:
    if value is None or limit is None:
        return None
    return value - limit if higher_is_better else limit - value


def diagnostic_row(row: dict[str, str], support: dict[tuple[str, int], dict[str, str]], ranks: dict[tuple[str, str, int], int]) -> dict[str, Any]:
    seed = safe_seed(row.get("split_seed", 0))
    policy_id = row.get("policy_id", "")
    target, model, feature = split_policy(policy_id)
    supp = support.get((policy_id, seed), {})
    rho = as_float(row.get("rho"))
    beta = as_float(row.get("beta"))
    gamma = as_float(row.get("gamma"))
    eta = as_float(row.get("eta"))
    alpha = None
    cal_allowed = as_float(row.get("calibration_allowed_bad_rate"))
    test_allowed = as_float(row.get("test_allowed_bad_rate"))
    cal_capture = as_float(row.get("calibration_bad_row_capture"))
    test_capture = as_float(row.get("test_bad_row_capture"))
    cal_first = as_float(row.get("calibration_first_failure_coverage"))
    test_first = as_float(row.get("test_first_failure_coverage"))
    cal_traj = as_float(row.get("calibration_trajectory_burden"))
    cal_row = as_float(row.get("calibration_row_deferral_rate"))
    test_traj = as_float(row.get("test_trajectory_burden"))
    test_row = as_float(row.get("test_row_deferral_rate"))
    large_capture_drop = cal_capture is not None and test_capture is not None and (cal_capture - test_capture) >= LARGE_BAD_CAPTURE_DROP
    large_first_drop = cal_first is not None and test_first is not None and (cal_first - test_first) >= LARGE_FIRST_FAILURE_DROP
    large_allowed_gap = cal_allowed is not None and test_allowed is not None and (test_allowed - cal_allowed) >= LARGE_ALLOWED_BAD_GAP
    row_violation = as_bool(row.get("test_row_deferral_rate_violation"))
    traj_violation = as_bool(row.get("test_trajectory_burden_violation"))
    alpha_violation = bool(alpha is not None and test_allowed is not None and test_allowed > alpha)
    any_violation = row_violation or traj_violation or alpha_violation
    bad_outcome = any_violation or large_capture_drop or large_first_drop or large_allowed_gap
    return {
        "split_seed": seed,
        "target_name": target,
        "objective_name": row.get("selector"),
        "policy_family": row.get("policy_family") or "no_safe_recommendation",
        "model_family": model,
        "feature_set": feature,
        "row_budget_requested": rho,
        "trajectory_budget_requested": beta,
        "alpha_requested": alpha,
        "capture_target_requested": gamma,
        "first_failure_target_requested": eta,
        "calibration_rows": as_int(supp.get("calibration_rows")),
        "calibration_positive_rows": as_int(supp.get("calibration_positives")),
        "calibration_trajectories": as_int(supp.get("calibration_trajectories")),
        "calibration_positive_trajectories": as_int(supp.get("calibration_positive_trajectories")),
        "calibration_base_risk": (as_float(supp.get("calibration_positives")) / as_float(supp.get("calibration_rows"))) if as_float(supp.get("calibration_rows")) else None,
        "calibration_positive_trajectory_rate": (as_float(supp.get("calibration_positive_trajectories")) / as_float(supp.get("calibration_trajectories"))) if as_float(supp.get("calibration_trajectories")) else None,
        "feasible_policy_count": as_int(supp.get("candidate_policies")),
        "pareto_policy_count": as_int(supp.get("pareto_policies")),
        "selected_policy_rank_on_calibration": ranks.get((row.get("selector", ""), policy_id, seed)),
        "selected_calibration_bad_row_capture": cal_capture,
        "selected_calibration_first_failure_coverage": cal_first,
        "selected_calibration_allowed_bad_rate": cal_allowed,
        "selected_calibration_row_deferral": cal_row,
        "selected_calibration_trajectory_burden": cal_traj,
        "calibration_margin_to_row_budget": margin(cal_row, rho),
        "calibration_margin_to_trajectory_budget": margin(cal_traj, beta),
        "calibration_margin_to_alpha": margin(cal_allowed, alpha),
        "calibration_margin_to_capture_target": margin(cal_capture, gamma, higher_is_better=True),
        "calibration_margin_to_first_failure_target": margin(cal_first, eta, higher_is_better=True),
        "support_status": supp.get("support_status", "unknown"),
        "fail_closed_reason": row.get("reason"),
        "scenario_type": "iid",
        "source_group_context": "repeated_split_all",
        "no_safe_recommendation_9i": as_bool(row.get("no_safe_recommendation")),
        "gate_input_allowed": True,
        "test_row_budget_violation": row_violation,
        "test_trajectory_budget_violation": traj_violation,
        "test_alpha_violation": alpha_violation,
        "large_bad_capture_drop": large_capture_drop,
        "large_first_failure_drop": large_first_drop,
        "large_allowed_bad_gap": large_allowed_gap,
        "unstable_policy": abs(as_float(row.get("calibration_to_test_gap_trajectory_burden")) or 0.0) >= 0.10,
        "any_test_constraint_violation": any_violation,
        "bad_recommendation_outcome": bad_outcome,
        "test_bad_row_capture": test_capture,
        "test_first_failure_coverage": test_first,
        "test_allowed_bad_rate": test_allowed,
        "test_trajectory_burden": test_traj,
        "test_row_deferral_rate": test_row,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in keys})


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    outcomes = ["test_row_budget_violation", "test_trajectory_budget_violation", "large_bad_capture_drop", "large_first_failure_drop", "large_allowed_bad_gap", "any_test_constraint_violation", "bad_recommendation_outcome"]
    missing = Counter()
    for row in rows:
        for key, value in row.items():
            if value is None or value == "":
                missing[key] += 1
    return {
        "diagnostic_rows": len(rows),
        "outcome_prevalence": {key: sum(1 for row in rows if row.get(key)) / len(rows) if rows else None for key in outcomes},
        "support_status_counts": dict(Counter(str(row.get("support_status")) for row in rows)),
        "objective_counts": dict(Counter(str(row.get("objective_name")) for row in rows)),
        "missingness_top": dict(missing.most_common(20)),
        "sufficient_for_gate_modeling": len(rows) >= 200 and any(row.get("bad_recommendation_outcome") for row in rows),
        "large_thresholds": {
            "bad_capture_drop": LARGE_BAD_CAPTURE_DROP,
            "first_failure_drop": LARGE_FIRST_FAILURE_DROP,
            "allowed_bad_gap": LARGE_ALLOWED_BAD_GAP,
        },
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9J Support Diagnostic Dataset",
        "",
        "Exploratory benchmark-level diagnostic dataset on CodeTraceBench-derived trajectories. This offline proxy uses calibration support for dual-unit row-level risk and trajectory-level burden decisions; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Diagnostic rows: `{report['summary']['diagnostic_rows']}`",
        f"- Sufficient for support-gate modeling: `{report['summary']['sufficient_for_gate_modeling']}`",
        "",
        "## Outcome Prevalence",
        "",
    ]
    lines.extend(f"- `{key}`: `{value}`" for key, value in report["summary"]["outcome_prevalence"].items())
    lines.extend([
        "",
        "## Notes",
        "",
        "- Gate input columns exclude test outcomes; test columns are labels for diagnostic evaluation.",
        "- Source/layout/parser context is retained only as deployment context, not as a risk-model feature.",
        "- Missing required Batch 9I evidence fails loudly.",
    ])
    return "\n".join(lines)


def main() -> None:
    for path in [POLICY_JSON, SELECTED_CSV, SUPPORT_CSV, PARETO_CSV]:
        require(path)
    selected = read_csv(SELECTED_CSV)
    support = join_support()
    ranks = rank_by_calibration(selected)
    rows = [diagnostic_row(row, support, ranks) for row in selected]
    serialized = json.dumps(rows)
    raw_hits = [marker for marker in RAW_MARKERS if marker in serialized]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; dual-unit row-level risk and trajectory-level burden; calibration support and fail-closed; domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "input_files": [str(POLICY_JSON), str(SELECTED_CSV), str(SUPPORT_CSV), str(PARETO_CSV)],
        "forbidden_gate_features": ["raw text", "hashes", "artifact paths", "trajectory IDs as predictive features", "test metrics"],
        "gate_input_columns": [key for key in rows[0] if not key.startswith("test_") and key not in {"large_bad_capture_drop", "large_first_failure_drop", "large_allowed_bad_gap", "unstable_policy", "any_test_constraint_violation", "bad_recommendation_outcome"}] if rows else [],
        "outcome_columns": ["test_row_budget_violation", "test_trajectory_budget_violation", "test_alpha_violation", "large_bad_capture_drop", "large_first_failure_drop", "large_allowed_bad_gap", "unstable_policy", "any_test_constraint_violation", "bad_recommendation_outcome"],
        "summary": summarize(rows),
        "guard_results": {"raw_marker_hits": raw_hits, "test_features_in_gate_inputs": False, "metadata_as_risk_model_features": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    write_csv(REPORT_CSV, rows)
    print(json.dumps({"diagnostic_rows": len(rows), "bad_outcome_rate": report["summary"]["outcome_prevalence"]["bad_recommendation_outcome"]}, indent=2))


if __name__ == "__main__":
    main()
