#!/usr/bin/env python3
"""Check Batch 9N reports for claim-boundary violations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9n_claim_boundary_check.json"
REPORT_MD = REPORTS_DIR / "batch_9n_claim_boundary_check.md"

REPORTS = [
    "batch_9n_first_event_calibration_formulation.md",
    "batch_9n_first_event_policy_table.md",
    "batch_9n_first_event_calibration_selectors.md",
    "batch_9n_first_event_crc_feasibility.md",
    "batch_9n_first_event_groups_shift.md",
    "batch_9n_research_assessment.md",
]
FORBIDDEN = [
    "validates codingactiongate",
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
]
CONDITIONAL = ["conformal guarantee", "theorem", "finite-sample guarantee"]
REQUIRED = [
    "benchmark-level",
    "codetracebench-derived",
    "offline proxy",
    "first-event",
    "first-failure",
    "trajectory-level loss",
    "trajectory-level burden",
    "calibration support",
    "domain shift",
    "not production validation",
    "not causal prevention",
    "no formal conformal guarantee claimed",
]


def check_text(text: str) -> tuple[list[str], list[str]]:
    lower = text.lower()
    hits = []
    for phrase in FORBIDDEN:
        if phrase not in lower:
            continue
        if phrase == "causal prevention" and "not causal prevention" in lower:
            continue
        hits.append(phrase)
    for phrase in CONDITIONAL:
        if phrase in lower and f"no formal {phrase} claimed" not in lower and f"not a {phrase}" not in lower and f"not formal {phrase}" not in lower:
            hits.append(phrase)
    missing = [phrase for phrase in REQUIRED if phrase not in lower]
    return hits, missing


def main() -> None:
    files = []
    violations = []
    missing_required = {}
    for name in REPORTS:
        path = REPORTS_DIR / name
        if not path.exists():
            violations.append({"file": name, "issue": "missing_report"})
            continue
        text = path.read_text()
        hits, missing = check_text(text)
        files.append(str(path))
        if hits:
            violations.append({"file": name, "forbidden_hits": hits})
        if missing:
            missing_required[name] = missing
    passed = not violations and not missing_required
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files_checked": files,
        "passed": passed,
        "violations": violations,
        "missing_required_safe_concepts": missing_required,
        "required_safe_concepts": REQUIRED,
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text("\n".join([
        "# Batch 9N Claim Boundary Check",
        "",
        f"- Passed: `{passed}`",
        f"- Files checked: `{len(files)}`",
        f"- Violations: `{len(violations)}`",
        f"- Missing safe-concept entries: `{len(missing_required)}`",
        "",
        "Required safe concepts include benchmark-level, CodeTraceBench-derived, offline proxy, first-event, first-failure, trajectory-level loss, trajectory-level burden, calibration support, domain shift, not production validation, not causal prevention, and no formal conformal guarantee claimed.",
    ]) + "\n")
    print(json.dumps({"passed": passed, "violations": len(violations)}, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
