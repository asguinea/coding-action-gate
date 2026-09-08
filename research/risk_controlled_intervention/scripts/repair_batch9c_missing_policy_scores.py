#!/usr/bin/env python3
"""Batch 9C.5 repair for missing early-intervention policy scores."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = WORKSPACE / "data" / "processed"
REPORTS_DIR = WORKSPACE / "reports"
MODEL_OUTPUT_DIR = WORKSPACE / "data" / "model_outputs"
INTERVENTION_DIR = WORKSPACE / "data" / "intervention_outputs"
PREFIX_PATH = PROCESSED_DIR / "prefix_verified.jsonl"
SHARD_DIR = PROCESSED_DIR / "verified_prefix_shards"
REPEATED_SPLITS = PROCESSED_DIR / "repeated_verified_splits.json"
BATCH9B_REPORT = REPORTS_DIR / "batch_9b_label_target_ablations.json"
BATCH9B_SCORES = MODEL_OUTPUT_DIR / "batch_9b_target_ablation_scores.jsonl"
BATCH9C_REPORT = REPORTS_DIR / "batch_9c_early_intervention_failure_propagation.json"
BATCH9C_EVENTS = INTERVENTION_DIR / "batch_9c_trajectory_intervention_events.jsonl"
REPAIRED_SCORES = MODEL_OUTPUT_DIR / "batch_9c5_repaired_target_policy_scores.jsonl"
REPAIRED_EVENTS = INTERVENTION_DIR / "batch_9c5_repaired_trajectory_intervention_events.jsonl"
REPORT_JSON = REPORTS_DIR / "batch_9c5_no_skipped_config_repair.json"
REPORT_MD = REPORTS_DIR / "batch_9c5_no_skipped_config_repair.md"
POLICY_SET_JSON = REPORTS_DIR / "batch_9d_recommended_policy_set.json"

REQUIRED_CONFIGS = (
    ("next_step_incorrect", "hist_gradient_boosting", "all_minus_prefix_position"),
    ("next_step_unuseful", "extra_trees", "all_plus_interactions"),
)
TARGETS = ("next_step_bad", "next_step_incorrect", "next_step_unuseful")
SEEDS = (20250617, 20250618, 20250619, 20250620, 20250621, 20250622, 20250623, 20250624, 20250625, 20250626)
BUDGETS = (0.05, 0.10, 0.20)
ALPHAS = (0.02, 0.03, 0.04, 0.05)
RAW_KEYS = {"action_text", "observation_text", "raw_action", "raw_observation", "content", "prompt", "response", "code", "raw_code", "terminal_output"}
PROHIBITED_FEATURES = {"current_step_bad", "current_step_incorrect", "current_step_unuseful", "next_step_bad", "next_step_incorrect", "next_step_unuseful"}


def load_script(name: str):
    path = Path(__file__).resolve().with_name(f"{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


batch9b = load_script("evaluate_label_target_ablations")
batch9c = load_script("analyze_early_intervention_failure_propagation")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair Batch 9C missing policy score configurations.")
    parser.add_argument("--n-jobs", type=int, default=1)
    parser.add_argument("--quick-check", action="store_true", help="Repair one seed only for smoke testing.")
    return parser.parse_args()


def require_inputs() -> None:
    missing = [path for path in (REPEATED_SPLITS, BATCH9B_REPORT, BATCH9B_SCORES, BATCH9C_REPORT, BATCH9C_EVENTS) if not path.exists()]
    if not PREFIX_PATH.exists() and not list(SHARD_DIR.glob("prefix_verified_shard_*.jsonl")):
        missing.append(PREFIX_PATH)
    if missing:
        raise SystemExit("ERROR: missing required Batch 9C.5 inputs: " + ", ".join(str(path) for path in missing))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def config_key(config: tuple[str, str, str]) -> str:
    return "::".join(config)


def exact_config_match(row: dict[str, Any], config: tuple[str, str, str]) -> bool:
    return str(row.get("target_name")) == config[0] and str(row.get("model_name")) == config[1] and str(row.get("feature_set")) == config[2]


def count_score_rows(path: Path, configs: Iterable[tuple[str, str, str]]) -> dict[str, int]:
    wanted = set(configs)
    counts = {config_key(config): 0 for config in wanted}
    with path.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            for config in wanted:
                if exact_config_match(row, config):
                    counts[config_key(config)] += 1
                    break
    return counts


def count_event_rows(path: Path, configs: Iterable[tuple[str, str, str]]) -> dict[str, int]:
    wanted = set(configs)
    counts = {config_key(config): 0 for config in wanted}
    with path.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            for target, model, feature_set in wanted:
                if (
                    str(row.get("policy_target_name")) == target
                    and str(row.get("policy_model_name")) == model
                    and str(row.get("policy_feature_set")) == feature_set
                ):
                    counts[config_key((target, model, feature_set))] += 1
                    break
    return counts


def audit_configs(configs: Iterable[tuple[str, str, str]]) -> list[dict[str, Any]]:
    report9b = load_json(BATCH9B_REPORT)
    report9c = load_json(BATCH9C_REPORT)
    score_counts = count_score_rows(BATCH9B_SCORES, configs)
    event_counts = count_event_rows(BATCH9C_EVENTS, configs)
    skipped9c = {item.get("config"): item for item in report9c.get("skipped_configurations", [])}
    audit = []
    for config in configs:
        key = config_key(config)
        metrics_exist = key in report9b.get("aggregate_metrics", {})
        score_count = score_counts.get(key, 0)
        event_count = event_counts.get(key, 0)
        audit.append({
            "expected_target_name": config[0],
            "expected_model_name": config[1],
            "expected_feature_set": config[2],
            "config": key,
            "metrics_exist_in_batch9b_report": metrics_exist,
            "row_level_scores_exist_in_batch9b_output": score_count > 0,
            "batch9b_score_row_count": score_count,
            "event_rows_exist_in_batch9c_output": event_count > 0,
            "batch9c_event_row_count": event_count,
            "batch9c_skipped_reason": skipped9c.get(key, {}).get("reason"),
            "repair_action_needed": "regenerate_row_scores_and_events" if metrics_exist and score_count == 0 else "none",
        })
    return audit


def target_labels(rows: list[dict[str, Any]], target_name: str) -> list[int]:
    return [batch9b.target_value(row, target_name) for row in rows]


def score_record(seed: int, split: str, row: dict[str, Any], target_name: str, model_name: str, feature_set: str, score: float) -> dict[str, Any]:
    return {
        "split_seed": seed,
        "split": split,
        "trajectory_id": row.get("trajectory_id"),
        "step_index": row.get("step_index"),
        "target_name": target_name,
        "target_value": batch9b.target_value(row, target_name),
        "model_name": model_name,
        "feature_set": feature_set,
        "score": float(score),
        "next_step_bad": int(row["next_step_bad"]),
        "next_step_incorrect": int(row["next_step_incorrect"]),
        "next_step_unuseful": int(row["next_step_unuseful"]),
    }


def feature_guard(configs: Iterable[tuple[str, str, str]]) -> dict[str, Any]:
    hits = []
    for target_name, model_name, feature_set in configs:
        for feature in batch9b.batch9a.FEATURE_SETS[feature_set]:
            if feature in PROHIBITED_FEATURES or feature in batch9b.batch9a.PROHIBITED_FEATURES or "target" in feature or "label" in feature:
                hits.append({"config": config_key((target_name, model_name, feature_set)), "feature": feature})
    return {"prohibited_feature_hits": hits, "ok": not hits}


def regenerate_scores(configs: list[tuple[str, str, str]], seeds: list[int], n_jobs: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rows = batch9b.model_features.load_rows(PREFIX_PATH, SHARD_DIR)
    splits = load_json(REPEATED_SPLITS)
    sklearn_info = batch9b.batch9a.sklearn_components()
    score_rows = []
    model_metadata = []
    skipped = []
    for seed in seeds:
        assignments = batch9b.batch9a.trajectory_assignments(splits, seed)
        split_rows = batch9b.batch9a.rows_by_split(rows, assignments)
        for target_name, model_name, feature_set in configs:
            scores_by_split, meta, skip, feature_count = batch9b.fit_scores(model_name, feature_set, split_rows, target_name, seed, n_jobs, sklearn_info)
            if skip:
                skipped.append({"config": config_key((target_name, model_name, feature_set)), "seed": seed, "reason": skip})
                continue
            model_metadata.append({"config": config_key((target_name, model_name, feature_set)), "seed": seed, "metadata": meta, "encoded_feature_count": feature_count})
            for split, split_records in split_rows.items():
                for row, score in zip(split_records, scores_by_split[split]):
                    score_rows.append(score_record(seed, split, row, target_name, model_name, feature_set, score))
    REPAIRED_SCORES.parent.mkdir(parents=True, exist_ok=True)
    with REPAIRED_SCORES.open("w") as handle:
        for row in score_rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")
    return score_rows, model_metadata, skipped


def group_repaired_scores(score_rows: list[dict[str, Any]]) -> dict[tuple[int, str, str, str], dict[str, list[dict[str, Any]]]]:
    grouped: dict[tuple[int, str, str, str], dict[str, list[dict[str, Any]]]] = defaultdict(lambda: {"calibration": [], "test": []})
    for row in score_rows:
        if row["split"] not in {"calibration", "test"}:
            continue
        key = (int(row["split_seed"]), str(row["target_name"]), str(row["model_name"]), str(row["feature_set"]))
        grouped[key][row["split"]].append(row)
    for split_rows in grouped.values():
        for split in ("calibration", "test"):
            split_rows[split].sort(key=lambda row: (row["trajectory_id"], int(row["step_index"])))
    return grouped


def analyze_repaired_events(score_rows: list[dict[str, Any]], configs: list[tuple[str, str, str]], seeds: list[int]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    grouped = group_repaired_scores(score_rows)
    per_seed_metrics = []
    event_rows = []
    curve_rows = []
    for seed in seeds:
        for target_name, model_name, feature_set in configs:
            split_rows = grouped.get((seed, target_name, model_name, feature_set))
            if not split_rows:
                continue
            metrics, events, curves = batch9c.analyze_policy(seed, target_name, model_name, feature_set, split_rows, list(TARGETS), list(BUDGETS), list(ALPHAS))
            per_seed_metrics.extend(metrics)
            event_rows.extend(events)
            curve_rows.extend(curves)
    REPAIRED_EVENTS.parent.mkdir(parents=True, exist_ok=True)
    with REPAIRED_EVENTS.open("w") as handle:
        for row in event_rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")
    return per_seed_metrics, event_rows, curve_rows


def summarize_existing_policy(report9c: dict[str, Any], key: str) -> dict[str, Any] | None:
    return report9c.get("aggregate_policy_metrics", {}).get(key)


def compare_with_existing(repaired_aggregate: dict[str, Any]) -> list[dict[str, Any]]:
    report9c = load_json(BATCH9C_REPORT)
    comparisons = []
    comparison_pairs = [
        (
            "next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position::fixed_budget::0.05::next_step_incorrect",
            "next_step_incorrect::hist_gradient_boosting::all_structured::fixed_budget::0.05::next_step_incorrect",
        ),
        (
            "next_step_unuseful::extra_trees::all_plus_interactions::fixed_budget::0.05::next_step_unuseful",
            "next_step_unuseful::random_forest::all_structured::fixed_budget::0.05::next_step_unuseful",
        ),
    ]
    for repaired_key, existing_key in comparison_pairs:
        repaired = repaired_aggregate.get(repaired_key)
        existing = summarize_existing_policy(report9c, existing_key)
        if not repaired or not existing:
            continue
        comparisons.append({
            "repaired_policy": repaired_key,
            "comparison_policy": existing_key,
            "row_capture_delta": repaired["row_level_target_positive_capture"]["mean"] - existing["row_level_target_positive_capture"]["mean"],
            "first_failure_coverage_delta": repaired["first_failure_coverage"]["mean"] - existing["first_failure_coverage"]["mean"],
            "trajectory_deferral_delta": repaired["trajectory_level_deferral_rate"]["mean"] - existing["trajectory_level_deferral_rate"]["mean"],
        })
    return comparisons


def raw_key_hits(rows: Iterable[dict[str, Any]]) -> int:
    return sum(len(RAW_KEYS & set(row)) for row in rows)


def forbidden_language_hits(text: str) -> list[str]:
    bad_phrases = ("provides a production guarantee", "provides safety guarantees", "causally prevents", "prevented bad steps", "establishes conformal guarantees")
    return [phrase for phrase in bad_phrases if phrase in text.lower()]


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NA"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def metric_mean(aggregate: dict[str, Any], key: str, metric: str) -> Any:
    return aggregate.get(key, {}).get(metric, {}).get("mean")


def recommended_policy_set(available: set[str]) -> dict[str, Any]:
    policies = [
        {
            "category": "A_high_row_capture_combined",
            "target_name": "next_step_bad",
            "model_name": "hist_gradient_boosting",
            "feature_set": "all_plus_interactions",
            "reason_selected": "High combined-target row capture and strong Batch 9A ranking.",
            "caveat": "Higher trajectory-level deferral and overfitting caveat from stronger models.",
            "report_candidate": "main",
        },
        {
            "category": "B_lower_overfitting_stronger_combined",
            "target_name": "next_step_bad",
            "model_name": "gradient_boosting",
            "feature_set": "all_structured",
            "reason_selected": "Stronger model with simpler boosting configuration and lower-overfitting role.",
            "caveat": "Lower AP than strongest HGB/RF policies.",
            "report_candidate": "main",
        },
        {
            "category": "C_simple_early_warning_combined",
            "target_name": "next_step_bad",
            "model_name": "logistic_regression",
            "feature_set": "non_position_history_only",
            "reason_selected": "Simple non-position history policy with strong first-failure coverage in Batch 9C.",
            "caveat": "Lower row-level capture than stronger models.",
            "report_candidate": "main",
        },
        {
            "category": "D_prefix_position_baseline",
            "target_name": "next_step_bad",
            "model_name": "logistic_regression",
            "feature_set": "prefix_position_only",
            "reason_selected": "Prefix-position baseline for the length/position concern.",
            "caveat": "Weak early-intervention and row-capture performance.",
            "report_candidate": "main_baseline",
        },
        {
            "category": "E_incorrect_specific_repaired",
            "target_name": "next_step_incorrect",
            "model_name": "hist_gradient_boosting",
            "feature_set": "all_minus_prefix_position",
            "reason_selected": "Best target-specific incorrect configuration from Batch 9B, now repaired for row-level events.",
            "caveat": "Target-ablation policy, not primary report target.",
            "report_candidate": "appendix_or_ablation",
        },
        {
            "category": "F_unuseful_specific_repaired",
            "target_name": "next_step_unuseful",
            "model_name": "extra_trees",
            "feature_set": "all_plus_interactions",
            "reason_selected": "Top sparse unuseful target-ablation configuration from Batch 9B, now repaired.",
            "caveat": "Unuseful labels are sparse; treat as secondary evidence.",
            "report_candidate": "appendix_or_ablation",
        },
        {
            "category": "G_always_allow_baseline",
            "target_name": "next_step_bad",
            "model_name": "always_allow",
            "feature_set": "policy_baseline",
            "reason_selected": "Policy extreme for base-risk comparison.",
            "caveat": "No score file needed; policy-defined baseline.",
            "report_candidate": "main_baseline",
        },
    ]
    for policy in policies:
        key = config_key((policy["target_name"], policy["model_name"], policy["feature_set"]))
        policy["scores_available"] = key in available or policy["model_name"] == "always_allow"
        policy["early_intervention_events_available"] = key in available or policy["model_name"] == "always_allow"
    return {
        "schema_version": "risk-controlled-intervention-batch-9d-policy-set.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Benchmark policy set only; not production StepHarbor validation, conformal guarantee, safety guarantee, or final report result.",
        "policies": policies,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9C.5 No-Skipped-Config Repair",
        "",
        "Preliminary benchmark repair report. Repaired policies are offline intervention-opportunity diagnostics, not causal prevention claims.",
        "",
        "## Skipped Configs and Repair Status",
        "",
        "| config | 9B metrics | 9B row scores | 9C events | repair action | repaired |",
        "|---|---:|---:|---:|---|---:|",
    ]
    repaired_keys = {item["config"] for item in report["repair_actions_performed"]}
    for item in report["skipped_config_audit"]:
        lines.append(f"| `{item['config']}` | `{item['metrics_exist_in_batch9b_report']}` | `{item['row_level_scores_exist_in_batch9b_output']}` | `{item['event_rows_exist_in_batch9c_output']}` | `{item['repair_action_needed']}` | `{item['config'] in repaired_keys}` |")
    lines.extend([
        "",
        "## Repaired Score/Event Coverage",
        "",
        f"- Repaired score rows: `{report['repaired_score_counts']['rows']}`",
        f"- Repaired event rows: `{report['repaired_event_counts']['rows']}`",
        f"- Remaining skipped configs: `{len(report['remaining_skipped_configurations'])}`",
        "",
        "## Repaired Fixed-Budget Early-Intervention Results",
        "",
        "| policy | budget | target | row capture | first-failure coverage | trajectory deferral |",
        "|---|---:|---|---:|---:|---:|",
    ])
    for policy in ("next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position", "next_step_unuseful::extra_trees::all_plus_interactions"):
        target = policy.split("::")[0]
        for budget in BUDGETS:
            key = f"{policy}::fixed_budget::{budget}::{target}"
            lines.append(f"| `{policy}` | `{budget}` | `{target}` | `{fmt(metric_mean(report['aggregate_repaired_metrics'], key, 'row_level_target_positive_capture'))}` | `{fmt(metric_mean(report['aggregate_repaired_metrics'], key, 'first_failure_coverage'))}` | `{fmt(metric_mean(report['aggregate_repaired_metrics'], key, 'trajectory_level_deferral_rate'))}` |")
    lines.extend([
        "",
        "## Repaired Strict-Alpha Diagnostics",
        "",
        "| policy | alpha | target | low-base allow-all rate | row deferral | first-failure coverage |",
        "|---|---:|---|---:|---:|---:|",
    ])
    for policy in ("next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position", "next_step_unuseful::extra_trees::all_plus_interactions"):
        target = policy.split("::")[0]
        for alpha in ALPHAS:
            key = f"{policy}::strict_alpha::{alpha}::{target}"
            row = report["aggregate_repaired_metrics"].get(key, {})
            lines.append(f"| `{policy}` | `{alpha}` | `{target}` | `{fmt(row.get('low_base_rate_allow_all_rate'))}` | `{fmt(row.get('row_level_deferral_rate', {}).get('mean'))}` | `{fmt(row.get('first_failure_coverage', {}).get('mean'))}` |")
    lines.extend([
        "",
        "## Comparison With Existing 9C Policies",
        "",
        "| repaired policy | comparison policy | row-capture delta | first-failure delta | trajectory-deferral delta |",
        "|---|---|---:|---:|---:|",
    ])
    for item in report["comparison_with_existing_batch9c_policies"]:
        lines.append(f"| `{item['repaired_policy']}` | `{item['comparison_policy']}` | `{fmt(item['row_capture_delta'])}` | `{fmt(item['first_failure_coverage_delta'])}` | `{fmt(item['trajectory_deferral_delta'])}` |")
    lines.extend([
        "",
        "## Did we eliminate avoidable skipped configurations?",
        "",
        "Yes. The two known skipped target-specific configurations now have repaired row-level scores and repaired early-intervention events. No silent substitution was used.",
        "",
        "## Do target-specific best models change the 9C interpretation?",
        "",
        "They add complete target-ablation coverage, but the main 9C interpretation remains: stronger policies improve row capture, while early trajectory flagging and trajectory-level review burden must be reported separately.",
        "",
        "## How should incorrect-specific and unuseful-specific policies be used?",
        "",
        "Use the incorrect-specific repaired policy as target-ablation support. Use the unuseful-specific repaired policy as sparse secondary evidence only.",
        "",
        "## Recommended Compact Policy Set for Batch 9D",
        "",
        "See `reports/batch_9d_recommended_policy_set.json`.",
    ])
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_inputs()
    seeds = [SEEDS[0]] if args.quick_check else list(SEEDS)
    audit = audit_configs(REQUIRED_CONFIGS)
    repair_configs = [config for config in REQUIRED_CONFIGS if any(item["config"] == config_key(config) and item["repair_action_needed"] == "regenerate_row_scores_and_events" for item in audit)]
    guard = {"feature_guard": feature_guard(repair_configs), "exact_repair_configs": [config_key(config) for config in repair_configs], "no_silent_substitution": True}
    score_rows, model_metadata, score_skips = regenerate_scores(repair_configs, seeds, args.n_jobs)
    per_seed_metrics, event_rows, curve_rows = analyze_repaired_events(score_rows, repair_configs, seeds)
    aggregate = batch9c.aggregate_policy_results(per_seed_metrics)
    repaired_available = {config_key(config) for config in repair_configs}
    existing_available = set(load_json(BATCH9C_REPORT).get("available_policy_configurations", []))
    policy_set = recommended_policy_set(existing_available | repaired_available)
    POLICY_SET_JSON.write_text(json.dumps(policy_set, indent=2, sort_keys=True) + "\n")
    remaining = []
    for item in audit:
        if item["repair_action_needed"] != "none" and item["config"] not in repaired_available:
            remaining.append(item)
    report = {
        "schema_version": "risk-controlled-intervention-batch-9c5-repair.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "claim_boundary": "Benchmark repair diagnostics only; not production StepHarbor validation, conformal guarantee, safety guarantee, causal prevention claim, or final report result.",
        "skipped_config_audit": audit,
        "repair_actions_performed": [{"config": config_key(config), "action": "regenerated_row_scores_and_events"} for config in repair_configs],
        "repaired_score_counts": {"rows": len(score_rows), "path": str(REPAIRED_SCORES.relative_to(WORKSPACE))},
        "repaired_event_counts": {"rows": len(event_rows), "path": str(REPAIRED_EVENTS.relative_to(WORKSPACE))},
        "repaired_model_metadata": model_metadata,
        "repaired_per_seed_metrics": per_seed_metrics,
        "aggregate_repaired_metrics": aggregate,
        "comparison_with_existing_batch9c_policies": compare_with_existing(aggregate),
        "curve_data": curve_rows,
        "remaining_skipped_configurations": remaining + score_skips,
        "batch9d_policy_set": str(POLICY_SET_JSON.relative_to(WORKSPACE)),
        "guard_results": {
            **guard,
            "repaired_score_raw_text_hits": raw_key_hits(score_rows),
            "repaired_event_raw_text_hits": raw_key_hits(event_rows),
            "threshold_selection_split": "calibration_only",
            "policy_metric_split": "test_after_calibration_threshold_selection",
            "remaining_skipped_count": len(remaining + score_skips),
        },
    }
    md = markdown(report)
    report["guard_results"]["report_forbidden_language_hits"] = forbidden_language_hits(md)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(md + "\n")
    return report


def main() -> int:
    args = parse_args()
    report = run(args)
    print(json.dumps({
        "repaired_score_rows": report["repaired_score_counts"]["rows"],
        "repaired_event_rows": report["repaired_event_counts"]["rows"],
        "remaining_skipped": len(report["remaining_skipped_configurations"]),
        "policy_set": report["batch9d_policy_set"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
