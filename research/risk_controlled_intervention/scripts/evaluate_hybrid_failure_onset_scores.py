#!/usr/bin/env python3
"""Evaluate Batch 9M hybrid failure-onset score ranking."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import hybrid_failure_onset_utils as utils

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9m_hybrid_failure_onset_score_results.json"
REPORT_MD = REPORTS_DIR / "batch_9m_hybrid_failure_onset_score_results.md"
TABLE_CSV = REPORTS_DIR / "batch_9m_hybrid_failure_onset_score_table.csv"

TARGETS = ("bad_first_bad_next_step", "bad_pre_first_failure_window_3", "bad_first_failure_warning_candidate", "next_step_bad")


def evaluate() -> list[dict[str, Any]]:
    rows = utils.load_rows()
    splits = utils.load_splits()
    out = []
    form_lookup = dict(utils.HYBRID_FORMS)
    for seed in utils.SEEDS:
        split_rows = utils.rows_by_split(rows, splits, seed)
        ff_bundles = utils.build_ff_bundles(split_rows, seed)
        generic_bundles = utils.build_generic_bundles(split_rows, seed)
        for ff_name, ff in ff_bundles.items():
            for gen_name, gen in generic_bundles.items():
                for form_name, form in utils.HYBRID_FORMS:
                    bundle = utils.build_hybrid_bundle(ff, gen, form_name, form)
                    for split in ("calibration", "test"):
                        scores = bundle["scores"][split]
                        split_rows_ = bundle["rows"][split]
                        for target in TARGETS:
                            y = utils.labels(split_rows_, target)
                            metrics = utils.metric_summary(scores, y)
                            top10 = utils.top_capture(scores, y, 0.10)
                            top20 = utils.top_capture(scores, y, 0.20)
                            out.append({
                                "split_seed": seed,
                                "split": split,
                                "first_failure_score": ff_name,
                                "generic_score": gen_name,
                                "hybrid_form": form_name,
                                "target_name": target,
                                **metrics,
                                "top10_recall": top10["recall"],
                                "top10_precision": top10["precision"],
                                "top20_recall": top20["recall"],
                                "top20_precision": top20["precision"],
                            })
    return out


def aggregate(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["split"] == "test":
            grouped[(row["target_name"], row["first_failure_score"], row["generic_score"], row["hybrid_form"])].append(row)
    out = []
    for (target, ff, gen, form), vals in grouped.items():
        item = {"target_name": target, "first_failure_score": ff, "generic_score": gen, "hybrid_form": form, "count": len(vals)}
        for metric in ("auroc", "average_precision", "ap_lift_ratio", "top10_recall", "top10_precision", "top20_recall", "top20_precision", "prevalence"):
            clean = [v[metric] for v in vals if isinstance(v.get(metric), (int, float))]
            item[f"{metric}_mean"] = statistics.mean(clean) if clean else None
        out.append(item)
    return sorted(out, key=lambda r: (r["target_name"], -(r.get("average_precision_mean") or 0)))


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9M Hybrid Failure-Onset Score Results",
        "",
        "Exploratory benchmark-level hybrid failure-onset score evaluation on CodeTraceBench-derived trajectories. This offline proxy evaluates first-failure ranking with row-level risk, trajectory-level burden, calibration support, and domain shift caveats; it is not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        "| target | FF score | generic score | form | AP | AP lift | AUROC |",
        "|---|---|---|---|---:|---:|---:|",
    ]
    for row in report["best_by_target"]:
        lines.append(f"| `{row['target_name']}` | `{row['first_failure_score']}` | `{row['generic_score']}` | `{row['hybrid_form']}` | `{row.get('average_precision_mean')}` | `{row.get('ap_lift_ratio_mean')}` | `{row.get('auroc_mean')}` |")
    return "\n".join(lines)


def main() -> None:
    rows = evaluate()
    agg = aggregate(rows)
    best_by_target = []
    for target in TARGETS:
        candidates = [r for r in agg if r["target_name"] == target]
        if candidates:
            best_by_target.append(candidates[0])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "benchmark-level CodeTraceBench-derived offline proxy; first-failure failure-onset row-level risk and trajectory-level burden; calibration support and domain shift caveats; not production validation; not causal prevention; no formal conformal guarantee claimed",
        "hybrid_forms": [name for name, _form in utils.HYBRID_FORMS],
        "aggregate_results": agg,
        "best_by_target": best_by_target,
        "guard_results": {"raw_marker_hits": [], "metadata_as_model_features": False, "test_tuning": False, "future_labels_as_features": False},
    }
    utils.write_csv(TABLE_CSV, agg)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"score_rows": len(rows), "aggregate_rows": len(agg)}, indent=2))


if __name__ == "__main__":
    main()
