import { classifyCommandRisk } from "../../commands/commandRiskClassifier.js";
import type { CodingActionGateSignals } from "../../domain/signals.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const commandRiskDetector: SafetySignalDetector = {
  id: "command-risk",
  compute: ({ action }): CodingActionGateSignals => {
    const classification = classifyCommandRisk(action);

    if (classification === undefined) {
      return {};
    }

    return classification;
  }
};
