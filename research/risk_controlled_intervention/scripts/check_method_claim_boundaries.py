#!/usr/bin/env python3
"""Check Batch 9G method reports for claim-boundary language."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9g_claim_boundary_check.json"
REPORT_MD = REPORTS_DIR / "batch_9g_claim_boundary_check.md"

DEFAULT_FILES = [
    REPORTS_DIR / "batch_9g_policy_selector_decision_matrix.md",
    REPORTS_DIR / "batch_9g_cost_aware_method_spec.md",
    REPORTS_DIR / "batch_9g_recommended_main_method.md",
]

FORBIDDEN_PHRASES = [
    "validates StepHarbor",
    "production validated",
    "production guarantee",
    "guarantees safety",
    "prevents failures",
    "prevents mistakes",
    "conformal guarantee",
    "works under arbitrary distribution shift",
    "solves coding-agent reliability",
    "universal controller",
    "robust across all frameworks",
    "eliminates review burden",
]

SAFE_CONCEPTS = [
    "benchmark-level",
    "CodeTraceBench-derived",
    "cost-aware",
    "trajectory-level burden",
    "row-level risk",
    "calibration support",
    "domain shift",
    "not production StepHarbor validation",
    "not a production guarantee",
    "not causal prevention",
]


def phrase_hits(text: str, phrases: Iterable[str]) -> list[str]:
    lowered = text.lower()
    hits = []
    for phrase in phrases:
        needle = phrase.lower()
        start = 0
        found = False
        while True:
            idx = lowered.find(needle, start)
            if idx == -1:
                break
            context = lowered[max(0, idx - 32): idx + len(needle)]
            if not any(prefix in context for prefix in ("not ", "not a ", "does not ", "do not ", "no ")):
                found = True
                break
            start = idx + len(needle)
        if found:
            hits.append(phrase)
    return hits


def check_text(text: str) -> dict[str, object]:
    return {
        "forbidden_phrase_hits": phrase_hits(text, FORBIDDEN_PHRASES),
        "missing_safe_concepts": [phrase for phrase in SAFE_CONCEPTS if phrase.lower() not in text.lower()],
    }


def check_files(paths: list[Path] | None = None) -> dict[str, object]:
    paths = paths or DEFAULT_FILES
    files = {}
    all_forbidden: list[dict[str, str]] = []
    combined_text = ""
    for path in paths:
        if not path.exists():
            files[str(path)] = {"exists": False, "forbidden_phrase_hits": [], "missing_safe_concepts": SAFE_CONCEPTS}
            continue
        text = path.read_text()
        combined_text += "\n" + text
        result = check_text(text)
        files[str(path)] = {"exists": True, **result}
        for hit in result["forbidden_phrase_hits"]:
            all_forbidden.append({"path": str(path), "phrase": hit})
    missing_global = [phrase for phrase in SAFE_CONCEPTS if phrase.lower() not in combined_text.lower()]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "forbidden_hits": all_forbidden,
        "missing_safe_concepts": missing_global,
        "passed": not all_forbidden and not missing_global,
    }


def markdown(report: dict[str, object]) -> str:
    lines = [
        "# Batch 9G Claim Boundary Check",
        "",
        f"Passed: `{report['passed']}`",
        "",
        "## Forbidden Phrase Hits",
        "",
    ]
    hits = report["forbidden_hits"]
    if hits:
        for hit in hits:  # type: ignore[assignment]
            lines.append(f"- `{hit['path']}`: {hit['phrase']}")
    else:
        lines.append("- None")
    lines.extend(["", "## Missing Safe Concepts", ""])
    missing = report["missing_safe_concepts"]
    if missing:
        for concept in missing:  # type: ignore[assignment]
            lines.append(f"- {concept}")
    else:
        lines.append("- None")
    return "\n".join(lines)


def main() -> None:
    report = check_files()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"passed": report["passed"], "json": str(REPORT_JSON), "md": str(REPORT_MD)}, indent=2))


if __name__ == "__main__":
    main()
