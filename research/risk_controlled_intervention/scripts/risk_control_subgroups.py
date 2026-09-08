#!/usr/bin/env python3
"""Subgroup risk-control summaries for selected Batch 8 baselines."""

from __future__ import annotations

import importlib.util
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
DECISIONS = WORKSPACE / "data" / "model_outputs" / "risk_control_decisions.jsonl"
BASELINE_COMPARISON = REPORTS_DIR / "baseline_comparison.json"
OUTPUT_JSON = REPORTS_DIR / "risk_control_subgroups.json"
OUTPUT_MD = REPORTS_DIR / "risk_control_subgroups.md"
METRICS_SCRIPT = Path(__file__).resolve().with_name("risk_control_metrics.py")

SUBGROUP_FIELDS = ("source_bucket", "agent", "layout_family", "difficulty", "category")
MIN_ROWS = 100
MIN_POSITIVES = 10


def _load_metrics():
    spec = importlib.util.spec_from_file_location("risk_control_metrics", METRICS_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


rcm = _load_metrics()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_decisions() -> list[dict[str, Any]]:
    rows = []
    with DECISIONS.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def best_heuristic_name(comparison: dict[str, Any]) -> str | None:
    candidates = [
        row for row in comparison.get("baseline_rows", [])
        if row.get("group") == "heuristic" and not row.get("skipped") and not row.get("baseline_name", "").startswith("always_")
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda row: row.get("calibration_average_precision") or -1.0)["baseline_name"]


def selected_baselines(comparison: dict[str, Any]) -> list[str]:
    names = ["logistic_regression", "class_weighted_logistic_regression"]
    heuristic = best_heuristic_name(comparison)
    if heuristic:
        names.append(heuristic)
    names.append("always_allow")
    return names


def subgroup_row(group_rows: list[dict[str, Any]], alpha: float) -> dict[str, Any]:
    scores = [float(row["score"]) for row in group_rows]
    labels = [int(row["target"]) for row in group_rows]
    tau = float(group_rows[0]["tau"])
    trajectories = [str(row["trajectory_id"]) for row in group_rows]
    return rcm.decision_metrics(scores, labels, tau, alpha, trajectories)


def evaluate_subgroups(
    rows: list[dict[str, Any]],
    subgroup_fields: tuple[str, ...] = SUBGROUP_FIELDS,
    min_rows: int = MIN_ROWS,
    min_positives: int = MIN_POSITIVES,
) -> list[dict[str, Any]]:
    records = []
    for field in subgroup_fields:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[str(row.get(field, "unknown"))].append(row)
        for value, group_rows in sorted(groups.items()):
            positives = sum(int(row["target"]) for row in group_rows)
            sparse = len(group_rows) < min_rows or positives < min_positives
            record = {
                "subgroup_field": field,
                "subgroup_value": value,
                "rows": len(group_rows),
                "positives": positives,
                "sparse": sparse,
                "suppression_rule": f"rows < {min_rows} or positives < {min_positives}",
            }
            if sparse:
                record["metrics"] = None
            else:
                record["metrics"] = subgroup_row(group_rows, float(group_rows[0]["alpha"]))
            records.append(record)
    return records


def build_report() -> dict[str, Any]:
    comparison = load_json(BASELINE_COMPARISON)
    keep = set(selected_baselines(comparison))
    rows = [row for row in load_decisions() if row.get("split") == "test" and row.get("baseline_name") in keep]
    grouped: dict[tuple[str, str, float], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row["baseline_name"]), str(row["thresholding_variant"]), float(row["alpha"]))].append(row)
    result_rows = []
    for (baseline, variant, alpha), group_rows in sorted(grouped.items()):
        result_rows.append(
            {
                "baseline_name": baseline,
                "thresholding_variant": variant,
                "alpha": alpha,
                "split": "test",
                "subgroups": evaluate_subgroups(group_rows),
            }
        )
    return {
        "schema_version": "risk-controlled-intervention-subgroups.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Batch 8 subgroup evaluation only; benchmark-level and not production guarantees.",
        "scope": "Frozen v0.4 extraction-supported verified subset test split only.",
        "selected_baselines": sorted(keep),
        "sparse_subgroup_rule": {"min_rows": MIN_ROWS, "min_positives": MIN_POSITIVES},
        "subgroup_results": result_rows,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Risk-Control Subgroups",
        "",
        "Subgroup metrics are test-split summaries for selected baselines. Sparse subgroups are suppressed.",
        "",
        f"- Selected baselines: `{', '.join(report['selected_baselines'])}`",
        f"- Sparse rule: rows < `{MIN_ROWS}` or positives < `{MIN_POSITIVES}`",
        "",
        "| baseline | variant | alpha | subgroup field | reported | sparse |",
        "|---|---|---:|---|---:|---:|",
    ]
    for row in report["subgroup_results"]:
        for subgroup in row["subgroups"]:
            reported = 0 if subgroup["metrics"] is None else 1
            lines.append(
                f"| `{row['baseline_name']}` | `{row['thresholding_variant']}` | `{row['alpha']}` | "
                f"`{subgroup['subgroup_field']}` | `{reported}` | `{subgroup['sparse']}` |"
            )
    return "\n".join(lines)


def main() -> int:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUTPUT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"selected_baselines": report["selected_baselines"], "result_rows": len(report["subgroup_results"])}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
