import type { MissingContextEntry } from "../domain/common.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import type { DeferReasonCategory } from "./deferTypes.js";

const withTarget = (
  entry: MissingContextEntry,
  target: string | undefined
): MissingContextEntry => ({
  ...entry,
  ...(target !== undefined ? { target } : {})
});

export const buildMissingContext = (
  category: DeferReasonCategory,
  target: string | undefined,
  signals: CodingActionGateSignals = {}
): MissingContextEntry[] => {
  switch (category) {
    case "target_file_never_read":
      return [
        withTarget(
          {
            type: "current_file_contents",
            reason: "Target file has not been observed in this session.",
            required: true
          },
          target
        )
      ];
    case "target_file_stale":
      return [
        withTarget(
          {
            type: "current_file_contents",
            reason: "Target file changed since the last observation.",
            required: true
          },
          target
        )
      ];
    case "target_file_missing":
      return [
        withTarget(
          {
            type: "file_existence",
            reason: "Target file is missing or no longer available.",
            required: true
          },
          target
        )
      ];
    case "metadata_only_observation":
      return [
        withTarget(
          {
            type: "full_file_observation",
            reason:
              "Latest observation is metadata-only and cannot authorize mutation.",
            required: true
          },
          target
        )
      ];
    case "validation_not_run":
      return [
        {
          type: "validation_result",
          reason: "Required validation has not been run.",
          required: true
        }
      ];
    case "validation_stale":
      return [
        {
          type: "validation_result",
          reason: "Validation is stale relative to the current action.",
          required: true
        }
      ];
    case "context_incomplete":
      return (signals.relatedTestPaths ?? []).map((relatedTestPath) => ({
        type: "related_tests",
        target: relatedTestPath,
        reason: "Related tests have not been inspected.",
        required: true
      }));
    case "environment_unknown":
    case "branch_unknown":
    case "large_change_lacks_plan":
    case "agent_loop_detected":
    case "unknown_defer_reason":
      return [];
  }
};
