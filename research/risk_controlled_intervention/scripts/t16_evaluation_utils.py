#!/usr/bin/env python3
"""Shared helpers for Batch T-16 evaluation-package scripts."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from statistics import mean
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
THEORY = ROOT / "theory"
DATA = ROOT / "data" / "intervention_outputs"
ARTIFACTS = ROOT / "theory_evaluation_artifacts"
TABLES = ARTIFACTS / "tables"
FIGURES = ARTIFACTS / "figures_data"


def read_json(path: Path, optional: bool = False) -> dict[str, Any]:
    if not path.exists():
        if optional:
            return {"_missing": True, "_path": str(path)}
        raise FileNotFoundError(path)
    return json.loads(path.read_text())


def read_csv(path: Path, optional: bool = False) -> list[dict[str, str]]:
    if not path.exists():
        if optional:
            return []
        raise FileNotFoundError(path)
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if fieldnames is None:
        keys: list[str] = []
        for row in rows:
            for key in row:
                if key not in keys:
                    keys.append(key)
        fieldnames = keys
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def md_table(rows: list[dict[str, Any]], columns: list[str] | None = None) -> str:
    if not rows:
        return "_No rows available._"
    if columns is None:
        columns = list(rows[0].keys())
    out = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        vals = [str(row.get(col, "")).replace("|", "/") for col in columns]
        out.append("| " + " | ".join(vals) + " |")
    return "\n".join(out)


def write_md(path: Path, title: str, lines: list[str], rows: list[dict[str, Any]] | None = None, columns: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = [f"# {title}", ""]
    content.extend(lines)
    if rows is not None:
        content.extend(["", md_table(rows, columns)])
    path.write_text("\n".join(content).rstrip() + "\n")


def ffloat(value: Any, default: float | None = None) -> float | None:
    if value in ("", None):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def fbool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes"}


def safe_mean(values: list[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return mean(vals) if vals else None


def claim_boundary() -> dict[str, bool]:
    return {
        "not_production_validation": True,
        "not_causal_prevention": True,
        "no_formal_conformal_guarantee_claimed": True,
        "offline_proxy": True,
        "no_superiority_over_named_related_methods": True,
    }


DATASET_SUMMARY = {
    "verified_manifest_rows": 1000,
    "artifacts_available_cached": 992,
    "parsed_with_prefix_examples": 922,
    "prefix_examples": 34554,
    "main_target_positives": 1754,
    "main_target_prevalence": 0.0508,
    "first_failure_trajectories": 368,
    "repeated_bad_trajectories": 289,
    "schema": "Prefix Extraction Schema v0.4",
    "raw_text_exclusion": "passed",
    "no_future_leakage": "passed",
    "split_leakage": "false",
}


def ensure_dirs() -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    TABLES.mkdir(parents=True, exist_ok=True)
    FIGURES.mkdir(parents=True, exist_ok=True)
