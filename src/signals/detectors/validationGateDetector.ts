import { computeValidationGateSignals } from "../../validation/validationGateDetector.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const validationGateDetector: SafetySignalDetector = {
  id: "validation-gate",
  compute: ({ action, policy, context }) =>
    computeValidationGateSignals({
      action,
      policy,
      ...(context?.cwd !== undefined ? { cwd: context.cwd } : {}),
      ...(context?.session?.sessionId !== undefined
        ? { sessionId: context.session.sessionId }
        : {}),
      ...(context?.validationDir !== undefined
        ? { validationDir: context.validationDir }
        : {})
    })
};
