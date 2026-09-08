#!/usr/bin/env python3
"""Claim-boundary and consistency check for Batch 9P internal package."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
PACKAGE = WORKSPACE / "reports" / "internal_evidence_package"
OUT_JSON = PACKAGE / "package_claim_boundary_check.json"
OUT_MD = PACKAGE / "package_claim_boundary_check.md"

FORBIDDEN = [
    "stepharbor validated",
    "validated stepharbor",
    "production validated",
    "production guarantee",
    "conformal guarantee",
    "safe to deploy",
    "prevents failures",
    "prevents mistakes",
    "solves coding-agent reliability",
    "arbitrary distribution shift",
    "externally validated",
    "customer validated",
    "developer validated",
    "production-authoritative",
    "causal prevention",
    "new method works",
    "theorem proven",
]

REQUIRED_PACKAGE_CONCEPTS = [
    "benchmark-level evidence",
    "codetracebench-derived",
    "offline proxy",
    "not production validation",
    "no formal conformal guarantee claimed",
    "not causal prevention",
    "trajectory-level burden",
    "row-level risk",
    "uncertainty-aware control",
    "risk ranking",
    "calibration support",
    "domain shift",
    "external validation remains untested",
    "trajectory-level first-event dual-unit risk control",
]

ALLOW_MARKERS = [
    "not ",
    "no ",
    "do not ",
    "unsupported",
    "wording_forbidden",
    "not claimed",
    "not established",
    "remains untested",
    "without successful",
]


def package_files() -> list[Path]:
    if not PACKAGE.exists():
        raise FileNotFoundError(PACKAGE)
    return sorted(
        path for path in PACKAGE.rglob("*")
        if path.is_file()
        and path.name not in {"package_claim_boundary_check.json", "package_claim_boundary_check.md"}
        and path.suffix.lower() in {".md", ".json", ".csv"}
    )


def forbidden_hits(text: str) -> list[dict[str, str]]:
    hits = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        lower = line.lower()
        for phrase in FORBIDDEN:
            if phrase not in lower:
                continue
            window = lower[max(0, lower.find(phrase) - 48): lower.find(phrase) + len(phrase) + 48]
            if any(marker in window for marker in ALLOW_MARKERS):
                continue
            hits.append({"line": str(lineno), "phrase": phrase, "context": line[:240]})
    return hits


def check_package() -> dict[str, object]:
    files = package_files()
    violations = []
    corpus = []
    for path in files:
        text = path.read_text()
        corpus.append(text.lower())
        hits = forbidden_hits(text)
        if hits:
            violations.append({"file": str(path), "hits": hits})
    joined = "\n".join(corpus)
    missing = [concept for concept in REQUIRED_PACKAGE_CONCEPTS if concept not in joined]
    latex_files = [str(path) for path in PACKAGE.rglob("*") if path.suffix.lower() in {".tex", ".pdf", ".docx"}]
    report_draft_hits = []
    for path in files:
        lower = path.read_text().lower()
        if "this package is a report draft" in lower or "publication draft" in lower and "not a publication draft" not in lower:
            report_draft_hits.append(str(path))
    passed = not violations and not missing and not latex_files and not report_draft_hits
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "package_dir": str(PACKAGE),
        "files_checked": [str(path) for path in files],
        "passed": passed,
        "violations": violations,
        "missing_required_concepts": missing,
        "latex_or_document_files": latex_files,
        "report_draft_hits": report_draft_hits,
        "required_concepts": REQUIRED_PACKAGE_CONCEPTS,
    }


def main() -> None:
    report = check_package()
    OUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    OUT_MD.write_text("\n".join([
        "# Package Claim Boundary Check",
        "",
        f"- Passed: `{report['passed']}`",
        f"- Files checked: `{len(report['files_checked'])}`",
        f"- Violating files: `{len(report['violations'])}`",
        f"- Missing required concepts: `{len(report['missing_required_concepts'])}`",
        f"- LaTeX/PDF/DOCX files: `{len(report['latex_or_document_files'])}`",
        "",
        "This checker enforces benchmark-level evidence wording, CodeTraceBench-derived scope, offline proxy framing, not production validation, no formal conformal guarantee claimed, not causal prevention, trajectory-level burden, row-level risk, uncertainty-aware control, risk ranking, calibration support, domain shift, external validation remains untested, and the new trajectory-level first-event dual-unit risk-control direction.",
    ]) + "\n")
    print(json.dumps({"passed": report["passed"], "violations": len(report["violations"])}, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
