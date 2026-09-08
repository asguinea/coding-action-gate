#!/usr/bin/env python3
"""Shared helpers for Batch T-11 feasibility-aware diagnostics."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
DATA = WORKSPACE / "data" / "intervention_outputs"
REPORTS = WORKSPACE / "reports"
THEORY = WORKSPACE / "theory"
FEATURE_PATH = DATA / "theory_trajectory_level_features.jsonl"
ALPHAS = [0.05, 0.10, 0.20, 0.30, 0.40]
BETAS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.80]


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text())


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    rows = []
    with path.open() as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open() as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = sorted({k for row in rows for k in row}) if rows else ["empty"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def ffloat(value: Any, default: float = 0.0) -> float:
    try:
        if value in {"", None}:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def fbool(value: Any) -> bool:
    return str(value).lower() in {"true", "1", "yes"}


def structural_bound(p_f: float, alpha: float) -> float:
    return max(0.0, p_f - alpha)


def is_structurally_feasible(p_f: float, alpha: float, beta: float) -> bool:
    return beta + 1e-12 >= structural_bound(p_f, alpha)


def feature_prevalence_by_split() -> dict[tuple[int, str], dict[str, Any]]:
    grouped: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for row in read_jsonl(FEATURE_PATH):
        grouped[(int(row["split_seed"]), str(row["split_role"]))].append(row)
    out = {}
    for key, rows in grouped.items():
        p = sum(int(r["trajectory_has_first_failure"]) for r in rows) / len(rows) if rows else 0.0
        out[key] = {"trajectory_count": len(rows), "p_F": p}
    return out


def mean_or_none(vals: list[float]) -> float | None:
    return mean(vals) if vals else None
