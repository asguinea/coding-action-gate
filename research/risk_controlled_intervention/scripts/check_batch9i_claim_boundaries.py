#!/usr/bin/env python3
"""Check Batch 9I reports for claim-boundary wording."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
REPORT_JSON = REPORTS_DIR / "batch_9i_claim_boundary_check.json"
REPORT_MD = REPORTS_DIR / "batch_9i_claim_boundary_check.md"

REPORTS = [
    REPORTS_DIR / "batch_9i_dual_unit_formulation.md",
    REPORTS_DIR / "batch_9i_dual_unit_policy_selection.md",
    REPORTS_DIR / "batch_9i_calibration_support_fail_closed.md",
    REPORTS_DIR / "batch_9i_dual_unit_conformal_assessment.md",
    REPORTS_DIR / "batch_9i_research_recommendation.md",
]

FORBIDDEN = [
    "validates StepHarbor",
    "production validated",
    "production guarantee",
    "guarantees safety",
    "prevents failures",
    "prevents mistakes",
    "robust across all frameworks",
    "universal controller",
    "solves coding-agent reliability",
    "works under arbitrary distribution shift",
    "breakthrough proven",
    "theorem",
]
CONDITIONAL_FORBIDDEN = ["conformal guarantee", "finite-sample guarantee", "causal prevention"]
SAFE_QUALIFIERS = ["not claimed", "not a", "future work", "would require", "no formal"]
REQUIRED = [
    "benchmark-level",
    "CodeTraceBench-derived",
    "offline proxy",
    "trajectory-level burden",
    "row-level risk",
    "dual-unit",
    "calibration support",
    "domain shift",
    "not production validation",
    "not causal prevention",
    "no formal conformal guarantee claimed",
]


def conditional_hit(text: str, phrase: str) -> bool:
    for match in re.finditer(re.escape(phrase), text, flags=re.IGNORECASE):
        window = text[max(0, match.start() - 80): match.end() + 80].lower()
        if not any(q in window for q in SAFE_QUALIFIERS):
            return True
    return False


def check_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "forbidden_phrase_hits": [], "missing_required_concepts": REQUIRED}
    text = path.read_text()
    lower = text.lower()
    hits = [phrase for phrase in FORBIDDEN if phrase.lower() in lower]
    hits.extend(phrase for phrase in CONDITIONAL_FORBIDDEN if conditional_hit(text, phrase))
    missing = [phrase for phrase in REQUIRED if phrase.lower() not in lower]
    return {"exists": True, "forbidden_phrase_hits": hits, "missing_required_concepts": missing}


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Batch 9I Claim-Boundary Check",
        "",
        f"- Passed: `{report['passed']}`",
        f"- Forbidden hits: `{report['forbidden_hits']}`",
        f"- Missing required concepts: `{report['missing_required_concepts']}`",
    ]
    return "\n".join(lines)


def main() -> None:
    files = {str(path): check_file(path) for path in REPORTS}
    forbidden = [(path, hit) for path, result in files.items() for hit in result["forbidden_phrase_hits"]]
    missing_global = [phrase for phrase in REQUIRED if not any(result["exists"] and phrase.lower() not in result["missing_required_concepts"] for result in files.values())]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "forbidden_hits": forbidden,
        "missing_required_concepts": missing_global,
        "passed": not forbidden and not missing_global,
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    REPORT_MD.write_text(markdown(report) + "\n")
    print(json.dumps({"passed": report["passed"], "json": str(REPORT_JSON)}, indent=2))


if __name__ == "__main__":
    main()
