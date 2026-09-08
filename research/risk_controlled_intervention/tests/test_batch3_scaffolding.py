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


sample_pilot = load_script("sample_pilot_artifacts")
splits = load_script("make_pilot_splits")
metrics = load_script("risk_control_metrics")
prefix_pilot = load_script("build_prefix_pilot")


class Batch3ScaffoldingTests(unittest.TestCase):
    def candidate(self, index, label_bucket="no_labels", source_bucket="swe_bench_like", difficulty="easy"):
        row = {
            "traj_id": f"traj-{index}",
            "artifact_path": f"bench_artifacts/full/traj-{index}.tar.zst",
            "category": "software-engineering" if source_bucket == "swe_bench_like" else "terminal",
            "difficulty": difficulty,
            "agent": "agent-a" if index % 2 == 0 else "agent-b",
            "model": "model-a" if index % 3 == 0 else "model-b",
            "step_count": 10 + index,
        }
        return sample_pilot.PilotCandidate(
            row=row,
            split="verified",
            row_index=index,
            label_bucket=label_bucket,
            source_bucket=source_bucket,
            artifact_path=row["artifact_path"],
        )

    def test_deterministic_stratified_selection(self):
        candidates = [
            self.candidate(1, "incorrect", "swe_bench_like", "easy"),
            self.candidate(2, "no_labels", "swe_bench_like", "hard"),
            self.candidate(3, "unuseful", "terminalbench_like", "medium"),
            self.candidate(4, "no_labels", "terminalbench_like", "easy"),
            self.candidate(5, "incorrect_and_unuseful", "swe_bench_like", "medium"),
        ]
        first = sample_pilot.deterministic_stratified_select(candidates, 4, seed=7)
        second = sample_pilot.deterministic_stratified_select(candidates, 4, seed=7)
        self.assertEqual([item.artifact_path for item in first], [item.artifact_path for item in second])
        self.assertEqual(len(first), 4)
        self.assertIn("labeled", {sample_pilot.label_presence(item.label_bucket) for item in first})
        self.assertIn("unlabeled", {sample_pilot.label_presence(item.label_bucket) for item in first})

    def test_missing_artifact_path_handling(self):
        candidate, error = sample_pilot.pilot_candidate_from_row({"traj_id": "missing"}, 4)
        self.assertIsNone(candidate)
        self.assertIsNotNone(error)
        self.assertIn("missing", error["reason"])

    def test_no_trajectory_leakage_across_splits(self):
        rows = [
            {"trajectory_id": "a", "next_step_bad": 0, "source_bucket": "swe", "difficulty": "easy", "category": "x"},
            {"trajectory_id": "a", "next_step_bad": 1, "source_bucket": "swe", "difficulty": "easy", "category": "x"},
            {"trajectory_id": "b", "next_step_bad": 0, "source_bucket": "term", "difficulty": "hard", "category": "y"},
            {"trajectory_id": "c", "next_step_bad": 0, "source_bucket": "term", "difficulty": "medium", "category": "z"},
            {"trajectory_id": "d", "next_step_bad": 1, "source_bucket": "swe", "difficulty": "easy", "category": "x"},
            {"trajectory_id": "e", "next_step_bad": 0, "source_bucket": "swe", "difficulty": "hard", "category": "x"},
        ]
        grouped = splits.group_by_trajectory(rows)
        assignments = splits.make_assignments(list(grouped), seed=1)
        self.assertFalse(splits.trajectory_leakage_exists(assignments, rows))
        assigned_counts = {split: list(assignments.values()).count(split) for split in splits.SPLIT_NAMES}
        self.assertEqual(sum(assigned_counts.values()), 5)
        self.assertGreaterEqual(assigned_counts["train"], 2)

    def test_positive_counts_reconciled_in_split_summary(self):
        rows = [
            {"trajectory_id": "a", "next_step_bad": 1, "source_bucket": "swe", "difficulty": "easy", "category": "x"},
            {"trajectory_id": "a", "next_step_bad": 0, "source_bucket": "swe", "difficulty": "easy", "category": "x"},
            {"trajectory_id": "b", "next_step_bad": 1, "source_bucket": "term", "difficulty": "hard", "category": "y"},
        ]
        assignments = {"a": "train", "b": "test"}
        summary = splits.summarize_split(rows, assignments, "train")
        self.assertEqual(summary["trajectory_count"], 1)
        self.assertEqual(summary["prefix_example_count"], 2)
        self.assertEqual(summary["next_step_bad_positives"], 1)

    def test_risk_metric_calculations(self):
        decisions = ["ALLOW", "DEFER", "ALLOW", "DEFER"]
        labels = [0, 1, 1, 0]
        self.assertEqual(metrics.allowed_bad_rate(decisions, labels), 0.5)
        self.assertEqual(metrics.deferral_rate(decisions), 0.5)
        self.assertEqual(metrics.false_deferral_rate(decisions, labels), 0.5)
        self.assertAlmostEqual(metrics.risk_gap(0.12, 0.10), 0.02)
        low, high = metrics.bootstrap_ci([0, 1, 1, 0], seed=1, iterations=50)
        self.assertLessEqual(low, high)

    def test_threshold_selection_monotonicity(self):
        scores = [0.1, 0.2, 0.3, 0.9]
        labels = [0, 0, 1, 1]
        strict = metrics.choose_threshold_for_alpha(scores, labels, 0.0)
        loose = metrics.choose_threshold_for_alpha(scores, labels, 0.5)
        self.assertLessEqual(strict, loose)

    def test_raw_text_exclusion_summary(self):
        manifest = {"artifacts": {"selected": 1, "downloaded_or_cached": 1}, "unresolved_artifact_path_rows": {"count": 0}}
        clean = [{"next_step_bad": 0, "next_step_incorrect": 0, "next_step_unuseful": 0, "current_step_bad": 0, "step_index": 1, "next_step_index": 2}]
        dirty = [dict(clean[0], action_text="raw")]
        clean_summary = prefix_pilot.summarize(manifest, [], clean, [], [])
        dirty_summary = prefix_pilot.summarize(manifest, [], dirty, [], [])
        self.assertTrue(clean_summary["raw_text_excluded_from_jsonl"])
        self.assertFalse(dirty_summary["raw_text_excluded_from_jsonl"])


if __name__ == "__main__":
    unittest.main()
