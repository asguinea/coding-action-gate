#!/usr/bin/env python3
"""Shared utilities for Batch 9M hybrid failure-onset analyses."""

from __future__ import annotations

import csv
import importlib.util
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
GENERIC_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"

SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
ROW_BUDGETS = (0.01, 0.02, 0.05, 0.10, 0.20)
TRAJ_BUDGETS = (0.10, 0.20, 0.25, 0.30, 0.40, 0.50)

FF_CONFIGS = (
    ("ff_exact_hgb_interactions", "bad_first_bad_next_step", "hist_gradient_boosting", "all_plus_interactions"),
    ("ff_warning_rf_structured", "bad_first_failure_warning_candidate", "random_forest", "all_structured"),
    ("ff_warning_gb_structured", "bad_first_failure_warning_candidate", "gradient_boosting", "all_structured"),
)
GENERIC_CONFIGS = (
    ("generic_bad_logistic_history", "logistic_regression", "non_position_history_only"),
    ("generic_bad_hgb_interactions", "hist_gradient_boosting", "all_plus_interactions"),
    ("generic_bad_gb_structured", "gradient_boosting", "all_structured"),
    ("generic_bad_logistic_prefix", "logistic_regression", "prefix_position_only"),
)
HYBRID_FORMS = (
    ("linear_w0.25", {"kind": "linear", "weight": 0.25}),
    ("linear_w0.50", {"kind": "linear", "weight": 0.50}),
    ("linear_w0.75", {"kind": "linear", "weight": 0.75}),
    ("max", {"kind": "max"}),
    ("product", {"kind": "product"}),
    ("rank_fusion", {"kind": "rank_fusion"}),
    ("ff_gated_generic", {"kind": "ff_gated_generic"}),
    ("generic_gated_ff", {"kind": "generic_gated_ff"}),
)
PRIMARY_HYBRIDS = (
    ("ff_warning_rf_structured", "generic_bad_logistic_history", "linear_w0.50"),
    ("ff_warning_rf_structured", "generic_bad_logistic_history", "max"),
    ("ff_warning_rf_structured", "generic_bad_logistic_history", "rank_fusion"),
    ("ff_warning_rf_structured", "generic_bad_logistic_history", "generic_gated_ff"),
    ("ff_exact_hgb_interactions", "generic_bad_logistic_history", "linear_w0.50"),
    ("ff_warning_gb_structured", "generic_bad_hgb_interactions", "max"),
)


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ff_models = load_script("evaluate_first_failure_risk_models")
ff_intervention = load_script("evaluate_first_failure_intervention_policies")
targets_mod = load_script("build_first_failure_targets")


def require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"missing required Batch 9M input: {path}")


def load_rows() -> list[dict[str, Any]]:
    return targets_mod.add_first_failure_targets(targets_mod.load_prefix_rows())


def load_splits() -> dict[str, Any]:
    require(REPEATED_SPLITS)
    return json.loads(REPEATED_SPLITS.read_text())


def rows_by_split(rows: list[dict[str, Any]], splits: dict[str, Any], seed: int) -> dict[str, list[dict[str, Any]]]:
    assignments = None
    for item in splits["splits"]:
        if int(item["seed"]) == int(seed):
            assignments = item["assignments"]
            break
    if assignments is None:
        raise KeyError(seed)
    out = {"train": [], "calibration": [], "test": []}
    for row in rows:
        split = assignments.get(str(row["trajectory_id"]))
        if split in out:
            out[split].append(row)
    for vals in out.values():
        vals.sort(key=lambda r: (str(r["trajectory_id"]), int(r["trajectory_row_ordinal"])))
    return out


def key(row: dict[str, Any]) -> tuple[str, int]:
    return str(row["trajectory_id"]), int(row["step_index"])


def build_ff_bundles(split_rows: dict[str, list[dict[str, Any]]], seed: int) -> dict[str, dict[str, Any]]:
    sklearn_info = ff_models.batch9a.sklearn_components()
    out = {}
    for name, target, model, feature_set in FF_CONFIGS:
        scores, _meta = ff_models.fit_scores(model, feature_set, split_rows, target, seed, sklearn_info)
        out[name] = {
            "name": name,
            "target_trained": target,
            "model_name": model,
            "feature_set": feature_set,
            "score_source": "first_failure_specific_score",
            "rows": split_rows,
            "scores": scores,
        }
    return out


def build_generic_bundles(split_rows: dict[str, list[dict[str, Any]]], seed: int) -> dict[str, dict[str, Any]]:
    require(GENERIC_SCORES)
    index = {key(row): {**row, "_split": split} for split, vals in split_rows.items() for row in vals}
    store: dict[str, dict[str, list[Any]]] = defaultdict(lambda: {"train": [], "calibration": [], "test": [], "scores_train": [], "scores_calibration": [], "scores_test": []})
    wanted = {(model, feature_set): name for name, model, feature_set in GENERIC_CONFIGS}
    with GENERIC_SCORES.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            ident = (row.get("model_name"), row.get("feature_set"))
            if int(row.get("split_seed", -1)) != seed or row.get("target_name") != "next_step_bad" or ident not in wanted:
                continue
            target_row = index.get((str(row["trajectory_id"]), int(row["step_index"])))
            if not target_row:
                continue
            split = target_row["_split"]
            name = wanted[ident]
            store[name][split].append(target_row)
            store[name][f"scores_{split}"].append(float(row["score"]))
    return {
        name: {
            "name": name,
            "model_name": next(model for n, model, _fs in GENERIC_CONFIGS if n == name),
            "feature_set": next(fs for n, _m, fs in GENERIC_CONFIGS if n == name),
            "score_source": "generic_next_step_bad_score",
            "rows": {split: data[split] for split in ("train", "calibration", "test")},
            "scores": {split: data[f"scores_{split}"] for split in ("train", "calibration", "test")},
        }
        for name, data in store.items()
    }


def minmax_params(values: list[float]) -> tuple[float, float]:
    return (min(values), max(values)) if values else (0.0, 1.0)


def norm(values: list[float], params: tuple[float, float]) -> list[float]:
    lo, hi = params
    if hi <= lo:
        return [0.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    out = [0.0] * len(values)
    denom = max(len(values) - 1, 1)
    for rank, idx in enumerate(order):
        out[idx] = rank / denom
    return out


def threshold_for_budget(scores: list[float], budget: float) -> float:
    if not scores:
        return math.inf
    ordered = sorted(scores, reverse=True)
    k = max(1, min(len(ordered), math.ceil(len(ordered) * budget)))
    return ordered[k - 1]


def align_scores(ff: dict[str, Any], generic: dict[str, Any], split: str) -> tuple[list[dict[str, Any]], list[float], list[float]]:
    gen_map = {key(row): score for row, score in zip(generic["rows"][split], generic["scores"][split])}
    rows, ff_scores, gen_scores = [], [], []
    for row, score in zip(ff["rows"][split], ff["scores"][split]):
        k = key(row)
        if k in gen_map:
            rows.append(row)
            ff_scores.append(float(score))
            gen_scores.append(float(gen_map[k]))
    return rows, ff_scores, gen_scores


def hybrid_scores(ff_cal: list[float], gen_cal: list[float], ff_values: list[float], gen_values: list[float], form: dict[str, Any]) -> list[float]:
    ff_norm = norm(ff_values, minmax_params(ff_cal))
    gen_norm = norm(gen_values, minmax_params(gen_cal))
    kind = form["kind"]
    if kind == "linear":
        w = float(form["weight"])
        return [w * a + (1 - w) * b for a, b in zip(ff_norm, gen_norm)]
    if kind == "max":
        return [max(a, b) for a, b in zip(ff_norm, gen_norm)]
    if kind == "product":
        return [a * b for a, b in zip(ff_norm, gen_norm)]
    if kind == "rank_fusion":
        return [(a + b) / 2 for a, b in zip(ranks(ff_values), ranks(gen_values))]
    if kind == "ff_gated_generic":
        tau = threshold_for_budget(norm(ff_cal, minmax_params(ff_cal)), 0.20)
        return [b if a >= tau else 0.25 * b for a, b in zip(ff_norm, gen_norm)]
    if kind == "generic_gated_ff":
        tau = threshold_for_budget(norm(gen_cal, minmax_params(gen_cal)), 0.20)
        return [a if b >= tau else 0.25 * a for a, b in zip(ff_norm, gen_norm)]
    raise ValueError(kind)


def build_hybrid_bundle(ff: dict[str, Any], generic: dict[str, Any], form_name: str, form: dict[str, Any]) -> dict[str, Any]:
    cal_rows, ff_cal, gen_cal = align_scores(ff, generic, "calibration")
    rows_by = {}
    scores_by = {}
    for split in ("train", "calibration", "test"):
        rows, ff_scores, gen_scores = align_scores(ff, generic, split)
        rows_by[split] = rows
        scores_by[split] = hybrid_scores(ff_cal, gen_cal, ff_scores, gen_scores, form)
    return {
        "policy_id": f"{ff['name']}+{generic['name']}::{form_name}",
        "first_failure_score": ff["name"],
        "generic_score": generic["name"],
        "hybrid_form": form_name,
        "rows": rows_by,
        "scores": scores_by,
        "score_source": "hybrid_failure_onset_score",
    }


def metric_summary(scores: list[float], y: list[int]) -> dict[str, Any]:
    prevalence = sum(y) / len(y) if y else 0.0
    ap = ff_models.batch9a.baseline_metrics.average_precision(scores, y)
    return {
        "rows": len(y),
        "positives": sum(y),
        "prevalence": prevalence,
        "auroc": ff_models.batch9a.baseline_metrics.auroc(scores, y),
        "average_precision": ap,
        "ap_lift_ratio": ap / prevalence if ap is not None and prevalence else None,
        "ap_lift_absolute": ap - prevalence if ap is not None else None,
    }


def labels(rows: list[dict[str, Any]], target: str) -> list[int]:
    return [int(row.get(target, 0)) for row in rows]


def top_capture(scores: list[float], y: list[int], budget: float = 0.10) -> dict[str, float]:
    pairs = sorted(zip(scores, y), key=lambda item: item[0], reverse=True)
    if not pairs:
        return {"recall": 0.0, "precision": 0.0}
    n = max(1, min(len(pairs), math.ceil(len(pairs) * budget)))
    selected = pairs[:n]
    hits = sum(label for _s, label in selected)
    positives = sum(y)
    return {"recall": hits / positives if positives else 0.0, "precision": hits / len(selected)}


def first_failure_metrics(rows: list[dict[str, Any]], decisions: list[bool]) -> dict[str, Any]:
    return ff_intervention.first_failure_metrics(rows, decisions)


def first_crossing(rows: list[dict[str, Any]], scores: list[float], threshold: float) -> list[bool]:
    return ff_intervention.first_crossing(rows, scores, threshold)


def trajectory_triage(rows: list[dict[str, Any]], scores: list[float], trajectory_scores: list[float], traj_budget: float, row_budget: float = 0.05) -> list[bool]:
    by_traj: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for idx, (row, score, tscore) in enumerate(zip(rows, scores, trajectory_scores)):
        by_traj[str(row["trajectory_id"])].append((idx, score, tscore))
    traj_values = [max(v[2] for v in vals) for vals in by_traj.values()]
    tau_traj = threshold_for_budget(traj_values, traj_budget)
    tau_row = threshold_for_budget(scores, row_budget)
    selected = set()
    for vals in by_traj.values():
        if max(v[2] for v in vals) < tau_traj:
            continue
        crossing = [(idx, score) for idx, score, _tscore in vals if score >= tau_row]
        chosen = min(crossing or [(idx, score) for idx, score, _tscore in vals], key=lambda item: int(rows[item[0]]["trajectory_row_ordinal"]))
        selected.add(chosen[0])
    return [idx in selected for idx in range(len(rows))]


def trajectory_threshold(scores: list[float], trajectory_scores: list[float], rows: list[dict[str, Any]], traj_budget: float) -> float:
    by_traj: dict[str, list[float]] = defaultdict(list)
    for row, tscore in zip(rows, trajectory_scores):
        by_traj[str(row["trajectory_id"])].append(float(tscore))
    return threshold_for_budget([max(vals) for vals in by_traj.values()], traj_budget)


def trajectory_triage_with_thresholds(
    rows: list[dict[str, Any]],
    scores: list[float],
    trajectory_scores: list[float],
    trajectory_threshold_value: float,
    row_threshold_value: float,
) -> list[bool]:
    by_traj: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for idx, (row, score, tscore) in enumerate(zip(rows, scores, trajectory_scores)):
        by_traj[str(row["trajectory_id"])].append((idx, float(score), float(tscore)))
    selected = set()
    for vals in by_traj.values():
        if max(v[2] for v in vals) < trajectory_threshold_value:
            continue
        crossing = [(idx, score) for idx, score, _tscore in vals if score >= row_threshold_value]
        chosen = min(crossing or [(idx, score) for idx, score, _tscore in vals], key=lambda item: int(rows[item[0]]["trajectory_row_ordinal"]))
        selected.add(chosen[0])
    return [idx in selected for idx in range(len(rows))]


def source_group(row: dict[str, Any]) -> str:
    source = str(row.get("source_bucket", "unknown"))
    if source == "swe_bench_like":
        return "SWE-like"
    if source == "terminalbench_like":
        return "TerminalBench-like"
    if source == "openhands":
        return "OpenHands-like"
    return source


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in keys} for row in rows)


def aggregate(rows: list[dict[str, Any]], group_keys: list[str], metric_keys: list[str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row.get(key) for key in group_keys)].append(row)
    out = []
    for key_tuple, vals in grouped.items():
        item = {name: value for name, value in zip(group_keys, key_tuple)}
        item["count"] = len(vals)
        for metric in metric_keys:
            clean = [row.get(metric) for row in vals if isinstance(row.get(metric), (int, float))]
            item[f"{metric}_mean"] = statistics.mean(clean) if clean else None
        out.append(item)
    return out
