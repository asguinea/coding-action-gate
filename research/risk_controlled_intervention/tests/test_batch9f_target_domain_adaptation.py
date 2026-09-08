import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_target_domain_adaptation.py"
spec = importlib.util.spec_from_file_location("batch9f", SCRIPT)
batch9f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch9f)


def row(tid, step, score, bad=0, split="test"):
    return {
        "scenario": "non_openhands_to_openhands",
        "split_seed": 1,
        "split": split,
        "trajectory_id": tid,
        "step_index": step,
        "target_name": "next_step_bad",
        "target_value": bad,
        "policy_id": "next_step_bad::toy::all_structured",
        "policy_target_name": "next_step_bad",
        "policy_model_name": "toy",
        "policy_feature_set": "all_structured",
        "score": score,
        "next_step_bad": bad,
        "next_step_incorrect": bad,
        "next_step_unuseful": 0,
    }


class Batch9FTargetDomainAdaptationTests(unittest.TestCase):
    def test_adaptation_size_count_and_percent(self):
        self.assertEqual(batch9f.adaptation_count("5", 100), 5)
        self.assertEqual(batch9f.adaptation_count("10pct", 100), 10)
        self.assertEqual(batch9f.adaptation_count("10pct", 7), 1)

    def test_target_calibration_test_disjoint(self):
        rows = [row(f"t{i}", 1, 0.1 * i, bad=int(i == 1)) for i in range(6)]
        cal, test, info = batch9f.split_target_rows(rows, "next_step_bad", "2", 1, "s")
        self.assertTrue(info["target_calibration_test_disjoint"])
        self.assertTrue(set(batch9f.batch9e.group_by_trajectory(cal)).isdisjoint(batch9f.batch9e.group_by_trajectory(test)))
        self.assertEqual(info["actual_target_calibration_trajectories"], 2)

    def test_zero_positive_calibration_support_reported(self):
        source = [row("s1", 1, 0.1, 0, "calibration")]
        target_cal = [row("c1", 1, 0.2, 0)]
        target_test = [row("t1", 1, 0.9, 1)]
        support = batch9f.support_info(source, target_cal, target_test, "next_step_bad")
        self.assertEqual(support["target_calibration"]["positive_rows"], 0)
        result = batch9f.evaluate_decisions("target_domain_adaptation", "s", 1, "next_step_bad", "p", "global_row_threshold", "row_budget", 0.1, target_cal, target_test, [False], 1.0, support)
        self.assertTrue(result["zero_positive_target_calibration"])

    def test_threshold_selection_declared_calibration_only(self):
        cal = [row("c1", 1, 0.1, 0), row("c2", 1, 0.9, 1)]
        tau = batch9f.choose_global_threshold(cal, 0.5)
        test = [row("t1", 1, 0.99, 1)]
        self.assertEqual(batch9f.batch9e.decisions_global(test, tau), [True])

    def test_adaptation_delta_and_pareto_flags(self):
        aggregate = {
            "pure_heldout_reference::s::next_step_bad::p::global_row_threshold::row_budget::0.05::5": {
                "target_positive_row_capture": {"mean": 0.5},
                "trajectory_level_deferral_rate": {"mean": 0.5},
                "first_failure_coverage": {"mean": 0.4},
            },
            "target_domain_adaptation::s::next_step_bad::p::global_row_threshold::row_budget::0.05::5": {
                "target_positive_row_capture": {"mean": 0.5},
                "trajectory_level_deferral_rate": {"mean": 0.3},
                "first_failure_coverage": {"mean": 0.45},
            },
        }
        deltas = batch9f.adaptation_deltas(aggregate)
        self.assertEqual(len(deltas), 1)
        self.assertTrue(deltas[0]["lower_burden_adaptation"])

    def test_event_output_schema_no_raw_fields(self):
        rows = [row("t1", 1, 0.9, 1), row("t1", 2, 0.1, 0)]
        support = batch9f.support_info([], rows[:1], rows, "next_step_bad")
        result = batch9f.evaluate_decisions("target_domain_adaptation", "s", 1, "next_step_bad", "p", "global_row_threshold", "row_budget", 0.1, rows[:1], rows, [True, False], 0.5, support, {"adaptation_size": "1"})
        events = batch9f.event_records_for_result(result, rows, [True, False])
        self.assertIn("first_deferred_row_ordinal", events[0])
        self.assertNotIn("action_text", events[0])

    def test_recommended_method_update_schema(self):
        method = batch9f.recommended_update([])
        self.assertIn("target_domain_calibration_part_of_method", method)
        self.assertIn("next_batch", method)

    def test_markdown_report_creation(self):
        report = {
            "scenarios_evaluated": ["s"],
            "adaptation_modes": ["pure_heldout_reference", "target_domain_adaptation"],
            "adaptation_sizes": ["5"],
            "per_seed_metrics": [],
            "event_output_rows": 0,
            "aggregate_metrics": {},
            "adaptation_deltas": [],
            "recommended_method_update": batch9f.recommended_update([]),
        }
        text = batch9f.markdown(report)
        self.assertIn("Adaptation is not pure held-out generalization", text)
        self.assertIn("Target-Domain Calibration", text)

    def test_forbidden_language_guard(self):
        self.assertEqual(batch9f.forbidden_language_hits("target-domain calibration offline proxy"), [])
        self.assertTrue(batch9f.forbidden_language_hits("this provides a production guarantee"))


if __name__ == "__main__":
    unittest.main()
