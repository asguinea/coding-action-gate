#!/usr/bin/env python3
"""Claim-boundary checks for Batch 9H reports."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9h_claim_boundary_check.json"
REPORT_MD = REPORTS_DIR / "batch_9h_claim_boundary_check.md"

DEFAULT_FILES = [
    REPORTS_DIR / "batch_9h_row_to_trajectory_burden_audit.md",
    REPORTS_DIR / "batch_9h_trajectory_aware_intervention.md",
    REPORTS_DIR / "batch_9h_trajectory_aware_policy_recommendation.md",
    REPORTS_DIR / "batch_9h_dual_unit_research_assessment.md",
]

FORBIDDEN = [
    "validates StepHarbor",
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
    "new state of the art",
]

REQUIRED = [
    "benchmark-level",
    "CodeTraceBench-derived",
    "offline proxy",
    "trajectory-level burden",
    "row-level risk",
    "calibration support",
    "domain shift",
    "not production validation",
    "not causal prevention",
]


def phrase_hits(text: str, phrases: Iterable[str]) -> list[str]:
    lowered = text.lower()
    hits = []
    for phrase in phrases:
        needle = phrase.lower()
        idx = lowered.find(needle)
        while idx != -1:
            context = lowered[max(0, idx - 40): idx + len(needle)]
            if not any(prefix in context for prefix in ("not ", "not a ", "does not ", "do not ", "no ")):
                hits.append(phrase)
                break
            idx = lowered.find(needle, idx + len(needle))
    return hits


def check_text(text: str) -> dict[str, list[str]]:
    return {"forbidden_phrase_hits": phrase_hits(text, FORBIDDEN), "missing_required_concepts": [item for item in REQUIRED if item.lower() not in text.lower()]}


def check_files(paths: list[Path] | None = None) -> dict[str, object]:
    paths = paths or DEFAULT_FILES
    files = {}
    combined = ""
    forbidden = []
    for path in paths:
        if not path.exists():
            files[str(path)] = {"exists": False, "forbidden_phrase_hits": [], "missing_required_concepts": REQUIRED}
            continue
        text = path.read_text()
        combined += "\n" + text
        result = check_text(text)
        files[str(path)] = {"exists": True, **result}
        for hit in result["forbidden_phrase_hits"]:
            forbidden.append({"path": str(path), "phrase": hit})
    missing = [item for item in REQUIRED if item.lower() not in combined.lower()]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "forbidden_hits": forbidden,
        "missing_required_concepts": missing,
        "passed": not forbidden and not missing,
    }


def markdown(report: dict[str, object]) -> str:
    lines = ["# Batch 9H Claim Boundary Check", "", f"Passed: `{report['passed']}`", "", "## Forbidden Hits"]
    if report["forbidden_hits"]:
        for hit in report["forbidden_hits"]:  # type: ignore[assignment]
            lines.append(f"- `{hit['path']}`: {hit['phrase']}")
    else:
        lines.append("- None")
    lines.extend(["", "## Missing Required Concepts"])
    if report["missing_required_concepts"]:
        for item in report["missing_required_concepts"]:  # type: ignore[assignment]
            lines.append(f"- {item}")
    else:
        lines.append("- None")
    return "\n".join(lines)


def main() -> None:
    report = check_files()
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"passed": report["passed"], "json": str(REPORT_JSON)}, indent=2))


if __name__ == "__main__":
    main()
