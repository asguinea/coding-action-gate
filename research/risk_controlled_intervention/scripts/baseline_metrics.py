#!/usr/bin/env python3
"""Pure-Python metrics for Batch 7 uncalibrated baseline scoring."""

from __future__ import annotations

import math
import random
import statistics
from collections import defaultdict
from typing import Any


def safe_div(num: float, den: float) -> float:
    return 0.0 if den == 0 else num / den


def confusion_at_threshold(scores: list[float], labels: list[int], threshold: float) -> dict[str, int]:
    tp = fp = tn = fn = 0
    for score, label in zip(scores, labels):
        pred = score >= threshold
        if pred and label:
            tp += 1
        elif pred and not label:
            fp += 1
        elif not pred and label:
            fn += 1
        else:
            tn += 1
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn}


def precision_recall_f1(scores: list[float], labels: list[int], threshold: float) -> dict[str, float]:
    cm = confusion_at_threshold(scores, labels, threshold)
    precision = safe_div(cm["tp"], cm["tp"] + cm["fp"])
    recall = safe_div(cm["tp"], cm["tp"] + cm["fn"])
    f1 = safe_div(2 * precision * recall, precision + recall)
    return {**cm, "precision": precision, "recall": recall, "f1": f1}


def auroc(scores: list[float], labels: list[int]) -> float | None:
    positives = [(score, label) for score, label in zip(scores, labels) if label]
    negatives = [(score, label) for score, label in zip(scores, labels) if not label]
    if not positives or not negatives:
        return None
    sorted_pairs = sorted(zip(scores, labels), key=lambda item: item[0])
    rank_sum = 0.0
    rank = 1
    index = 0
    while index < len(sorted_pairs):
        end = index + 1
        while end < len(sorted_pairs) and sorted_pairs[end][0] == sorted_pairs[index][0]:
            end += 1
        avg_rank = (rank + rank + (end - index) - 1) / 2.0
        for _score, label in sorted_pairs[index:end]:
            if label:
                rank_sum += avg_rank
        rank += end - index
        index = end
    n_pos = len(positives)
    n_neg = len(negatives)
    return (rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def average_precision(scores: list[float], labels: list[int]) -> float | None:
    total_pos = sum(labels)
    if total_pos == 0:
        return None
    pairs = sorted(zip(scores, labels), key=lambda item: item[0], reverse=True)
    tp = 0
    fp = 0
    prev_recall = 0.0
    precision_sum = 0.0
    index = 0
    while index < len(pairs):
        score = pairs[index][0]
        group_pos = 0
        group_neg = 0
        while index < len(pairs) and pairs[index][0] == score:
            if pairs[index][1]:
                group_pos += 1
            else:
                group_neg += 1
            index += 1
        tp += group_pos
        fp += group_neg
        recall = tp / total_pos
        precision = safe_div(tp, tp + fp)
        precision_sum += (recall - prev_recall) * precision
        prev_recall = recall
    return precision_sum


def brier_score(scores: list[float], labels: list[int]) -> float | None:
    return None if not labels else sum((score - label) ** 2 for score, label in zip(scores, labels)) / len(labels)


def log_loss(scores: list[float], labels: list[int], eps: float = 1e-12) -> float | None:
    if not labels:
        return None
    loss = 0.0
    for score, label in zip(scores, labels):
        p = min(max(score, eps), 1.0 - eps)
        loss -= label * math.log(p) + (1 - label) * math.log(1 - p)
    return loss / len(labels)


def quantile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * q))))
    return ordered[index]


def threshold_from_train(scores: list[float], labels: list[int]) -> float:
    positives = [score for score, label in zip(scores, labels) if label]
    if positives:
        return quantile(positives, 0.50)
    return quantile(scores, 0.95)


def decision_rates(scores: list[float], labels: list[int], threshold: float) -> dict[str, float]:
    decisions = [score >= threshold for score in scores]
    deferred = sum(decisions)
    allowed = len(decisions) - deferred
    allowed_bad = sum(1 for decision, label in zip(decisions, labels) if not decision and label)
    false_deferred = sum(1 for decision, label in zip(decisions, labels) if decision and not label)
    deferred_bad = sum(1 for decision, label in zip(decisions, labels) if decision and label)
    return {
        "deferral_rate": safe_div(deferred, len(decisions)),
        "review_rate": safe_div(deferred, len(decisions)),
        "allowed_bad_rate": safe_div(allowed_bad, allowed),
        "false_deferral_rate": safe_div(false_deferred, sum(1 for label in labels if not label)),
        "bad_step_positive_rate_among_deferred": safe_div(deferred_bad, deferred),
    }


def score_distribution(scores: list[float]) -> dict[str, float | None]:
    if not scores:
        return {"count": 0, "min": None, "median": None, "mean": None, "max": None}
    return {
        "count": len(scores),
        "min": min(scores),
        "median": statistics.median(scores),
        "mean": sum(scores) / len(scores),
        "max": max(scores),
    }


def split_metrics(scores: list[float], labels: list[int], threshold: float | None = None) -> dict[str, Any]:
    threshold = 0.5 if threshold is None else threshold
    return {
        "row_count": len(labels),
        "positive_count": sum(labels),
        "positive_rate": safe_div(sum(labels), len(labels)),
        "auroc": auroc(scores, labels),
        "average_precision": average_precision(scores, labels),
        "brier_score": brier_score(scores, labels),
        "log_loss": log_loss(scores, labels),
        "threshold": threshold,
        **precision_recall_f1(scores, labels, threshold),
        **decision_rates(scores, labels, threshold),
        "score_distribution": score_distribution(scores),
    }


def subgroup_metrics(
    scores: list[float],
    labels: list[int],
    metadata: list[dict[str, Any]],
    threshold: float,
    keys: tuple[str, ...] = ("source_bucket", "agent", "layout_family", "difficulty", "category"),
    min_count: int = 50,
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for key in keys:
        groups: dict[str, list[int]] = defaultdict(list)
        for index, meta in enumerate(metadata):
            groups[str(meta.get(key))].append(index)
        result[key] = {}
        for value, indices in sorted(groups.items()):
            if len(indices) < min_count:
                continue
            group_scores = [scores[index] for index in indices]
            group_labels = [labels[index] for index in indices]
            result[key][value] = split_metrics(group_scores, group_labels, threshold)
    return result


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def seed_shuffle_indices(count: int, seed: int) -> list[int]:
    indices = list(range(count))
    rng = random.Random(seed)
    rng.shuffle(indices)
    return indices
