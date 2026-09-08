#!/usr/bin/env python3
"""Check Batch T-14 finite-grid proof files for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
THEORY = ROOT / "theory"
OUT_JSON = REPORTS / "batch_T14_claim_boundary_check.json"
OUT_MD = REPORTS / "batch_T14_claim_boundary_check.md"

FILES = [
    THEORY / "batch_T14_finite_grid_theorem.md",
    THEORY / "batch_T14_finite_grid_proof.md",
    THEORY / "batch_T14_structural_certificate.md",
    THEORY / "batch_T14_grid_protocol_audit.md",
    THEORY / "batch_T14_score_policy_selection_audit.md",
    THEORY / "batch_T14_no_safe_claim_audit.md",
    THEORY / "batch_T14_method_status_and_gaps.md",
]

FORBIDDEN = [
    "validates codingactiongate",
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

REQUIRED = [
    "finite-grid theorem under assumptions",
    "high-probability bound",
    "structural lower bound",
    "corrected feasible set",
    "no_safe_recommendation",
    "trajectory-level loss",
    "first-event",
    "missed first failure",
    "trajectory burden",
    "not production validation",
    "not causal prevention",
    "no formal conformal guarantee claimed",
    "offline proxy",
]

QUALIFIED = [
    "theorem under assumptions",
    "finite-grid high-probability bound",
    "structural certificate",
    "proof",
]


def allowed(line: str, phrase: str) -> bool:
    lower = line.lower()
    if phrase == "conformal guarantee":
        return "no formal conformal guarantee claimed" in lower
    if phrase == "causal prevention":
        return "not causal prevention" in lower
    return False


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
                if phrase in lower and not allowed(line, phrase):
                    violations.append({"file": str(path), "line": lineno, "phrase": phrase, "context": line[:240]})
    joined = "\n".join(corpus).lower()
    missing = [phrase for phrase in REQUIRED if phrase not in joined]
    qualified_missing = [phrase for phrase in QUALIFIED if phrase not in joined]
    passed = not violations and not missing
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "batch": "T-14",
        "files_checked": checked,
        "passed": passed,
        "violations": violations,
        "corpus_missing_required_concepts": missing,
        "qualified_terms_not_observed": qualified_missing,
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Batch T-14 Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(checked)}`",
        f"- Violations: `{len(violations)}`",
        f"- Missing required concepts: `{len(missing)}`",
        "",
        "This check enforces finite-grid theorem under assumptions wording, high-probability bound scope, no_safe_recommendation semantics, not production validation, not causal prevention, offline proxy, and no formal conformal guarantee claimed.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations), "missing": missing}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
