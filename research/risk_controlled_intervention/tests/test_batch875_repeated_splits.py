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


utils = load_script("repeated_split_utils")
make_splits = load_script("make_repeated_verified_splits")
strict = load_script("run_repeated_strict_alpha_thresholds")
budget = load_script("run_repeated_deferral_budget_analysis")
summary = load_script("summarize_repeated_split_results")


class Batch875RepeatedSplitTests(unittest.TestCase):
    def prefix_row(self, tid, target, source="s", agent="a", layout="l", category="c", difficulty="d"):
        return {
            "trajectory_id": tid,
            "next_step_bad": target,
            "step_index": 1,
            "source_bucket": source,
            "agent": agent,
            "layout_family": layout,
            "category": category,
            "difficulty": difficulty,
        }

    def score_row(self, seed, baseline, split, score, target, tid="t1"):
        return {
            "seed": seed,
            "trajectory_id": tid,
            "step_index": 1,
            "split": split,
            "baseline_name": baseline,
            "score": score,
            "target": target,
            "next_step_bad": target,
            "higher_means_riskier": True,
        }

    def test_stratification_metadata_creation(self):
        rows = [self.prefix_row("t1", 0), self.prefix_row("t1", 1, source="x")]
        meta = utils.trajectory_metadata("t1", rows)
        self.assertTrue(meta["has_any_next_step_bad"])
        self.assertEqual(meta["positive_count"], 1)

    def test_repeated_split_deterministic_and_no_leakage(self):
        rows = []
        for index in range(30):
            rows.append(self.prefix_row(f"t{index}", int(index % 5 == 0), source=f"s{index%2}", agent=f"a{index%3}"))
        first = make_splits.create_repeated_splits(rows, seeds=(7,))
        second = make_splits.create_repeated_splits(rows, seeds=(7,))
        self.assertEqual(first["splits"][0]["assignments"], second["splits"][0]["assignments"])
        self.assertFalse(first["splits"][0]["audit"]["trajectory_leakage"])

    def test_repeated_model_score_schema_shape(self):
        row = utils.score_record(1, "test", "b", "heuristic", {"trajectory_id": "t", "step_index": 2, "next_step_bad": 1}, 0.7)
        self.assertEqual(row["seed"], 1)
        self.assertTrue(row["higher_means_riskier"])
        self.assertNotIn("action_text", row)

    def test_calibration_only_threshold_selection_per_seed(self):
        rows = [
            self.score_row(1, "toy", "calibration", 0.1, 0, "c1"),
            self.score_row(1, "toy", "calibration", 0.2, 0, "c2"),
            self.score_row(1, "toy", "calibration", 0.9, 1, "c3"),
            self.score_row(1, "toy", "test", 0.1, 1, "s1"),
            self.score_row(1, "toy", "test", 0.2, 1, "s2"),
            self.score_row(1, "toy", "test", 0.9, 0, "s3"),
        ]
        report = strict.run_thresholds(rows)
        row = next(item for item in report["threshold_results"] if item["split"] == "calibration" and item["alpha"] == 0.005)
        self.assertGreater(row["deferred_count"], 0)
        self.assertFalse(row["risk_violation"])

    def test_fixed_budget_threshold_per_seed(self):
        tau = utils.threshold_for_budget([0.1, 0.2, 0.3, 0.9], 0.25)
        self.assertEqual(tau, 0.3)
        rows = [
            self.score_row(1, "toy", "calibration", 0.1, 0, "c1"),
            self.score_row(1, "toy", "calibration", 0.2, 0, "c2"),
            self.score_row(1, "toy", "calibration", 0.3, 0, "c3"),
            self.score_row(1, "toy", "calibration", 0.9, 1, "c4"),
            self.score_row(1, "toy", "test", 0.9, 1, "s1"),
            self.score_row(1, "toy", "test", 0.1, 0, "s2"),
        ]
        report = budget.run_budget(rows)
        self.assertTrue(report["budget_results"])

    def test_repeated_aggregation_statistics(self):
        values = utils.summary_stats([1.0, 2.0, 3.0])
        self.assertEqual(values["mean"], 2.0)
        self.assertEqual(values["median"], 2.0)

    def test_no_raw_text_fields_in_score_record(self):
        row = utils.score_record(1, "test", "b", "heuristic", {"trajectory_id": "t", "step_index": 1, "next_step_bad": 0}, 0.1)
        self.assertFalse(utils.RAW_KEYS & set(row))


if __name__ == "__main__":
    unittest.main()
