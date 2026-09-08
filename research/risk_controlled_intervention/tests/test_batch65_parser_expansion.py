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
cluster = load_script("cluster_unsupported_verified_layouts")
deep = load_script("inspect_unsupported_cluster_deep")
compare = load_script("compare_verified_coverage")


class Batch65ParserExpansionTests(unittest.TestCase):
    def tensorblock_payloads(self):
        return {
            "root/tensorblock__gpt-5-1000.0.json": {
                "messages": [
                    {"role": "system", "content": "system"},
                    {"role": "user", "content": "task"},
                ],
                "response": {"choices": [{"message": {"role": "assistant", "content": "run tests"}}]},
            },
            "root/tensorblock__gpt-5-1001.0.json": {
                "messages": [
                    {"role": "system", "content": "system"},
                    {"role": "user", "content": "task"},
                    {"role": "assistant", "content": "run tests"},
                    {"role": "tool", "content": "tests failed"},
                ],
                "response": {"choices": [{"message": {"role": "assistant", "content": "fix failure"}}]},
            },
            "root/tensorblock__gpt-5-1002.0.json": {
                "messages": [
                    {"role": "system", "content": "system"},
                    {"role": "user", "content": "task"},
                    {"role": "assistant", "content": "run tests"},
                    {"role": "tool", "content": "tests failed"},
                    {"role": "assistant", "content": "fix failure"},
                    {"role": "tool", "content": "tests passed"},
                ],
                "response": {"choices": [{"message": {"role": "assistant", "content": "final answer"}}]},
            },
        }

    def write_tensorblock_tar(self, path: Path) -> None:
        with tarfile.open(path, "w") as archive:
            for name, payload in self.tensorblock_payloads().items():
                data = json.dumps(payload).encode("utf-8")
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, fileobj=__import__("io").BytesIO(data))

    def sample(self, local_path: str) -> dict:
        return {
            "traj_id": "tensor-traj",
            "local_path": local_path,
            "artifact_path": local_path,
            "source_bucket": "swebench_like",
            "agent": "OpenHands",
            "model": "gpt-5",
            "category": "code",
            "difficulty": "medium",
            "step_count": 3,
            "incorrect_stages": [
                {
                    "steps": [
                        {"step_id": 2, "labels": ["incorrect"]},
                    ]
                }
            ],
        }

    def test_tensorblock_layout_detection_and_step_recovery(self):
        members = [parser.inspect.ArchiveMember(name, 1) for name in self.tensorblock_payloads()]
        self.assertEqual(parser.detect_layout_family(members), "openhands_tensorblock")
        with tempfile.TemporaryDirectory(dir=parser.WORKSPACE) as tmp:
            artifact = Path(tmp) / "tensor.tar"
            self.write_tensorblock_tar(artifact)
            sample = self.sample(str(artifact.relative_to(parser.WORKSPACE)))
            steps, recovery = parser.recover_steps(sample)
        self.assertEqual(recovery["layout_family"], "openhands_tensorblock")
        self.assertEqual([step.step_index for step in steps], [1, 2, 3])
        self.assertIn("run tests", steps[0].action_text)
        self.assertIn("tests failed", steps[0].observation_text)
        self.assertTrue(steps[1].incorrect)

    def test_tensorblock_prefix_examples_have_no_future_or_raw_text_keys(self):
        with tempfile.TemporaryDirectory(dir=parser.WORKSPACE) as tmp:
            artifact = Path(tmp) / "tensor.tar"
            self.write_tensorblock_tar(artifact)
            steps, _recovery = parser.recover_steps(self.sample(str(artifact.relative_to(parser.WORKSPACE))))
        examples = parser.build_prefix_examples(self.sample("unused"), steps)
        self.assertEqual(len(examples), 2)
        self.assertEqual(examples[0]["next_step_bad"], 1)
        self.assertEqual(examples[1]["next_step_bad"], 0)
        self.assertTrue(all(parser.validate_no_future_leakage(example) for example in examples))
        self.assertTrue(all(parser.validate_no_raw_text(example) for example in examples))
        self.assertNotIn("fix failure", json.dumps(examples[0]))

    def test_cluster_signature_and_decision_for_tensorblock(self):
        sample = {
            "traj_id": "t1",
            "agent": "OpenHands",
            "source_bucket": "swebench_like",
            "step_count": 3,
            "label_counts": {"incorrect_or_unuseful_count": 1},
        }
        members = [parser.inspect.ArchiveMember(name, 1) for name in self.tensorblock_payloads()]
        signature = cluster.signature_for_artifact(sample, members)
        self.assertEqual(signature["signature"]["layout_marker"], "openhands_tensorblock")
        fake_cluster = {
            "cluster_id": signature["cluster_id"],
            "artifact_count": 1,
            "label_positive_count": 1,
            "signature": signature["signature"],
            "aggregate": {"label_ref_count": 0, "label_ref_exists_count": 0},
        }
        decision = cluster.candidate_decision(fake_cluster)
        self.assertEqual(decision["recommended_decision"], "implement_now")
        self.assertEqual(decision["leakage_risk"], "low")

    def test_deep_inspection_report_schema_guard_allows_schema_keys_not_raw_values(self):
        report = {
            "json_schema_summaries": [
                {
                    "top_level_keys": ["messages", "response"],
                    "nested_object_keys": [{"object_key": "response", "child_keys": ["choices"]}],
                    "read_chars": 200,
                    "sha256_prefix": "abc",
                }
            ]
        }
        self.assertTrue(deep.no_raw_text_leak(report))
        unsafe_report = {"response": "raw text"}
        self.assertFalse(deep.no_raw_text_leak(unsafe_report))

    def test_coverage_comparison_deltas(self):
        after = dict(compare.V02_BASELINE)
        after["schema_version"] = "v0.3"
        after["artifacts_parsed_with_prefix_examples"] = compare.V02_BASELINE["artifacts_parsed_with_prefix_examples"] + 10
        self.assertEqual(compare.delta(compare.V02_BASELINE, after, "artifacts_parsed_with_prefix_examples"), 10)


if __name__ == "__main__":
    unittest.main()
