import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


selector = load_script("cost_aware_policy_selector")
evidence_mod = load_script("policy_selector_evidence")
matrix_mod = load_script("build_policy_selector_decision_matrix")
spec_mod = load_script("write_cost_aware_method_spec")
claim_mod = load_script("check_method_claim_boundaries")


def evidence_bundle():
    return {
        "base_risk": 0.05,
        "best_high_capture_policy": {
            "policy": "next_step_bad::hist_gradient_boosting::all_plus_interactions",
            "model": "hist_gradient_boosting",
            "feature_set": "all_plus_interactions",
        },
        "best_lower_overfit_policy": {
            "policy": "next_step_bad::gradient_boosting::all_structured",
            "model": "gradient_boosting",
            "feature_set": "all_structured",
        },
        "best_non_position_history_policy": {
            "policy": "next_step_bad::logistic_regression::non_position_history_only",
            "model": "logistic_regression",
            "feature_set": "non_position_history_only",
        },
        "best_incorrect_specific_policy": {
            "policy": "next_step_incorrect::hist_gradient_boosting::all_minus_prefix_position",
            "model": "hist_gradient_boosting",
            "feature_set": "all_minus_prefix_position",
        },
        "iid_fixed_budget": {
            "hgb_0.05": {
                "row_deferral": 0.05,
                "trajectory_deferral": 0.47,
                "bad_row_capture": 0.41,
                "first_failure_coverage": 0.25,
            }
        },
        "heldout_shift": {
            "non_openhands_to_openhands": {
                "gb_0.05": {
                    "trajectory_deferral": 1.0,
                    "bad_row_capture": 0.17,
                    "first_failure_coverage": 1.0,
                }
            },
            "swe_like_to_terminalbench_like": {
                "logistic_history_0.05": {
                    "trajectory_deferral": 0.29,
                    "bad_row_capture": 0.60,
                }
            },
        },
        "target_domain_adaptation": {
            "non_openhands_to_openhands_gb_10": {
                "target_calibration_trajectories": 10,
                "target_calibration_positive_rows": 39,
                "trajectory_deferral": 0.79,
                "bad_row_capture": 0.07,
            }
        },
    }


class Batch9GPolicySelectorTests(unittest.TestCase):
    def test_iid_row_budget_selects_global_threshold(self):
        result = selector.select_intervention_policy(
            "row_budget",
            "next_step_bad",
            "iid_repeated",
            {"max_row_deferral": 0.05},
            {"support_status": "sufficient"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertEqual(result["recommended_policy_family"], "global_row_threshold")
        self.assertEqual(result["recommended_base_model"], "hist_gradient_boosting")
        self.assertFalse(result["no_safe_recommendation"])

    def test_trajectory_budget_selects_trajectory_family(self):
        result = selector.select_intervention_policy(
            "trajectory_budget",
            "next_step_bad",
            "iid_repeated",
            {"max_trajectory_deferral": 0.25},
            {"support_status": "sufficient"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertIn(result["recommended_policy_family"], {"trajectory_budgeted_first_crossing", "dual_budget_threshold"})

    def test_strict_alpha_warns_above_base_risk(self):
        result = selector.select_intervention_policy(
            "strict_alpha",
            "next_step_bad",
            "iid_repeated",
            {"target_alpha": 0.10},
            {"support_status": "sufficient"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertTrue(any("allow-all" in warning for warning in result["warnings"]))

    def test_strict_alpha_warns_below_base_risk(self):
        result = selector.select_intervention_policy(
            "strict_alpha",
            "next_step_bad",
            "iid_repeated",
            {"target_alpha": 0.01},
            {"support_status": "sufficient"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertTrue(any("heavy deferral" in warning for warning in result["warnings"]))

    def test_openhands_without_target_calibration_fails_closed_under_strict_constraints(self):
        result = selector.select_intervention_policy(
            "heldout_shift",
            "next_step_bad",
            "openhands_stress",
            {"minimum_bad_row_capture": 0.30, "max_trajectory_deferral": 0.50},
            {"support_status": "unavailable", "target_domain_calibration_available": False},
            evidence_bundle=evidence_bundle(),
        )
        self.assertIn(result["recommended_policy_family"], {"conservative_fallback", "no_safe_recommendation"})
        self.assertTrue(result["no_safe_recommendation"])

    def test_target_domain_adaptation_is_labeled_separately(self):
        result = selector.select_intervention_policy(
            "target_domain_adaptation",
            "next_step_bad",
            "openhands_stress",
            {"allow_adaptation": True},
            {"support_status": "sufficient", "target_domain_calibration_available": True},
            evidence_bundle=evidence_bundle(),
        )
        self.assertEqual(result["recommended_policy_family"], "target_domain_adaptation")
        self.assertTrue(any("not pure held-out" in warning for warning in result["warnings"]))

    def test_unuseful_marked_sparse_secondary(self):
        result = selector.select_intervention_policy(
            "row_budget",
            "next_step_unuseful",
            "iid_repeated",
            {"max_row_deferral": 0.05},
            {"support_status": "sparse"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertTrue(any("sparse" in warning for warning in result["warnings"]))

    def test_selector_never_recommends_metadata_features(self):
        result = selector.select_intervention_policy(
            "row_budget",
            "next_step_bad",
            "iid_repeated",
            {},
            {"support_status": "sufficient"},
            evidence_bundle=evidence_bundle(),
        )
        self.assertNotIn(result["recommended_feature_set"], {"layout_family", "parser_adapter", "source_bucket"})
        self.assertTrue(any("never as model features" in warning for warning in result["warnings"]))

    def test_decision_matrix_contains_canonical_scenarios(self):
        names = {row["scenario"] for row in matrix_mod.SCENARIOS}
        self.assertIn("iid_row_budget_5pct", names)
        self.assertIn("heldout_openhands_no_target_calibration", names)
        self.assertIn("sparse_unuseful_target", names)
        self.assertEqual(len(names), 10)

    def test_method_spec_contains_units(self):
        spec = spec_mod.method_spec(evidence_bundle())
        self.assertIn("prediction_unit", spec)
        self.assertIn("control_unit", spec)
        self.assertIn("risk_unit", spec)
        self.assertIn("row_cost", spec)
        self.assertIn("trajectory_cost", spec)

    def test_recommended_main_method_fields(self):
        method = spec_mod.recommended_main_method(evidence_bundle())
        self.assertIn("recommended_report_facing_main_method", method)
        self.assertIn("required_companion_metrics", method)
        self.assertIn("no_safe_recommendation_conditions", method)

    def test_claim_checker_catches_forbidden_phrase(self):
        result = claim_mod.check_text("This validates StepHarbor and prevents failures.")
        self.assertIn("validates StepHarbor", result["forbidden_phrase_hits"])
        self.assertIn("prevents failures", result["forbidden_phrase_hits"])

    def test_claim_checker_allows_negated_safe_phrase(self):
        text = "benchmark-level CodeTraceBench-derived cost-aware row-level risk with trajectory-level burden, calibration support, and domain shift; not production StepHarbor validation; not a production guarantee; not causal prevention."
        result = claim_mod.check_text(text)
        self.assertEqual(result["forbidden_phrase_hits"], [])

    def test_missing_evidence_reports_fail_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                evidence_mod.build_evidence_bundle(Path(tmp))


if __name__ == "__main__":
    unittest.main()
