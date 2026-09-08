#!/usr/bin/env python3
"""Build a tiny leakage-safe prefix preview from sampled CodeTraceBench artifacts."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

WORKSPACE = Path(__file__).resolve().parents[1]
REPORTS_DIR = WORKSPACE / "reports"
PROCESSED_DIR = WORKSPACE / "data" / "processed"
SAMPLE_MANIFEST = REPORTS_DIR / "artifact_sample_manifest.json"
PREFIX_PREVIEW_PATH = PROCESSED_DIR / "prefix_preview.jsonl"
AUDIT_REPORT_PATH = REPORTS_DIR / "prefix_preview_audit.json"
AUDIT_MARKDOWN_PATH = REPORTS_DIR / "prefix_preview_audit.md"
INSPECT_SCRIPT = Path(__file__).resolve().with_name("inspect_artifacts.py")

ERROR_KEYWORDS = ("error", "failed", "failure", "traceback", "exception", "panic", "segmentation fault")
FAILURE_KEYWORDS = ("failed", "failure", "incorrect", "invalid", "cannot", "unable", "mismatch")
TIMEOUT_KEYWORDS = ("timeout", "timed out", "deadline exceeded")
TEST_KEYWORDS = ("test", "pytest", "unittest", "jest", "assert", "spec")
EXCEPTION_KEYWORDS = ("exception", "traceback", "stack trace", "panic")


def _load_inspect_module():
    spec = importlib.util.spec_from_file_location("inspect_artifacts", INSPECT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


inspect = _load_inspect_module()
audit = inspect.audit


@dataclass
class StepRecord:
    step_index: int
    stage_index: int | None
    stage_name: str | None
    action_path: str | None = None
    observation_path: str | None = None
    action_text: str = ""
    observation_text: str = ""
    incorrect: bool = False
    unuseful: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build leakage-safe prefix preview examples from sampled artifacts only."
    )
    parser.add_argument(
        "--sample-manifest",
        default=str(SAMPLE_MANIFEST),
        help="Path to reports/artifact_sample_manifest.json.",
    )
    return parser.parse_args()


def sha256_text(text: str) -> str | None:
    if text == "":
        return None
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def count_keywords(text: str, keywords: Iterable[str]) -> int:
    lower = text.lower()
    return sum(lower.count(keyword) for keyword in keywords)


def keyword_features(action_text: str, observation_text: str) -> dict[str, int]:
    recent = f"{action_text}\n{observation_text}"
    return {
        "recent_error_keyword_count": count_keywords(recent, ERROR_KEYWORDS),
        "recent_failure_keyword_count": count_keywords(recent, FAILURE_KEYWORDS),
        "recent_timeout_keyword_count": count_keywords(recent, TIMEOUT_KEYWORDS),
        "recent_test_keyword_count": count_keywords(recent, TEST_KEYWORDS),
        "recent_exception_keyword_count": count_keywords(recent, EXCEPTION_KEYWORDS),
    }


def guess_action_kind(action_text: str) -> str:
    lower = action_text.lower()
    if any(term in lower for term in ("git ", '"git"', "git commit", "git status", "git diff")):
        return "git"
    if any(term in lower for term in ("pytest", "npm test", "unittest", "cargo test", "go test")):
        return "test"
    if any(term in lower for term in ("pip install", "npm install", "apt-get install", "brew install")):
        return "install"
    if any(term in lower for term in ("apply_patch", "write_file", "edit", "cat >", "tee ", "sed -i")):
        return "edit"
    if any(term in lower for term in ("grep", "rg ", "find ", "search", "ls ", "cat ")):
        return "search"
    if any(term in lower for term in ("bash", "python", "node", "npm ", "make ", "cargo ", "run")):
        return "command"
    return "unknown"


def guess_observation_kind(observation_text: str) -> str:
    stripped = observation_text.strip()
    lower = stripped.lower()
    if stripped == "":
        return "empty"
    if any(term in lower for term in ("timeout", "timed out", "deadline exceeded")):
        return "timeout"
    if any(term in lower for term in ("traceback", "exception", "error", "<returncode>1", "failed")):
        if any(test_term in lower for test_term in TEST_KEYWORDS):
            return "test_failure"
        return "error"
    if any(term in lower for term in ("test", "pytest", "passed", "assert")) and any(
        term in lower for term in ("fail", "failed", "error")
    ):
        return "test_failure"
    if any(term in lower for term in ("<returncode>0", "success", "passed", "complete")):
        return "success"
    return "unknown"


def stage_ranges(sample: dict[str, Any]) -> list[dict[str, Any]]:
    ranges = []
    for stage in audit.coerce_list(sample.get("stages")):
        if isinstance(stage, dict):
            ranges.append(stage)
    return ranges


def stage_for_step(sample: dict[str, Any], step_index: int) -> tuple[int | None, str | None]:
    for stage in stage_ranges(sample):
        start = audit.as_int(stage.get("start_step_id"))
        end = audit.as_int(stage.get("end_step_id"))
        if start is not None and end is not None and start <= step_index <= end:
            stage_id = audit.as_int(stage.get("stage_id"))
            stage_name = stage.get("name") or stage.get("stage_name")
            return stage_id, str(stage_name) if stage_name is not None else None
    return None, None


def labels_by_step(sample: dict[str, Any]) -> dict[int, set[str]]:
    labels: dict[int, set[str]] = {}
    for step_id, raw_labels in inspect.label_steps_from_sample(sample).items():
        parsed = audit.as_int(step_id)
        if parsed is None:
            continue
        clean = {label for label in raw_labels if not str(label).startswith("stage:")}
        if clean:
            labels.setdefault(parsed, set()).update(clean)
    return labels


def ref_paths_by_step(sample: dict[str, Any]) -> dict[int, dict[str, str]]:
    refs: dict[int, dict[str, str]] = {}
    for stage in audit.coerce_list(sample.get("incorrect_stages")):
        if not isinstance(stage, dict):
            continue
        for step in audit.coerce_list(stage.get("steps")):
            if not isinstance(step, dict):
                continue
            step_id = audit.as_int(step.get("step_id"))
            if step_id is None:
                continue
            entry = refs.setdefault(step_id, {})
            for key, output_key in (("action_ref", "action_path"), ("observation_ref", "observation_path")):
                ref = step.get(key)
                if isinstance(ref, dict) and isinstance(ref.get("path"), str):
                    entry[output_key] = ref["path"]
    return refs


def stage_transition_count_so_far(sample: dict[str, Any], step_index: int) -> int:
    transitions = 0
    for stage in stage_ranges(sample):
        start = audit.as_int(stage.get("start_step_id"))
        if start is not None and start > 1 and start <= step_index:
            transitions += 1
    return transitions


def current_stage_step_count_so_far(sample: dict[str, Any], step_index: int) -> int:
    for stage in stage_ranges(sample):
        start = audit.as_int(stage.get("start_step_id"))
        end = audit.as_int(stage.get("end_step_id"))
        if start is not None and end is not None and start <= step_index <= end:
            return step_index - start + 1
    return 0


EPISODE_RE = re.compile(r"/episode-(\d+)/")


def step_index_from_ref_path(ref_path: str | None, ref_kind: str) -> int | None:
    if not ref_path:
        return None
    match = EPISODE_RE.search(ref_path)
    if match is not None:
        episode = int(match.group(1))
        return episode + 1 if ref_kind == "action" else episode
    return None


def normalized_ref_candidates(ref_path: str | None) -> list[str]:
    if not ref_path:
        return []
    normalized = ref_path.replace("\\", "/").lstrip("/")
    candidates = [normalized]
    if normalized.startswith("traj/"):
        candidates.append(normalized.removeprefix("traj/"))
    parts = normalized.split("/")
    if len(parts) > 1:
        candidates.append("/".join(parts[1:]))
    return list(dict.fromkeys(candidates))


def find_member_for_ref(ref_path: str | None, members: list[inspect.ArchiveMember]) -> str | None:
    candidates = normalized_ref_candidates(ref_path)
    for candidate in candidates:
        for member in members:
            if member.name == candidate or member.name.endswith(candidate):
                return member.name
    return None


def read_ref_text(
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
    ref_path: str | None,
) -> str:
    member_name = find_member_for_ref(ref_path, members)
    if member_name is None:
        return ""
    return inspect.read_member(artifact_path, artifact_format, member_name, 100000)


def infer_terminus_steps(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
) -> tuple[dict[int, StepRecord], int]:
    steps: dict[int, StepRecord] = {}
    malformed = 0
    episode_paths: dict[int, dict[str, str]] = {}
    for member in members:
        match = EPISODE_RE.search(member.name)
        if match is None:
            continue
        episode = int(match.group(1))
        if member.name.endswith("/response.txt"):
            episode_paths.setdefault(episode, {})["response"] = member.name
        elif member.name.endswith("/prompt.txt"):
            episode_paths.setdefault(episode, {})["prompt"] = member.name
    for episode, paths in episode_paths.items():
        step_index = episode + 1
        stage_id, stage_name = stage_for_step(sample, step_index)
        action_text = ""
        observation_text = ""
        if "response" in paths:
            action_text = inspect.read_member(artifact_path, artifact_format, paths["response"], 100000)
        if episode + 1 in episode_paths and "prompt" in episode_paths[episode + 1]:
            observation_text = inspect.read_member(
                artifact_path,
                artifact_format,
                episode_paths[episode + 1]["prompt"],
                100000,
            )
        steps[step_index] = StepRecord(
            step_index=step_index,
            stage_index=stage_id,
            stage_name=stage_name,
            action_path=paths.get("response"),
            observation_path=episode_paths.get(episode + 1, {}).get("prompt"),
            action_text=action_text,
            observation_text=observation_text,
        )
    return steps, malformed


def parse_jsonish_member(text: str) -> Any | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def messages_from_jsonish(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("messages", "trajectory", "history", "steps"):
            if isinstance(value.get(key), list):
                return [item for item in value[key] if isinstance(item, dict)]
        if "role" in value and "content" in value:
            return [value]
    return []


def infer_miniswe_steps_from_traj(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
) -> tuple[dict[int, StepRecord], int]:
    traj_members = [member for member in members if member.name.endswith("mini.traj.json")]
    if not traj_members:
        return {}, 1
    text = inspect.read_member(artifact_path, artifact_format, traj_members[0].name, 2_000_000)
    parsed = parse_jsonish_member(text)
    messages = messages_from_jsonish(parsed)
    if not messages:
        return {}, 1
    pairs: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    index = 0
    while index < len(messages):
        message = messages[index]
        if str(message.get("role", "")).lower() == "assistant":
            observation = messages[index + 1] if index + 1 < len(messages) else None
            pairs.append((message, observation))
            index += 2
        else:
            index += 1
    steps: dict[int, StepRecord] = {}
    for step_index, (action, observation) in enumerate(pairs, start=1):
        stage_id, stage_name = stage_for_step(sample, step_index)
        steps[step_index] = StepRecord(
            step_index=step_index,
            stage_index=stage_id,
            stage_name=stage_name,
            action_path=traj_members[0].name,
            observation_path=traj_members[0].name if observation is not None else None,
            action_text=str(action.get("content", "")),
            observation_text=str(observation.get("content", "")) if observation is not None else "",
        )
    return steps, 0


def apply_manifest_ref_texts(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
    steps: dict[int, StepRecord],
) -> int:
    malformed = 0
    for step_id, refs in ref_paths_by_step(sample).items():
        stage_id, stage_name = stage_for_step(sample, step_id)
        record = steps.setdefault(
            step_id,
            StepRecord(step_index=step_id, stage_index=stage_id, stage_name=stage_name),
        )
        if "action_path" in refs:
            action_text = read_ref_text(artifact_path, artifact_format, members, refs["action_path"])
            if action_text:
                record.action_text = action_text
                record.action_path = refs["action_path"]
            else:
                malformed += 1
        if "observation_path" in refs:
            observation_text = read_ref_text(artifact_path, artifact_format, members, refs["observation_path"])
            if observation_text:
                record.observation_text = observation_text
                record.observation_path = refs["observation_path"]
            else:
                malformed += 1
    return malformed


def recover_steps(sample: dict[str, Any]) -> tuple[list[StepRecord], dict[str, Any]]:
    artifact_path = WORKSPACE / sample["local_path"]
    format_info = inspect.detect_artifact_format(artifact_path)
    artifact_format = format_info["format"]
    members = inspect.list_members(artifact_path, artifact_format)
    source_bucket = str(sample.get("source_bucket", ""))
    malformed = 0
    if source_bucket == "terminalbench_like":
        steps, malformed = infer_terminus_steps(sample, artifact_path, artifact_format, members)
    else:
        steps, malformed = infer_miniswe_steps_from_traj(sample, artifact_path, artifact_format, members)
    malformed += apply_manifest_ref_texts(sample, artifact_path, artifact_format, members, steps)
    labels = labels_by_step(sample)
    for step_id, label_set in labels.items():
        if step_id in steps:
            steps[step_id].incorrect = "incorrect" in label_set
            steps[step_id].unuseful = "unuseful" in label_set
        else:
            stage_id, stage_name = stage_for_step(sample, step_id)
            steps[step_id] = StepRecord(
                step_index=step_id,
                stage_index=stage_id,
                stage_name=stage_name,
                incorrect="incorrect" in label_set,
                unuseful="unuseful" in label_set,
            )
            malformed += 1
    declared_step_count = audit.as_int(sample.get("step_count"))
    overrun_step_count = 0
    missing_declared_step_count = 0
    if declared_step_count is not None:
        overrun_steps = [index for index in steps if index > declared_step_count]
        overrun_step_count = len(overrun_steps)
        for index in overrun_steps:
            del steps[index]
        missing_declared_step_count = len(
            [index for index in range(1, declared_step_count + 1) if index not in steps]
        )
        malformed += overrun_step_count + missing_declared_step_count
    ordered = [steps[index] for index in sorted(steps)]
    return ordered, {
        "artifact_format": artifact_format,
        "member_count": len(members),
        "malformed_or_unmapped_step_parts": malformed,
        "declared_step_count": declared_step_count,
        "overrun_step_count": overrun_step_count,
        "missing_declared_step_count": missing_declared_step_count,
        "label_count": len(labels),
    }


def repeated_indicator(current_hash: str | None, previous_hashes: set[str]) -> int:
    return int(current_hash is not None and current_hash in previous_hashes)


def example_for_step(
    sample: dict[str, Any],
    steps: list[StepRecord],
    index: int,
    previous_action_hashes: set[str],
    previous_observation_hashes: set[str],
) -> dict[str, Any]:
    current = steps[index]
    target = steps[index + 1]
    action_hash = sha256_text(current.action_text)
    observation_hash = sha256_text(current.observation_text)
    features = keyword_features(current.action_text, current.observation_text)
    features.update(
        {
            "prefix_length": index + 1,
            "current_stage_step_count_so_far": current_stage_step_count_so_far(sample, current.step_index),
            "total_stage_transitions_so_far": stage_transition_count_so_far(sample, current.step_index),
            "repeated_action_indicator": repeated_indicator(action_hash, previous_action_hashes),
            "repeated_observation_indicator": repeated_indicator(observation_hash, previous_observation_hashes),
            "action_text_hash": action_hash,
            "observation_text_hash": observation_hash,
            "action_length_chars": len(current.action_text),
            "observation_length_chars": len(current.observation_text),
            "action_kind_guess": guess_action_kind(current.action_text),
            "observation_kind_guess": guess_observation_kind(current.observation_text),
        }
    )
    target_bad = target.incorrect or target.unuseful
    current_bad = current.incorrect or current.unuseful
    return {
        "trajectory_id": sample.get("traj_id"),
        "artifact_id": Path(str(sample.get("local_path", ""))).name,
        "artifact_path": sample.get("local_path"),
        "source_inferred": sample.get("inferred_source"),
        "source_bucket": sample.get("source_bucket"),
        "agent": sample.get("agent"),
        "model": sample.get("model"),
        "category": sample.get("category"),
        "difficulty": sample.get("difficulty"),
        "step_index": current.step_index,
        "next_step_index": target.step_index,
        "current_stage_index": current.stage_index,
        "current_stage_name": current.stage_name,
        "next_step_bad": int(target_bad),
        "next_step_incorrect": int(target.incorrect),
        "next_step_unuseful": int(target.unuseful),
        "current_step_bad": int(current_bad),
        "current_step_incorrect": int(current.incorrect),
        "current_step_unuseful": int(current.unuseful),
        "trajectory_has_any_bad_step": int(any(step.incorrect or step.unuseful for step in steps)),
        **features,
    }


def build_prefix_examples(sample: dict[str, Any], steps: list[StepRecord]) -> list[dict[str, Any]]:
    examples = []
    previous_action_hashes: set[str] = set()
    previous_observation_hashes: set[str] = set()
    for index in range(0, max(0, len(steps) - 1)):
        current = steps[index]
        examples.append(
            example_for_step(sample, steps, index, previous_action_hashes, previous_observation_hashes)
        )
        action_hash = sha256_text(current.action_text)
        observation_hash = sha256_text(current.observation_text)
        if action_hash is not None:
            previous_action_hashes.add(action_hash)
        if observation_hash is not None:
            previous_observation_hashes.add(observation_hash)
    return examples


RAW_TEXT_KEYS = {
    "action_text",
    "observation_text",
    "raw_action",
    "raw_observation",
    "content",
    "prompt",
    "response",
}


def validate_no_raw_text(example: dict[str, Any]) -> bool:
    return not any(key in example for key in RAW_TEXT_KEYS)


def validate_no_future_leakage(example: dict[str, Any]) -> bool:
    return int(example["next_step_index"]) > int(example["step_index"])


def validate_positive_targets_traceable(
    examples: list[dict[str, Any]],
    steps: list[StepRecord],
) -> list[str]:
    labels = {step.step_index for step in steps if step.incorrect or step.unuseful}
    failures = []
    for example in examples:
        if example["next_step_bad"] == 1 and example["next_step_index"] not in labels:
            failures.append(f"{example['trajectory_id']}:{example['step_index']}->{example['next_step_index']}")
    return failures


def audit_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Prefix Preview Audit",
        "",
        "Tiny leakage-safe prefix preview over sampled CodeTraceBench artifacts only.",
        "",
        "This is not production CodingActionGate validation, not a conformal claim, and not a production statistical guarantee.",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Truncated Examples", ""])
    for example in report.get("truncated_human_examples", []):
        lines.append(f"### {example['trajectory_id']} step {example['step_index']}")
        lines.append("")
        lines.append(f"- Action preview: `{example['action_preview']}`")
        lines.append(f"- Observation preview: `{example['observation_preview']}`")
        lines.append("")
    lines.extend(
        [
            "## Privacy Note",
            "",
            "`data/processed/prefix_preview.jsonl` excludes full raw action and observation text. It stores hashes, lengths, keyword counts, coarse kind guesses, and labels.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    sample_manifest_path = Path(args.sample_manifest)
    if not sample_manifest_path.exists():
        raise SystemExit(f"ERROR: Sample manifest not found: {sample_manifest_path}")
    sample_manifest = json.loads(sample_manifest_path.read_text())
    all_examples: list[dict[str, Any]] = []
    trajectory_reports = []
    truncated_examples = []
    validation_failures: list[str] = []
    for sample in sample_manifest.get("samples", []):
        steps, recovery = recover_steps(sample)
        examples = build_prefix_examples(sample, steps)
        validation_failures.extend(validate_positive_targets_traceable(examples, steps))
        raw_text_failures = [ex for ex in examples if not validate_no_raw_text(ex)]
        leakage_failures = [ex for ex in examples if not validate_no_future_leakage(ex)]
        if raw_text_failures:
            validation_failures.append(f"{sample.get('traj_id')}: raw text keys found")
        if leakage_failures:
            validation_failures.append(f"{sample.get('traj_id')}: next_step_index leakage guard failed")
        all_examples.extend(examples)
        if steps:
            truncated_examples.append(
                {
                    "trajectory_id": sample.get("traj_id"),
                    "step_index": steps[0].step_index,
                    "action_preview": inspect.safe_truncate_text(steps[0].action_text, 180),
                    "observation_preview": inspect.safe_truncate_text(steps[0].observation_text, 180),
                }
            )
        trajectory_reports.append(
            {
                "trajectory_id": sample.get("traj_id"),
                "ordered_steps_recovered": len(steps),
                "prefix_examples": len(examples),
                "next_step_bad_positives": sum(ex["next_step_bad"] for ex in examples),
                "next_step_incorrect_positives": sum(ex["next_step_incorrect"] for ex in examples),
                "next_step_unuseful_positives": sum(ex["next_step_unuseful"] for ex in examples),
                **recovery,
            }
        )
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PREFIX_PREVIEW_PATH.write_text(
        "".join(json.dumps(example, sort_keys=True) + "\n" for example in all_examples)
    )
    summary = {
        "sampled_artifacts_parsed": len(sample_manifest.get("samples", [])),
        "trajectories_parsed": len(trajectory_reports),
        "ordered_steps_recovered": sum(item["ordered_steps_recovered"] for item in trajectory_reports),
        "prefix_examples_created": len(all_examples),
        "next_step_bad_positives": sum(example["next_step_bad"] for example in all_examples),
        "next_step_incorrect_positives": sum(example["next_step_incorrect"] for example in all_examples),
        "next_step_unuseful_positives": sum(example["next_step_unuseful"] for example in all_examples),
        "current_step_bad_positives": sum(example["current_step_bad"] for example in all_examples),
        "malformed_or_unmapped_step_parts": sum(item["malformed_or_unmapped_step_parts"] for item in trajectory_reports),
        "raw_text_excluded_from_jsonl": all(validate_no_raw_text(example) for example in all_examples),
        "no_future_leakage_guard_passed": all(validate_no_future_leakage(example) for example in all_examples),
        "positive_targets_traceable": len(validation_failures) == 0,
    }
    report = {
        "schema_version": "risk-controlled-intervention-prefix-preview.v1",
        "report_working_title": "Risk-Controlled Intervention in Coding-Agent Trajectories",
        "dataset": "NJU-LINK/CodeTraceBench",
        "claim_boundary": (
            "Batch 2 tiny prefix preview only; not production CodingActionGate validation, "
            "not a conformal claim, and not a production statistical guarantee."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "processed_path": str(PREFIX_PREVIEW_PATH.relative_to(WORKSPACE)),
        "summary": summary,
        "validation_failures": validation_failures,
        "trajectories": trajectory_reports,
        "target_distribution": dict(Counter(example["next_step_bad"] for example in all_examples)),
        "truncated_human_examples": truncated_examples[:4],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    AUDIT_MARKDOWN_PATH.write_text(audit_markdown(report) + "\n")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"Saved prefix preview: {PREFIX_PREVIEW_PATH}")
    print(f"Saved JSON audit: {AUDIT_REPORT_PATH}")
    print(f"Saved markdown audit: {AUDIT_MARKDOWN_PATH}")
    return 1 if validation_failures else 0


if __name__ == "__main__":
    sys.exit(main())
