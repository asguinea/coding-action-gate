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


batch9c = load_script("analyze_early_intervention_failure_propagation")


class Batch9CEarlyInterventionTests(unittest.TestCase):
    def row(self, step, score=0.1, bad=0, incorrect=0, unuseful=0, trajectory_id="t1"):
        return {
            "trajectory_id": trajectory_id,
            "step_index": step,
            "score": score,
            "next_step_bad": bad,
            "next_step_incorrect": incorrect,
            "next_step_unuseful": unuseful,
        }

    def test_first_and_second_target_positive_detection(self):
        rows = [self.row(1), self.row(2, bad=1, incorrect=1), self.row(3), self.row(4, bad=1, incorrect=1)]
        event = batch9c.trajectory_target_event(rows, "next_step_bad")
        self.assertEqual(event["first_target_positive_row_ordinal"], 2)
        self.assertEqual(event["second_target_positive_row_ordinal"], 4)
        self.assertTrue(event["has_repeated_target_positive"])

    def test_positive_run_lengths(self):
        self.assertEqual(batch9c.run_lengths([2, 3, 5, 7, 8, 9]), [2, 1, 3])

    def test_policy_timing_before_at_after_first_positive(self):
        rows = [
            self.row(1, score=0.9),
            self.row(2, score=0.1, bad=1, incorrect=1),
            self.row(3, score=0.9, bad=1, incorrect=1),
        ]
        event = batch9c.trajectory_policy_event(rows, "next_step_bad", tau=0.5)
        self.assertEqual(event["first_deferred_row_ordinal"], 1)
        self.assertTrue(event["first_deferral_before_first_positive"])
        self.assertTrue(event["first_deferral_before_or_at_first_positive"])
        self.assertEqual(event["distance_first_positive_to_first_deferral"], -1)

        rows[0]["score"] = 0.1
        rows[1]["score"] = 0.9
        event = batch9c.trajectory_policy_event(rows, "next_step_bad", tau=0.5)
        self.assertTrue(event["first_deferral_at_first_positive"])
        self.assertEqual(event["distance_first_positive_to_first_deferral"], 0)

    def test_within_k_after_first_positive_logic(self):
        rows = [self.row(1, score=0.1, bad=1, incorrect=1), self.row(2, score=0.1), self.row(3, score=0.9)]
        event = batch9c.trajectory_policy_event(rows, "next_step_bad", tau=0.5)
        self.assertFalse(event["first_deferral_within_1_after_first_positive"])
        self.assertTrue(event["first_deferral_within_2_after_first_positive"])

    def test_target_positive_rows_deferred_and_allowed_before_first_deferral(self):
        rows = [
            self.row(1, score=0.1, bad=1, incorrect=1),
            self.row(2, score=0.9, bad=1, incorrect=1),
            self.row(3, score=0.9, bad=1, incorrect=1),
        ]
        event = batch9c.trajectory_policy_event(rows, "next_step_bad", tau=0.5)
        self.assertEqual(event["target_positive_rows_deferred"], 2)
        self.assertEqual(event["target_positive_rows_allowed_before_first_deferral"], 1)

    def test_aggregate_policy_events(self):
        rows_a = [self.row(1, score=0.9, bad=1, incorrect=1), self.row(2, score=0.1)]
        rows_b = [self.row(1, score=0.1, bad=1, incorrect=1, trajectory_id="t2"), self.row(2, score=0.9, bad=1, incorrect=1, trajectory_id="t2")]
        events = [
            batch9c.trajectory_policy_event(rows_a, "next_step_bad", tau=0.5),
            batch9c.trajectory_policy_event(rows_b, "next_step_bad", tau=0.5),
        ]
        row_metrics = batch9c.row_threshold_metrics(rows_a + rows_b, "next_step_bad", tau=0.5)
        aggregate = batch9c.aggregate_policy_events(events, row_metrics)
        self.assertEqual(aggregate["trajectory_level_deferral_rate"], 1.0)
        self.assertEqual(aggregate["trajectory_level_positive_coverage"], 1.0)
        self.assertEqual(aggregate["first_failure_coverage"], 0.5)
        self.assertEqual(aggregate["repeated_failure_coverage"], 1.0)

    def test_fixed_budget_thresholding(self):
        tau = batch9c.threshold_for_budget([0.1, 0.2, 0.9, 1.0], 0.25)
        self.assertEqual(tau, 0.9)

    def test_strict_alpha_threshold_and_low_base_flag_inputs(self):
        selected = batch9c.select_alpha_threshold([0.1, 0.2, 0.9], [0, 0, 1], 0.0)
        self.assertGreaterEqual(selected["tau"], 0.2)

    def test_cross_target_target_value(self):
        row = self.row(1, incorrect=0, unuseful=1, bad=1)
        self.assertEqual(batch9c.target_value(row, "next_step_bad"), 1)
        self.assertEqual(batch9c.target_value(row, "next_step_unuseful"), 1)

    def test_event_output_schema_has_no_raw_fields(self):
        rows = [self.row(1, score=0.9, bad=1, incorrect=1)]
        event = batch9c.trajectory_policy_event(rows, "next_step_bad", tau=0.5)
        record = batch9c.event_output_record(1, "test", "t1", "next_step_bad", "next_step_bad", "m", "f", "fixed_budget", 0.05, 0.5, event)
        self.assertFalse(batch9c.RAW_KEYS & set(record))
        self.assertIn("first_deferral_before_or_at_first_positive", record)

    def test_runtime_option_parsing_quick_check(self):
        ns = type("Args", (), {"quick_check": True, "targets": None, "configs": None, "budgets": None, "alphas": None, "seeds": None})()
        targets, configs, budgets, alphas, seeds = batch9c.selected_options(ns)
        self.assertIn("next_step_bad", targets)
        self.assertEqual(len(seeds), 1)
        self.assertTrue(configs)
        self.assertTrue(budgets)
        self.assertTrue(alphas)

    def test_markdown_creation(self):
        report = {
            "failure_propagation_aggregate": {target: {} for target in batch9c.TARGETS},
            "aggregate_policy_metrics": {},
        }
        self.assertIn("Early-Intervention", batch9c.markdown(report))
        self.assertIn("candidate / not final", batch9c.report_tables(report))

    def test_forbidden_language_guard(self):
        self.assertEqual(batch9c.forbidden_language_hits("No causal prevention claim is made."), [])
        self.assertTrue(batch9c.forbidden_language_hits("This causally prevents errors."))


if __name__ == "__main__":
    unittest.main()
