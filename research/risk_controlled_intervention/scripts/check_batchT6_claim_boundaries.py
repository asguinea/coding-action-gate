#!/usr/bin/env python3
"""Check Batch T-6 reports for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPORTS = Path(__file__).resolve().parents[1] / "reports"
OUT_JSON = REPORTS / "batch_T6_claim_boundary_check.json"
OUT_MD = REPORTS / "batch_T6_claim_boundary_check.md"

FILES = [
    "batch_T6_option_C_oracle_feasible_region.md",
    "batch_T6_option_C_correction_conservatism.md",
    "batch_T6_row_level_score_artifact_audit.md",
    "batch_T6_option_C_grid_reconstruction.md",
    "batch_T6_option_C_expanded_grid_results.md",
    "batch_T6_option_C_nested_family_expansion.md",
    "batch_T6_infeasibility_diagnosis.md",
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
    "final theorem",
    "safe to deploy",
]
CONDITIONAL = ["finite-sample guarantee"]
REQUIRED = [
    "infeasibility diagnosis",
    "feasible-region expansion",
    "theory candidate",
    "trajectory-level loss",
    "first-event",
    "missed first failure",
    "trajectory burden",
    "oracle feasibility",
    "finite-grid correction",
    "no_safe_recommendation",
    "no formal conformal guarantee claimed",
    "not production validation",
    "not causal prevention",
    "offline proxy",
]


def allowed(line: str, phrase: str) -> bool:
    lower = line.lower()
    if phrase == "conformal guarantee":
        return "no formal conformal guarantee claimed" in lower
    if phrase == "causal prevention":
        return "not causal prevention" in lower
    if phrase == "finite-sample guarantee":
        return "theory candidate" in lower or "under assumptions" in lower or "not claimed" in lower
    return False


def check_text(text: str):
    lower_text = text.lower()
    hits = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        lower = line.lower()
        for phrase in FORBIDDEN:
            if phrase in lower and not allowed(line, phrase):
                hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
        for phrase in CONDITIONAL:
            if phrase in lower and not allowed(line, phrase):
                hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
    missing = [phrase for phrase in REQUIRED if phrase not in lower_text]
    return hits, missing


def main() -> None:
    files_checked = []
    violations = []
    missing_by_file = {}
    corpus = []
    for name in FILES:
        path = REPORTS / name
        if not path.exists():
            violations.append({"file": name, "issue": "missing_report"})
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
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Batch T-6 Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(files_checked)}`",
        f"- Violations: `{len(violations)}`",
        f"- Corpus missing required concepts: `{len(corpus_missing)}`",
        "",
        "Required concepts include infeasibility diagnosis, feasible-region expansion, theory candidate, trajectory-level loss, first-event, missed first failure, trajectory burden, oracle feasibility, finite-grid correction, no_safe_recommendation, no formal conformal guarantee claimed, not production validation, not causal prevention, and offline proxy.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations)}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
