import type { StepHarborSignals } from "../../domain/signals.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const actionMetadataDetector: SafetySignalDetector = {
  id: "action-metadata",
  compute: ({ action }): StepHarborSignals => {
    const signals: StepHarborSignals = {};

    if (action.type === "delete_file") {
      signals.destructiveOperation = true;
      signals.destructiveSubtype = "delete_file";
    }

    if (
      action.type === "read_file" ||
      action.type === "run_command" ||
      action.type === "git_command" ||
      action.type === "validation_command"
    ) {
      signals.destructiveOperation = false;
    }

    if (
      action.type === "write_file" ||
      action.type === "edit_file" ||
      action.type === "delete_file"
    ) {
      signals.mutatesFilesystem = true;
    }

    if (action.type === "read_file") {
      signals.mutatesFilesystem = false;
    }

    if (action.type === "validation_command") {
      signals.validationStatus = "unknown";
    }

    if (
      action.origin?.toolId !== undefined ||
      action.origin?.agentId !== undefined
    ) {
      signals.delegationProvenance = "partial";
    } else {
      signals.delegationProvenance = "unknown";
    }

    return signals;
  }
};
