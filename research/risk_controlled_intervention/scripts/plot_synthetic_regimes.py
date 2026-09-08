#!/usr/bin/env python3
"""Build synthetic-regime report assets.

Creates Table 6 and Figure 7 from stored Batch T-17 synthetic theorem
demonstration artifacts. This script does not regenerate synthetic data.
"""

from __future__ import annotations

import csv
import json
import os
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from textwrap import wrap
from typing import Any

MPLCONFIGDIR = Path(tempfile.gettempdir()) / "stepharbor_release_matplotlib"
MPLCONFIGDIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPLCONFIGDIR))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


REPO_ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = REPO_ROOT / "research" / "risk_controlled_intervention"
REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURE_DATA_DIR = PROJECT_ROOT / "theory_evaluation_artifacts" / "figures_data"
OUTPUT_DIR = REPORTS_DIR / "report_assets"

SCENARIO_SUMMARY = REPORTS_DIR / "batch_T17_synthetic_theorem_demo_by_scenario.csv"
SYNTHETIC_DEMO_JSON = REPORTS_DIR / "batch_T17_synthetic_theorem_demo.json"
NO_SAFE_REASONS = FIGURE_DATA_DIR / "fig_T17_synthetic_no_safe_reasons.csv"
SHIFT_FAILURE = FIGURE_DATA_DIR / "fig_T17_synthetic_shift_failure.csv"

TABLE_STEM = "table_synthetic_regime_summary"
TABLE_TEX = OUTPUT_DIR / f"{TABLE_STEM}.tex"
TABLE_CSV = OUTPUT_DIR / f"{TABLE_STEM}.csv"
TABLE_JSON = OUTPUT_DIR / f"{TABLE_STEM}.json"
TABLE_MANIFEST = OUTPUT_DIR / f"{TABLE_STEM}_manifest.json"
TABLE_MD = OUTPUT_DIR / f"{TABLE_STEM}.md"

FIG_STEM = "fig_synthetic_controller_behavior"
FIG_PDF = OUTPUT_DIR / f"{FIG_STEM}.pdf"
FIG_PNG = OUTPUT_DIR / f"{FIG_STEM}.png"
FIG_CSV = OUTPUT_DIR / f"{FIG_STEM}_data.csv"
FIG_JSON = OUTPUT_DIR / f"{FIG_STEM}_data.json"
FIG_MANIFEST = OUTPUT_DIR / f"{FIG_STEM}_manifest.json"
FIG_MD = OUTPUT_DIR / f"{FIG_STEM}.md"
MISSING_OUT = OUTPUT_DIR / "synthetic_regime_assets_missing_data_report.json"

SCENARIO_ORDER = [
    "structural_impossible_by_prevalence",
    "feasible_good_scores",
    "oracle_feasible_score_limited",
    "correction_blocked_small_calibration",
    "weak_scores_high_false_alarm",
    "calibration_test_shift",
    "low_prevalence_easy",
    "high_prevalence_high_burden_required",
]

SCENARIO_LABELS = {
    "structural_impossible_by_prevalence": "Structural impossible",
    "feasible_good_scores": "Good scores",
    "oracle_feasible_score_limited": "Score limited",
    "correction_blocked_small_calibration": "Small calibration",
    "weak_scores_high_false_alarm": "Weak scores",
    "calibration_test_shift": "Shift violation",
    "low_prevalence_easy": "Low prevalence",
    "high_prevalence_high_burden_required": "High prevalence",
}

NO_SAFE_REASON_ORDER = [
    "structurally_infeasible_by_first_failure_prevalence",
    "empirical_infeasible",
    "correction_blocked",
    "selected_corrected_feasible_policy",
]

REASON_LABELS = {
    "structurally_infeasible_by_first_failure_prevalence": "Struct. infeasible",
    "empirical_infeasible": "Empirical infeasible",
    "correction_blocked": "Correction blocked",
    "selected_corrected_feasible_policy": "Selected",
}

REASON_COLORS = {
    "structurally_infeasible_by_first_failure_prevalence": "#b2182b",
    "empirical_infeasible": "#ef8a62",
    "correction_blocked": "#fddbc7",
    "selected_corrected_feasible_policy": "#67a9cf",
}

SUMMARY_REQUIRED_FIELDS = {
    "scenario",
    "rows",
    "true_p_F",
    "selected_rate",
    "certified_structural_no_safe_rate",
    "empirical_structural_no_safe_rate",
    "joint_success_among_selected",
    "top_no_safe_reason",
}

NO_SAFE_REQUIRED_FIELDS = {"scenario", "no_safe_reason", "count", "rate"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_missing_report(checked: list[dict[str, Any]], reason: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(
        MISSING_OUT,
        {
            "generated_at": utc_now(),
            "status": "missing_required_synthetic_regime_data",
            "reason": reason,
            "checked_artifacts": checked,
            "expected_summary_fields": sorted(SUMMARY_REQUIRED_FIELDS),
            "expected_no_safe_fields": sorted(NO_SAFE_REQUIRED_FIELDS),
            "fabricated_values": False,
        },
    )


def read_csv_rows(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = list(reader.fieldnames or [])
    return rows, fields


def load_sources() -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], dict[str, Any], list[dict[str, Any]]]:
    checked = [
        {"path": rel(SCENARIO_SUMMARY), "exists": SCENARIO_SUMMARY.exists()},
        {"path": rel(NO_SAFE_REASONS), "exists": NO_SAFE_REASONS.exists()},
        {"path": rel(SHIFT_FAILURE), "exists": SHIFT_FAILURE.exists()},
        {"path": rel(SYNTHETIC_DEMO_JSON), "exists": SYNTHETIC_DEMO_JSON.exists()},
    ]
    for path in [SCENARIO_SUMMARY, NO_SAFE_REASONS, SHIFT_FAILURE, SYNTHETIC_DEMO_JSON]:
        if not path.exists():
            write_missing_report(checked, f"Missing source artifact: {rel(path)}")
            raise SystemExit(f"Missing source artifact: {rel(path)}")

    summary_rows, summary_fields = read_csv_rows(SCENARIO_SUMMARY)
    no_safe_rows, no_safe_fields = read_csv_rows(NO_SAFE_REASONS)
    shift_rows, shift_fields = read_csv_rows(SHIFT_FAILURE)
    demo_json = json.loads(SYNTHETIC_DEMO_JSON.read_text())

    checked[0]["fields"] = summary_fields
    checked[0]["row_count"] = len(summary_rows)
    checked[1]["fields"] = no_safe_fields
    checked[1]["row_count"] = len(no_safe_rows)
    checked[2]["fields"] = shift_fields
    checked[2]["row_count"] = len(shift_rows)
    checked[3]["fields"] = sorted(demo_json) if isinstance(demo_json, dict) else []

    missing_summary = sorted(SUMMARY_REQUIRED_FIELDS - set(summary_fields))
    missing_no_safe = sorted(NO_SAFE_REQUIRED_FIELDS - set(no_safe_fields))
    if missing_summary or missing_no_safe:
        write_missing_report(checked, f"Missing fields: summary={missing_summary}; no_safe={missing_no_safe}")
        raise SystemExit("Missing required synthetic fields.")

    scenarios = [row["scenario"] for row in summary_rows]
    missing_scenarios = [scenario for scenario in SCENARIO_ORDER if scenario not in scenarios]
    if missing_scenarios:
        write_missing_report(checked, f"Missing expected scenarios: {missing_scenarios}")
        raise SystemExit(f"Missing expected scenarios: {missing_scenarios}")

    return summary_rows, no_safe_rows, shift_rows, demo_json, checked


def fmt_rate(value: str | float | None) -> str:
    if value in ("", None):
        return "NA"
    return f"{100.0 * float(value):.1f}"


def diagnosis_for(row: dict[str, str], shift_scenarios: set[str]) -> str:
    scenario = row["scenario"]
    top = row["top_no_safe_reason"]
    selected = float(row["selected_rate"])
    joint = row["joint_success_among_selected"]
    if scenario in shift_scenarios:
        return "assumption_violation_shift"
    if top == "structurally_infeasible_by_first_failure_prevalence":
        return "structural_boundary"
    if top == "correction_blocked":
        if selected == 0.0:
            return "correction_blocked"
        return "mixed_selected_and_correction_blocked"
    if top == "empirical_infeasible":
        return "score_or_policy_limited"
    if joint == "1.0" and selected > 0:
        return "selected_successful"
    return top or "NA"


def build_table_rows(summary_rows: list[dict[str, str]], no_safe_rows: list[dict[str, str]], shift_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    no_safe_rate = defaultdict(lambda: defaultdict(float))
    for row in no_safe_rows:
        no_safe_rate[row["scenario"]][row["no_safe_reason"]] = float(row["rate"])
    shift_scenarios = {row["scenario"] for row in shift_rows if row.get("calibration_test_gap") == "assumption_violation_scenario"}

    rows_by_scenario = {row["scenario"]: row for row in summary_rows}
    table_rows: list[dict[str, Any]] = []
    for scenario in SCENARIO_ORDER:
        row = rows_by_scenario[scenario]
        table_rows.append(
            {
                "scenario": scenario,
                "display_label": SCENARIO_LABELS[scenario],
                "runs_evaluated": int(row["rows"]),
                "true_p_F": float(row["true_p_F"]),
                "certified_structural_no_safe_rate": float(row["certified_structural_no_safe_rate"]),
                "empirical_structural_no_safe_rate": float(row["empirical_structural_no_safe_rate"]),
                "empirical_infeasible_rate": no_safe_rate[scenario].get("empirical_infeasible", 0.0),
                "correction_blocked_rate": no_safe_rate[scenario].get("correction_blocked", 0.0),
                "selected_rate": float(row["selected_rate"]),
                "joint_success_among_selected": None
                if row["joint_success_among_selected"] == ""
                else float(row["joint_success_among_selected"]),
                "top_no_safe_reason": row["top_no_safe_reason"],
                "main_diagnosis": diagnosis_for(row, shift_scenarios),
                "assumption_violation_regime": scenario in shift_scenarios,
                "source_artifact": rel(SCENARIO_SUMMARY),
                "secondary_source_artifact": rel(NO_SAFE_REASONS),
                "value_status": "stored_scenario_aggregate",
                "fabricated": False,
                "interpolated": False,
                "raw_trajectory_content_used": False,
            }
        )
    return table_rows


def build_figure_rows(no_safe_rows: list[dict[str, str]], shift_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    shift_scenarios = {row["scenario"] for row in shift_rows if row.get("calibration_test_gap") == "assumption_violation_scenario"}
    by_scenario_reason = defaultdict(dict)
    for row in no_safe_rows:
        by_scenario_reason[row["scenario"]][row["no_safe_reason"]] = row

    figure_rows: list[dict[str, Any]] = []
    for scenario in SCENARIO_ORDER:
        for reason in NO_SAFE_REASON_ORDER:
            source = by_scenario_reason[scenario].get(reason)
            count = int(source["count"]) if source else 0
            rate = float(source["rate"]) if source else 0.0
            figure_rows.append(
                {
                    "scenario": scenario,
                    "display_label": SCENARIO_LABELS[scenario],
                    "controller_output_category": reason,
                    "report_label": REASON_LABELS[reason],
                    "count": count,
                    "rate": rate,
                    "percentage": rate * 100.0,
                    "assumption_violation_regime": scenario in shift_scenarios,
                    "source_artifact": rel(NO_SAFE_REASONS),
                    "value_status": "stored_synthetic_controller_reason_rate",
                    "fabricated": False,
                    "interpolated": False,
                    "raw_trajectory_content_used": False,
                }
            )
    return figure_rows


def write_table_data(table_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    fieldnames = [
        "scenario",
        "display_label",
        "runs_evaluated",
        "true_p_F",
        "certified_structural_no_safe_rate",
        "empirical_structural_no_safe_rate",
        "empirical_infeasible_rate",
        "correction_blocked_rate",
        "selected_rate",
        "joint_success_among_selected",
        "top_no_safe_reason",
        "main_diagnosis",
        "assumption_violation_regime",
        "source_artifact",
        "secondary_source_artifact",
        "value_status",
        "fabricated",
        "interpolated",
        "raw_trajectory_content_used",
    ]
    with TABLE_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in table_rows:
            out = dict(row)
            out["joint_success_among_selected"] = "NA" if row["joint_success_among_selected"] is None else row["joint_success_among_selected"]
            writer.writerow({field: out[field] for field in fieldnames})

    write_json(
        TABLE_JSON,
        {
            "generated_at": utc_now(),
            "description": "Table 6 synthetic regime summary data.",
            "source_artifact_paths": [rel(SCENARIO_SUMMARY), rel(NO_SAFE_REASONS), rel(SHIFT_FAILURE), rel(SYNTHETIC_DEMO_JSON)],
            "checked_artifacts": checked,
            "rows": table_rows,
            "fabricated_values": False,
            "interpolated_values": False,
            "raw_trajectory_content_used": False,
        },
    )


def escape_latex(text: str) -> str:
    return text.replace("_", "\\_")


def write_latex_table(table_rows: list[dict[str, Any]]) -> None:
    lines = [
        "% Auto-generated by plot_synthetic_regimes.py",
        "\\begin{tabular}{lrrrrrrl}",
        "\\toprule",
        "Scenario & $p_F$ & Cert. struct. & Emp. infeas. & Corr. block & Selected & Joint succ. & Diagnosis \\\\",
        "\\midrule",
    ]
    for row in table_rows:
        joint = "NA" if row["joint_success_among_selected"] is None else f"{100.0 * row['joint_success_among_selected']:.1f}"
        lines.append(
            f"{escape_latex(row['display_label'])} & "
            f"{row['true_p_F']:.2f} & "
            f"{100.0 * row['certified_structural_no_safe_rate']:.1f} & "
            f"{100.0 * row['empirical_infeasible_rate']:.1f} & "
            f"{100.0 * row['correction_blocked_rate']:.1f} & "
            f"{100.0 * row['selected_rate']:.1f} & "
            f"{joint} & "
            f"{escape_latex(row['main_diagnosis'])} \\\\"
        )
    lines.extend(["\\bottomrule", "\\end{tabular}", ""])
    TABLE_TEX.write_text("\n".join(lines))


def write_table_manifest(table_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    missing = []
    if any(row["joint_success_among_selected"] is None for row in table_rows):
        missing.append("joint_success_among_selected is NA for scenarios with no selected policies.")
    write_json(
        TABLE_MANIFEST,
        {
            "generated_at": utc_now(),
            "asset": "Table 6 synthetic scenario summary",
            "source_artifact_paths_used": [rel(SCENARIO_SUMMARY), rel(NO_SAFE_REASONS), rel(SHIFT_FAILURE), rel(SYNTHETIC_DEMO_JSON)],
            "checked_artifacts": checked,
            "exact_fields_read": {
                rel(SCENARIO_SUMMARY): sorted(SUMMARY_REQUIRED_FIELDS),
                rel(NO_SAFE_REASONS): sorted(NO_SAFE_REQUIRED_FIELDS),
                rel(SHIFT_FAILURE): ["scenario", "shift_level", "alpha_success", "beta_success", "joint_success", "calibration_test_gap"],
            },
            "scenario_names": [row["scenario"] for row in table_rows],
            "aggregation_rule": "Use stored T-17 scenario-level aggregates; no synthetic rerun or raw-data aggregation.",
            "values_read_directly_or_recomputed": "Scenario rates read directly where available; empirical/correction rates joined from stored T17 no-safe reason rates.",
            "missing_fields": missing,
            "assumption_violation_note": "calibration_test_shift is an assumption-violation regime, not evidence of robustness under shift.",
            "command_used_to_regenerate": f"{sys.executable} {rel(Path(__file__))}",
            "portable_command": "research/risk_controlled_intervention/.venv/bin/python research/risk_controlled_intervention/scripts/plot_synthetic_regimes.py",
        },
    )


def write_table_markdown(table_rows: list[dict[str, Any]]) -> None:
    lines = [
        "# Table 6: Synthetic Regime Summary",
        "",
        "This table summarizes the stored Batch T-17 synthetic theorem-demonstration regimes. It reports scenario-level controller behavior under known structural, score-limited, correction-blocked, low-prevalence, high-prevalence, and calibration-test shift settings.",
        "",
        "| Scenario | $p_F$ | Cert. structural (%) | Empirical infeasible (%) | Correction blocked (%) | Selected (%) | Joint success selected (%) | Diagnosis |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in table_rows:
        joint = "NA" if row["joint_success_among_selected"] is None else f"{100.0 * row['joint_success_among_selected']:.1f}"
        lines.append(
            f"| `{row['scenario']}` | {row['true_p_F']:.2f} | "
            f"{100.0 * row['certified_structural_no_safe_rate']:.1f} | "
            f"{100.0 * row['empirical_infeasible_rate']:.1f} | "
            f"{100.0 * row['correction_blocked_rate']:.1f} | "
            f"{100.0 * row['selected_rate']:.1f} | {joint} | `{row['main_diagnosis']}` |"
        )
    lines.extend(
        [
            "",
            "## Source Artifacts",
            "",
            f"- `{rel(SCENARIO_SUMMARY)}`",
            f"- `{rel(NO_SAFE_REASONS)}`",
            f"- `{rel(SHIFT_FAILURE)}`",
            "",
            "## Section 6.4 Support",
            "",
            "The table supports revising Section 6.4 from qualitative to quantitative: structurally impossible and high-prevalence regimes show high structural no-safe rates, good-score and low-prevalence regimes select policies in supported cells, score-limited and weak-score regimes are mostly empirical infeasible, and small-calibration regimes are mostly correction blocked.",
            "",
            "The `calibration_test_shift` scenario is explicitly an assumption-violation regime, not a robustness guarantee.",
            "",
            "No interpolation, smoothing, raw trajectory text, code, action text, or observation text is used.",
            "",
        ]
    )
    TABLE_MD.write_text("\n".join(lines))


def write_figure_data(figure_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    fieldnames = [
        "scenario",
        "display_label",
        "controller_output_category",
        "report_label",
        "count",
        "rate",
        "percentage",
        "assumption_violation_regime",
        "source_artifact",
        "value_status",
        "fabricated",
        "interpolated",
        "raw_trajectory_content_used",
    ]
    with FIG_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in figure_rows:
            writer.writerow({field: row[field] for field in fieldnames})

    write_json(
        FIG_JSON,
        {
            "generated_at": utc_now(),
            "description": "Figure 7 synthetic controller behavior stacked-bar data.",
            "source_artifact_paths": [rel(NO_SAFE_REASONS), rel(SHIFT_FAILURE), rel(SCENARIO_SUMMARY)],
            "checked_artifacts": checked,
            "rows": figure_rows,
            "fabricated_values": False,
            "interpolated_values": False,
            "raw_trajectory_content_used": False,
        },
    )


def make_figure(figure_rows: list[dict[str, Any]]) -> None:
    by_scenario = defaultdict(dict)
    for row in figure_rows:
        by_scenario[row["scenario"]][row["controller_output_category"]] = row

    plt.rcParams.update(
        {
            "font.size": 7,
            "axes.labelsize": 8,
            "legend.fontsize": 6.4,
            "xtick.labelsize": 7,
            "ytick.labelsize": 6.5,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )
    fig, ax = plt.subplots(figsize=(3.35, 3.25))
    y_positions = list(range(len(SCENARIO_ORDER)))
    left = [0.0] * len(SCENARIO_ORDER)
    for reason in NO_SAFE_REASON_ORDER:
        values = [100.0 * by_scenario[scenario].get(reason, {"rate": 0.0})["rate"] for scenario in SCENARIO_ORDER]
        ax.barh(
            y_positions,
            values,
            left=left,
            color=REASON_COLORS[reason],
            edgecolor="white",
            linewidth=0.4,
            label=REASON_LABELS[reason],
        )
        left = [l + v for l, v in zip(left, values)]

    labels = []
    for scenario in SCENARIO_ORDER:
        label = SCENARIO_LABELS[scenario]
        if scenario == "calibration_test_shift":
            label += "*"
        labels.append("\n".join(wrap(label, width=18)))
    ax.set_yticks(y_positions)
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlabel("Controller evaluations (%)")
    ax.set_xlim(0, 100)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xticklabels(["0", "25", "50", "75", "100"])
    ax.grid(axis="x", color="#d9d9d9", linewidth=0.5)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="lower center", bbox_to_anchor=(0.5, 1.01), ncol=2, handlelength=1.2, columnspacing=0.8)
    ax.text(0, len(SCENARIO_ORDER) - 0.05, "* shift assumption violated", fontsize=6.2, va="bottom")
    fig.tight_layout(pad=0.35)
    fig.savefig(FIG_PDF, bbox_inches="tight")
    fig.savefig(FIG_PNG, dpi=300, bbox_inches="tight")
    plt.close(fig)


def write_figure_manifest(figure_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    write_json(
        FIG_MANIFEST,
        {
            "generated_at": utc_now(),
            "asset": "Figure 7 synthetic controller behavior summary",
            "source_artifact_paths_used": [rel(NO_SAFE_REASONS), rel(SHIFT_FAILURE), rel(SCENARIO_SUMMARY)],
            "checked_artifacts": checked,
            "exact_fields_read": {
                rel(NO_SAFE_REASONS): sorted(NO_SAFE_REQUIRED_FIELDS),
                rel(SHIFT_FAILURE): ["scenario", "shift_level", "alpha_success", "beta_success", "joint_success", "calibration_test_gap"],
                rel(SCENARIO_SUMMARY): ["scenario", "rows", "selected_rate", "top_no_safe_reason"],
            },
            "scenario_names": SCENARIO_ORDER,
            "aggregation_rule": "Use stored T-17 synthetic no-safe reason count/rate rows; zero-fill only absent reason categories within a known scenario.",
            "values_read_directly_or_recomputed": "Counts and rates read directly from stored figure-ready CSV where present; percentages are rate*100.",
            "missing_fields": [],
            "assumption_violation_note": "calibration_test_shift is marked with an asterisk as an assumption-violation regime because it intentionally violates calibration/test exchangeability assumptions; it is not a robustness guarantee.",
            "command_used_to_regenerate": f"{sys.executable} {rel(Path(__file__))}",
            "portable_command": "research/risk_controlled_intervention/.venv/bin/python research/risk_controlled_intervention/scripts/plot_synthetic_regimes.py",
        },
    )


def write_figure_markdown(figure_rows: list[dict[str, Any]]) -> None:
    lines = [
        "# Figure 7: Synthetic Controller Behavior",
        "",
        "This stacked bar figure summarizes the stored Batch T-17 synthetic controller output distribution for each controlled synthetic regime. Each scenario row shows the percentage of evaluations that were structurally infeasible, empirically infeasible, correction blocked, or selected.",
        "",
        "| Scenario | Struct. infeasible (%) | Empirical infeasible (%) | Correction blocked (%) | Selected (%) |",
        "|---|---:|---:|---:|---:|",
    ]
    by = defaultdict(dict)
    for row in figure_rows:
        by[row["scenario"]][row["controller_output_category"]] = row["percentage"]
    for scenario in SCENARIO_ORDER:
        lines.append(
            f"| `{scenario}` | "
            f"{by[scenario].get('structurally_infeasible_by_first_failure_prevalence', 0.0):.1f} | "
            f"{by[scenario].get('empirical_infeasible', 0.0):.1f} | "
            f"{by[scenario].get('correction_blocked', 0.0):.1f} | "
            f"{by[scenario].get('selected_corrected_feasible_policy', 0.0):.1f} |"
        )
    lines.extend(
        [
            "",
            "## Source Artifacts",
            "",
            f"- `{rel(NO_SAFE_REASONS)}`",
            f"- `{rel(SHIFT_FAILURE)}`",
            f"- `{rel(SCENARIO_SUMMARY)}`",
            "",
            "## Section 6.4 Support",
            "",
            "The figure supports revising Section 6.4 from qualitative to quantitative by showing that the controller output distribution changes in the expected direction across controlled regimes: structural regimes produce structural no-safe, score-limited and weak-score regimes are mostly empirically infeasible, small-calibration and low-prevalence settings are often correction blocked, and selected policies appear where the synthetic conditions support them.",
            "",
            "The `calibration_test_shift` scenario is an assumption-violation regime, not a robustness guarantee.",
            "",
            "No interpolation, smoothing, raw trajectory text, code, action text, or observation text is used.",
            "",
        ]
    )
    FIG_MD.write_text("\n".join(lines))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    summary_rows, no_safe_rows, shift_rows, _demo_json, checked = load_sources()
    table_rows = build_table_rows(summary_rows, no_safe_rows, shift_rows)
    figure_rows = build_figure_rows(no_safe_rows, shift_rows)

    write_table_data(table_rows, checked)
    write_latex_table(table_rows)
    write_table_manifest(table_rows, checked)
    write_table_markdown(table_rows)

    write_figure_data(figure_rows, checked)
    make_figure(figure_rows)
    write_figure_manifest(figure_rows, checked)
    write_figure_markdown(figure_rows)

    for path in [
        TABLE_TEX,
        TABLE_CSV,
        TABLE_JSON,
        TABLE_MANIFEST,
        TABLE_MD,
        FIG_PDF,
        FIG_PNG,
        FIG_CSV,
        FIG_JSON,
        FIG_MANIFEST,
        FIG_MD,
    ]:
        print(f"Wrote {rel(path)}")


if __name__ == "__main__":
    main()
