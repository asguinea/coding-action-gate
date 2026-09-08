#!/usr/bin/env python3
"""Check Batch T-2 theory files for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
THEORY = WORKSPACE / "theory"
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T2_claim_boundary_check.json"
OUT_MD = REPORTS / "batch_T2_claim_boundary_check.md"

FILES = [
    "batch_T2_option_A_algorithm.md",
    "batch_T2_correction_rules.md",
    "batch_T2_option_A_theorem_candidate.md",
    "batch_T2_no_safe_recommendation.md",
    "batch_T2_option_A_pseudocode.md",
    "batch_T2_empirical_link.md",
]

FORBIDDEN = [
    "validates stepharbor",
    "production validated",
    "production guarantee",
    "conformal guarantee",
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
]

CONDITIONAL = ["finite-sample guarantee"]

REQUIRED = [
    "theorem candidate",
    "proof sketch",
    "trajectory-level loss",
    "first-event",
    "missed first failure",
    "nested warning policy",
    "uniform correction",
    "no_safe_recommendation",
    "no formal conformal guarantee claimed yet",
    "not production validation",
    "not causal prevention",
    "offline proxy",
]

ALLOWED_QUALIFIED = [
    "theorem candidate",
    "proof sketch",
    "high-probability bound",
    "uniform correction",
    "under assumptions",
    "future",
    "not claimed",
]


def qualified(line: str, phrase: str) -> bool:
    lower = line.lower()
    if phrase == "conformal guarantee":
        return "no formal conformal guarantee claimed yet" in lower or "does not claim a formal conformal guarantee" in lower
    if phrase == "causal prevention":
        return "not causal prevention" in lower or "no causal prevention" in lower
    if phrase == "finite-sample guarantee":
        return any(marker in lower for marker in ["theorem candidate", "under assumptions", "future", "not claimed", "no formal conformal guarantee claimed yet"])
    return False


def check_text(text: str) -> tuple[list[dict[str, str]], list[str]]:
    lower_text = text.lower()
    hits: list[dict[str, str]] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        lower = line.lower()
        for phrase in FORBIDDEN:
            if phrase not in lower:
                continue
            if qualified(line, phrase):
                continue
            hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
        for phrase in CONDITIONAL:
            if phrase in lower and not qualified(line, phrase):
                hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
    missing = [phrase for phrase in REQUIRED if phrase not in lower_text]
    return hits, missing


def main() -> None:
    files_checked = []
    violations = []
    missing_by_file = {}
    corpus = []
    for name in FILES:
        path = THEORY / name
        if not path.exists():
            violations.append({"file": name, "issue": "missing_theory_file"})
            continue
        text = path.read_text()
        corpus.append(text)
        hits, missing = check_text(text)
        files_checked.append(str(path))
        if hits:
            violations.append({"file": name, "hits": hits})
        if missing:
            missing_by_file[name] = missing
    joined = "\n".join(corpus).lower()
    corpus_missing = [phrase for phrase in REQUIRED if phrase not in joined]
    passed = not violations and not corpus_missing
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files_checked": files_checked,
        "passed": passed,
        "violations": violations,
        "per_file_missing_required_concepts": missing_by_file,
        "corpus_missing_required_concepts": corpus_missing,
        "required_safe_concepts": REQUIRED,
        "allowed_qualified_terms": ALLOWED_QUALIFIED,
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Batch T-2 Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(files_checked)}`",
        f"- Violations: `{len(violations)}`",
        f"- Corpus missing required concepts: `{len(corpus_missing)}`",
        "",
        "Required concepts include theorem candidate, proof sketch, trajectory-level loss, first-event, missed first failure, nested warning policy, uniform correction, no_safe_recommendation, no formal conformal guarantee claimed yet, not production validation, not causal prevention, and offline proxy.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations)}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
