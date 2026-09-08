#!/usr/bin/env python3
"""Check Batch T-1 theory files for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
THEORY = WORKSPACE / "theory"
REPORTS = WORKSPACE / "reports"
OUT_JSON = REPORTS / "batch_T1_claim_boundary_check.json"
OUT_MD = REPORTS / "batch_T1_claim_boundary_check.md"

FILES = [
    "THEORY_INDEX.md",
    "batch_T1_formal_setup.md",
    "batch_T1_loss_definitions.md",
    "batch_T1_policy_families.md",
    "batch_T1_monotonicity_feasibility.md",
    "batch_T1_assumption_register.md",
    "batch_T1_option_A_C_roadmap.md",
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

CONDITIONAL = ["theorem", "finite-sample guarantee"]

REQUIRED = [
    "formal setup",
    "candidate theory",
    "first-event",
    "first-failure",
    "trajectory-level loss",
    "nested warning policy",
    "no formal guarantee claimed yet",
    "not production validation",
    "not causal prevention",
    "offline proxy",
]


def conditional_allowed(line: str, phrase: str) -> bool:
    lower = line.lower()
    if phrase == "theorem":
        return any(marker in lower for marker in [
            "future theorem target",
            "theorem is not yet claimed",
            "theorem-critical",
            "theorem_claimed_now",
            "do not claim a theorem",
        ])
    if phrase == "finite-sample guarantee":
        return any(marker in lower for marker in [
            "not claimed",
            "future",
            "no formal guarantee claimed yet",
        ])
    return False


def check_text(text: str) -> tuple[list[dict[str, str]], list[str]]:
    lower_text = text.lower()
    hits: list[dict[str, str]] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        lower = line.lower()
        for phrase in FORBIDDEN:
            if phrase not in lower:
                continue
            if phrase == "causal prevention" and "not causal prevention" in lower:
                continue
            if phrase == "conformal guarantee" and ("no formal guarantee claimed yet" in lower or "not production validation" in lower):
                continue
            hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
        for phrase in CONDITIONAL:
            if phrase in lower and not conditional_allowed(line, phrase):
                hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
    missing = [phrase for phrase in REQUIRED if phrase not in lower_text]
    return hits, missing


def main() -> None:
    files_checked = []
    violations = []
    missing_required = {}
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
            missing_required[name] = missing

    # Required concepts should also hold over the full T-1 corpus, because JSON
    # files carry machine-readable mirrors while Markdown carries explanation.
    corpus_missing = [phrase for phrase in REQUIRED if phrase not in "\n".join(corpus).lower()]
    passed = not violations and not corpus_missing
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files_checked": files_checked,
        "passed": passed,
        "violations": violations,
        "per_file_missing_required_concepts": missing_required,
        "corpus_missing_required_concepts": corpus_missing,
        "required_safe_concepts": REQUIRED,
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Batch T-1 Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(files_checked)}`",
        f"- Violations: `{len(violations)}`",
        f"- Corpus missing required concepts: `{len(corpus_missing)}`",
        "",
        "Required concepts include formal setup, candidate theory, first-event, first-failure, trajectory-level loss, nested warning policy, no formal guarantee claimed yet, not production validation, not causal prevention, and offline proxy.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations)}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
