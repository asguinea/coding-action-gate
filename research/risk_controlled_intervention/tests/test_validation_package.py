import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "build_validation_package.py"
)
SPEC = importlib.util.spec_from_file_location("build_validation_package", SCRIPT_PATH)
validation = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = validation
SPEC.loader.exec_module(validation)

WORKSPACE = Path(__file__).resolve().parents[1]


class ValidationPackageTests(unittest.TestCase):
    def test_validation_selection_prefers_labeled_swe_and_terminalbench(self):
        samples = [
            {"traj_id": "a", "label_bucket": "no_labels", "source_bucket": "swe_bench_like"},
            {"traj_id": "b", "label_bucket": "incorrect", "source_bucket": "swe_bench_like"},
            {"traj_id": "c", "label_bucket": "incorrect", "source_bucket": "terminalbench_like"},
        ]
        selected = validation.select_validation_samples(samples)
        self.assertEqual(selected["labeled_swe_like"]["traj_id"], "b")
        self.assertEqual(selected["labeled_terminalbench_like"]["traj_id"], "c")

    def test_markdown_table_generation_truncates_paths_and_uses_snippets(self):
        row = {
            "step_index": 1,
            "stage_index": 1,
            "stage_name": None,
            "action_kind_guess": "command",
            "observation_kind_guess": "success",
            "current_step_incorrect": False,
            "current_step_unuseful": False,
            "prefix_row_created": True,
            "next_step_index": 2,
            "next_step_bad": 1,
            "action_ref_path": "a/" * 120 + "response.txt",
            "observation_ref_path": "b/" * 120 + "prompt.txt",
            "action_snippet": "short action",
            "observation_snippet": "short observation",
        }
        rendered = validation.markdown_table_row(row)
        self.assertIn(".../", rendered)
        self.assertIn("short action", rendered)
        self.assertIn("short observation", rendered)

    def test_schema_lock_file_exists_and_contains_required_sections(self):
        text = (WORKSPACE / "SCHEMA_LOCK.md").read_text()
        required = [
            "Artifact Archive Format",
            "Internal Trajectory And Log Files Used",
            "Step Ordering Rule",
            "Label Mapping Rule",
            "Target Construction Rule",
            "Privacy Rule For Derived JSONL",
            "Support For Later Conformal Risk-Control Experiments",
            "Known Caveats",
            "alpha in `{0.05, 0.10, 0.20}`",
        ]
        for section in required:
            self.assertIn(section, text)

    def test_validation_json_contains_mapping_evidence(self):
        sample = {
            "traj_id": "t1",
            "local_path": "artifact.tar.zst",
            "incorrect_stages": [
                {
                    "stage_id": 1,
                    "steps": [
                        {
                            "step_id": 2,
                            "labels": ["incorrect"],
                            "action_ref": {"path": "traj/run/response.txt"},
                            "observation_ref": {"path": "traj/run/prompt.txt"},
                        }
                    ],
                }
            ],
        }
        rows = [
            validation.prefix.StepRecord(step_index=1, stage_index=1, stage_name=None),
            validation.prefix.StepRecord(step_index=2, stage_index=1, stage_name=None, incorrect=True),
        ]
        prefix_rows = [
            {
                "trajectory_id": "t1",
                "step_index": 1,
                "next_step_index": 2,
            }
        ]
        step_rows = validation.row_for_step(sample, rows, validation.prefix_rows_by_step(prefix_rows, "t1"))
        json_rows = validation.json_step_rows(step_rows)
        evidence = json_rows[1]["mapped_label_evidence"]
        self.assertEqual(evidence["action_ref_path"], "traj/run/response.txt")
        self.assertEqual(evidence["observation_ref_path"], "traj/run/prompt.txt")
        self.assertNotIn("action_snippet", json_rows[1])


if __name__ == "__main__":
    unittest.main()
