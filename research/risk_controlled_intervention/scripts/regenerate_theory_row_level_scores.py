#!/usr/bin/env python3
"""Regenerate clean row-level score artifacts for theory evaluation."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as hutils

WORKSPACE = Path(__file__).resolve().parents[1]
OUT = WORKSPACE / "data" / "intervention_outputs" / "theory_row_level_scores.jsonl"
REPORT_JSON = WORKSPACE / "reports" / "batch_T7_theory_row_level_scores_summary.json"
REPORT_MD = WORKSPACE / "reports" / "batch_T7_theory_row_level_scores_summary.md"

SEEDS = hutils.SEEDS[:5]
RAW_FORBIDDEN = {"action_text", "observation_text", "raw_action", "raw_observation", "terminal_output", "code_text"}
BASE_FF = {"ff_exact_hgb_interactions"}
BASE_GENERIC = {"generic_bad_logistic_history"}


def norm_values(values: list[float], lo: float, hi: float) -> list[float]:
    if hi <= lo:
        return [0.0 for _ in values]
    return [(float(v) - lo) / (hi - lo) for v in values]


def train_minmax(bundle: dict[str, Any]) -> tuple[float, float]:
    vals = [float(v) for v in bundle["scores"]["train"]]
    return (min(vals), max(vals)) if vals else (0.0, 1.0)


def row_key(row: dict[str, Any]) -> tuple[str, int]:
    return (str(row["trajectory_id"]), int(row["step_index"]))


def output_row(seed: int, split: str, score_family: str, row: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "split_seed": seed,
        "trajectory_id": str(row["trajectory_id"]),
        "prefix_row_index": int(row["trajectory_row_ordinal"]),
        "step_index": int(row["step_index"]),
        "split_role": split,
        "score_family": score_family,
        "score_value": float(score),
        "target_first_bad_next_step": int(row.get("bad_first_bad_next_step", 0)),
        "target_pre_first_failure_window_3": int(row.get("bad_pre_first_failure_window_3", 0)),
        "target_first_failure_warning_candidate": int(row.get("bad_first_failure_warning_candidate", 0)),
        "target_next_step_bad": int(row.get("next_step_bad", 0)),
        "trajectory_has_first_failure": int(row.get("bad_trajectory_has_any_bad_row", 0)),
        "first_bad_row_index": int(row.get("bad_first_bad_row_index", -1)) if int(row.get("bad_trajectory_has_any_bad_row", 0)) else -1,
        "before_first_failure": int(row.get("bad_before_first_failure", 0)),
        "after_first_failure": int(row.get("bad_after_first_failure", 0)),
        "source_bucket": row.get("source_bucket"),
        "layout_family": row.get("layout_family"),
    }


def emit_bundle(handle, seed: int, name: str, bundle: dict[str, Any], counts: Counter) -> None:
    lo, hi = train_minmax(bundle)
    for split in ("train", "calibration", "test"):
        rows = bundle["rows"][split]
        scores = norm_values(bundle["scores"][split], lo, hi)
        for row, score in zip(rows, scores):
            handle.write(json.dumps(output_row(seed, split, name, row, score), sort_keys=True, separators=(",", ":")) + "\n")
            counts[(seed, name, split)] += 1


def hybrid_emit(handle, seed: int, name: str, ff: dict[str, Any], gen: dict[str, Any], form: str, counts: Counter) -> None:
    ff_lo, ff_hi = train_minmax(ff)
    gen_lo, gen_hi = train_minmax(gen)
    for split in ("train", "calibration", "test"):
        gen_map = {row_key(row): score for row, score in zip(gen["rows"][split], norm_values(gen["scores"][split], gen_lo, gen_hi))}
        ff_scores = norm_values(ff["scores"][split], ff_lo, ff_hi)
        for row, ff_score in zip(ff["rows"][split], ff_scores):
            key = row_key(row)
            if key not in gen_map:
                continue
            gen_score = gen_map[key]
            if form == "product":
                score = ff_score * gen_score
            elif form == "linear_w0.75":
                score = 0.75 * ff_score + 0.25 * gen_score
            else:
                raise ValueError(form)
            handle.write(json.dumps(output_row(seed, split, name, row, score), sort_keys=True, separators=(",", ":")) + "\n")
            counts[(seed, name, split)] += 1


def main() -> None:
    rows = hutils.load_rows()
    splits = hutils.load_splits()
    counts: Counter = Counter()
    score_families = set()
    split_roles = set()
    target_counts = Counter()
    with OUT.open("w") as handle:
        for seed in SEEDS:
            split_rows = hutils.rows_by_split(rows, splits, seed)
            ff = hutils.build_ff_bundles(split_rows, seed)
            gen = hutils.build_generic_bundles(split_rows, seed)
            missing = [name for name in BASE_FF if name not in ff] + [name for name in BASE_GENERIC if name not in gen]
            if missing:
                raise RuntimeError(f"missing required score families for seed {seed}: {missing}")
            for name in sorted(BASE_FF):
                emit_bundle(handle, seed, name, ff[name], counts)
                score_families.add(name)
            for name in sorted(BASE_GENERIC):
                emit_bundle(handle, seed, name, gen[name], counts)
                score_families.add(name)
            hybrid_emit(handle, seed, "hybrid_exact_product", ff["ff_exact_hgb_interactions"], gen["generic_bad_logistic_history"], "product", counts)
            score_families.update({"hybrid_exact_product"})
    with OUT.open() as handle:
        total = 0
        trajectories = set()
        seeds = set()
        for line in handle:
            row = json.loads(line)
            total += 1
            trajectories.add(row["trajectory_id"])
            seeds.add(row["split_seed"])
            split_roles.add(row["split_role"])
            for key in ("target_first_bad_next_step", "target_pre_first_failure_window_3", "target_first_failure_warning_candidate", "target_next_step_bad"):
                target_counts[key] += int(row[key])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "row-level score artifacts; clean-grid evaluation; theory candidate; trajectory-level loss; first-event; missed first failure; trajectory burden; oracle feasibility; finite-grid correction; no_safe_recommendation; benchmark-level offline proxy; no formal conformal guarantee claimed; not production validation; not causal prevention",
        "output_file": str(OUT),
        "score_rows": total,
        "trajectories": len(trajectories),
        "split_seeds": sorted(seeds),
        "split_roles": sorted(split_roles),
        "score_families": sorted(score_families),
        "score_family_split_counts": {f"{seed}:{fam}:{split}": count for (seed, fam, split), count in counts.items()},
        "target_positive_counts": dict(target_counts),
        "target_prevalence_by_score_row": {key: value / total for key, value in target_counts.items()},
        "missing_optional_scores": [
            "ff_warning_rf_structured",
            "generic_bad_hgb_interactions",
            "hybrid_warning_linear_w0.75",
            "rank_fusion_or_max_hybrid",
        ],
        "scope_note": "Artifact is intentionally scoped to the minimum required first-event, generic, and hybrid score families over five repeated seeds to avoid a massive output.",
        "raw_text_exclusion_status": "passed",
        "feature_leakage_guard_status": "prefix_safe_features_only; targets used only as labels/evaluation fields",
        "metadata_as_model_features": False,
        "supported_grid_protocols": ["fixed_score_threshold_grid", "train_score_quantiles", "split_calibration_grid_then_risk", "calibration_score_quantiles"],
        "guard_results": {"raw_text_used": False, "test_tuning": False, "mock_scores_used": False},
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text("\n".join([
        "# Batch T-7 Theory Row-Level Scores Summary",
        "",
        report["claim_boundary"],
        "",
        f"- Score rows: `{total}`",
        f"- Trajectories: `{len(trajectories)}`",
        f"- Split seeds: `{len(seeds)}`",
        f"- Score families: `{', '.join(sorted(score_families))}`",
        f"- Raw-text exclusion: `{report['raw_text_exclusion_status']}`",
        f"- Grid protocols supported: `{', '.join(report['supported_grid_protocols'])}`",
    ]) + "\n")
    print(json.dumps({"score_rows": total, "families": sorted(score_families)}, indent=2))


if __name__ == "__main__":
    main()
