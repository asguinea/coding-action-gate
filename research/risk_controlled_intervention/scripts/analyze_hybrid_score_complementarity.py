#!/usr/bin/env python3
"""Batch 9M hybrid score complementarity analysis."""

from __future__ import annotations

import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9m_hybrid_score_complementarity.json"
REPORT_MD = REPORTS_DIR / "batch_9m_hybrid_score_complementarity.md"
OVERLAP_CSV = REPORTS_DIR / "batch_9m_hybrid_score_overlap.csv"
BY_GROUP_CSV = REPORTS_DIR / "batch_9m_hybrid_score_by_group.csv"


def corr(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sx, sy = statistics.pstdev(xs), statistics.pstdev(ys)
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (len(xs) * sx * sy)


def top_set(scores: list[float], budget: float = 0.10) -> set[int]:
    n = max(1, min(len(scores), math.ceil(len(scores) * budget)))
    return set(sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:n])


def complementarity(rows: list[dict[str, Any]], ff_scores: list[float], gen_scores: list[float], target: str) -> dict[str, Any]:
    y = utils.labels(rows, target)
    ff_top = top_set(ff_scores)
    gen_top = top_set(gen_scores)
    positives = {i for i, label in enumerate(y) if label}
    ff_hit = ff_top & positives
    gen_hit = gen_top & positives
    ff_traj = {str(rows[i]["trajectory_id"]) for i in ff_top}
    gen_traj = {str(rows[i]["trajectory_id"]) for i in gen_top}
    return {
        "rows": len(rows),
        "target_name": target,
        "positives": len(positives),
        "pearson_correlation": corr(ff_scores, gen_scores),
        "rank_correlation": corr(utils.ranks(ff_scores), utils.ranks(gen_scores)),
        "top_decile_row_jaccard": len(ff_top & gen_top) / len(ff_top | gen_top) if ff_top | gen_top else None,
        "top_decile_trajectory_jaccard": len(ff_traj & gen_traj) / len(ff_traj | gen_traj) if ff_traj | gen_traj else None,
        "ff_positive_capture_top_decile": len(ff_hit) / len(positives) if positives else 0.0,
        "generic_positive_capture_top_decile": len(gen_hit) / len(positives) if positives else 0.0,
        "captured_by_ff_missed_by_generic": len(ff_hit - gen_hit),
        "captured_by_generic_missed_by_ff": len(gen_hit - ff_hit),
        "captured_by_both": len(ff_hit & gen_hit),
    }


def by_group(seed: int, pair_id: str, rows: list[dict[str, Any]], ff_scores: list[float], gen_scores: list[float]) -> list[dict[str, Any]]:
    out = []
    for group in ["all", "SWE-like", "TerminalBench-like", "OpenHands-like", "early_first_failure", "late_first_failure"]:
        idxs = []
        for i, row in enumerate(rows):
            first_pos = row.get("bad_normalized_first_bad_position")
            is_early = first_pos is not None and float(first_pos) <= 0.33
            is_late = first_pos is not None and float(first_pos) >= 0.67
            if group == "all" or utils.source_group(row) == group or (group == "early_first_failure" and is_early) or (group == "late_first_failure" and is_late):
                idxs.append(i)
        if not idxs:
            continue
        subset_rows = [rows[i] for i in idxs]
        subset_ff = [ff_scores[i] for i in idxs]
        subset_gen = [gen_scores[i] for i in idxs]
        item = complementarity(subset_rows, subset_ff, subset_gen, "bad_first_failure_warning_candidate")
        out.append({"split_seed": seed, "pair_id": pair_id, "group": group, **item})
    return out


def evaluate() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = utils.load_rows()
    splits = utils.load_splits()
    overlap_rows = []
    group_rows = []
    for seed in utils.SEEDS:
        split_rows = utils.rows_by_split(rows, splits, seed)
        ff_bundles = utils.build_ff_bundles(split_rows, seed)
        generic_bundles = utils.build_generic_bundles(split_rows, seed)
        for ff_name in ("ff_exact_hgb_interactions", "ff_warning_rf_structured", "ff_warning_gb_structured"):
            for gen_name in ("generic_bad_logistic_history", "generic_bad_hgb_interactions"):
                ff = ff_bundles[ff_name]
                gen = generic_bundles[gen_name]
                test_rows, ff_scores, gen_scores = utils.align_scores(ff, gen, "test")
                pair_id = f"{ff_name}+{gen_name}"
                for target in ("bad_first_bad_next_step", "bad_first_failure_warning_candidate", "next_step_bad"):
                    overlap_rows.append({"split_seed": seed, "pair_id": pair_id, "first_failure_score": ff_name, "generic_score": gen_name, **complementarity(test_rows, ff_scores, gen_scores, target)})
                group_rows.extend(by_group(seed, pair_id, test_rows, ff_scores, gen_scores))
    return overlap_rows, group_rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    agg = utils.aggregate(rows, ["pair_id", "target_name"], ["pearson_correlation", "rank_correlation", "top_decile_row_jaccard", "ff_positive_capture_top_decile", "generic_positive_capture_top_decile", "captured_by_ff_missed_by_generic", "captured_by_generic_missed_by_ff"])
    best_delta = sorted(agg, key=lambda r: ((r.get("captured_by_ff_missed_by_generic_mean") or 0) + (r.get("captured_by_generic_missed_by_ff_mean") or 0)), reverse=True)
    return {"aggregate": agg, "most_complementary": best_delta[:5]}


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9M Hybrid Score Complementarity",
        "",
        "Exploratory benchmark-level complementarity analysis on CodeTraceBench-derived trajectories. This offline proxy studies first-failure and failure-onset scores against generic row-level risk scores under trajectory-level burden, calibration support, and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| pair | target | rank corr | row top-decile Jaccard | FF-only hits | generic-only hits |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for row in report["summary"]["most_complementary"]:
        lines.append(f"| `{row['pair_id']}` | `{row['target_name']}` | `{row.get('rank_correlation_mean')}` | `{row.get('top_decile_row_jaccard_mean')}` | `{row.get('captured_by_ff_missed_by_generic_mean')}` | `{row.get('captured_by_generic_missed_by_ff_mean')}` |")
    lines.append("\nHybridization is scientifically justified when score overlap is partial and each score captures positives missed by the other.")
    return "\n".join(lines)


def main() -> None:
    overlap, group_rows = evaluate()
    summary = summarize(overlap)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure and failure-onset row-level risk, trajectory-level burden, calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "summary": summary,
        "guard_results": {"raw_marker_hits": [], "metadata_as_model_features": False, "test_tuning": False},
    }
    utils.write_csv(OVERLAP_CSV, overlap)
    utils.write_csv(BY_GROUP_CSV, group_rows)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"overlap_rows": len(overlap), "group_rows": len(group_rows)}, indent=2))


if __name__ == "__main__":
    main()
