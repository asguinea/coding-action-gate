#!/usr/bin/env python3
"""Prepare leakage-guarded model features from frozen verified prefix rows."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
FEATURE_SCHEMA_PATH = REPORTS_DIR / "verified_prefix_feature_schema.json"
PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
SPLITS_PATH = PROCESSED_DIR / "verified_splits.json"
AUDIT_JSON = REPORTS_DIR / "model_feature_preparation_audit.json"
AUDIT_MD = REPORTS_DIR / "model_feature_preparation_audit.md"

TARGET = "next_step_bad"
RAW_TEXT_KEYS = {
    "action_text",
    "observation_text",
    "raw_action",
    "raw_observation",
    "content",
    "prompt",
    "response",
    "code",
    "raw_code",
}
FORBIDDEN_PREFIXES = ("next_step_",)
FORBIDDEN_LABEL_FIELDS = {
    "current_step_bad",
    "current_step_incorrect",
    "current_step_unuseful",
    "trajectory_has_any_bad_step",
}
IDENTIFIER_FIELDS = {
    "trajectory_id",
    "artifact_id",
    "artifact_path",
    "source_inferred",
    "step_index",
    "next_step_index",
}
EVAL_METADATA_FIELDS = (
    "trajectory_id",
    "source_bucket",
    "agent",
    "model",
    "layout_family",
    "category",
    "difficulty",
    "step_index",
)
MAX_CATEGORICAL_CARDINALITY = 50
HASH_FEATURE_SUFFIX = "_text_hash"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare model feature audit for verified prefix data.")
    parser.add_argument("--prefix-jsonl", default=str(PREFIX_PATH))
    parser.add_argument("--splits", default=str(SPLITS_PATH))
    parser.add_argument("--schema", default=str(FEATURE_SCHEMA_PATH))
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_rows(prefix_path: Path = PREFIX_PATH, shard_dir: Path = SHARD_DIR) -> list[dict[str, Any]]:
    if prefix_path.exists():
        paths = [prefix_path]
    else:
        paths = sorted(shard_dir.glob("prefix_verified_shard_*.jsonl"))
    rows: list[dict[str, Any]] = []
    for path in paths:
        with path.open() as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise SystemExit(f"ERROR: malformed JSONL at {path}:{line_number}: {exc}") from exc
    return rows


def schema_by_name(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {field["name"]: field for field in schema.get("fields", [])}


def is_forbidden_feature(name: str, field: dict[str, Any]) -> tuple[bool, str | None]:
    if name in RAW_TEXT_KEYS:
        return True, "raw_text_key"
    if name in IDENTIFIER_FIELDS:
        return True, "identifier_or_future_index"
    if name in FORBIDDEN_LABEL_FIELDS or field.get("target_or_label_only"):
        return True, "target_or_label_field"
    if name.startswith(FORBIDDEN_PREFIXES) and name != "prefix_length":
        return True, "future_or_target_step_field"
    if field.get("prohibited_from_model_features"):
        return True, "schema_prohibited"
    if not field.get("allowed_as_model_feature"):
        return True, "not_schema_allowed_feature"
    return False, None


def infer_feature_plan(
    rows: list[dict[str, Any]],
    schema: dict[str, Any],
    max_categorical_cardinality: int = MAX_CATEGORICAL_CARDINALITY,
) -> dict[str, Any]:
    fields = schema_by_name(schema)
    excluded: dict[str, str] = {}
    allowed_candidates = []
    for name, field in fields.items():
        forbidden, reason = is_forbidden_feature(name, field)
        if forbidden:
            excluded[name] = reason or "excluded"
        else:
            allowed_candidates.append(name)
    numeric = []
    categorical = []
    for name in sorted(allowed_candidates):
        values = [row.get(name) for row in rows]
        non_missing = [value for value in values if value is not None]
        dtype = fields.get(name, {}).get("dtype")
        if not non_missing:
            excluded[name] = "all_missing"
        elif dtype in {"int", "float", "bool"} or all(isinstance(value, (int, float, bool)) for value in non_missing):
            numeric.append(name)
        else:
            distinct = len({str(value) for value in non_missing})
            if name.endswith(HASH_FEATURE_SUFFIX):
                excluded[name] = "high_cardinality_hash_feature_not_used_for_baseline_models"
            elif distinct <= max_categorical_cardinality:
                categorical.append(name)
            else:
                excluded[name] = f"high_cardinality_categorical_{distinct}"
    return {
        "numeric_features": numeric,
        "categorical_features": categorical,
        "feature_names_used": numeric + categorical,
        "excluded_fields": excluded,
    }


def split_rows(rows: list[dict[str, Any]], splits: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    assignments = splits.get("assignments", {})
    by_split: dict[str, list[dict[str, Any]]] = {"train": [], "calibration": [], "test": []}
    for row in rows:
        split = assignments.get(row.get("trajectory_id"))
        if split in by_split:
            by_split[split].append(row)
    return by_split


def median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def build_encoder(split_data: dict[str, list[dict[str, Any]]], plan: dict[str, Any]) -> dict[str, Any]:
    train_rows = split_data["train"]
    numeric_impute = {}
    for name in plan["numeric_features"]:
        values = [float(row.get(name)) for row in train_rows if isinstance(row.get(name), (int, float, bool))]
        numeric_impute[name] = median(values)
    categories = {}
    for name in plan["categorical_features"]:
        values = [str(row.get(name)) if row.get(name) is not None else "<MISSING>" for row in train_rows]
        categories[name] = sorted(set(values))
    encoded_names = list(plan["numeric_features"])
    for name in plan["categorical_features"]:
        encoded_names.extend(f"{name}={category}" for category in categories[name])
        encoded_names.append(f"{name}=<UNK>")
    return {
        "numeric_impute": numeric_impute,
        "categories": categories,
        "encoded_feature_names": encoded_names,
    }


def encode_row(row: dict[str, Any], plan: dict[str, Any], encoder: dict[str, Any]) -> list[float]:
    values = []
    for name in plan["numeric_features"]:
        raw = row.get(name)
        values.append(float(raw) if isinstance(raw, (int, float, bool)) else float(encoder["numeric_impute"][name]))
    for name in plan["categorical_features"]:
        raw_value = str(row.get(name)) if row.get(name) is not None else "<MISSING>"
        known = set(encoder["categories"][name])
        value = raw_value if raw_value in known else "<UNK>"
        for category in encoder["categories"][name]:
            values.append(1.0 if value == category else 0.0)
        values.append(1.0 if value == "<UNK>" else 0.0)
    return values


def prepare_matrices(
    rows: list[dict[str, Any]] | None = None,
    schema: dict[str, Any] | None = None,
    splits: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rows = rows if rows is not None else load_rows()
    schema = schema if schema is not None else load_json(FEATURE_SCHEMA_PATH)
    splits = splits if splits is not None else load_json(SPLITS_PATH)
    plan = infer_feature_plan(rows, schema)
    split_data = split_rows(rows, splits)
    encoder = build_encoder(split_data, plan)
    matrices = {}
    for split, split_rows_ in split_data.items():
        matrices[split] = {
            "X": [encode_row(row, plan, encoder) for row in split_rows_],
            "y": [int(row[TARGET]) for row in split_rows_],
            "rows": split_rows_,
            "metadata": [{key: row.get(key) for key in EVAL_METADATA_FIELDS} for row in split_rows_],
        }
    return {
        "plan": plan,
        "encoder": encoder,
        "splits": matrices,
        "all_rows": rows,
    }


def raw_text_feature_guard(plan: dict[str, Any]) -> bool:
    return not any(name in RAW_TEXT_KEYS or "raw" in name.lower() or name in {"content", "prompt", "response", "code"} for name in plan["feature_names_used"])


def leakage_guard(plan: dict[str, Any]) -> bool:
    names = set(plan["feature_names_used"])
    if names & FORBIDDEN_LABEL_FIELDS:
        return False
    if any(name.startswith("next_step_") for name in names):
        return False
    return TARGET not in names and "trajectory_has_any_bad_step" not in names


def trajectory_split_leakage(splits: dict[str, Any]) -> bool:
    split_sets = {
        split: set(splits.get("split_trajectories", {}).get(split, []))
        for split in ("train", "calibration", "test")
    }
    return bool(
        split_sets["train"] & split_sets["calibration"]
        or split_sets["train"] & split_sets["test"]
        or split_sets["calibration"] & split_sets["test"]
    )


def missingness_summary(rows: list[dict[str, Any]], feature_names: list[str]) -> dict[str, dict[str, float]]:
    total = len(rows)
    return {
        name: {
            "missing_count": sum(1 for row in rows if row.get(name) is None),
            "missing_percent": (sum(1 for row in rows if row.get(name) is None) / total * 100.0) if total else 0.0,
        }
        for name in feature_names
    }


def numeric_summary(rows: list[dict[str, Any]], numeric_features: list[str]) -> dict[str, dict[str, Any]]:
    summary = {}
    for name in numeric_features:
        values = [float(row.get(name)) for row in rows if isinstance(row.get(name), (int, float, bool))]
        if values:
            summary[name] = {
                "count": len(values),
                "min": min(values),
                "median": statistics.median(values),
                "max": max(values),
                "mean": sum(values) / len(values),
            }
        else:
            summary[name] = {"count": 0}
    return summary


def build_audit(prepared: dict[str, Any], schema: dict[str, Any], splits: dict[str, Any]) -> dict[str, Any]:
    rows = prepared["all_rows"]
    split_counts = {
        split: {
            "rows": len(data["rows"]),
            "target_positives": sum(data["y"]),
            "positive_rate": (sum(data["y"]) / len(data["y"])) if data["y"] else 0.0,
        }
        for split, data in prepared["splits"].items()
    }
    plan = prepared["plan"]
    encoder = prepared["encoder"]
    return {
        "schema_version": "risk-controlled-intervention-model-feature-preparation.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": (
            "Batch 7 feature preparation only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "scope": "Frozen Prefix Extraction Schema v0.4 extraction-supported verified subset only.",
        "row_counts_by_split": split_counts,
        "feature_names_used": plan["feature_names_used"],
        "encoded_feature_count": len(encoder["encoded_feature_names"]),
        "encoded_feature_names": encoder["encoded_feature_names"],
        "excluded_fields": plan["excluded_fields"],
        "missingness_summary": missingness_summary(rows, plan["feature_names_used"]),
        "categorical_encoding_summary": {
            name: {"category_count": len(categories), "categories": categories}
            for name, categories in encoder["categories"].items()
        },
        "numeric_feature_summary": numeric_summary(rows, plan["numeric_features"]),
        "leakage_guard_status": leakage_guard(plan),
        "raw_text_feature_guard_status": raw_text_feature_guard(plan),
        "trajectory_split_leakage": trajectory_split_leakage(splits),
        "feature_schema_fields_read": len(schema.get("fields", [])),
        "reminder": "Metrics produced from these features apply only to the v0.4 extraction-supported verified subset.",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Model Feature Preparation Audit",
        "",
        "Batch 7 prepares non-raw prefix features for uncalibrated baseline scoring only.",
        "",
        "## Split Rows",
        "",
    ]
    for split, values in report["row_counts_by_split"].items():
        lines.append(f"- `{split}`: rows `{values['rows']}`, positives `{values['target_positives']}`, rate `{values['positive_rate']:.4f}`")
    lines.extend(["", "## Features Used", ""])
    for name in report["feature_names_used"]:
        lines.append(f"- `{name}`")
    lines.extend(
        [
            "",
            "## Guards",
            "",
            f"- `leakage_guard_status`: `{report['leakage_guard_status']}`",
            f"- `raw_text_feature_guard_status`: `{report['raw_text_feature_guard_status']}`",
            f"- `trajectory_split_leakage`: `{report['trajectory_split_leakage']}`",
            "",
            "## Caveat",
            "",
            report["reminder"],
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    rows = load_rows(Path(args.prefix_jsonl))
    schema = load_json(Path(args.schema))
    splits = load_json(Path(args.splits))
    prepared = prepare_matrices(rows, schema, splits)
    audit = build_audit(prepared, schema, splits)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_JSON.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n")
    AUDIT_MD.write_text(markdown(audit) + "\n")
    print(json.dumps({"rows": audit["row_counts_by_split"], "features": audit["feature_names_used"], "encoded_feature_count": audit["encoded_feature_count"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
