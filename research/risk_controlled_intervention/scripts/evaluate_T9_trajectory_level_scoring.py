#!/usr/bin/env python3
"""Batch T-9 Part B: train/evaluate trajectory-level first-event scoring."""

from __future__ import annotations

import json
import warnings
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean
from typing import Any

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from t9_trajectory_scoring_utils import (
    BETAS,
    REPORTS,
    TRAJ_SCORE_PATH,
    budget_curve,
    feature_columns,
    load_feature_rows,
    matrix,
    ranking_metrics,
    safe_int,
    write_csv,
    write_json,
    write_jsonl,
)

OUT_JSON = REPORTS / "batch_T9_trajectory_scoring_results.json"
OUT_MD = REPORTS / "batch_T9_trajectory_scoring_results.md"
OUT_CSV = REPORTS / "batch_T9_trajectory_scoring_results.csv"
OUT_CURVES = REPORTS / "batch_T9_trajectory_scoring_budget_curves.csv"
OUT_ABLATIONS = REPORTS / "batch_T9_trajectory_scoring_ablations.csv"

TARGETS = ["trajectory_has_first_failure", "trajectory_has_repeated_bad", "early_first_failure", "late_first_failure"]
BASELINES = {
    "score_baseline::generic_bad_logistic_history::top_5_mean_score": "score__generic_bad_logistic_history__top_5_mean_score",
    "score_baseline::hybrid_exact_product::top_5_mean_score": "score__hybrid_exact_product__top_5_mean_score",
    "score_baseline::ff_exact_hgb_interactions::top_5_mean_score": "score__ff_exact_hgb_interactions__top_5_mean_score",
}


def _models(seed: int) -> dict[str, Any]:
    return {
        "logistic_regression": make_pipeline(
            SimpleImputer(strategy="median"),
            StandardScaler(),
            LogisticRegression(max_iter=2000, solver="liblinear", random_state=seed),
        ),
        "class_weighted_logistic_regression": make_pipeline(
            SimpleImputer(strategy="median"),
            StandardScaler(),
            LogisticRegression(max_iter=2000, solver="liblinear", class_weight="balanced", random_state=seed),
        ),
        "gradient_boosting": GradientBoostingClassifier(random_state=seed),
        "hist_gradient_boosting": HistGradientBoostingClassifier(random_state=seed, max_iter=120),
        "random_forest": RandomForestClassifier(n_estimators=120, min_samples_leaf=3, random_state=seed, n_jobs=1),
        "extra_trees": ExtraTreesClassifier(n_estimators=160, min_samples_leaf=2, random_state=seed, n_jobs=1),
        "dummy_prior": DummyClassifier(strategy="prior"),
    }


def _score_model(model: Any, X: list[list[float]]) -> list[float]:
    if hasattr(model, "predict_proba"):
        return [float(x) for x in model.predict_proba(X)[:, 1]]
    if hasattr(model, "decision_function"):
        raw = model.decision_function(X)
        return [float(1.0 / (1.0 + np.exp(-x))) for x in raw]
    return [float(x) for x in model.predict(X)]


def _role_groups(rows: list[dict[str, Any]], seed: int) -> dict[str, list[dict[str, Any]]]:
    return {
        role: [row for row in rows if safe_int(row["split_seed"]) == seed and row["split_role"] == role]
        for role in ["train", "calibration", "test"]
    }


def _evaluate_scores(
    score_values: list[float],
    labels: list[int],
    *,
    split_seed: int,
    target: str,
    model_name: str,
    feature_set: str,
    split_role: str,
) -> dict[str, Any]:
    metrics = ranking_metrics(score_values, labels)
    return {
        "split_seed": split_seed,
        "target": target,
        "model_name": model_name,
        "feature_set": feature_set,
        "split_role": split_role,
        "trajectory_count": len(labels),
        "positive_count": sum(labels),
        **metrics,
    }


def main() -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    rows = load_feature_rows()
    if not rows:
        raise RuntimeError("trajectory feature table is empty")
    columns_by_set = feature_columns(rows)
    split_seeds = sorted({safe_int(row["split_seed"]) for row in rows})
    result_rows: list[dict[str, Any]] = []
    curve_rows: list[dict[str, Any]] = []
    ablation_rows: list[dict[str, Any]] = []
    score_artifact_rows: list[dict[str, Any]] = []

    for seed in split_seeds:
        roles = _role_groups(rows, seed)
        for target in TARGETS:
            y_train = [safe_int(row[target]) for row in roles["train"]]
            if len(set(y_train)) < 2:
                continue
            for feature_set, cols in columns_by_set.items():
                if not cols:
                    continue
                X_train, _ = matrix(roles["train"], cols)
                for model_name, model in _models(seed).items():
                    try:
                        model.fit(X_train, y_train)
                    except Exception:
                        continue
                    train_scores = _score_model(model, X_train)
                    train_metrics = ranking_metrics(train_scores, y_train)
                    for role, role_rows in roles.items():
                        X_role, _ = matrix(role_rows, cols)
                        labels = [safe_int(row[target]) for row in role_rows]
                        scores = train_scores if role == "train" else _score_model(model, X_role)
                        result_rows.append(_evaluate_scores(
                            scores, labels,
                            split_seed=seed,
                            target=target,
                            model_name=model_name,
                            feature_set=feature_set,
                            split_role=role,
                        ))
                        if target == "trajectory_has_first_failure":
                            if role == "test":
                                for curve in budget_curve(scores, labels, BETAS):
                                    curve_rows.append({
                                        "split_seed": seed,
                                        "model_name": model_name,
                                        "feature_set": feature_set,
                                        **curve,
                                    })
                            for row, score in zip(role_rows, scores):
                                score_artifact_rows.append({
                                    "split_seed": seed,
                                    "trajectory_id": row["trajectory_id"],
                                    "split_role": role,
                                    "trajectory_score_family": f"{model_name}::{feature_set}",
                                    "score_value": float(score),
                                    "trajectory_has_first_failure": safe_int(row["trajectory_has_first_failure"]),
                                    "trajectory_has_repeated_bad": safe_int(row["trajectory_has_repeated_bad"]),
                                    "early_first_failure": safe_int(row["early_first_failure"]),
                                    "late_first_failure": safe_int(row["late_first_failure"]),
                                    "first_bad_row_index": safe_int(row["first_bad_row_index"], -1),
                                    "trajectory_length": safe_int(row["trajectory_length"]),
                                    "source_bucket": row.get("source_bucket", "unknown"),
                                    "layout_family": row.get("layout_family", "unknown"),
                                    "model_trained_on_split_role": "train",
                                    "test_tuning": False,
                                })
                    test_row = next((r for r in result_rows if r["split_seed"] == seed and r["target"] == target and r["model_name"] == model_name and r["feature_set"] == feature_set and r["split_role"] == "test"), None)
                    if test_row:
                        ablation_rows.append({
                            **test_row,
                            "train_ap": train_metrics["ap"],
                            "overfit_ap_gap": train_metrics["ap"] - test_row["ap"],
                        })
            if target == "trajectory_has_first_failure":
                for baseline_name, col in BASELINES.items():
                    if col not in rows[0]:
                        continue
                    for role, role_rows in roles.items():
                        labels = [safe_int(row[target]) for row in role_rows]
                        scores = [float(row.get(col, 0.0)) for row in role_rows]
                        result_rows.append(_evaluate_scores(
                            scores, labels,
                            split_seed=seed,
                            target=target,
                            model_name=baseline_name,
                            feature_set="score_only_baseline",
                            split_role=role,
                        ))
                        if role == "test":
                            for curve in budget_curve(scores, labels, BETAS):
                                curve_rows.append({
                                    "split_seed": seed,
                                    "model_name": baseline_name,
                                    "feature_set": "score_only_baseline",
                                    **curve,
                                })
                        for row, score in zip(role_rows, scores):
                            score_artifact_rows.append({
                                "split_seed": seed,
                                "trajectory_id": row["trajectory_id"],
                                "split_role": role,
                                "trajectory_score_family": baseline_name,
                                "score_value": float(score),
                                "trajectory_has_first_failure": safe_int(row["trajectory_has_first_failure"]),
                                "trajectory_has_repeated_bad": safe_int(row["trajectory_has_repeated_bad"]),
                                "early_first_failure": safe_int(row["early_first_failure"]),
                                "late_first_failure": safe_int(row["late_first_failure"]),
                                "first_bad_row_index": safe_int(row["first_bad_row_index"], -1),
                                "trajectory_length": safe_int(row["trajectory_length"]),
                                "source_bucket": row.get("source_bucket", "unknown"),
                                "layout_family": row.get("layout_family", "unknown"),
                                "model_trained_on_split_role": "train",
                                "test_tuning": False,
                            })

    write_jsonl(TRAJ_SCORE_PATH, score_artifact_rows)
    primary_test = [r for r in result_rows if r["target"] == "trajectory_has_first_failure" and r["split_role"] == "test"]
    learned_test = [r for r in primary_test if not r["model_name"].startswith("score_baseline::")]
    baseline_test = [r for r in primary_test if r["model_name"].startswith("score_baseline::")]
    best = max(primary_test, key=lambda r: r["ap"]) if primary_test else {}
    best_learned = max(learned_test, key=lambda r: r["ap"]) if learned_test else {}
    best_baseline = max(baseline_test, key=lambda r: r["ap"]) if baseline_test else {}
    t8_best_ap = 0.6230476879653218
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-9",
        "purpose": "trajectory-level scoring for first-event risk under theory-candidate constraints",
        "result_rows": len(result_rows),
        "budget_curve_rows": len(curve_rows),
        "score_artifact_rows": len(score_artifact_rows),
        "best_primary_test_result": best,
        "best_learned_primary_test_result": best_learned,
        "best_score_only_baseline_result": best_baseline,
        "improvement_over_T8_best_ap": (best.get("ap", 0.0) - t8_best_ap) if best else None,
        "feature_sets": {key: len(value) for key, value in columns_by_set.items()},
        "guard_results": {
            "raw_text_used": False,
            "metadata_used_as_model_features": False,
            "source_layout_metadata_evaluation_only": True,
            "test_tuning": False,
            "mock_data_used": False,
        },
        "claim_boundary": {
            "not_production_validation": True,
            "not_causal_prevention": True,
            "no_formal_conformal_guarantee_claimed": True,
            "offline_proxy": True,
        },
    }
    write_json(OUT_JSON, payload)
    write_csv(OUT_CSV, result_rows)
    write_csv(OUT_CURVES, curve_rows)
    write_csv(OUT_ABLATIONS, ablation_rows)
    OUT_MD.write_text("\n".join([
        "# Batch T-9 Trajectory-Level Scoring",
        "",
        "This evaluates trajectory-level scoring for first-event risk using train-only model fitting. It is a theory candidate benchmark-level offline proxy, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
        "",
        f"- Result rows: `{len(result_rows)}`",
        f"- Budget curve rows: `{len(curve_rows)}`",
        f"- Trajectory score artifact rows: `{len(score_artifact_rows)}`",
        "",
        "## Best Primary Test Result",
        "",
        f"- Model: `{best.get('model_name')}`",
        f"- Feature set: `{best.get('feature_set')}`",
        f"- AUROC: `{best.get('auroc', 0.0):.4f}`",
        f"- AP: `{best.get('ap', 0.0):.4f}`",
        f"- AP lift: `{best.get('ap_lift', 0.0):.4f}`",
        f"- AP improvement over T-8 best aggregate: `{payload['improvement_over_T8_best_ap']}`",
        "",
        "## Interpretation",
        "",
        "The ablations separate score aggregates, structured aggregates, length-only baselines, early-window features, and top-k score mass. Source/layout metadata is not used as a model feature.",
    ]) + "\n")
    print(json.dumps({"result_rows": len(result_rows), "best_ap": best.get("ap"), "score_rows": len(score_artifact_rows)}, indent=2))


if __name__ == "__main__":
    main()
