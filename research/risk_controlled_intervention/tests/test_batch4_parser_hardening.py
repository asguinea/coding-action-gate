import importlib.util
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


def load_script(name):
    script_path = Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


parser = load_script("prefix_parsing")
taxonomy = load_script("inspect_pilot_failures")
splits = load_script("make_pilot_splits")


def write_tar(path, files):
    with tarfile.open(path, "w") as archive:
        for name, text in files.items():
            data = text.encode("utf-8")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, fileobj=__import__("io").BytesIO(data))


class Batch4ParserHardeningTests(unittest.TestCase):
    def test_layout_detection(self):
        members = [parser.inspect.ArchiveMember("x/sessions/sessions/abc/events/1.json")]
        self.assertEqual(parser.detect_layout_family(members), "openhands_events")
        members = [parser.inspect.ArchiveMember("x/foo.traj.json")]
        self.assertEqual(parser.detect_layout_family(members), "mini_swe_generic_traj_json")
        members = [parser.inspect.ArchiveMember("x/foo.traj")]
        self.assertEqual(parser.detect_layout_family(members), "swe_agent_traj")
        members = [
            parser.inspect.ArchiveMember("x/agent-logs/episode-0/response.txt"),
            parser.inspect.ArchiveMember("x/agent-logs/episode-1/prompt.txt"),
        ]
        self.assertEqual(parser.detect_layout_family(members), "terminus_episode")

    def test_generic_traj_json_parser_synthetic_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.tar"
            write_tar(
                path,
                {
                    "run/task.traj.json": json.dumps(
                        {
                            "messages": [
                                {"role": "system", "content": "setup"},
                                {"role": "assistant", "content": "act1"},
                                {"role": "user", "content": "obs1"},
                                {"role": "assistant", "content": "act2"},
                                {"role": "user", "content": "obs2"},
                            ]
                        }
                    )
                },
            )
            members = parser.inspect.list_members(path, "tar")
            steps, malformed = parser.infer_message_traj_steps(
                {"stages": []},
                path,
                "tar",
                members,
                lambda name: name.endswith(".traj.json"),
            )
            self.assertEqual(malformed, 0)
            self.assertEqual(list(steps), [1, 2])
            self.assertEqual(steps[1].action_text, "act1")
            self.assertEqual(steps[1].observation_text, "obs1")

    def test_swe_agent_traj_parser_synthetic_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.tar"
            write_tar(
                path,
                {
                    "run/task.traj": json.dumps(
                        {"trajectory": [{"action": "ls", "observation": "ok"}, {"action": "pytest", "observation": "fail"}]}
                    )
                },
            )
            members = parser.inspect.list_members(path, "tar")
            steps, malformed = parser.infer_swe_agent_traj_steps({"stages": []}, path, "tar", members)
            self.assertEqual(malformed, 0)
            self.assertEqual(len(steps), 2)
            self.assertEqual(steps[2].action_text, "pytest")

    def test_openhands_event_parser_synthetic_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.tar"
            write_tar(
                path,
                {
                    "sessions/sessions/a/events/1.json": json.dumps(
                        {"id": 1, "source": "agent", "action": "run", "message": "Running command: ls"}
                    ),
                    "sessions/sessions/a/events/2.json": json.dumps(
                        {"id": 2, "source": "agent", "observation": "run", "cause": 1, "content": "ok"}
                    ),
                    "sessions/sessions/a/events/3.json": json.dumps(
                        {"id": 3, "source": "agent", "action": "read", "message": "Reading file"}
                    ),
                },
            )
            members = parser.inspect.list_members(path, "tar")
            steps, malformed = parser.infer_openhands_event_steps({"stages": []}, path, "tar", members)
            self.assertEqual(malformed, 0)
            self.assertEqual(len(steps), 2)
            self.assertEqual(steps[1].observation_text, "ok")
            self.assertEqual(steps[2].observation_text, "")

    def test_unsupported_layout_does_not_create_label_only_prefix_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "sample.tar"
            write_tar(local, {"only/report.json": "{}"})
            sample = {
                "local_path": str(local),
                "step_count": 3,
                "incorrect_stages": [{"incorrect_step_ids": [1, 2]}],
            }
            original_workspace = parser.WORKSPACE
            try:
                parser.WORKSPACE = Path("/")
                steps, recovery = parser.recover_steps(sample)
            finally:
                parser.WORKSPACE = original_workspace
            self.assertEqual(steps, [])
            self.assertEqual(recovery["zero_prefix_cause"], "unsupported_layout")

    def test_archive_diagnosis_non_zstd(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "not_archive.txt"
            path.write_text("not a zstd archive")
            diagnosis = taxonomy.archive_diagnosis(path)
            self.assertFalse(diagnosis["appears_zstd_compressed"])
            self.assertEqual(diagnosis["likely_failure_type"], "unsupported compression/archive format")

    def test_no_raw_text_and_no_future_leakage_guards(self):
        clean = {"step_index": 1, "next_step_index": 2, "action_text_hash": "abc"}
        dirty = {"step_index": 1, "next_step_index": 2, "action_text": "raw"}
        self.assertTrue(parser.validate_no_raw_text(clean))
        self.assertFalse(parser.validate_no_raw_text(dirty))
        self.assertTrue(parser.validate_no_future_leakage(clean))
        self.assertFalse(parser.validate_no_future_leakage({"step_index": 2, "next_step_index": 2}))

    def test_label_to_step_mapping_and_split_leakage(self):
        steps = [
            parser.StepRecord(step_index=1, stage_index=None, stage_name=None),
            parser.StepRecord(step_index=2, stage_index=None, stage_name=None, incorrect=True),
        ]
        examples = [{"trajectory_id": "t", "step_index": 1, "next_step_index": 2, "next_step_bad": 1}]
        self.assertEqual(parser.validate_positive_targets_traceable(examples, steps), [])
        rows = [{"trajectory_id": "t", "next_step_bad": 0}, {"trajectory_id": "u", "next_step_bad": 1}]
        self.assertFalse(splits.trajectory_leakage_exists({"t": "train", "u": "test"}, rows))


if __name__ == "__main__":
    unittest.main()
