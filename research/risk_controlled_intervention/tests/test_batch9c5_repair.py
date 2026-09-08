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


repair = load_script("repair_batch9c_missing_policy_scores")


class Batch9C5RepairTests(unittest.TestCase):
    def test_exact_config_identity_matching(self):
        row = {"target_name": "next_step_incorrect", "model_name": "hist_gradient_boosting", "feature_set": "all_minus_prefix_position"}
        self.assertTrue(repair.exact_config_match(row, ("next_step_incorrect", "hist_gradient_boosting", "all_minus_prefix_position")))
        self.assertFalse(repair.exact_config_match(row, ("next_step_incorrect", "hist_gradient_boosting", "all_structured")))

    def test_config_key(self):
        self.assertEqual(repair.config_key(("a", "b", "c")), "a::b::c")

    def test_score_output_schema(self):
        row = {
            "trajectory_id": "t1",
            "step_index": 1,
            "next_step_bad": 1,
            "next_step_incorrect": 1,
            "next_step_unuseful": 0,
        }
        record = repair.score_record(1, "test", row, "next_step_incorrect", "m", "f", 0.7)
        self.assertEqual(record["target_value"], 1)
        self.assertEqual(record["target_name"], "next_step_incorrect")
        self.assertFalse(repair.RAW_KEYS & set(record))

    def test_feature_guard_rejects_annotation_labels(self):
        original = repair.batch9b.batch9a.FEATURE_SETS.get("bad_test_set")
        repair.batch9b.batch9a.FEATURE_SETS["bad_test_set"] = ("current_step_bad",)
        try:
            guard = repair.feature_guard([("next_step_bad", "m", "bad_test_set")])
            self.assertFalse(guard["ok"])
        finally:
            if original is None:
                del repair.batch9b.batch9a.FEATURE_SETS["bad_test_set"]
            else:
                repair.batch9b.batch9a.FEATURE_SETS["bad_test_set"] = original

    def test_group_repaired_scores(self):
        rows = [
            {"split_seed": 1, "target_name": "next_step_bad", "model_name": "m", "feature_set": "f", "split": "calibration", "trajectory_id": "t", "step_index": 2},
            {"split_seed": 1, "target_name": "next_step_bad", "model_name": "m", "feature_set": "f", "split": "test", "trajectory_id": "t", "step_index": 1},
            {"split_seed": 1, "target_name": "next_step_bad", "model_name": "m", "feature_set": "f", "split": "train", "trajectory_id": "t", "step_index": 3},
        ]
        grouped = repair.group_repaired_scores(rows)
        key = (1, "next_step_bad", "m", "f")
        self.assertEqual(len(grouped[key]["calibration"]), 1)
        self.assertEqual(len(grouped[key]["test"]), 1)

    def test_policy_set_schema(self):
        policy_set = repair.recommended_policy_set({"next_step_bad::hist_gradient_boosting::all_plus_interactions"})
        self.assertIn("policies", policy_set)
        self.assertTrue(any(policy["category"] == "G_always_allow_baseline" for policy in policy_set["policies"]))
        for policy in policy_set["policies"]:
            self.assertIn("scores_available", policy)
            self.assertIn("early_intervention_events_available", policy)

    def test_markdown_creation(self):
        report = {
            "skipped_config_audit": [{
                "config": "a::b::c",
                "metrics_exist_in_batch9b_report": True,
                "row_level_scores_exist_in_batch9b_output": False,
                "event_rows_exist_in_batch9c_output": False,
                "repair_action_needed": "regenerate_row_scores_and_events",
            }],
            "repair_actions_performed": [{"config": "a::b::c"}],
            "repaired_score_counts": {"rows": 1},
            "repaired_event_counts": {"rows": 1},
            "remaining_skipped_configurations": [],
            "aggregate_repaired_metrics": {},
            "comparison_with_existing_batch9c_policies": [],
        }
        self.assertIn("No-Skipped-Config Repair", repair.markdown(report))

    def test_forbidden_language_guard(self):
        self.assertFalse(repair.forbidden_language_hits("No causal prevention claim is made."))
        self.assertTrue(repair.forbidden_language_hits("This causally prevents failures."))

    def test_raw_key_guard(self):
        self.assertEqual(repair.raw_key_hits([{"score": 0.1}]), 0)
        self.assertEqual(repair.raw_key_hits([{"action_text": "x"}]), 1)


if __name__ == "__main__":
    unittest.main()
