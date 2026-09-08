#!/usr/bin/env python3
"""Shared prefix parsing adapters for CodeTraceBench artifact layouts."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

PREFIX_SCRIPT = Path(__file__).resolve().with_name("build_prefix_preview.py")


def _load_prefix_module():
    spec = importlib.util.spec_from_file_location("build_prefix_preview", PREFIX_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


base = _load_prefix_module()
inspect = base.inspect
audit = base.audit
WORKSPACE = base.WORKSPACE
StepRecord = base.StepRecord

EVENT_RE = re.compile(r"/events/(\d+)\.json$")
TENSORBLOCK_RE = re.compile(r"(?:^|/)tensorblock__[^/]+-(\d+(?:\.\d+)?)\.json$")
SWE_AGENT_TRAJ_READ_LIMIT = 100_000_000


def detect_layout_family(members: list[inspect.ArchiveMember], sample: dict[str, Any] | None = None) -> str:
    """Detect a parser layout family from archive member names.

    Detection rules:
    - `terminus_episode`: `agent-logs/episode-N/response.txt` and `prompt.txt` pairs.
    - `mini_swe_mini_traj`: a `mini.traj.json` message trajectory.
    - `mini_swe_generic_traj_json`: another `.traj.json` message trajectory.
    - `swe_agent_traj`: a SWE-agent `.traj` JSON object with `trajectory` action/observation rows.
    - `openhands_events`: OpenHands numeric `sessions/.../events/N.json` stream.
    - `openhands_tensorblock`: OpenHands raw timestamped tensorblock request/response JSON files.
    """
    names = [member.name for member in members]
    has_episode_response = any(base.EPISODE_RE.search(name) and name.endswith("/response.txt") for name in names)
    has_episode_prompt = any(base.EPISODE_RE.search(name) and name.endswith("/prompt.txt") for name in names)
    if has_episode_response and has_episode_prompt:
        return "terminus_episode"
    if any(name.endswith("mini.traj.json") for name in names):
        return "mini_swe_mini_traj"
    if any(name.endswith(".traj.json") for name in names):
        return "mini_swe_generic_traj_json"
    if any(name.endswith(".traj") for name in names):
        return "swe_agent_traj"
    if any(EVENT_RE.search(name) for name in names):
        return "openhands_events"
    if any(TENSORBLOCK_RE.search(name) for name in names):
        return "openhands_tensorblock"
    return "unsupported_layout"


def parser_documentation() -> dict[str, dict[str, str]]:
    return {
        "mini_swe_mini_traj": {
            "layout_detection_rule": "Archive contains a member ending in mini.traj.json.",
            "authoritative_files_used": "agent-logs/mini.traj.json.",
            "step_ordering_rule": "Assistant messages are paired with the immediately following message in message-list order.",
            "action_source": "Assistant message content.",
            "observation_source": "Immediately following message content when present.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered 1-indexed message pairs.",
            "known_caveats": "System and non-assistant messages are skipped.",
        },
        "mini_swe_generic_traj_json": {
            "layout_detection_rule": "Archive contains a .traj.json member but not mini.traj.json.",
            "authoritative_files_used": "The first .traj.json member with a messages list.",
            "step_ordering_rule": "Assistant messages are paired with the immediately following message in message-list order.",
            "action_source": "Assistant message content.",
            "observation_source": "Immediately following message content when present.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered 1-indexed message pairs.",
            "known_caveats": "If a generic .traj.json uses a non-message schema, no steps are recovered.",
        },
        "terminus_episode": {
            "layout_detection_rule": "Archive contains agent-logs/episode-N response.txt and prompt.txt files.",
            "authoritative_files_used": "agent-logs/episode-*/response.txt and following episode prompt.txt.",
            "step_ordering_rule": "episode-N/response.txt maps to step N + 1; observation comes from episode-(N + 1)/prompt.txt.",
            "action_source": "response.txt.",
            "observation_source": "Following prompt.txt when available.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered step ids.",
            "known_caveats": "Archive episodes beyond manifest step_count are bounded out.",
        },
        "swe_agent_traj": {
            "layout_detection_rule": "Archive contains a .traj member with a JSON trajectory list.",
            "authoritative_files_used": "The first .traj member whose JSON has trajectory rows.",
            "step_ordering_rule": "Rows in the trajectory list define 1-indexed steps.",
            "action_source": "trajectory row action field.",
            "observation_source": "trajectory row observation field.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered 1-indexed rows.",
            "known_caveats": "Raw patch/pred files are not used as prefix text. Large .traj files are read up to 100 MB to avoid truncating valid JSON.",
        },
        "openhands_events": {
            "layout_detection_rule": "Archive contains sessions/.../events/N.json files.",
            "authoritative_files_used": "Numeric OpenHands event JSON files.",
            "step_ordering_rule": "Agent action events are sorted by numeric event id; each becomes one 1-indexed step.",
            "action_source": "Agent action event message.",
            "observation_source": "Event whose cause equals the action event id, using content or message.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered action-event sequence numbers; action_ref/observation_ref paths provide mapping evidence.",
            "known_caveats": "Non-action state/context events are skipped.",
        },
        "openhands_tensorblock": {
            "layout_detection_rule": "Archive contains timestamped tensorblock__*.json files.",
            "authoritative_files_used": "Timestamped tensorblock request/response JSON files.",
            "step_ordering_rule": "Files are sorted by embedded timestamp; each response is one action step.",
            "action_source": "Current tensorblock response.choices[0].message.",
            "observation_source": "New non-assistant messages appended in the next tensorblock request after the current response.",
            "label_mapping_rule": "Manifest incorrect_stages step_id values are attached to recovered 1-indexed tensorblock response steps.",
            "known_caveats": "Last response may have an empty observation if no following tensorblock request exists; raw patch/test files are not used.",
        },
    }


def parse_jsonish_member(text: str) -> Any | None:
    return base.parse_jsonish_member(text)


def read_members_texts(
    artifact_path: Path,
    artifact_format: str,
    member_names: list[str],
    max_bytes: int,
    chunk_size: int = 100,
) -> dict[str, str]:
    """Read multiple archive members, batching tar.zst extraction for performance."""
    if artifact_format != "tar.zst":
        return {
            member_name: inspect.read_member(artifact_path, artifact_format, member_name, max_bytes)
            for member_name in member_names
        }
    texts: dict[str, str] = {}
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        for start in range(0, len(member_names), chunk_size):
            chunk = member_names[start : start + chunk_size]
            result = subprocess.run(
                ["tar", "-xf", str(artifact_path), "-C", str(tmp_path), *chunk],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if result.returncode != 0:
                # GNU/BSD tar may exit nonzero on zstd stream-end quirks while still extracting members.
                missing = [name for name in chunk if not (tmp_path / name).exists()]
                if missing:
                    for name in missing:
                        texts[name] = ""
            for name in chunk:
                extracted = tmp_path / name
                if extracted.exists() and extracted.is_file():
                    texts[name] = extracted.read_bytes()[:max_bytes].decode("utf-8", errors="replace")
                else:
                    texts.setdefault(name, "")
    return texts


def infer_message_traj_steps(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
    predicate,
) -> tuple[dict[int, StepRecord], int]:
    traj_members = [member for member in members if predicate(member.name)]
    for member in traj_members:
        text = inspect.read_member(artifact_path, artifact_format, member.name, 5_000_000)
        parsed = parse_jsonish_member(text)
        messages = base.messages_from_jsonish(parsed)
        if not messages:
            continue
        steps: dict[int, StepRecord] = {}
        step_index = 1
        index = 0
        while index < len(messages):
            message = messages[index]
            if str(message.get("role", "")).lower() == "assistant":
                observation = messages[index + 1] if index + 1 < len(messages) else None
                stage_id, stage_name = base.stage_for_step(sample, step_index)
                steps[step_index] = StepRecord(
                    step_index=step_index,
                    stage_index=stage_id,
                    stage_name=stage_name,
                    action_path=member.name,
                    observation_path=member.name if observation is not None else None,
                    action_text=str(message.get("content", "")),
                    observation_text=str(observation.get("content", "")) if observation is not None else "",
                )
                step_index += 1
                index += 2
            else:
                index += 1
        return steps, 0
    return {}, 1


def infer_swe_agent_traj_steps(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
) -> tuple[dict[int, StepRecord], int]:
    traj_members = [member for member in members if member.name.endswith(".traj")]
    for member in traj_members:
        text = inspect.read_member(artifact_path, artifact_format, member.name, SWE_AGENT_TRAJ_READ_LIMIT)
        parsed = parse_jsonish_member(text)
        trajectory = parsed.get("trajectory") if isinstance(parsed, dict) else None
        if not isinstance(trajectory, list):
            continue
        steps: dict[int, StepRecord] = {}
        for step_index, row in enumerate([item for item in trajectory if isinstance(item, dict)], start=1):
            stage_id, stage_name = base.stage_for_step(sample, step_index)
            steps[step_index] = StepRecord(
                step_index=step_index,
                stage_index=stage_id,
                stage_name=stage_name,
                action_path=member.name,
                observation_path=member.name,
                action_text=str(row.get("action", "")),
                observation_text=str(row.get("observation", "")),
            )
        return steps, 0
    return {}, 1


def event_id_from_path(path: str) -> int | None:
    match = EVENT_RE.search(path)
    return int(match.group(1)) if match else None


def tensorblock_timestamp_from_path(path: str) -> float | None:
    match = TENSORBLOCK_RE.search(path)
    return float(match.group(1)) if match else None


def event_text(value: dict[str, Any], kind: str) -> str:
    if kind == "action":
        return str(value.get("message") or value.get("content") or "")
    content = value.get("content")
    if content not in (None, ""):
        return str(content)
    return str(value.get("message") or "")


def infer_openhands_event_steps(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
) -> tuple[dict[int, StepRecord], int]:
    event_members = sorted(
        [member for member in members if event_id_from_path(member.name) is not None],
        key=lambda member: event_id_from_path(member.name) or -1,
    )
    events: dict[int, tuple[str, dict[str, Any]]] = {}
    malformed = 0
    event_texts = read_members_texts(
        artifact_path,
        artifact_format,
        [member.name for member in event_members],
        5_000_000,
    )
    for member in event_members:
        event_id = event_id_from_path(member.name)
        if event_id is None:
            continue
        text = event_texts.get(member.name, "")
        parsed = parse_jsonish_member(text)
        if isinstance(parsed, dict):
            events[event_id] = (member.name, parsed)
        else:
            malformed += 1
    observations_by_cause: dict[int, tuple[str, dict[str, Any]]] = {}
    for event_id, (name, value) in events.items():
        cause = audit.as_int(value.get("cause"))
        if cause is not None and value.get("observation") is not None:
            observations_by_cause.setdefault(cause, (name, value))
    steps: dict[int, StepRecord] = {}
    action_events = [
        (event_id, name, value)
        for event_id, (name, value) in sorted(events.items())
        if str(value.get("source", "")).lower() == "agent" and value.get("action") is not None
    ]
    for step_index, (event_id, name, value) in enumerate(action_events, start=1):
        observation_name, observation_value = observations_by_cause.get(event_id, (None, {}))
        stage_id, stage_name = base.stage_for_step(sample, step_index)
        steps[step_index] = StepRecord(
            step_index=step_index,
            stage_index=stage_id,
            stage_name=stage_name,
            action_path=name,
            observation_path=observation_name,
            action_text=event_text(value, "action"),
            observation_text=event_text(observation_value, "observation") if observation_value else "",
        )
    return steps, malformed


def response_message_text(parsed: dict[str, Any]) -> str:
    response = parsed.get("response")
    if not isinstance(response, dict):
        return ""
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if message is None:
        return ""
    if isinstance(message, str):
        return message
    return json.dumps(message, sort_keys=True)


def messages_list(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    messages = parsed.get("messages")
    if not isinstance(messages, list):
        return []
    return [message for message in messages if isinstance(message, dict)]


def tensorblock_observation_text(current: dict[str, Any], next_block: dict[str, Any] | None) -> str:
    if next_block is None:
        return ""
    current_messages = messages_list(current)
    next_messages = messages_list(next_block)
    if len(next_messages) <= len(current_messages):
        return ""
    appended = next_messages[len(current_messages) :]
    non_assistant = [
        message
        for message in appended
        if str(message.get("role", "")).lower() != "assistant"
    ]
    if not non_assistant:
        return ""
    return json.dumps(non_assistant, sort_keys=True)


def infer_openhands_tensorblock_steps(
    sample: dict[str, Any],
    artifact_path: Path,
    artifact_format: str,
    members: list[inspect.ArchiveMember],
) -> tuple[dict[int, StepRecord], int]:
    tensor_members = sorted(
        [member for member in members if tensorblock_timestamp_from_path(member.name) is not None],
        key=lambda member: tensorblock_timestamp_from_path(member.name) or 0.0,
    )
    parsed_blocks: list[tuple[str, dict[str, Any]]] = []
    malformed = 0
    tensor_texts = read_members_texts(
        artifact_path,
        artifact_format,
        [member.name for member in tensor_members],
        10_000_000,
    )
    for member in tensor_members:
        text = tensor_texts.get(member.name, "")
        parsed = parse_jsonish_member(text)
        if isinstance(parsed, dict) and isinstance(parsed.get("response"), dict):
            parsed_blocks.append((member.name, parsed))
        else:
            malformed += 1
    steps: dict[int, StepRecord] = {}
    for index, (member_name, parsed) in enumerate(parsed_blocks):
        action_text = response_message_text(parsed)
        if not action_text:
            malformed += 1
            continue
        next_block = parsed_blocks[index + 1][1] if index + 1 < len(parsed_blocks) else None
        next_member = parsed_blocks[index + 1][0] if index + 1 < len(parsed_blocks) else None
        step_index = len(steps) + 1
        stage_id, stage_name = base.stage_for_step(sample, step_index)
        steps[step_index] = StepRecord(
            step_index=step_index,
            stage_index=stage_id,
            stage_name=stage_name,
            action_path=member_name,
            observation_path=next_member,
            action_text=action_text,
            observation_text=tensorblock_observation_text(parsed, next_block),
        )
    return steps, malformed


def zero_prefix_cause(
    sample: dict[str, Any],
    layout_family: str,
    recovery: dict[str, Any],
    ordered_step_count: int,
) -> str | None:
    if ordered_step_count >= 2:
        return None
    if layout_family == "unsupported_layout":
        return "unsupported_layout"
    if ordered_step_count < 2 and int(recovery.get("missing_declared_step_count") or 0) > 0:
        return "manifest/artifact step_count mismatch"
    if ordered_step_count < 2:
        return "trajectory has fewer than 2 recoverable steps"
    return "other"


def recover_steps(sample: dict[str, Any]) -> tuple[list[StepRecord], dict[str, Any]]:
    artifact_path = WORKSPACE / sample["local_path"]
    format_info = inspect.detect_artifact_format(artifact_path)
    artifact_format = format_info["format"]
    members = inspect.list_members(artifact_path, artifact_format)
    layout_family = detect_layout_family(members, sample)
    malformed = 0
    if layout_family == "terminus_episode":
        steps, malformed = base.infer_terminus_steps(sample, artifact_path, artifact_format, members)
    elif layout_family == "mini_swe_mini_traj":
        steps, malformed = infer_message_traj_steps(
            sample,
            artifact_path,
            artifact_format,
            members,
            lambda name: name.endswith("mini.traj.json"),
        )
    elif layout_family == "mini_swe_generic_traj_json":
        steps, malformed = infer_message_traj_steps(
            sample,
            artifact_path,
            artifact_format,
            members,
            lambda name: name.endswith(".traj.json"),
        )
    elif layout_family == "swe_agent_traj":
        steps, malformed = infer_swe_agent_traj_steps(sample, artifact_path, artifact_format, members)
    elif layout_family == "openhands_events":
        steps, malformed = infer_openhands_event_steps(sample, artifact_path, artifact_format, members)
    elif layout_family == "openhands_tensorblock":
        steps, malformed = infer_openhands_tensorblock_steps(sample, artifact_path, artifact_format, members)
    else:
        steps = {}
    labels = base.labels_by_step(sample)
    if layout_family == "unsupported_layout":
        declared_step_count = audit.as_int(sample.get("step_count"))
        recovery = {
            "artifact_format": artifact_format,
            "member_count": len(members),
            "layout_family": layout_family,
            "parser_adapter": None,
            "malformed_or_unmapped_step_parts": declared_step_count or len(labels),
            "declared_step_count": declared_step_count,
            "overrun_step_count": 0,
            "missing_declared_step_count": declared_step_count or 0,
            "label_count": len(labels),
            "zero_prefix_cause": "unsupported_layout",
        }
        return [], recovery
    malformed += base.apply_manifest_ref_texts(sample, artifact_path, artifact_format, members, steps)
    for step_id, label_set in labels.items():
        if step_id in steps:
            steps[step_id].incorrect = "incorrect" in label_set
            steps[step_id].unuseful = "unuseful" in label_set
        else:
            stage_id, stage_name = base.stage_for_step(sample, step_id)
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
    recovery = {
        "artifact_format": artifact_format,
        "member_count": len(members),
        "layout_family": layout_family,
        "parser_adapter": layout_family if layout_family != "unsupported_layout" else None,
        "malformed_or_unmapped_step_parts": malformed,
        "declared_step_count": declared_step_count,
        "overrun_step_count": overrun_step_count,
        "missing_declared_step_count": missing_declared_step_count,
        "label_count": len(labels),
    }
    recovery["zero_prefix_cause"] = zero_prefix_cause(sample, layout_family, recovery, len(ordered))
    return ordered, recovery


build_prefix_examples = base.build_prefix_examples
validate_positive_targets_traceable = base.validate_positive_targets_traceable
validate_no_raw_text = base.validate_no_raw_text
validate_no_future_leakage = base.validate_no_future_leakage
safe_truncate_text = inspect.safe_truncate_text
