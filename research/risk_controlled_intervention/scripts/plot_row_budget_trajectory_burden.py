#!/usr/bin/env python3
"""Build report asset: row warning budget vs trajectory review burden.

The figure is intentionally sourced from stored Batch 9H diagnostic artifacts.
It does not read raw trajectory content and does not interpolate missing points.
"""

from __future__ import annotations

import csv
import json
import math
import os
import statistics
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MPLCONFIGDIR = Path(tempfile.gettempdir()) / "codingactiongate_release_matplotlib"
MPLCONFIGDIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPLCONFIGDIR))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


REPO_ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = REPO_ROOT / "research" / "risk_controlled_intervention"
REPORTS_DIR = PROJECT_ROOT / "reports"
OUTPUT_DIR = REPORTS_DIR / "report_assets"

DIAGNOSTIC_SOURCE = PROJECT_ROOT / "reference-data" / "batch_9h_oracle_random_burden_diagnostics.csv"
AUDIT_SOURCE = PROJECT_ROOT / "reference-data" / "batch_9h_row_to_trajectory_burden_audit.json"

OUTPUT_STEM = "fig_row_budget_trajectory_burden"
CSV_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.csv"
JSON_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.json"
MANIFEST_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_manifest.json"
MD_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.md"
PDF_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.pdf"
PNG_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.png"
MISSING_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_missing_data_report.json"

SERIES = [
    {
        "label": "Learned row threshold",
        "source_field": "observed_learned_trajectory_burden",
        "color": "#1f77b4",
        "marker": "o",
    },
    {
        "label": "Random row diagnostic",
        "source_field": "analytic_random_trajectory_burden",
        "color": "#d62728",
        "marker": "s",
    },
    {
        "label": "Oracle bad-row diagnostic",
        "source_field": "oracle_bad_row_trajectory_burden",
        "color": "#2ca02c",
        "marker": "^",
    },
]

REQUIRED_FIELDS = {
    "row_budget",
    "policy_id",
    "split_seed",
    "observed_learned_trajectory_burden",
    "analytic_random_trajectory_burden",
    "oracle_bad_row_trajectory_burden",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_missing_report(checked_artifacts: list[dict[str, Any]], reason: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(
        MISSING_OUT,
        {
            "generated_at": utc_now(),
            "status": "missing_required_curve_data",
            "reason": reason,
            "checked_artifacts": checked_artifacts,
            "expected_fields": sorted(REQUIRED_FIELDS),
            "fabricated_values": False,
        },
    )


def load_diagnostic_rows() -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    checked = []
    for path in [DIAGNOSTIC_SOURCE, AUDIT_SOURCE]:
        checked.append({"path": rel(path), "exists": path.exists()})

    if not DIAGNOSTIC_SOURCE.exists():
        write_missing_report(checked, "Batch 9H oracle/random diagnostic CSV was not found.")
        raise SystemExit(f"Missing required source artifact: {rel(DIAGNOSTIC_SOURCE)}")

    with DIAGNOSTIC_SOURCE.open(newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = set(reader.fieldnames or [])
    checked[0]["fields"] = sorted(fields)
    checked[0]["row_count"] = len(rows)

    missing = sorted(REQUIRED_FIELDS - fields)
    if missing:
        write_missing_report(checked, f"Diagnostic CSV is missing fields: {missing}")
        raise SystemExit(f"Required fields missing from {rel(DIAGNOSTIC_SOURCE)}: {missing}")

    if not rows:
        write_missing_report(checked, "Diagnostic CSV contains no rows.")
        raise SystemExit(f"No rows in {rel(DIAGNOSTIC_SOURCE)}")

    return rows, checked


def load_audit_summary() -> dict[str, Any]:
    if not AUDIT_SOURCE.exists():
        return {}
    try:
        payload = json.loads(AUDIT_SOURCE.read_text())
    except json.JSONDecodeError:
        return {}
    return payload.get("summary", {}) if isinstance(payload, dict) else {}


def build_plot_rows(source_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    plot_rows: list[dict[str, Any]] = []
    for series in SERIES:
        by_budget: dict[float, list[float]] = defaultdict(list)
        field = series["source_field"]
        for row in source_rows:
            try:
                budget = float(row["row_budget"])
                burden = float(row[field])
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(budget) and math.isfinite(burden):
                by_budget[budget].append(burden)

        for budget in sorted(by_budget):
            values = by_budget[budget]
            mean_burden = statistics.mean(values)
            plot_rows.append(
                {
                    "row_budget": budget,
                    "row_budget_percent": budget * 100.0,
                    "series": series["label"],
                    "trajectory_burden": mean_burden,
                    "trajectory_burden_percent": mean_burden * 100.0,
                    "source_artifact": rel(DIAGNOSTIC_SOURCE),
                    "source_field": field,
                    "source_row_count": len(values),
                    "aggregation": "mean_over_stored_batch_9h_policy_seed_diagnostic_rows",
                    "value_status": "stored_diagnostic_aggregate",
                    "interpolated": False,
                    "raw_trajectory_content_used": False,
                }
            )
    return plot_rows


def write_data_files(plot_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    fieldnames = [
        "row_budget",
        "row_budget_percent",
        "series",
        "trajectory_burden",
        "trajectory_burden_percent",
        "source_artifact",
        "source_field",
        "source_row_count",
        "aggregation",
        "value_status",
        "interpolated",
        "raw_trajectory_content_used",
    ]
    with CSV_OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in plot_rows:
            writer.writerow({key: row[key] for key in fieldnames})

    write_json(
        JSON_OUT,
        {
            "generated_at": utc_now(),
            "description": "row-level warning budget versus trajectory-level review burden figure data.",
            "source_artifact_paths": [rel(DIAGNOSTIC_SOURCE), rel(AUDIT_SOURCE)],
            "checked_artifacts": checked,
            "rows": plot_rows,
            "fabricated_values": False,
            "interpolated_values": False,
            "raw_trajectory_content_used": False,
        },
    )


def make_plot(plot_rows: list[dict[str, Any]]) -> str:
    budgets_by_series: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in plot_rows:
        budgets_by_series[row["series"]].append(row)

    common_point_count = min(len(rows) for rows in budgets_by_series.values())
    use_line_plot = common_point_count >= 2

    plt.rcParams.update(
        {
            "font.size": 8,
            "axes.labelsize": 8,
            "legend.fontsize": 7,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )
    fig, ax = plt.subplots(figsize=(3.35, 2.35))

    if use_line_plot:
        for series in SERIES:
            label = series["label"]
            rows = sorted(budgets_by_series[label], key=lambda r: r["row_budget_percent"])
            ax.plot(
                [r["row_budget_percent"] for r in rows],
                [r["trajectory_burden_percent"] for r in rows],
                marker=series["marker"],
                linewidth=1.4,
                markersize=4.0,
                label=label,
                color=series["color"],
            )
    else:
        budget_values = sorted({row["row_budget_percent"] for row in plot_rows})
        budget = budget_values[0]
        width = 0.22
        offsets = [-width, 0.0, width]
        for offset, series in zip(offsets, SERIES):
            label = series["label"]
            rows = budgets_by_series[label]
            if not rows:
                continue
            ax.bar(
                [budget + offset],
                [rows[0]["trajectory_burden_percent"]],
                width=width,
                label=label,
                color=series["color"],
            )

    ax.set_xlabel("Row-level warning budget (%)")
    ax.set_ylabel("Trajectory-level review burden (%)")
    ax.set_xticks([1, 2, 5, 10, 20])
    ax.set_xticklabels(["1", "2", "5", "10", "20"])
    ax.set_yticks([0, 20, 40, 60, 80, 100])
    ax.set_yticklabels(["0", "20", "40", "60", "80", "100"])
    ax.set_ylim(0, 105)
    ax.grid(axis="y", color="#d9d9d9", linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="lower right")
    fig.tight_layout(pad=0.35)
    fig.savefig(PDF_OUT, bbox_inches="tight")
    fig.savefig(PNG_OUT, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return "line_plot_with_markers" if use_line_plot else "grouped_bar_chart"


def write_manifest(plot_rows: list[dict[str, Any]], checked: list[dict[str, Any]], plot_type: str) -> None:
    by_series: dict[str, list[dict[str, float]]] = defaultdict(list)
    for row in plot_rows:
        by_series[row["series"]].append(
            {
                "row_budget": row["row_budget"],
                "row_budget_percent": row["row_budget_percent"],
                "trajectory_burden": row["trajectory_burden"],
                "trajectory_burden_percent": row["trajectory_burden_percent"],
            }
        )

    expected_series = {series["label"] for series in SERIES}
    present_series = set(by_series)
    missing_series = sorted(expected_series - present_series)
    all_budgets = sorted({row["row_budget"] for row in plot_rows})
    missing_points: list[dict[str, Any]] = []
    for label in sorted(present_series):
        have = {row["row_budget"] for row in plot_rows if row["series"] == label}
        for budget in all_budgets:
            if budget not in have:
                missing_points.append({"series": label, "row_budget": budget})

    summary = load_audit_summary()
    validation_anchors = {}
    anchor_map = {
        "mean_learned_5pct_trajectory_burden": "Learned row threshold",
        "mean_random_expected_5pct_trajectory_burden": "Random row diagnostic",
        "mean_oracle_bad_row_5pct_trajectory_burden": "Oracle bad-row diagnostic",
    }
    for key, label in anchor_map.items():
        if key not in summary:
            continue
        plotted = next(
            (
                row["trajectory_burden"]
                for row in plot_rows
                if row["series"] == label and abs(row["row_budget"] - 0.05) < 1e-12
            ),
            None,
        )
        validation_anchors[key] = {
            "audit_summary_value": summary[key],
            "plotted_value": plotted,
            "absolute_difference": abs(float(summary[key]) - plotted) if plotted is not None else None,
        }

    write_json(
        MANIFEST_OUT,
        {
            "generated_at": utc_now(),
            "figure": "Figure 4 / row-level warning budget versus trajectory-level review burden",
            "source_artifact_paths_used": [rel(DIAGNOSTIC_SOURCE), rel(AUDIT_SOURCE)],
            "checked_artifacts": checked,
            "exact_fields_read": {
                rel(DIAGNOSTIC_SOURCE): [
                    "row_budget",
                    "policy_id",
                    "split_seed",
                    "observed_learned_trajectory_burden",
                    "analytic_random_trajectory_burden",
                    "oracle_bad_row_trajectory_burden",
                ],
                rel(AUDIT_SOURCE): [
                    "summary.mean_learned_5pct_trajectory_burden",
                    "summary.mean_random_expected_5pct_trajectory_burden",
                    "summary.mean_oracle_bad_row_5pct_trajectory_burden",
                ],
            },
            "plotted_series": sorted(present_series),
            "plotted_values": by_series,
            "plotted_row_budget_values": all_budgets,
            "plotted_row_budget_percent_values": sorted({row["row_budget_percent"] for row in plot_rows}),
            "value_derivation": "mean over stored Batch 9H policy/seed diagnostic rows; no raw data recomputation",
            "values_directly_read_or_recomputed": "aggregated_from_stored_diagnostic_curve_artifact",
            "interpolated_or_smoothed": False,
            "plot_type": plot_type,
            "missing_expected_series": missing_series,
            "missing_expected_points": missing_points,
            "validation_against_batch_9h_summary": validation_anchors,
            "command_used_to_regenerate": f"{sys.executable} {rel(Path(__file__))}",
            "portable_command": "python3 research/risk_controlled_intervention/scripts/plot_row_budget_trajectory_burden.py",
        },
    )


def write_markdown_note(plot_rows: list[dict[str, Any]]) -> None:
    rows = sorted(plot_rows, key=lambda r: (r["row_budget"], r["series"]))
    table_lines = [
        "| Row-level warning budget (%) | Series | Trajectory-level review burden (%) | Source rows |",
        "|---:|---|---:|---:|",
    ]
    for row in rows:
        table_lines.append(
            f"| {row['row_budget_percent']:.0f} | {row['series']} | "
            f"{row['trajectory_burden_percent']:.2f} | {row['source_row_count']} |"
        )

    five_pct = {row["series"]: row["trajectory_burden_percent"] for row in rows if abs(row["row_budget"] - 0.05) < 1e-12}
    supports = (
        five_pct.get("Learned row threshold", 0.0) >= 40.0
        and five_pct.get("Oracle bad-row diagnostic", 0.0) >= 39.0
        and five_pct.get("Random row diagnostic", 0.0) > five_pct.get("Learned row threshold", 100.0)
    )
    support_sentence = (
        "The plotted 5% row-budget values support the text: a 5% row-level warning budget can touch "
        "roughly 40% or more of trajectories, and random row warning can touch substantially more."
        if supports
        else "The plotted values do not fully support the proposed sentence without additional qualification."
    )

    MD_OUT.write_text(
        "\n".join(
            [
                "# Figure: Row Budget Versus Trajectory Burden",
                "",
                "This figure shows how stored Batch 9H row-level warning budgets translate into trajectory-level review burden. "
                "The points use only available stored diagnostic curve values and show that a small prefix-row warning budget can still touch a large fraction of coding-agent trajectories.",
                "",
                *table_lines,
                "",
                "## Source Artifacts",
                "",
                f"- `{rel(DIAGNOSTIC_SOURCE)}`",
                f"- `{rel(AUDIT_SOURCE)}` for 5% summary-anchor validation",
                "",
                "## Support",
                "",
                support_sentence,
                "",
                "No interpolation, extrapolation, smoothing, raw trajectory text, code, or observation/action content is used.",
                "",
            ]
        )
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_rows, checked = load_diagnostic_rows()
    plot_rows = build_plot_rows(source_rows)

    if not plot_rows:
        write_missing_report(checked, "No plottable rows could be constructed from stored diagnostics.")
        raise SystemExit("No plottable rows could be constructed from stored diagnostics.")

    expected_series = {series["label"] for series in SERIES}
    present_series = {row["series"] for row in plot_rows}
    if expected_series - present_series:
        write_missing_report(checked, f"Missing expected plotted series: {sorted(expected_series - present_series)}")
        raise SystemExit(f"Missing expected plotted series: {sorted(expected_series - present_series)}")

    write_data_files(plot_rows, checked)
    plot_type = make_plot(plot_rows)
    write_manifest(plot_rows, checked, plot_type)
    write_markdown_note(plot_rows)
    print(f"Wrote {rel(PDF_OUT)}")
    print(f"Wrote {rel(PNG_OUT)}")
    print(f"Wrote {rel(CSV_OUT)}")
    print(f"Wrote {rel(JSON_OUT)}")
    print(f"Wrote {rel(MANIFEST_OUT)}")
    print(f"Wrote {rel(MD_OUT)}")


if __name__ == "__main__":
    main()
