import type { DecisionPosture } from "../domain/decisions.js";

export const cliExitCodes = {
  success: 0,
  error: 1,
  defer: 2,
  escalate: 3,
  block: 4,
  validationFailed: 5
} as const;

export type CliExitCode = (typeof cliExitCodes)[keyof typeof cliExitCodes];

export const exitCodeForDecision = (decision: DecisionPosture): CliExitCode => {
  switch (decision) {
    case "PROCEED":
      return cliExitCodes.success;
    case "DEFER":
      return cliExitCodes.defer;
    case "ESCALATE":
      return cliExitCodes.escalate;
    case "BLOCK":
      return cliExitCodes.block;
  }
};
