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


deep = load_script("inspect_uncovered_cases_deep")
parser = load_script("prefix_parsing")


class Batch55DeepUncoveredTests(unittest.TestCase):
    def test_recommendation_for_swe_agent_mismatch(self):
        feasibility, action, reason, blocks = deep.classify_recommendation(
            {"classification": "parsed_zero_prefix", "likely_reason_not_covered": "manifest/artifact step_count mismatch"},
            "swe_agent_traj",
            True,
            True,
            True,
            True,
        )
        self.assertEqual(feasibility, "hard")
        self.assertEqual(action, "keep_excluded_documented")
        self.assertFalse(blocks)
        self.assertIn("manifest", reason)

    def test_recommendation_for_unreadable_archive_blocks(self):
        feasibility, action, _reason, blocks = deep.classify_recommendation(
            {"classification": "parse_failure"},
            "unsupported_layout",
            False,
            False,
            False,
            False,
        )
        self.assertEqual(feasibility, "unknown")
        self.assertEqual(action, "block_scaling_until_resolved")
        self.assertTrue(blocks)

    def test_unsupported_layout_not_feasible_without_text_contract(self):
        feasibility, action, _reason, blocks = deep.classify_recommendation(
            {"classification": "unsupported_layout"},
            "unsupported_layout",
            False,
            False,
            False,
            False,
        )
        self.assertEqual(feasibility, "not_feasible")
        self.assertEqual(action, "keep_excluded_documented")
        self.assertFalse(blocks)

    def test_deterministic_order_for_timestamped_json_is_not_enough(self):
        possible, reason = deep.deterministic_order_possible(
            "unsupported_layout",
            {"trajectory_log_files": [], "action_files": [], "observation_files": [], "event_state_files": []},
            [{"member": "run/gpt-5-1769074642.0207586.json", "json_keys": ["choices"]}],
        )
        self.assertTrue(possible)
        self.assertIn("not established", reason)

    def test_label_mapping_unlabeled_case(self):
        possible, reason = deep.label_mapping_possible([], {"label_presence": "unlabeled"}, "unsupported_layout")
        self.assertTrue(possible)
        self.assertEqual(reason, "unlabeled trajectory")

    def test_no_raw_text_guard(self):
        clean = {"cases": [{"action_text_appears_recoverable": True, "json_member_summaries": [{"sha256_prefix": "abc"}]}]}
        dirty = {"cases": [{"action_text": "raw"}]}
        self.assertTrue(deep.no_raw_text_leak(clean))
        self.assertFalse(deep.no_raw_text_leak(dirty))

    def test_report_schema_shape(self):
        case = {
            "trajectory_id": "t",
            "recommended_action": "keep_excluded_documented",
            "should_block_full_verified_extraction": False,
        }
        report = {
            "schema_version": "risk-controlled-intervention-uncovered-deep-inspection.v1",
            "summary": {"case_count": 1},
            "cases": [case],
        }
        self.assertIn("schema_version", report)
        self.assertEqual(report["cases"][0]["recommended_action"], "keep_excluded_documented")


if __name__ == "__main__":
    unittest.main()
