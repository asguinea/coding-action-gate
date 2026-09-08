import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "audit_codetracebench.py"
)
SPEC = importlib.util.spec_from_file_location("audit_codetracebench", SCRIPT_PATH)
audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(audit)


class AuditHelperTests(unittest.TestCase):
    def test_safe_json_loads_parses_serialized_lists(self):
        parsed, error = audit.safe_json_loads("[1, 2, 3]")
        self.assertIsNone(error)
        self.assertEqual(parsed, [1, 2, 3])

    def test_safe_json_loads_reports_malformed(self):
        parsed, error = audit.safe_json_loads("[1,")
        self.assertIsNone(parsed)
        self.assertTrue(error.startswith("malformed:"))

    def test_label_counting_handles_overlap(self):
        counts = audit.count_label_ids(
            {
                "incorrect_step_ids": "[1, 2]",
                "unuseful_step_ids": "[2, 3]",
            }
        )
        self.assertTrue(counts["has_incorrect"])
        self.assertTrue(counts["has_unuseful"])
        self.assertEqual(counts["incorrect_count"], 2)
        self.assertEqual(counts["unuseful_count"], 2)
        self.assertEqual(counts["incorrect_or_unuseful_count"], 3)

    def test_label_counting_treats_malformed_as_empty(self):
        counts = audit.count_label_ids(
            {
                "incorrect_step_ids": "not-json",
                "unuseful_step_ids": "[4]",
            }
        )
        self.assertFalse(counts["has_incorrect"])
        self.assertTrue(counts["has_unuseful"])
        self.assertEqual(counts["incorrect_count"], 0)
        self.assertEqual(counts["unuseful_count"], 1)

    def test_label_counting_reads_nested_incorrect_stages(self):
        counts = audit.count_label_ids(
            {
                "incorrect_stages": """
                [
                  {
                    "incorrect_step_ids": [3],
                    "unuseful_step_ids": [4],
                    "steps": [
                      {"step_id": 5, "labels": ["incorrect"]},
                      {"step_id": 6, "labels": ["unuseful"]}
                    ]
                  }
                ]
                """,
            }
        )
        self.assertEqual(counts["incorrect_count"], 2)
        self.assertEqual(counts["unuseful_count"], 2)
        self.assertEqual(counts["incorrect_or_unuseful_count"], 4)

    def test_source_inference_prefers_explicit_source(self):
        source, heuristic = audit.infer_source_value(
            {
                "source": "SWE-bench",
                "artifact_path": "other/path",
            }
        )
        self.assertEqual(source, "SWE-bench")
        self.assertEqual(heuristic, "explicit column: source")

    def test_source_inference_uses_known_path_terms(self):
        source, heuristic = audit.infer_source_value(
            {
                "artifact_path": "runs/humaneval/task-001.json",
            }
        )
        self.assertEqual(source, "humaneval")
        self.assertIn("artifact_path", heuristic)

    def test_malformed_field_handling_is_reported(self):
        report = audit.audit_rows(
            [
                {
                    "step_count": "2",
                    "stages": "[{\"name\": \"stage\"}]",
                    "tags": "{bad",
                    "incorrect_step_ids": "[1]",
                    "unuseful_step_ids": "[]",
                }
            ],
            Path("manifest.json"),
            examples=1,
        )
        self.assertEqual(report["trajectory_count"], 1)
        self.assertEqual(report["json_fields"]["malformed_counts"]["tags"], 1)
        self.assertEqual(report["labels"]["total_incorrect_step_ids"], 1)

    def test_text_availability_reads_nested_refs(self):
        availability = audit.inspect_text_availability(
            [
                {
                    "incorrect_stages": """
                    [
                      {
                        "steps": [
                          {
                            "action_ref": {"content": "assistant action"},
                            "observation_ref": {"content": "tool observation"}
                          }
                        ]
                      }
                    ]
                    """
                }
            ],
            ["incorrect_stages"],
        )
        self.assertGreater(availability["sampled_rows_with_serialized_text_keys"], 0)
        self.assertIn("content", availability["serialized_text_keys_sample"])


if __name__ == "__main__":
    unittest.main()
