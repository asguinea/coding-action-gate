import { classifyPathSensitivity } from "../../paths/pathSensitivityClassifier.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const sensitivePathDetector: SafetySignalDetector = {
  id: "sensitive-path",
  compute: ({ action, policy }) => classifyPathSensitivity(action, policy)
};
