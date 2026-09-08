import importlib.util
import json
import sys
import tempfile
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


qa = load_script("qa_pilot_extraction")
uncovered = load_script("summarize_uncovered_pilot_cases")
freeze = load_script("create_pilot_freeze_manifest")


class Batch5QualityGateTests(unittest.TestCase):
    def row(self, trajectory_id, step_index, next_bad=0, source="s1", agent="a1"):
        return {
            "trajectory_id": trajectory_id,
            "artifact_id": f"{trajectory_id}.tar.zst",
            "artifact_path": f"data/{trajectory_id}.tar.zst",
            "source_bucket": source,
            "agent": agent,
            "step_index": step_index,
            "next_step_index": step_index + 1,
            "next_step_bad": next_bad,
            "next_step_incorrect": next_bad,
            "next_step_unuseful": 0,
            "current_step_bad": 0,
            "current_step_incorrect": 0,
            "current_step_unuseful": 0,
            "prefix_length": step_index,
            "action_text_hash": "h",
            "observation_text_hash": "o",
        }

    def passing_inputs(self):
        rows = []
        for traj in range(45):
            for step in range(1, 24):
                rows.append(self.row(f"t{traj}", step, int(step in {3, 4}), source=f"s{traj % 2}", agent=f"a{traj % 2}"))
        prefix_audit = {
            "summary": {
                "selected_manifest_rows": 50,
                "trajectories_with_prefix_examples": 45,
                "parse_failures": 0,
                "corrupted_or_unreadable_archives": 0,
                "positive_targets_traceable": True,
                "label_mapping_success_rate": 0.95,
            },
            "parser_coverage": {
                "by_layout_family": {
                    "layout_a": {"with_prefix": 20},
                    "layout_b": {"with_prefix": 25},
                }
            },
            "trajectories": [
                {"trajectory_id": f"t{traj}", "ordered_steps_recovered": 24, "prefix_examples": 23}
                for traj in range(45)
            ],
        }
        taxonomy = {"summary": {"parsed_zero_prefix": 0, "unsupported_layout": 0}}
        assignments = {f"t{traj}": "train" if traj < 27 else "calibration" if traj < 36 else "test" for traj in range(45)}
        splits = {
            "assignments": assignments,
            "split_trajectories": {
                "train": [f"t{traj}" for traj in range(27)],
                "calibration": [f"t{traj}" for traj in range(27, 36)],
                "test": [f"t{traj}" for traj in range(36, 45)],
            },
        }
        split_audit = {
            "trajectory_leakage_across_splits": False,
            "splits": {
                "train": {"next_step_bad_positives": 27},
                "calibration": {"next_step_bad_positives": 9},
                "test": {"next_step_bad_positives": 9},
            },
        }
        schema_text = (
            "Prefix Extraction Schema v0.2 mini_swe_mini_traj mini_swe_generic_traj_json terminus_episode "
            "swe_agent_traj openhands_events openhands_tensorblock not production StepHarbor validation does not claim StepHarbor is conformal "
            "does not claim production statistical guarantees Privacy Rule For Derived JSONL must not store full raw action text "
            "No target-step action text future labels calibration-based threshold selection {0.05, 0.10, 0.20}"
        )
        return rows, prefix_audit, taxonomy, splits, split_audit, schema_text

    def test_quality_gate_ready_when_all_checks_pass(self):
        report = qa.run_quality_gate(*self.passing_inputs())
        self.assertEqual(report["decision"], "READY_FOR_VERIFIED_EXTRACTION")
        self.assertEqual(report["critical_failures"], [])

    def test_quality_gate_not_ready_on_raw_text(self):
        rows, prefix_audit, taxonomy, splits, split_audit, schema_text = self.passing_inputs()
        rows[0]["action_text"] = "raw"
        report = qa.run_quality_gate(rows, prefix_audit, taxonomy, splits, split_audit, schema_text)
        self.assertEqual(report["decision"], "NOT_READY")

    def test_target_integrity_detection(self):
        row = self.row("t", 1, next_bad=0)
        row["next_step_incorrect"] = 1
        failures = qa.target_integrity_failures([row])
        self.assertEqual(failures[0]["reason"], "next_step_bad mismatch")

    def test_split_leakage_detection(self):
        rows, _prefix_audit, _taxonomy, splits, split_audit, _schema_text = self.passing_inputs()
        splits["split_trajectories"]["test"].append("t0")
        issues = qa.split_assignment_issues(rows, splits, split_audit)
        self.assertTrue(issues["split_overlaps"])

    def test_feature_schema_classification(self):
        schema = qa.build_feature_schema([self.row("t", 1)])
        fields = {field["name"]: field for field in schema["fields"]}
        self.assertTrue(fields["prefix_length"]["allowed_as_model_feature"])
        self.assertTrue(fields["next_step_bad"]["target_or_label_only"])
        self.assertTrue(fields["trajectory_id"]["prohibited_from_model_features"])

    def test_freeze_hash_calculation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "x.txt"
            path.write_text("abc")
            self.assertEqual(
                freeze.sha256_file(path),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )

    def test_uncovered_case_classification(self):
        manifest = {"samples": [{"traj_id": "t1", "label_presence": "labeled", "step_count": 3}]}
        taxonomy = {
            "artifacts": [
                {
                    "trajectory_id": "t1",
                    "classification": "unsupported_layout",
                    "layout_family": "unsupported_layout",
                    "candidate_files": {"trajectory_or_log_files": ["run.log"]},
                }
            ]
        }
        cases = uncovered.summarize_cases(manifest, taxonomy)
        self.assertEqual(cases[0]["v0_3_parser_adapter_feasibility"], "manual_review_required")
        self.assertFalse(cases[0]["should_block_full_verified_extraction"])


if __name__ == "__main__":
    unittest.main()
