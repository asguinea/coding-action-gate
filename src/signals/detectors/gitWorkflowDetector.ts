import { computeGitWorkflowSignals } from "../../git/gitWorkflowDetector.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const gitWorkflowDetector: SafetySignalDetector = {
  id: "git-workflow",
  compute: ({ action, policy, context }) =>
    computeGitWorkflowSignals({
      action,
      policy,
      ...(context?.cwd !== undefined ? { cwd: context.cwd } : {})
    })
};
