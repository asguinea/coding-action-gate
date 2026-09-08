import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_adaptive_trajectory_policies.py"
spec = importlib.util.spec_from_file_location("batch9e", SCRIPT)
batch9e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch9e)


def row(tid, step, score, bad=0, split="calibration", group="A"):
    return {
        "trajectory_id": tid,
        "step_index": step,
        "score": score,
        "next_step_bad": bad,
        "next_step_incorrect": bad,
        "next_step_unuseful": 0,
        "target_name": "next_step_bad",
        "target_value": bad,
        "split": split,
        "split_seed": 1,
        "source_bucket": group,
        "parser_adapter": group,
        "layout_family": group,
        "policy_id": "next_step_bad::toy::all_structured",
    }


class Batch9EAdaptivePolicyTests(unittest.TestCase):
    def test_streaming_score_reader_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "scores.jsonl"
            fixture = {
                "split_seed": 1,
                "split": "calibration",
                "trajectory_id": "t1",
                "step_index": 1,
                "target_name": "next_step_bad",
                "model_name": "toy",
                "feature_set": "all_structured",
                "score": 0.7,
                "target_value": 1,
                "next_step_bad": 1,
                "next_step_incorrect": 1,
                "next_step_unuseful": 0,
            }
            path.write_text(json.dumps(fixture) + "\n")
            meta = {("t1", 1): {"source_bucket": "A", "parser_adapter": "P"}}
            rows = []
            with path.open() as handle:
                for line in handle:
                    raw = json.loads(line)
                    self.assertTrue(batch9e.row_matches(raw, "iid_repeated", {"next_step_bad"}, {"next_step_bad::toy::all_structured"}, {1}, False))
                    rows.append(batch9e.normalize_score_row(raw, "iid_repeated", meta, False))
            self.assertEqual(rows[0]["source_bucket"], "A")
            self.assertEqual(rows[0]["policy_id"], "next_step_bad::toy::all_structured")

    def test_global_row_threshold_and_first_trigger(self):
        rows = [row("a", 1, 0.1), row("a", 2, 0.9, 1), row("a", 3, 0.8, 1), row("b", 1, 0.7)]
        tau = 0.5
        self.assertEqual(batch9e.decisions_global(rows, tau), [False, True, True, True])
        self.assertEqual(batch9e.decisions_first_trigger(rows, tau), [False, True, False, True])

    def test_max_k_defers_per_trajectory(self):
        rows = [row("a", 1, 0.9), row("a", 2, 0.8), row("a", 3, 0.7), row("b", 1, 0.9)]
        self.assertEqual(batch9e.decisions_max_k(rows, 0.5, 2), [True, True, False, True])

    def test_trajectory_budgeted_threshold_objective(self):
        rows = [
            row("a", 1, 0.9, 1),
            row("a", 2, 0.8, 1),
            row("b", 1, 0.4, 0),
            row("c", 1, 0.3, 0),
        ]
        selected = batch9e.select_trajectory_budget_threshold(rows, "next_step_bad", 0.34)
        self.assertLessEqual(selected["metrics"]["trajectory_level_deferral_rate"], 0.34)
        self.assertGreater(selected["metrics"]["target_positive_row_capture"], 0)

    def test_dual_budget_infeasibility_reporting(self):
        rows = [row("a", 1, 0.9, 1), row("b", 1, 0.8, 1)]
        selected = batch9e.select_dual_budget_threshold(rows, "next_step_bad", 0.0, 0.0)
        self.assertIn("tau", selected)
        self.assertEqual(selected["metrics"]["row_deferral_rate"], 0.0)

    def test_group_specific_threshold_fallback(self):
        rows = [row("a", 1, 0.9, 1, group="small"), row("a", 2, 0.1, 0, group="small")]
        thresholds, info = batch9e.select_group_thresholds(rows, "next_step_bad", "source_bucket", "row", 0.5, 0.42)
        self.assertEqual(thresholds["small"], 0.42)
        self.assertEqual(info["fallback_group_count"], 1)

    def test_risk_spike_uses_only_past_scores(self):
        rows = [row("a", 1, 0.5), row("a", 2, 0.55), row("a", 3, 0.9)]
        decisions = batch9e.decisions_risk_spike(rows, 0.4, "previous_delta", delta=0.2)
        self.assertEqual(decisions, [True, False, True])

    def test_short_trajectory_risk_spike_edge_case(self):
        rows = [row("a", 1, 0.5)]
        decisions = batch9e.decisions_risk_spike(rows, 0.4, "rolling_mean_std", k=3, lam=1.0)
        self.assertEqual(decisions, [True])

    def test_row_and_trajectory_metrics(self):
        rows = [row("a", 1, 0.9, 1), row("a", 2, 0.1, 0), row("b", 1, 0.8, 1)]
        metrics = batch9e.aggregate_events(rows, "next_step_bad", [True, False, False])
        self.assertAlmostEqual(metrics["row_deferral_rate"], 1 / 3)
        self.assertAlmostEqual(metrics["trajectory_level_deferral_rate"], 0.5)
        self.assertAlmostEqual(metrics["first_failure_coverage"], 0.5)

    def test_pareto_comparison_logic(self):
        aggregate = {
            "iid_repeated::s::next_step_bad::next_step_bad::toy::all_structured::global_row_threshold::row_budget::0.05": {
                "target_positive_row_capture": {"mean": 0.5},
                "trajectory_level_deferral_rate": {"mean": 0.5},
                "first_failure_coverage": {"mean": 0.5},
            },
            "iid_repeated::s::next_step_bad::next_step_bad::toy::all_structured::first_trigger_only::row_budget::0.05": {
                "target_positive_row_capture": {"mean": 0.49},
                "trajectory_level_deferral_rate": {"mean": 0.3},
                "first_failure_coverage": {"mean": 0.48},
            },
        }
        rows = batch9e.pareto_results(aggregate)
        self.assertTrue(rows[0]["same_capture_lower_burden"])
        self.assertTrue(rows[0]["first_failure_efficiency"])

    def test_pure_heldout_and_adaptation_separation(self):
        self.assertEqual(batch9e.evaluation_mode("non_openhands_to_openhands", {}), "pure_heldout_transfer")
        self.assertEqual(batch9e.evaluation_mode("non_openhands_to_openhands", {"uses_target_domain_calibration": True}), "target_domain_adaptation")

    def test_event_output_schema(self):
        rows = [row("a", 1, 0.9, 1, split="test"), row("a", 2, 0.1, 0, split="test")]
        records = batch9e.event_records(rows, "next_step_bad", [True, False], {"split_seed": 1, "scenario": "iid", "base_policy_model_name": "m", "base_policy_feature_set": "f", "adaptive_policy_family": "x", "adaptive_policy_parameters": "{}", "budget_type": "row", "budget_value": 0.1, "threshold": 0.5, "group_key": None})
        self.assertIn("first_deferred_row_ordinal", records[0])
        self.assertNotIn("action_text", records[0])

    def test_recommended_method_schema(self):
        method = batch9e.recommended_method({}, [])
        self.assertIn("recommended_main_intervention_policy", method)
        self.assertIn("next_batch", method)

    def test_markdown_report_creation(self):
        report = {
            "execution_metadata": {"quick_check_passed": True, "evaluation_modes": ["iid_repeated"]},
            "per_seed_metrics": [],
            "event_output_rows": 0,
            "adaptive_policy_definitions": batch9e.adaptive_policy_definitions(),
            "aggregate_metrics": {},
            "pareto_comparisons": [],
            "recommended_method": batch9e.recommended_method({}, []),
        }
        text = batch9e.markdown(report)
        self.assertIn("Pure held-out transfer", text)
        self.assertIn("Target-domain calibration / adaptation", text)

    def test_forbidden_language_guard(self):
        self.assertEqual(batch9e.forbidden_language_hits("offline proxy only"), [])
        self.assertTrue(batch9e.forbidden_language_hits("this provides a production guarantee"))


if __name__ == "__main__":
    unittest.main()
