import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "build_prefix_preview.py"
)
SPEC = importlib.util.spec_from_file_location("build_prefix_preview", SCRIPT_PATH)
prefix = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = prefix
SPEC.loader.exec_module(prefix)


class PrefixPreviewHelperTests(unittest.TestCase):
    def test_keyword_features(self):
        features = prefix.keyword_features("run pytest", "Traceback error timeout")
        self.assertGreater(features["recent_error_keyword_count"], 0)
        self.assertGreater(features["recent_timeout_keyword_count"], 0)
        self.assertGreater(features["recent_test_keyword_count"], 0)
        self.assertGreater(features["recent_exception_keyword_count"], 0)

    def test_kind_guesses(self):
        self.assertEqual(prefix.guess_action_kind("git status"), "git")
        self.assertEqual(prefix.guess_action_kind("pytest tests"), "test")
        self.assertEqual(prefix.guess_action_kind("pip install x"), "install")
        self.assertEqual(prefix.guess_observation_kind("<returncode>0</returncode>"), "success")
        self.assertEqual(prefix.guess_observation_kind("pytest failed"), "test_failure")
        self.assertEqual(prefix.guess_observation_kind(""), "empty")

    def test_repeated_indicator_uses_hashes(self):
        current = prefix.sha256_text("same")
        self.assertEqual(prefix.repeated_indicator(current, {current}), 1)
        self.assertEqual(prefix.repeated_indicator(prefix.sha256_text("new"), {current}), 0)

    def test_next_step_target_construction(self):
        sample = {"traj_id": "t1", "local_path": "artifact.tar.zst"}
        steps = [
            prefix.StepRecord(step_index=1, stage_index=1, stage_name=None, action_text="a1"),
            prefix.StepRecord(step_index=2, stage_index=1, stage_name=None, incorrect=True),
        ]
        examples = prefix.build_prefix_examples(sample, steps)
        self.assertEqual(len(examples), 1)
        self.assertEqual(examples[0]["step_index"], 1)
        self.assertEqual(examples[0]["next_step_index"], 2)
        self.assertEqual(examples[0]["next_step_bad"], 1)
        self.assertEqual(examples[0]["next_step_incorrect"], 1)

    def test_no_future_leakage_guard(self):
        self.assertTrue(prefix.validate_no_future_leakage({"step_index": 1, "next_step_index": 2}))
        self.assertFalse(prefix.validate_no_future_leakage({"step_index": 2, "next_step_index": 2}))

    def test_raw_text_guard(self):
        self.assertTrue(prefix.validate_no_raw_text({"action_text_hash": "abc"}))
        self.assertFalse(prefix.validate_no_raw_text({"action_text": "raw"}))

    def test_label_reconciliation_positive_targets(self):
        examples = [{"trajectory_id": "t1", "step_index": 1, "next_step_index": 2, "next_step_bad": 1}]
        steps = [
            prefix.StepRecord(step_index=1, stage_index=None, stage_name=None),
            prefix.StepRecord(step_index=2, stage_index=None, stage_name=None, unuseful=True),
        ]
        self.assertEqual(prefix.validate_positive_targets_traceable(examples, steps), [])

    def test_prefix_examples_stop_at_last_recovered_step(self):
        sample = {"traj_id": "t1", "local_path": "artifact.tar.zst"}
        steps = [
            prefix.StepRecord(step_index=1, stage_index=None, stage_name=None),
            prefix.StepRecord(step_index=2, stage_index=None, stage_name=None),
            prefix.StepRecord(step_index=3, stage_index=None, stage_name=None),
        ]
        examples = prefix.build_prefix_examples(sample, steps)
        self.assertEqual([example["next_step_index"] for example in examples], [2, 3])


if __name__ == "__main__":
    unittest.main()
