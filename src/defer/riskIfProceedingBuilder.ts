import type { DeferReasonCategory } from "./deferTypes.js";

export const buildRiskIfProceeding = (
  category: DeferReasonCategory,
  hasPendingEscalation = false
): string[] => {
  const risks: string[] = [];

  switch (category) {
    case "target_file_never_read":
      risks.push(
        "The agent may edit a file it has not inspected.",
        "The proposed change may overwrite unknown current content."
      );
      break;
    case "target_file_stale":
      risks.push(
        "The proposed change may revert newer user or agent edits.",
        "The agent may be acting on stale file state."
      );
      break;
    case "target_file_missing":
      risks.push(
        "The action may target a file that no longer exists.",
        "The agent may recreate or delete the wrong file."
      );
      break;
    case "metadata_only_observation":
      risks.push(
        "Metadata-only observation does not prove the agent knows the current file contents."
      );
      break;
    case "validation_not_run":
      risks.push(
        "The change may be committed or landed without evidence that it works."
      );
      break;
    case "validation_stale":
      risks.push("Validation results may no longer apply to the current diff.");
      break;
    case "environment_unknown":
    case "branch_unknown":
    case "context_incomplete":
    case "large_change_lacks_plan":
    case "agent_loop_detected":
    case "unknown_defer_reason":
      break;
  }

  if (hasPendingEscalation) {
    risks.push(
      "After context is refreshed, this action may still require human approval."
    );
  }

  return risks;
};
