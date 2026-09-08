import { evaluateDestructiveAction } from "../../destructive/destructiveHeuristics.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const destructiveActionDetector: SafetySignalDetector = {
  id: "destructive-action",
  compute: ({ action, policy }) => evaluateDestructiveAction(action, policy)
};
