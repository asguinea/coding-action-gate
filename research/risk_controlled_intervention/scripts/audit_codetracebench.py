#!/usr/bin/env python3
"""Audit cached NJU-LINK/CodeTraceBench manifest files."""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
RAW_DIR = WORKSPACE / "data" / "raw"
REPORTS_DIR = WORKSPACE / "reports"
SUPPORTED_SPLITS = ("verified", "full")
JSON_FIELD_NAMES = (
    "tags",
    "stages",
    "incorrect_stages",
    "incorrect_step_ids",
    "unuseful_step_ids",
)
TEXT_SIGNAL_TERMS = ("action", "observation", "thought", "response", "message", "content")
PATH_SIGNAL_TERMS = ("path", "file", "artifact", "trace", "trajectory", "source", "benchmark", "dataset")
SECRETISH_KEYS = ("token", "secret", "password", "api_key", "apikey", "authorization")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit cached CodeTraceBench manifests.")
    parser.add_argument(
        "--split",
        choices=("verified", "full", "both"),
        default="both",
        help="Manifest split to audit.",
    )
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help="Explicit manifest path. Can be repeated. If provided, --split is used only for report naming.",
    )
    parser.add_argument(
        "--examples",
        type=int,
        default=5,
        help="Number of truncated example rows to include.",
    )
    return parser.parse_args()


def requested_splits(split: str) -> list[str]:
    return list(SUPPORTED_SPLITS) if split == "both" else [split]


def safe_json_loads(value: Any) -> tuple[Any | None, str | None]:
    if value is None:
        return None, "missing"
    if isinstance(value, float) and math.isnan(value):
        return None, "missing"
    if isinstance(value, (list, dict, int, bool)):
        return value, None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None, "missing"
        try:
            return json.loads(stripped), None
        except json.JSONDecodeError as exc:
            return None, f"malformed: {exc.msg}"
    return None, f"unsupported type: {type(value).__name__}"


def coerce_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return list(value)
    if isinstance(value, dict):
        return list(value.values())
    return [value]


def parsed_json_field(row: dict[str, Any], field: str) -> tuple[Any | None, str | None]:
    if field not in row:
        return None, "missing"
    return safe_json_loads(row.get(field))


def ids_from_incorrect_stages(row: dict[str, Any], field: str) -> list[Any]:
    stages, error = parsed_json_field(row, "incorrect_stages")
    if error is not None:
        return []
    ids: list[Any] = []
    for stage in coerce_list(stages):
        if not isinstance(stage, dict):
            continue
        ids.extend(coerce_list(stage.get(field)))
        for step in coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            labels = {str(label) for label in coerce_list(step.get("labels"))}
            if field == "incorrect_step_ids" and "incorrect" in labels:
                ids.extend(coerce_list(step.get("step_id")))
            if field == "unuseful_step_ids" and "unuseful" in labels:
                ids.extend(coerce_list(step.get("step_id")))
    return [value for value in ids if value is not None]


def unique_preserving_order(values: Iterable[Any]) -> list[Any]:
    seen: set[str] = set()
    unique_values: list[Any] = []
    for value in values:
        key = str(value)
        if key in seen:
            continue
        seen.add(key)
        unique_values.append(value)
    return unique_values


def count_label_ids(row: dict[str, Any]) -> dict[str, int | bool]:
    incorrect, incorrect_error = parsed_json_field(row, "incorrect_step_ids")
    unuseful, unuseful_error = parsed_json_field(row, "unuseful_step_ids")
    incorrect_ids = [] if incorrect_error else coerce_list(incorrect)
    unuseful_ids = [] if unuseful_error else coerce_list(unuseful)
    incorrect_ids = unique_preserving_order(
        [*incorrect_ids, *ids_from_incorrect_stages(row, "incorrect_step_ids")]
    )
    unuseful_ids = unique_preserving_order(
        [*unuseful_ids, *ids_from_incorrect_stages(row, "unuseful_step_ids")]
    )
    union_ids = {str(value) for value in incorrect_ids} | {str(value) for value in unuseful_ids}
    return {
        "has_incorrect": len(incorrect_ids) > 0,
        "has_unuseful": len(unuseful_ids) > 0,
        "incorrect_count": len(incorrect_ids),
        "unuseful_count": len(unuseful_ids),
        "incorrect_or_unuseful_count": len(union_ids),
    }


def distribution_summary(values: Iterable[int | float]) -> dict[str, Any]:
    clean = [value for value in values if isinstance(value, (int, float)) and not math.isnan(value)]
    if not clean:
        return {"count": 0}
    ordered = sorted(clean)
    return {
        "count": len(ordered),
        "min": ordered[0],
        "max": ordered[-1],
        "mean": statistics.fmean(ordered),
        "median": statistics.median(ordered),
        "p25": ordered[int((len(ordered) - 1) * 0.25)],
        "p75": ordered[int((len(ordered) - 1) * 0.75)],
        "p90": ordered[int((len(ordered) - 1) * 0.90)],
    }


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None
        try:
            return int(float(stripped))
        except ValueError:
            return None
    return None


def infer_stage_count(row: dict[str, Any]) -> int | None:
    explicit = as_int(row.get("stage_count"))
    if explicit is not None:
        return explicit
    stages, error = parsed_json_field(row, "stages")
    if error is None:
        return len(coerce_list(stages))
    return None


def infer_source_value(row: dict[str, Any]) -> tuple[str, str] | tuple[None, str]:
    explicit_columns = ("benchmark", "source", "dataset", "task_source")
    for column in explicit_columns:
        value = row.get(column)
        if isinstance(value, str) and value.strip():
            return value.strip(), f"explicit column: {column}"

    for column, value in row.items():
        lower_column = column.lower()
        if not any(term in lower_column for term in PATH_SIGNAL_TERMS):
            continue
        if not isinstance(value, str) or not value.strip():
            continue
        lowered = value.lower()
        known_sources = (
            "swe-bench",
            "swebench",
            "humaneval",
            "mbpp",
            "leetcode",
            "codeforces",
            "apps",
            "repoeval",
            "github",
        )
        for source in known_sources:
            if source in lowered:
                return source, f"inferred from path-like column: {column}"
        path_parts = [part for part in value.replace("\\", "/").split("/") if part]
        if len(path_parts) >= 2:
            return path_parts[0], f"inferred from first path segment in column: {column}"

    return None, "no explicit source column or recognizable path-like source signal"


def infer_source_distribution(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    heuristics: Counter[str] = Counter()
    missing = 0
    for row in rows:
        source, heuristic = infer_source_value(row)
        heuristics[heuristic] += 1
        if source is None:
            missing += 1
        else:
            counts[source] += 1
    return {
        "inferred": True,
        "heuristic": (
            "Prefer explicit benchmark/source/dataset/task_source columns; otherwise "
            "scan path-like columns for known benchmark names, then use the first path segment."
        ),
        "counts": dict(counts.most_common()),
        "missing": missing,
        "heuristic_counts": dict(heuristics.most_common()),
    }


def truncate_value(value: Any, limit: int = 160) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted-key]"
            if any(secret in key.lower() for secret in SECRETISH_KEYS)
            else truncate_value(item, limit)
            for key, item in list(value.items())[:20]
        }
    if isinstance(value, list):
        return [truncate_value(item, limit) for item in value[:10]]
    if isinstance(value, str):
        normalized = value.replace("\n", "\\n")
        return normalized if len(normalized) <= limit else normalized[:limit] + "...[truncated]"
    return value


def collect_text_keys_from_value(value: Any, counter: Counter[str]) -> bool:
    found = False
    if isinstance(value, dict):
        for key, item in value.items():
            if any(term in key.lower() for term in TEXT_SIGNAL_TERMS):
                counter[key] += 1
                found = True
            found = collect_text_keys_from_value(item, counter) or found
    elif isinstance(value, list):
        for item in value:
            found = collect_text_keys_from_value(item, counter) or found
    return found


def inspect_text_availability(rows: list[dict[str, Any]], columns: list[str]) -> dict[str, Any]:
    direct_columns = [
        column
        for column in columns
        if any(term in column.lower() for term in TEXT_SIGNAL_TERMS)
    ]
    serialized_text_keys: Counter[str] = Counter()
    rows_with_serialized_text_keys = 0
    for row in rows[:200]:
        found = False
        for field in ("stages", "incorrect_stages"):
            parsed, error = parsed_json_field(row, field)
            if error is not None:
                continue
            found = collect_text_keys_from_value(parsed, serialized_text_keys) or found
        if found:
            rows_with_serialized_text_keys += 1
    return {
        "manifest_direct_text_columns": direct_columns,
        "serialized_text_keys_sample": dict(serialized_text_keys.most_common(25)),
        "sampled_rows_with_serialized_text_keys": rows_with_serialized_text_keys,
        "assessment": (
            "action/observation-like text appears directly in manifest columns or serialized stages"
            if direct_columns or serialized_text_keys
            else "action/observation text was not found in sampled manifest fields; likely artifact-only"
        ),
    }


def load_json_file(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        for key in ("data", "rows", "records", "examples"):
            value = data.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
        return [data]
    raise ValueError(f"JSON root must be an object or array: {path}")


def load_jsonl_file(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"JSONL line {line_number} is not an object: {path}")
        rows.append(value)
    return rows


def load_csv_file(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def load_parquet_file(path: Path) -> list[dict[str, Any]]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError(
            "Parquet manifest loading requires pandas and a parquet engine, "
            "for example: python -m pip install pandas pyarrow"
        ) from exc
    frame = pd.read_parquet(path)
    return frame.to_dict(orient="records")


def load_manifest(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        return load_json_file(path)
    if suffix == ".jsonl":
        return load_jsonl_file(path)
    if suffix == ".csv":
        return load_csv_file(path)
    if suffix == ".parquet":
        return load_parquet_file(path)
    raise ValueError(f"Unsupported manifest format: {path}")


def discover_cached_manifests(splits: list[str]) -> list[Path]:
    paths: list[Path] = []
    for split in splits:
        candidates = sorted(
            path
            for path in RAW_DIR.iterdir()
            if path.is_file()
            and split in path.name.lower()
            and path.suffix.lower() in {".json", ".jsonl", ".csv", ".parquet"}
            and path.name != "manifest_downloads.json"
        )
        if not candidates:
            raise FileNotFoundError(
                f"No cached {split} manifest found under {RAW_DIR}. "
                "Run download_manifests.py first or pass --input."
            )
        paths.append(candidates[0])
    return paths


def count_distribution(rows: list[dict[str, Any]], columns: Iterable[str]) -> dict[str, int]:
    for column in columns:
        if any(column in row for row in rows):
            counter = Counter(str(row.get(column, "")).strip() or "(missing)" for row in rows)
            return dict(counter.most_common())
    return {}


def audit_rows(rows: list[dict[str, Any]], source_path: Path, examples: int) -> dict[str, Any]:
    columns = sorted({column for row in rows for column in row})
    step_counts = [as_int(row.get("step_count")) for row in rows]
    clean_step_counts = [value for value in step_counts if value is not None]
    stage_counts = [infer_stage_count(row) for row in rows]
    clean_stage_counts = [value for value in stage_counts if value is not None]
    malformed: Counter[str] = Counter()
    missing: Counter[str] = Counter()
    parsed_field_presence: Counter[str] = Counter()
    label_totals = Counter()

    for row in rows:
        for field in JSON_FIELD_NAMES:
            parsed, error = parsed_json_field(row, field)
            if error is None:
                parsed_field_presence[field] += 1
            elif error == "missing":
                missing[field] += 1
            else:
                malformed[field] += 1
        counts = count_label_ids(row)
        label_totals["trajectories_with_any_incorrect_step_ids"] += int(bool(counts["has_incorrect"]))
        label_totals["trajectories_with_any_unuseful_step_ids"] += int(bool(counts["has_unuseful"]))
        label_totals["total_incorrect_step_ids"] += int(counts["incorrect_count"])
        label_totals["total_unuseful_step_ids"] += int(counts["unuseful_count"])
        label_totals["total_incorrect_or_unuseful_labels"] += int(counts["incorrect_or_unuseful_count"])
        label_totals["trajectories_with_any_incorrect_or_unuseful_labels"] += int(
            bool(counts["incorrect_or_unuseful_count"])
        )

    return {
        "source_path": str(source_path),
        "actual_columns": columns,
        "trajectory_count": len(rows),
        "step_count": {
            "total": sum(clean_step_counts),
            "distribution": distribution_summary(clean_step_counts),
            "missing_or_unparseable": len(rows) - len(clean_step_counts),
        },
        "stage_count": {
            "distribution": distribution_summary(clean_stage_counts),
            "missing_or_unparseable": len(rows) - len(clean_stage_counts),
        },
        "json_fields": {
            "parsed_counts": dict(parsed_field_presence),
            "missing_counts": dict(missing),
            "malformed_counts": dict(malformed),
        },
        "labels": dict(label_totals),
        "difficulty_distribution": count_distribution(rows, ("difficulty", "task_difficulty")),
        "category_distribution": count_distribution(rows, ("category", "task_category", "problem_category")),
        "agent_distribution": count_distribution(rows, ("agent", "agent_name", "agent_type")),
        "model_distribution": count_distribution(rows, ("model", "model_name", "llm", "llm_model")),
        "benchmark_source_distribution": infer_source_distribution(rows),
        "action_observation_text_availability": inspect_text_availability(rows, columns),
        "example_rows_truncated": [truncate_value(row) for row in rows[:examples]],
    }


def print_summary(report: dict[str, Any]) -> None:
    print(json.dumps(report, indent=2, sort_keys=True))


def main() -> int:
    args = parse_args()
    paths = [Path(value).resolve() for value in args.input]
    if not paths:
        paths = discover_cached_manifests(requested_splits(args.split))

    manifest_reports = []
    blockers = []
    for path in paths:
        try:
            rows = load_manifest(path)
            manifest_reports.append(audit_rows(rows, path, args.examples))
        except Exception as exc:
            blockers.append({"path": str(path), "error": str(exc)})

    report = {
        "schema_version": "risk-controlled-intervention-audit.v0",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": "NJU-LINK/CodeTraceBench",
        "claim_boundary": (
            "Batch 0 dataset audit only; not production StepHarbor validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifests": manifest_reports,
        "blockers": blockers,
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"codetracebench_audit_{args.split}.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print_summary(report)
    print(f"\nSaved audit report: {report_path}")
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
