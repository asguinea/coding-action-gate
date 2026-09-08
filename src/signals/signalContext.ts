import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { StepHarborPolicy } from "../domain/policies.js";
import type { StepHarborSignals } from "../domain/signals.js";

export interface SafetySignalContext {
  cwd?: string;
  workspaceRoots?: string[];
  observationDir?: string;
  validationDir?: string;
  session?: {
    sessionId?: string;
    userId?: string;
    agentId?: string;
    repoId?: string;
    workspaceId?: string;
  };
}

export interface SafetySignalInput {
  action: NormalizedStepHarborAction;
  policy: StepHarborPolicy;
  providedSignals?: StepHarborSignals;
  context?: SafetySignalContext;
}
