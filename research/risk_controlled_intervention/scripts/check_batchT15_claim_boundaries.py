#!/usr/bin/env python3
"""Check Batch T-15 positioning files for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
THEORY = ROOT / "theory"
OUT_JSON = REPORTS / "batch_T15_claim_boundary_check.json"
OUT_MD = REPORTS / "batch_T15_claim_boundary_check.md"

FILES = [
    THEORY / "batch_T15_related_theory_inventory.md",
    THEORY / "batch_T15_comparison_matrix.md",
    THEORY / "batch_T15_claim_map.md",
    THEORY / "batch_T15_terminology_decision.md",
    THEORY / "batch_T15_related_work_risk_audit.md",
    THEORY / "batch_T15_evaluation_implications.md",
    THEORY / "batch_T15_positioning_assessment.md",
]

FORBIDDEN = [
    "validates stepharbor",
    "production validated",
    "production guarantee",
    "guarantees safety",
    "prevents failures",
    "prevents mistakes",
    "robust across all frameworks",
    "universal controller",
    "solves coding-agent reliability",
    "works under arbitrary distribution shift",
    "causal prevention",
    "breakthrough proven",
    "safe to deploy",
    "better than cora",
    "better than toolchain-crc",
]

QUALIFIED_TERMS = [
    "conformal risk control",
    "conformal",
    "crc",
    "theorem",
    "high-probability bound",
    "finite-grid guarantee",
]

REQUIRED = [
    "related-theory mapping",
    "claim-positioning audit",
    "crc-inspired",
    "finite-grid high-probability risk control",
    "feasibility-aware",
    "structural lower bound",
    "corrected feasible set",
    "no_safe_recommendation",
    "trajectory-level loss",
    "first-event",
    "missed first failure",
    "trajectory burden",
    "no formal conformal guarantee claimed",
    "not production validation",
    "not causal prevention",
    "offline proxy",
]


def allowed_forbidden(line: str, phrase: str) -> bool:
    lower = line.lower()
    if phrase == "causal prevention":
        return "not causal prevention" in lower
    if phrase.startswith("better than"):
        return "do not claim" in lower or "forbidden overclaim" in lower
    return False


def qualified(line: str, term: str) -> bool:
    lower = line.lower()
    if term == "conformal":
        return (
            "crc-inspired" in lower
            or "crc-adjacent" in lower
            or "no formal conformal guarantee claimed" in lower
            or "not full conformal" in lower
            or "full conformal" in lower
            or "avoid" in lower
            or "requires human/literature verification" in lower
            or "must not claim" in lower
        )
    if term == "conformal risk control":
        return (
            "crc-inspired" in lower
            or "crc-adjacent" in lower
            or "not full conformal risk control" in lower
            or "full conformal risk control" in lower
            or "avoid" in lower
            or "requires human/literature verification" in lower
            or "must not claim" in lower
        )
    if term == "crc":
        return (
            "crc-inspired" in lower
            or "crc-adjacent" in lower
            or "not full" in lower
            or "adjacent" in lower
            or "requires human/literature verification" in lower
            or "future" in lower
            or "like" in lower
            or "named related" in lower
        )
    if term == "theorem":
        return "finite-grid" in lower or "under assumptions" in lower or "future" in lower
    if term == "high-probability bound":
        return "under assumptions" in lower or "finite-grid" in lower
    if term == "finite-grid guarantee":
        return "no formal" in lower or "avoid" in lower or "not" in lower
    return True


def main() -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    violations: list[dict[str, object]] = []
    checked: list[str] = []
    corpus: list[str] = []
    for path in FILES:
        if not path.exists():
            violations.append({"file": str(path), "issue": "missing_file"})
            continue
        text = path.read_text()
        checked.append(str(path))
        corpus.append(text)
        for lineno, line in enumerate(text.splitlines(), 1):
            lower = line.lower()
            for phrase in FORBIDDEN:
                if phrase in lower and not allowed_forbidden(line, phrase):
                    violations.append({"file": str(path), "line": lineno, "phrase": phrase, "context": line[:240]})
            for term in QUALIFIED_TERMS:
                if term in lower and not qualified(line, term):
                    violations.append({"file": str(path), "line": lineno, "phrase": term, "context": line[:240], "issue": "unqualified_positioning_term"})
    joined = "\n".join(corpus).lower()
    missing = [phrase for phrase in REQUIRED if phrase not in joined]
    passed = not violations and not missing
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-15",
        "files_checked": checked,
        "passed": passed,
        "violations": violations,
        "corpus_missing_required_concepts": missing,
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Batch T-15 Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(checked)}`",
        f"- Violations: `{len(violations)}`",
        f"- Missing required concepts: `{len(missing)}`",
        "",
        "This check enforces CRC-inspired finite-grid positioning, no_safe_recommendation semantics, not production validation, not causal prevention, offline proxy, and no formal conformal guarantee claimed.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations), "missing": missing}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
