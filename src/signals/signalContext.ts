import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { CodingActionGatePolicy } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";

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
  action: NormalizedCodingActionGateAction;
  policy: CodingActionGatePolicy;
  providedSignals?: CodingActionGateSignals;
  context?: SafetySignalContext;
}
