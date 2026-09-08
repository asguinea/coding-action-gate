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


features = load_script("model_features")
metrics = load_script("baseline_metrics")
heuristics = load_script("run_heuristic_baselines")
lightweight = load_script("run_lightweight_baselines")
compare = load_script("compare_baselines")


class Batch7BaselineTests(unittest.TestCase):
    def toy_schema(self):
        fields = []
        for name, allowed, prohibited, label in [
            ("prefix_length", True, False, False),
            ("recent_error_keyword_count", True, False, False),
            ("action_kind_guess", True, False, False),
            ("action_text_hash", True, False, False),
            ("trajectory_id", False, True, False),
            ("artifact_path", False, True, False),
            ("next_step_bad", False, True, True),
            ("current_step_bad", False, True, True),
            ("next_step_index", False, True, False),
            ("content", False, True, False),
        ]:
            fields.append(
                {
                    "name": name,
                    "dtype": "string" if name.endswith("guess") or name.endswith("hash") or name in {"trajectory_id", "artifact_path", "content"} else "int",
                    "allowed_as_model_feature": allowed,
                    "prohibited_from_model_features": prohibited,
                    "target_or_label_only": label,
                }
            )
        return {"fields": fields}

    def toy_rows(self):
        rows = []
        for i in range(6):
            rows.append(
                {
                    "trajectory_id": f"t{i // 2}",
                    "artifact_path": "raw/path",
                    "step_index": i,
                    "next_step_index": i + 1,
                    "next_step_bad": int(i in {1, 4}),
                    "current_step_bad": int(i == 3),
                    "prefix_length": i + 1,
                    "recent_error_keyword_count": int(i == 1),
                    "action_kind_guess": "test" if i % 2 else "search",
                    "action_text_hash": f"hash-{i}",
                    "content": "raw",
                }
            )
        return rows

    def test_feature_allowlist_excludes_prohibited_raw_and_target_fields(self):
        plan = features.infer_feature_plan(self.toy_rows(), self.toy_schema(), max_categorical_cardinality=3)
        self.assertIn("prefix_length", plan["numeric_features"])
        self.assertIn("action_kind_guess", plan["categorical_features"])
        self.assertNotIn("next_step_bad", plan["feature_names_used"])
        self.assertNotIn("current_step_bad", plan["feature_names_used"])
        self.assertNotIn("content", plan["feature_names_used"])
        self.assertNotIn("artifact_path", plan["feature_names_used"])
        self.assertIn("action_text_hash", plan["excluded_fields"])
        self.assertTrue(features.raw_text_feature_guard(plan))
        self.assertTrue(features.leakage_guard(plan))

    def test_trajectory_split_preservation_detection(self):
        splits = {"split_trajectories": {"train": ["t1"], "calibration": ["t2"], "test": ["t1"]}}
        self.assertTrue(features.trajectory_split_leakage(splits))
        splits["split_trajectories"]["test"] = ["t3"]
        self.assertFalse(features.trajectory_split_leakage(splits))

    def test_heuristic_score_generation_uses_allowed_prefix_features(self):
        rows = self.toy_rows()
        funcs = heuristics.heuristic_functions(rows)
        score = funcs["observation_error_keyword_heuristic"][0](rows[1])
        self.assertEqual(score, 1.0)
        self.assertEqual(funcs["always_allow"][0](rows[1]), 0.0)

    def test_metrics_on_toy_data(self):
        scores = [0.1, 0.8, 0.2, 0.9]
        labels = [0, 1, 0, 1]
        self.assertEqual(metrics.auroc(scores, labels), 1.0)
        self.assertEqual(metrics.average_precision(scores, labels), 1.0)
        self.assertEqual(metrics.average_precision([0.5, 0.5, 0.5, 0.5], labels), 0.5)
        report = metrics.split_metrics(scores, labels, 0.5)
        self.assertEqual(report["tp"], 2)
        self.assertEqual(report["allowed_bad_rate"], 0.0)

    def test_lightweight_logistic_reproducibility_with_seed(self):
        x = [[0.0], [1.0], [2.0], [3.0]]
        y = [0, 0, 1, 1]
        w1 = lightweight.fit_logistic(x, y, class_weighted=False, seed=20250617, epochs=3)
        w2 = lightweight.fit_logistic(x, y, class_weighted=False, seed=20250617, epochs=3)
        self.assertEqual(w1, w2)
        scores = lightweight.predict_logistic(w1, x)
        self.assertEqual(len(scores), 4)

    def test_score_schema_has_no_raw_text_fields(self):
        schema = compare.score_schema()
        self.assertFalse(schema["raw_text_fields_allowed"])
        self.assertTrue(schema["higher_means_riskier"])
        self.assertFalse(any(field.get("raw_text") for field in schema["fields"]))

    def test_baseline_comparison_extract_rows(self):
        report = {
            "baselines": {
                "b": {
                    "default_threshold": 0.5,
                    "splits": {
                        "calibration": {"auroc": 0.5, "average_precision": 0.1, "deferral_rate": 0.2, "allowed_bad_rate": 0.3, "false_deferral_rate": 0.4},
                        "test": {"auroc": 0.6, "average_precision": 0.2, "deferral_rate": 0.3, "allowed_bad_rate": 0.4, "false_deferral_rate": 0.5},
                    },
                }
            }
        }
        rows = compare.extract_rows(report, "heuristic")
        self.assertEqual(rows[0]["baseline_name"], "b")
        self.assertEqual(rows[0]["test_average_precision"], 0.2)


if __name__ == "__main__":
    unittest.main()
