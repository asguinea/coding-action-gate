#!/usr/bin/env python3
"""Build structural feasibility heatmap report asset.

The figure is sourced from stored T16/T11/T12 structural feasibility artifacts.
It does not read raw trajectory content and does not create extra grid cells.
"""

from __future__ import annotations

import csv
import json
import os
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MPLCONFIGDIR = Path(tempfile.gettempdir()) / "stepharbor_release_matplotlib"
MPLCONFIGDIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(MPLCONFIGDIR))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from matplotlib.lines import Line2D
from matplotlib.patches import Patch


REPO_ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = REPO_ROOT / "research" / "risk_controlled_intervention"
REPORTS_DIR = PROJECT_ROOT / "reports"
OUTPUT_DIR = REPORTS_DIR / "report_assets"

STRUCTURAL_TABLE = PROJECT_ROOT / "reference-data" / "table_T16_structural_feasibility.csv"
T11_MAP_JSON = PROJECT_ROOT / "reference-data" / "batch_T11_structural_feasibility_map.json"
T12_REAL_JSON = PROJECT_ROOT / "reference-data" / "batch_T12_feasibility_aware_real_data.json"

OUTPUT_STEM = "fig_structural_feasibility_heatmap"
CSV_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.csv"
JSON_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_data.json"
MANIFEST_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_manifest.json"
MD_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.md"
PDF_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.pdf"
PNG_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}.png"
MISSING_OUT = OUTPUT_DIR / f"{OUTPUT_STEM}_missing_data_report.json"

REQUIRED_FIELDS = {
    "alpha",
    "beta",
    "p_F_estimate",
    "LCB_p_F_mean",
    "structurally_impossible_rate",
    "certified_structural_no_safe_rate",
    "excess_burden_allowance_empirical",
}

CATEGORY_TO_CODE = {
    "certified_structurally_infeasible": 0,
    "empirical_structural_warning_not_certified": 1,
    "structurally_possible": 2,
}

CATEGORY_LABELS = {
    "certified_structurally_infeasible": "Certified structurally infeasible",
    "empirical_structural_warning_not_certified": "Empirical-only warning",
    "structurally_possible": "Structurally possible",
}

CATEGORY_COLORS = {
    "certified_structurally_infeasible": "#b2182b",
    "empirical_structural_warning_not_certified": "#f4a582",
    "structurally_possible": "#d1e5f0",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def write_missing_report(checked: list[dict[str, Any]], reason: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(
        MISSING_OUT,
        {
            "generated_at": utc_now(),
            "status": "missing_required_structural_feasibility_data",
            "reason": reason,
            "checked_artifacts": checked,
            "expected_fields": sorted(REQUIRED_FIELDS),
            "fabricated_values": False,
        },
    )


def load_structural_rows() -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    checked = [
        {"path": rel(STRUCTURAL_TABLE), "exists": STRUCTURAL_TABLE.exists()},
        {"path": rel(T11_MAP_JSON), "exists": T11_MAP_JSON.exists()},
        {"path": rel(T12_REAL_JSON), "exists": T12_REAL_JSON.exists()},
    ]
    if not STRUCTURAL_TABLE.exists():
        write_missing_report(checked, "T16 structural feasibility table was not found.")
        raise SystemExit(f"Missing source artifact: {rel(STRUCTURAL_TABLE)}")

    with STRUCTURAL_TABLE.open(newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = set(reader.fieldnames or [])
    checked[0]["fields"] = sorted(fields)
    checked[0]["row_count"] = len(rows)

    missing = sorted(REQUIRED_FIELDS - fields)
    if missing:
        write_missing_report(checked, f"Structural table is missing fields: {missing}")
        raise SystemExit(f"Missing required fields in {rel(STRUCTURAL_TABLE)}: {missing}")
    if not rows:
        write_missing_report(checked, "Structural table contains no rows.")
        raise SystemExit(f"No rows in {rel(STRUCTURAL_TABLE)}")
    return rows, checked


def classify_cell(certified_rate: float, empirical_rate: float) -> str:
    if certified_rate > 0:
        return "certified_structurally_infeasible"
    if empirical_rate > 0:
        return "empirical_structural_warning_not_certified"
    return "structurally_possible"


def build_plot_rows(source_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    plot_rows: list[dict[str, Any]] = []
    for row in source_rows:
        alpha = float(row["alpha"])
        beta = float(row["beta"])
        p_hat = float(row["p_F_estimate"])
        p_lcb = float(row["LCB_p_F_mean"])
        empirical_rate = float(row["structurally_impossible_rate"])
        certified_rate = float(row["certified_structural_no_safe_rate"])
        category = classify_cell(certified_rate, empirical_rate)
        plot_rows.append(
            {
                "alpha": alpha,
                "beta": beta,
                "alpha_plus_beta": alpha + beta,
                "p_F_estimate": p_hat,
                "p_F_lcb_mean": p_lcb,
                "structurally_impossible_rate_empirical": empirical_rate,
                "certified_structural_no_safe_rate": certified_rate,
                "excess_burden_allowance_empirical": float(row["excess_burden_allowance_empirical"]),
                "category": category,
                "category_label": CATEGORY_LABELS[category],
                "category_code": CATEGORY_TO_CODE[category],
                "classification_rule": "certified if certified_structural_no_safe_rate > 0; empirical-only warning if structurally_impossible_rate > 0; otherwise possible",
                "source_artifact": rel(STRUCTURAL_TABLE),
                "value_status": "stored_aggregate_structural_feasibility_cell",
                "fabricated": False,
                "interpolated": False,
                "raw_trajectory_content_used": False,
            }
        )
    return sorted(plot_rows, key=lambda r: (r["alpha"], r["beta"]))


def grid_edges(values: list[float]) -> np.ndarray:
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        width = max(sorted_values[0] * 0.2, 0.05)
        return np.array([sorted_values[0] - width / 2, sorted_values[0] + width / 2])
    edges = [sorted_values[0] - (sorted_values[1] - sorted_values[0]) / 2]
    for left, right in zip(sorted_values, sorted_values[1:]):
        edges.append((left + right) / 2)
    edges.append(sorted_values[-1] + (sorted_values[-1] - sorted_values[-2]) / 2)
    return np.array(edges)


def make_plot(plot_rows: list[dict[str, Any]]) -> None:
    alphas = sorted({row["alpha"] for row in plot_rows})
    betas = sorted({row["beta"] for row in plot_rows})
    matrix = np.full((len(alphas), len(betas)), np.nan)
    by_cell = {(row["alpha"], row["beta"]): row for row in plot_rows}
    for i, alpha in enumerate(alphas):
        for j, beta in enumerate(betas):
            if (alpha, beta) in by_cell:
                matrix[i, j] = by_cell[(alpha, beta)]["category_code"]

    p_hat = float(np.mean([row["p_F_estimate"] for row in plot_rows]))
    p_lcb = float(np.mean([row["p_F_lcb_mean"] for row in plot_rows]))

    plt.rcParams.update(
        {
            "font.size": 8,
            "axes.labelsize": 8,
            "legend.fontsize": 6.7,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )
    fig, ax = plt.subplots(figsize=(3.35, 2.45))
    cmap = ListedColormap(
        [
            CATEGORY_COLORS["certified_structurally_infeasible"],
            CATEGORY_COLORS["empirical_structural_warning_not_certified"],
            CATEGORY_COLORS["structurally_possible"],
        ]
    )
    x_edges = grid_edges(betas)
    y_edges = grid_edges(alphas)
    ax.pcolormesh(x_edges, y_edges, matrix, cmap=cmap, vmin=0, vmax=2, edgecolors="white", linewidth=0.7)

    alpha_line = np.linspace(min(alphas), max(alphas), 200)
    beta_lcb = p_lcb - alpha_line
    beta_emp = p_hat - alpha_line
    mask_lcb = (beta_lcb >= min(x_edges)) & (beta_lcb <= max(x_edges))
    mask_emp = (beta_emp >= min(x_edges)) & (beta_emp <= max(x_edges))
    ax.plot(beta_lcb[mask_lcb], alpha_line[mask_lcb], color="black", linewidth=1.1)
    ax.plot(beta_emp[mask_emp], alpha_line[mask_emp], color="#555555", linewidth=1.0, linestyle="--")

    ax.set_xlabel("Trajectory-review burden tolerance β")
    ax.set_ylabel("Missed-first-failure tolerance α")
    ax.set_xticks(betas)
    ax.set_xticklabels([f"{value:.2f}".rstrip("0").rstrip(".") for value in betas])
    ax.set_yticks(alphas)
    ax.set_yticklabels([f"{value:.2f}".rstrip("0").rstrip(".") for value in alphas])
    ax.set_xlim(min(x_edges), max(x_edges))
    ax.set_ylim(min(y_edges), max(y_edges))

    legend_handles = [
        Patch(facecolor=CATEGORY_COLORS["certified_structurally_infeasible"], label="Certified infeasible"),
        Patch(facecolor=CATEGORY_COLORS["empirical_structural_warning_not_certified"], label="Empirical-only warning"),
        Patch(facecolor=CATEGORY_COLORS["structurally_possible"], label="Structurally possible"),
        Line2D([0], [0], color="black", linewidth=1.1, label="LCB boundary"),
        Line2D([0], [0], color="#555555", linewidth=1.0, linestyle="--", label="Empirical boundary"),
    ]
    ax.legend(handles=legend_handles, frameon=False, loc="upper right", bbox_to_anchor=(1.01, 1.02))
    fig.tight_layout(pad=0.35)
    fig.savefig(PDF_OUT, bbox_inches="tight")
    fig.savefig(PNG_OUT, dpi=300, bbox_inches="tight")
    plt.close(fig)


def write_data_files(plot_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    fieldnames = [
        "alpha",
        "beta",
        "alpha_plus_beta",
        "p_F_estimate",
        "p_F_lcb_mean",
        "structurally_impossible_rate_empirical",
        "certified_structural_no_safe_rate",
        "excess_burden_allowance_empirical",
        "category",
        "category_label",
        "category_code",
        "classification_rule",
        "source_artifact",
        "value_status",
        "fabricated",
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
            "description": "structural feasibility heatmap data over stored alpha/beta operating-point grid.",
            "source_artifact_paths": [rel(STRUCTURAL_TABLE), rel(T11_MAP_JSON), rel(T12_REAL_JSON)],
            "checked_artifacts": checked,
            "rows": plot_rows,
            "fabricated_values": False,
            "interpolated_values": False,
            "raw_trajectory_content_used": False,
        },
    )


def write_manifest(plot_rows: list[dict[str, Any]], checked: list[dict[str, Any]]) -> None:
    alphas = sorted({row["alpha"] for row in plot_rows})
    betas = sorted({row["beta"] for row in plot_rows})
    counts = Counter(row["category"] for row in plot_rows)
    total = len(plot_rows)
    t11 = read_json(T11_MAP_JSON)
    t12 = read_json(T12_REAL_JSON)
    write_json(
        MANIFEST_OUT,
        {
            "generated_at": utc_now(),
            "figure": "Figure 5 / structural feasibility heatmap",
            "source_artifact_paths_used": [rel(STRUCTURAL_TABLE), rel(T11_MAP_JSON), rel(T12_REAL_JSON)],
            "checked_artifacts": checked,
            "exact_fields_read": {
                rel(STRUCTURAL_TABLE): sorted(REQUIRED_FIELDS),
                rel(T11_MAP_JSON): [
                    "mean_p_F_calibration",
                    "mean_p_F_test",
                    "mean_abs_p_F_gap",
                    "structural_infeasible_rate_calibration",
                ],
                rel(T12_REAL_JSON): [
                    "p_hat_mean",
                    "p_lcb_mean",
                    "certified_structural_no_safe_rate",
                    "empirical_structural_no_safe_rate",
                ],
            },
            "operating_point_grid_values": {"alpha": alphas, "beta": betas},
            "classification_rule_used": "Use stored T16 rates: certified_structurally_infeasible if certified_structural_no_safe_rate > 0; empirical_structural_warning_not_certified if structurally_impossible_rate > 0; otherwise structurally_possible.",
            "primary_boundary_visualized": "alpha + beta = mean LCB(p_F)",
            "secondary_boundary_visualized": "alpha + beta = mean p_hat_F",
            "classification_came_directly_from_artifact_or_recomputed": "classification labels derived from stored aggregate rates; p_F and LCB values directly read from source artifacts",
            "aggregation_rule_across_seeds": "Stored T16 table rates aggregate repeated split/cell rows; this script does not re-aggregate raw split rows.",
            "missing_expected_fields_or_assumptions": [],
            "category_counts": {
                category: {"count": counts.get(category, 0), "fraction": counts.get(category, 0) / total}
                for category in CATEGORY_TO_CODE
            },
            "sanity_summary_from_sources": {
                "T11_mean_p_F_calibration": t11.get("mean_p_F_calibration"),
                "T11_mean_p_F_test": t11.get("mean_p_F_test"),
                "T11_mean_abs_p_F_gap": t11.get("mean_abs_p_F_gap"),
                "T11_structural_infeasible_rate_calibration": t11.get("structural_infeasible_rate_calibration"),
                "T12_p_hat_mean": t12.get("p_hat_mean"),
                "T12_p_lcb_mean": t12.get("p_lcb_mean"),
                "T12_certified_structural_no_safe_rate": t12.get("certified_structural_no_safe_rate"),
                "T12_empirical_structural_no_safe_rate": t12.get("empirical_structural_no_safe_rate"),
            },
            "command_used_to_regenerate": f"{sys.executable} {rel(Path(__file__))}",
            "portable_command": "research/risk_controlled_intervention/.venv/bin/python research/risk_controlled_intervention/scripts/plot_structural_feasibility.py",
        },
    )


def write_markdown_note(plot_rows: list[dict[str, Any]]) -> None:
    counts = Counter(row["category"] for row in plot_rows)
    total = len(plot_rows)
    empirical_structural_count = counts["certified_structurally_infeasible"] + counts["empirical_structural_warning_not_certified"]
    certified_count = counts["certified_structurally_infeasible"]
    summary_lines = [
        "| Category | Cells | Fraction |",
        "|---|---:|---:|",
        f"| Certified structurally infeasible by LCB | {certified_count} | {certified_count / total:.3f} |",
        f"| Empirical-only structural warning | {counts['empirical_structural_warning_not_certified']} | {counts['empirical_structural_warning_not_certified'] / total:.3f} |",
        f"| Structurally possible | {counts['structurally_possible']} | {counts['structurally_possible'] / total:.3f} |",
        f"| Empirical structural infeasible or warning total | {empirical_structural_count} | {empirical_structural_count / total:.3f} |",
    ]
    p_hat = sum(row["p_F_estimate"] for row in plot_rows) / total
    p_lcb = sum(row["p_F_lcb_mean"] for row in plot_rows) / total
    support = (
        "The figure supports the Section 6.2 statement with qualification: using the empirical prevalence boundary, "
        f"{empirical_structural_count}/{total} cells ({empirical_structural_count / total:.1%}) are structurally infeasible or warned; "
        f"the lower-confidence certificate marks {certified_count}/{total} cells ({certified_count / total:.1%})."
    )
    MD_OUT.write_text(
        "\n".join(
            [
                "# Figure: Structural Feasibility Heatmap",
                "",
                "This figure shows the stored alpha/beta operating-point grid for feasibility-aware dual-unit first-event control. "
                "Cells below the lower-confidence first-failure prevalence boundary are certified structurally infeasible before any score or threshold is considered; the empirical-only warning cell is below the empirical prevalence boundary but not below the LCB boundary.",
                "",
                *summary_lines,
                "",
                "## Source Artifacts",
                "",
                f"- `{rel(STRUCTURAL_TABLE)}`",
                f"- `{rel(T11_MAP_JSON)}`",
                f"- `{rel(T12_REAL_JSON)}`",
                "",
                "## Structural Condition",
                "",
                f"- Certified structural condition: `alpha + beta < LCB(p_F)`, with mean `LCB(p_F) = {p_lcb:.6f}` from the stored table.",
                f"- Empirical diagnostic condition: `alpha + beta < p_hat_F`, with mean `p_hat_F = {p_hat:.6f}` from the stored table.",
                "",
                "## Section 6.2 Support",
                "",
                support,
                "",
                "No interpolation, extrapolation, raw trajectory text, code, action text, or observation text is used.",
                "",
            ]
        )
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_rows, checked = load_structural_rows()
    plot_rows = build_plot_rows(source_rows)
    expected_cell_count = len({row["alpha"] for row in plot_rows}) * len({row["beta"] for row in plot_rows})
    if len(plot_rows) != expected_cell_count:
        write_missing_report(checked, "Operating-point grid is incomplete.")
        raise SystemExit("Operating-point grid is incomplete.")

    write_data_files(plot_rows, checked)
    make_plot(plot_rows)
    write_manifest(plot_rows, checked)
    write_markdown_note(plot_rows)

    print(f"Wrote {rel(PDF_OUT)}")
    print(f"Wrote {rel(PNG_OUT)}")
    print(f"Wrote {rel(CSV_OUT)}")
    print(f"Wrote {rel(JSON_OUT)}")
    print(f"Wrote {rel(MANIFEST_OUT)}")
    print(f"Wrote {rel(MD_OUT)}")


if __name__ == "__main__":
    main()
