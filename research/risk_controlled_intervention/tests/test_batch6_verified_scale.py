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


download = load_script("download_verified_artifacts")
prefix_verified = load_script("build_prefix_verified")
verified_splits = load_script("make_verified_splits")
qa_verified = load_script("qa_verified_extraction")
taxonomy = load_script("inspect_verified_failures")
freeze = load_script("create_verified_freeze_manifest")
pilot_qa = load_script("qa_pilot_extraction")


class Batch6VerifiedScaleTests(unittest.TestCase):
    def make_row(self, trajectory_id, step_index, bad=0):
        return {
            "trajectory_id": trajectory_id,
            "artifact_id": f"{trajectory_id}.tar.zst",
            "artifact_path": f"data/verified_artifacts/{trajectory_id}.tar.zst",
            "source_bucket": f"source-{int(trajectory_id[1:]) % 2}",
            "source_inferred": "inferred",
            "agent": f"agent-{int(trajectory_id[1:]) % 2}",
            "model": "model",
            "category": "category",
            "difficulty": "medium",
            "layout_family": f"layout-{int(trajectory_id[1:]) % 2}",
            "parser_adapter": f"adapter-{int(trajectory_id[1:]) % 2}",
            "step_index": step_index,
            "next_step_index": step_index + 1,
            "next_step_bad": bad,
            "next_step_incorrect": bad,
            "next_step_unuseful": 0,
            "current_step_bad": 0,
            "current_step_incorrect": 0,
            "current_step_unuseful": 0,
            "trajectory_has_any_bad_step": 1,
            "prefix_length": step_index,
            "action_text_hash": f"a-{trajectory_id}-{step_index}",
            "observation_text_hash": f"o-{trajectory_id}-{step_index}",
            "action_length_chars": 10,
            "observation_length_chars": 20,
            "action_kind_guess": "command",
            "observation_kind_guess": "success",
        }

    def verified_gate_inputs(self):
        rows = []
        trajectory_reports = []
        assignments = {}
        split_trajectories = {"train": [], "calibration": [], "test": []}
        for traj_index in range(100):
            trajectory_id = f"t{traj_index}"
            split = "train" if traj_index < 60 else "calibration" if traj_index < 80 else "test"
            assignments[trajectory_id] = split
            split_trajectories[split].append(trajectory_id)
            for step_index in range(1, 101):
                rows.append(self.make_row(trajectory_id, step_index, int(step_index % 20 == 0)))
            trajectory_reports.append(
                {
                    "trajectory_id": trajectory_id,
                    "ordered_steps_recovered": 101,
                    "prefix_examples": 100,
                }
            )
        prefix_audit = {
            "summary": {
                "verified_manifest_trajectories": 1000,
                "artifacts_cached_found": 1000,
                "artifacts_parsed_with_prefix_examples": 900,
                "parse_failures": 0,
                "corrupted_unreadable_archive_count": 0,
                "positive_target_traceability_status": True,
                "label_mapping_success_rate": 0.95,
            },
            "trajectories": trajectory_reports,
        }
        taxonomy_report = {"blocking_for_modeling_count": 0}
        splits = {"assignments": assignments, "split_trajectories": split_trajectories}
        split_audit = {
            "trajectory_leakage_across_splits": False,
            "calibration_has_enough_positives_for_alpha_grid": True,
            "test_has_enough_positives_for_evaluation": True,
            "splits": {
                "train": {"next_step_bad_positives": 300},
                "calibration": {"next_step_bad_positives": 100},
                "test": {"next_step_bad_positives": 100},
            },
        }
        schema_text = (
            "Prefix Extraction Schema v0.2 mini_swe_mini_traj mini_swe_generic_traj_json terminus_episode "
            "swe_agent_traj openhands_events openhands_tensorblock not production CodingActionGate validation does not claim CodingActionGate is conformal "
            "does not claim production statistical guarantees Privacy Rule For Derived JSONL must not store full raw action text "
            "No target-step action text future labels calibration-based threshold selection {0.05, 0.10, 0.20}"
        )
        return rows, prefix_audit, taxonomy_report, splits, split_audit, schema_text

    def test_verified_download_manifest_record_and_missing_handling(self):
        row = {
            "traj_id": "t1",
            "task_name": "task",
            "artifact_path": "bench_artifacts/verified/t1.tar.zst",
            "agent": "agent",
            "model": "model",
            "category": "cat",
            "difficulty": "easy",
            "step_count": 3,
        }
        record, error = download.candidate_record(row, 4)
        self.assertIsNone(error)
        self.assertEqual(record["traj_id"], "t1")
        self.assertEqual(record["split"], "verified")
        missing, missing_error = download.candidate_record({"traj_id": "missing"}, 5)
        self.assertIsNone(missing)
        self.assertIn("reason", missing_error)

    def test_shard_writing_and_reading(self):
        workspace_tmp = prefix_verified.WORKSPACE / "data" / "processed" / "_test_verified_shards"
        workspace_tmp.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=workspace_tmp.parent) as tmp:
            old_shard_dir = prefix_verified.SHARD_DIR
            old_processed_dir = verified_splits.PROCESSED_DIR
            try:
                prefix_verified.SHARD_DIR = Path(tmp) / "shards"
                verified_splits.PROCESSED_DIR = Path(tmp)
                rows = [self.make_row("t0", index) for index in range(1, 6)]
                manifest = prefix_verified.write_shards(rows, shard_size=2)
                self.assertEqual([item["row_count"] for item in manifest], [2, 2, 1])
                loaded = verified_splits.load_shards(prefix_verified.SHARD_DIR)
                self.assertEqual(len(loaded), 5)
            finally:
                prefix_verified.SHARD_DIR = old_shard_dir
                verified_splits.PROCESSED_DIR = old_processed_dir

    def test_verified_split_trajectory_leakage_detection(self):
        rows = [self.make_row("t0", 1), self.make_row("t1", 1)]
        assignments = {"t0": "train", "t1": "test"}
        self.assertFalse(verified_splits.pilot_splits.trajectory_leakage_exists(assignments, rows))
        split_audit = {"trajectory_leakage_across_splits": False}
        splits = {
            "assignments": assignments,
            "split_trajectories": {"train": ["t0"], "calibration": [], "test": ["t0", "t1"]},
        }
        issues = pilot_qa.split_assignment_issues(rows, splits, split_audit)
        self.assertTrue(issues["split_overlaps"])

    def test_verified_quality_gate_ready_when_critical_checks_pass(self):
        report = qa_verified.run_verified_gate(*self.verified_gate_inputs())
        self.assertEqual(report["decision"], "READY_FOR_BASELINE_MODELING")
        self.assertEqual(report["critical_failures"], [])

    def test_verified_quality_gate_not_ready_on_raw_text_key(self):
        rows, prefix_audit, taxonomy_report, splits, split_audit, schema_text = self.verified_gate_inputs()
        rows[0]["response"] = "raw response"
        report = qa_verified.run_verified_gate(rows, prefix_audit, taxonomy_report, splits, split_audit, schema_text)
        self.assertEqual(report["decision"], "NOT_READY")

    def test_verified_quality_gate_allows_low_mapping_when_documented_nonblocking(self):
        rows, prefix_audit, taxonomy_report, splits, split_audit, schema_text = self.verified_gate_inputs()
        prefix_audit["summary"]["label_mapping_success_rate"] = 0.85
        taxonomy_report["summary"] = {"unsupported_layout": 10, "parsed_zero_prefix": 2}
        taxonomy_report["blocking_for_modeling_count"] = 0
        report = qa_verified.run_verified_gate(rows, prefix_audit, taxonomy_report, splits, split_audit, schema_text)
        self.assertNotEqual(report["decision"], "NOT_READY")
        check_items = report["checks_by_category"]["label_integrity"]
        label_check = [item for item in check_items if item["name"].startswith("label mapping success rate")][0]
        self.assertTrue(label_check["passed"])

    def test_next_step_target_integrity_guard(self):
        row = self.make_row("t0", 1, bad=0)
        row["next_step_unuseful"] = 1
        failures = pilot_qa.target_integrity_failures([row])
        self.assertEqual(failures[0]["reason"], "next_step_bad mismatch")

    def test_feature_schema_classifies_verified_added_keys_as_prohibited_unknown(self):
        schema = pilot_qa.build_feature_schema([self.make_row("t0", 1)])
        fields = {field["name"]: field for field in schema["fields"]}
        self.assertEqual(fields["layout_family"]["role"], "unknown")
        self.assertTrue(fields["layout_family"]["prohibited_from_model_features"])
        self.assertTrue(fields["prefix_length"]["allowed_as_model_feature"])

    def test_freeze_manifest_hash_calculation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hash.txt"
            path.write_text("verified")
            self.assertEqual(
                freeze.sha256_file(path),
                "1c34f88707b55e6104c4eb20e71ffa3d33e414b71ef689a15fad0640d0ac58cb",
            )

    def test_verified_failure_taxonomy_includes_unresolved_manifest_rows(self):
        download_manifest = {
            "missing_unresolved_artifact_path_rows": {"examples": [{"traj_id": "missing", "reason": "missing artifact_path"}]},
            "samples": [],
        }
        prefix_audit = {"trajectories": [], "parse_failures": []}
        artifacts = taxonomy.taxonomy_from_reports(download_manifest, prefix_audit)
        self.assertEqual(artifacts[0]["classification"], "missing_or_unresolved_artifact")
        self.assertFalse(artifacts[0]["should_block_modeling"])


if __name__ == "__main__":
    unittest.main()
