#!/usr/bin/env python3
"""Build controller output distribution report asset.

The figure uses stored Batch T-12 feasibility-aware controller counts. It does
not read raw trajectory content or aggregate unrelated runs.
"""

from __future__ import annotations

import csv
import json
import os
import sys
import tempfile
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

T12_REAL_JSON = PROJECT_ROOT / "reference-data" / "batch_T12_feasibility_aware_real_data.json"
T12_BREAKDOWN_CSV = PROJECT_ROOT / "reference-data" / "batch_T12_no_safe_reason_breakdown.csv"

OUTPUT_STEM = "fig_controller_output_distribution"
CSV_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.csv"
JSON_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.json"
MANIFEST_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_manifest.json"
MD_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.md"
PDF_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.pdf"
PNG_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.png"
MISSING_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_missing_data_report.json"

SOURCE_REASONS_IN_ORDER = [
    "empirical_infeasible",
    "structurally_infeasible_by_first_failure_prevalence",
    "correction_blocked",
    "selected_corrected_feasible_policy",
]

DISPLAY_LABELS = {
    "empirical_infeasible": "Empirically infeasible",
    "structurally_infeasible_by_first_failure_prevalence": "Structurally infeasible",
    "correction_blocked": "Correction blocked",
    "selected_corrected_feasible_policy": "Selected",
}

COLORS = {
    "empirical_infeasible": "#b2182b",
    "structurally_infeasible_by_first_failure_prevalence": "#ef8a62",
    "correction_blocked": "#fddbc7",
    "selected_corrected_feasible_policy": "#67a9cf",
}

REQUIRED_JSON_FIELDS = {
    "rows",
    "no_safe_reason_distribution",
    "selected_policy_rate",
    "corrected_no_safe_rate",
}


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
            "status": "missing_required_controller_distribution_data",
            "reason": reason,
            "checked_artifacts": checked,
            "expected_json_fields": sorted(REQUIRED_JSON_FIELDS),
            "expected_source_reasons": SOURCE_REASONS_IN_ORDER,
            "fabricated_values": False,
        },
    )


def load_controller_distribution() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    checked = [
        {"path": rel(T12_REAL_JSON), "exists": T12_REAL_JSON.exists()},
        {"path": rel(T12_BREAKDOWN_CSV), "exists": T12_BREAKDOWN_CSV.exists()},
    ]
    if not T12_REAL_JSON.exists():
        write_missing_report(checked, "Batch T-12 real-data controller JSON was not found.")
        raise SystemExit(f"Missing source artifact: {rel(T12_REAL_JSON)}")

    payload = json.loads(T12_REAL_JSON.read_text())
    if not isinstance(payload, dict):
        write_missing_report(checked, "Batch T-12 real-data controller JSON is not an object.")
        raise SystemExit("Batch T-12 real-data controller JSON is not an object.")

    checked[0]["fields"] = sorted(payload)
    missing = sorted(REQUIRED_JSON_FIELDS - set(payload))
    if missing:
        write_missing_report(checked, f"Batch T-12 real-data JSON is missing fields: {missing}")
        raise SystemExit(f"Missing fields in {rel(T12_REAL_JSON)}: {missing}")

    distribution = payload.get("no_safe_reason_distribution")
    if not isinstance(distribution, dict):
        write_missing_report(checked, "no_safe_reason_distribution is missing or not an object.")
        raise SystemExit("no_safe_reason_distribution is missing or not an object.")
    missing_reasons = [reason for reason in SOURCE_REASONS_IN_ORDER if reason not in distribution]
    if missing_reasons:
        write_missing_report(checked, f"Missing required source reasons: {missing_reasons}")
        raise SystemExit(f"Missing required source reasons: {missing_reasons}")

    checked[0]["row_count_field"] = payload["rows"]
    checked[0]["no_safe_reason_distribution"] = distribution

    if T12_BREAKDOWN_CSV.exists():
        with T12_BREAKDOWN_CSV.open(newline="") as handle:
            rows = list(csv.DictReader(handle))
        checked[1]["fields"] = sorted(rows[0]) if rows else []
        checked[1]["row_count"] = len(rows)
        csv_counts = {row["no_safe_reason"]: int(row["count"]) for row in rows if row.get("no_safe_reason")}
        checked[1]["counts_match_json"] = all(
            csv_counts.get(reason) == int(distribution[reason]) for reason in SOURCE_REASONS_IN_ORDER
        )
    return payload, checked


def build_plot_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    total = int(payload["rows"])
    distribution = payload["no_safe_reason_distribution"]
    rows: list[dict[str, Any]] = []
    for rank, reason in enumerate(SOURCE_REASONS_IN_ORDER, start=1):
        count = int(distribution[reason])
        percentage = 100.0 * count / total
        rows.append(
            {
                "display_order": rank,
                "raw_category_name": reason,
                "report_label": DISPLAY_LABELS[reason],
                "count": count,
                "percentage": percentage,
                "rate": count / total,
                "total_denominator": total,
                "source_artifact": rel(T12_REAL_JSON),
                "source_field": f"no_safe_reason_distribution.{reason}",
                "value_status": "count_read_directly_from_stored_T12_json",
                "percentage_status": "recomputed_from_stored_count_and_denominator",
                "fabricated": False,
                "interpolated": False,
                "raw_trajectory_content_used": False,
            }
        )
    return rows


def write_data_files(plot_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    fieldnames = [
        "display_order",
        "raw_category_name",
        "report_label",
        "count",
        "percentage",
        "rate",
        "total_denominator",
        "source_artifact",
        "source_field",
        "value_status",
        "percentage_status",
        "fabricated",
        "interpolated",
        "raw_trajectory_content_used",
    ]
    with CSV_OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in plot_rows:
            writer.writerow({field: row[field] for field in fieldnames})

    write_json(
        JSON_OUT,
        {
            "generated_at": utc_now(),
            "description": "feasibility-aware controller output distribution for real-data operating-point evaluations.",
            "source_artifact_paths": [rel(T12_REAL_JSON), rel(T12_BREAKDOWN_CSV)],
            "checked_artifacts": checked,
            "rows": plot_rows,
            "fabricated_values": False,
            "interpolated_values": False,
            "raw_trajectory_content_used": False,
        },
    )


def make_plot(plot_rows: list[dict[str, Any]]) -> None:
    rows = sorted(plot_rows, key=lambda row: row["display_order"])
    labels = [row["report_label"] for row in rows]
    percentages = [row["percentage"] for row in rows]
    colors = [COLORS[row["raw_category_name"]] for row in rows]

    plt.rcParams.update(
        {
            "font.size": 8,
            "axes.labelsize": 8,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )
    fig, ax = plt.subplots(figsize=(3.35, 2.1))
    y_positions = list(range(len(rows)))
    ax.barh(y_positions, percentages, color=colors, edgecolor="white", linewidth=0.6)
    ax.set_yticks(y_positions)
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlabel("Controller evaluations (%)")
    ax.set_xlim(0, max(percentages) + 10)
    ax.set_xticks([0, 20, 40, 60, 80])
    ax.set_xticklabels(["0", "20", "40", "60", "80"])
    ax.grid(axis="x", color="#d9d9d9", linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for y, value in zip(y_positions, percentages):
        ax.text(value + 0.8, y, f"{value:.1f}", va="center", ha="left", fontsize=7)
    fig.tight_layout(pad=0.35)
    fig.savefig(PDF_OUT, bbox_inches="tight")
    fig.savefig(PNG_OUT, dpi=300, bbox_inches="tight")
    plt.close(fig)


def write_manifest(plot_rows: list[dict[str, Any]], payload: dict[str, Any], checked: list[dict[str, Any]]) -> None:
    total = int(payload["rows"])
    write_json(
        MANIFEST_OUT,
        {
            "generated_at": utc_now(),
            "figure": "Figure 6 / controller output distribution",
            "source_artifact_paths_used": [rel(T12_REAL_JSON), rel(T12_BREAKDOWN_CSV)],
            "checked_artifacts": checked,
            "exact_fields_read": {
                rel(T12_REAL_JSON): [
                    "rows",
                    "no_safe_reason_distribution",
                    "selected_policy_rate",
                    "corrected_no_safe_rate",
                ],
                rel(T12_BREAKDOWN_CSV): ["no_safe_reason", "count", "rate"],
            },
            "raw_category_names_from_source": [row["raw_category_name"] for row in plot_rows],
            "report_friendly_category_labels": {
                row["raw_category_name"]: row["report_label"] for row in plot_rows
            },
            "counts": {row["raw_category_name"]: row["count"] for row in plot_rows},
            "percentages": {row["raw_category_name"]: row["percentage"] for row in plot_rows},
            "total_denominator": total,
            "values_read_directly_or_recomputed": "counts read directly from stored T12 JSON; percentages recomputed from stored counts and denominator",
            "missing_expected_fields_or_assumptions": [],
            "sanity_checks": {
                "selected_policy_rate_from_source": payload.get("selected_policy_rate"),
                "selected_policy_rate_from_counts": next(
                    row["rate"]
                    for row in plot_rows
                    if row["raw_category_name"] == "selected_corrected_feasible_policy"
                ),
                "corrected_no_safe_rate_from_source": payload.get("corrected_no_safe_rate"),
            },
            "command_used_to_regenerate": f"{sys.executable} {rel(Path(__file__))}",
            "portable_command": "research/risk_controlled_intervention/.venv/bin/python research/risk_controlled_intervention/scripts/plot_controller_outputs.py",
        },
    )


def write_markdown_note(plot_rows: list[dict[str, Any]]) -> None:
    rows = sorted(plot_rows, key=lambda row: row["display_order"])
    table_lines = [
        "| Controller output | Source category | Count | Percentage |",
        "|---|---|---:|---:|",
    ]
    for row in rows:
        table_lines.append(
            f"| {row['report_label']} | `{row['raw_category_name']}` | {row['count']:,} | {row['percentage']:.2f}% |"
        )
    selected = next(row for row in rows if row["raw_category_name"] == "selected_corrected_feasible_policy")
    empirical = next(row for row in rows if row["raw_category_name"] == "empirical_infeasible")
    largest = max(rows, key=lambda row: row["count"])
    support = (
        "The figure supports the Section 6.3 text: the selected-policy rate is "
        f"{selected['percentage']:.2f}%, and empirical infeasibility is the largest controller-output category."
        if largest["raw_category_name"] == "empirical_infeasible"
        else "The figure does not support the Section 6.3 statement that empirical infeasibility is the largest category."
    )
    MD_OUT.write_text(
        "\n".join(
            [
                "# Figure: Controller Output Distribution",
                "",
                "This figure shows the stored Batch T-12 feasibility-aware controller output distribution over real-data operating-point evaluations. "
                "The horizontal bars report the percentage of controller evaluations assigned to each output category, with counts read directly from the stored real-data controller artifact.",
                "",
                *table_lines,
                "",
                "## Source Artifacts",
                "",
                f"- `{rel(T12_REAL_JSON)}`",
                f"- `{rel(T12_BREAKDOWN_CSV)}` for count/rate consistency validation",
                "",
                "## Section 6.3 Support",
                "",
                support,
                "",
                "No interpolation, smoothing, raw trajectory text, code, action text, or observation text is used.",
                "",
            ]
        )
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload, checked = load_controller_distribution()
    plot_rows = build_plot_rows(payload)
    total_from_counts = sum(row["count"] for row in plot_rows)
    if total_from_counts != int(payload["rows"]):
        write_missing_report(checked, f"Category counts sum to {total_from_counts}, not stored total {payload['rows']}.")
        raise SystemExit("Stored category counts do not sum to stored total.")

    write_data_files(plot_rows, checked)
    make_plot(plot_rows)
    write_manifest(plot_rows, payload, checked)
    write_markdown_note(plot_rows)

    print(f"Wrote {rel(PDF_OUT)}")
    print(f"Wrote {rel(PNG_OUT)}")
    print(f"Wrote {rel(CSV_OUT)}")
    print(f"Wrote {rel(JSON_OUT)}")
    print(f"Wrote {rel(MANIFEST_OUT)}")
    print(f"Wrote {rel(MD_OUT)}")


if __name__ == "__main__":
    main()
