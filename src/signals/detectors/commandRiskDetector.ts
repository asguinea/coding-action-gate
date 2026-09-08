import { classifyCommandRisk } from "../../commands/commandRiskClassifier.js";
import type { StepHarborSignals } from "../../domain/signals.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const commandRiskDetector: SafetySignalDetector = {
  id: "command-risk",
  compute: ({ action }): StepHarborSignals => {
    const classification = classifyCommandRisk(action);

    if (classification === undefined) {
      return {};
    }

    return classification;
  }
};
