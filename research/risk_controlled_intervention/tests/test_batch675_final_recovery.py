import importlib.util
import sys
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


missing = load_script("recover_missing_verified_artifacts")
unsupported = load_script("final_unsupported_layout_recovery")
zero = load_script("inspect_zero_prefix_verified_cases")
coverage = load_script("final_verified_coverage_recovery")
parser = load_script("prefix_parsing")


class Batch675FinalRecoveryTests(unittest.TestCase):
    def test_missing_artifact_recovery_decision_logic(self):
        decision, rationale, path = missing.classify_recovery({"artifact_path": None}, [], None)
        self.assertEqual(decision, "not_recoverable_no_path_evidence")
        self.assertIsNone(path)
        decision, _rationale, path = missing.classify_recovery({"artifact_path": None}, [], ["bench_artifacts/full/x.tar.zst"])
        self.assertEqual(decision, "recovered_by_deterministic_path_inference")
        self.assertEqual(path, "bench_artifacts/full/x.tar.zst")
        decision, _rationale, path = missing.classify_recovery({"artifact_path": None}, [], ["a.tar.zst", "b.tar.zst"])
        self.assertEqual(decision, "not_recoverable_ambiguous")
        self.assertIsNone(path)

    def test_unsupported_recovery_classification_for_log_only_layout(self):
        cluster = {
            "layout_signature": {
                "patterns": {
                    "has_agent_log": True,
                    "has_run_instance_log": False,
                    "has_episode_response": False,
                    "has_episode_prompt": False,
                    "has_event_json_numeric": False,
                    "has_tensorblock_json": False,
                    "has_events_dir": False,
                },
                "candidate_counts": {
                    "candidate_action_files": 1,
                    "candidate_observation_files": 1,
                },
            },
            "aggregate": {"label_ref_count": 0, "label_ref_exists_count": 0},
        }
        classification, recommendation, _rationale = unsupported.classify_cluster(cluster)
        self.assertEqual(classification, "already_rejected_no_action_observation_contract")
        self.assertEqual(recommendation, "keep_excluded_documented")

    def test_zero_prefix_parser_filter_too_strict_when_trajectory_list_exists(self):
        report = {
            "ordered_steps_recovered": 0,
            "declared_step_count": 26,
            "missing_declared_step_count": 26,
            "label_count": 0,
        }
        schemas = [{"json_valid": True, "list_lengths": {"trajectory": 48}}]
        cause, recoverable, rationale = zero.classify_zero_prefix(report, schemas)
        self.assertEqual(cause, "parser_filter_too_strict")
        self.assertTrue(recoverable)
        self.assertIn("trajectory list", rationale)

    def test_zero_prefix_parser_filter_too_strict_when_json_truncated(self):
        report = {
            "ordered_steps_recovered": 0,
            "declared_step_count": 93,
            "missing_declared_step_count": 93,
            "label_count": 0,
        }
        schemas = [{"json_valid": False, "possibly_truncated": True}]
        cause, recoverable, _rationale = zero.classify_zero_prefix(report, schemas)
        self.assertEqual(cause, "parser_filter_too_strict")
        self.assertTrue(recoverable)

    def test_final_coverage_delta(self):
        after = dict(coverage.BEFORE_BATCH_675)
        after["prefix_examples"] += 10
        self.assertEqual(coverage.delta(coverage.BEFORE_BATCH_675, after, "prefix_examples"), 10)

    def test_v04_swe_agent_read_limit_is_large_enough_for_known_zero_prefix_cases(self):
        self.assertGreaterEqual(parser.SWE_AGENT_TRAJ_READ_LIMIT, 50_000_000)


if __name__ == "__main__":
    unittest.main()
