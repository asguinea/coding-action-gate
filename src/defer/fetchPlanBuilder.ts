import type { FetchPlanStep } from "../domain/common.js";
import type { StepHarborSignals } from "../domain/signals.js";
import type { DeferReasonCategory } from "./deferTypes.js";

const readFileStep = (
  target: string | undefined,
  reason: string
): FetchPlanStep => ({
  type: "read_file",
  ...(target !== undefined ? { target } : {}),
  safe: true,
  reason
});

const runValidationStep = (reason: string): FetchPlanStep => ({
  type: "run_validation",
  safe: true,
  reason
});

export const buildFetchPlan = (
  category: DeferReasonCategory,
  target: string | undefined,
  signals: StepHarborSignals = {}
): FetchPlanStep[] => {
  switch (category) {
    case "target_file_never_read":
      return [
        readFileStep(
          target,
          "Read the current target file before retrying authorization."
        )
      ];
    case "target_file_stale":
      return [
        readFileStep(
          target,
          "Refresh the target file and recompute its current hash."
        )
      ];
    case "target_file_missing":
      return [
        readFileStep(
          target,
          "Confirm whether the target file exists before retrying authorization."
        )
      ];
    case "metadata_only_observation":
      return [
        readFileStep(
          target,
          "Perform a full authorized read before retrying mutation."
        )
      ];
    case "validation_not_run":
    case "validation_stale":
      return [
        runValidationStep(
          "Run required validation before retrying authorization."
        )
      ];
    case "context_incomplete":
      return (signals.relatedTestPaths ?? []).map((relatedTestPath) => ({
        type: "read_related_tests",
        target: relatedTestPath,
        safe: true,
        reason: "Inspect related tests before modifying this file."
      }));
    case "environment_unknown":
    case "branch_unknown":
    case "large_change_lacks_plan":
    case "agent_loop_detected":
    case "unknown_defer_reason":
      return [];
  }
};
