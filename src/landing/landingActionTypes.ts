import type { StepHarborSignals } from "../domain/signals.js";

export const landingActionTypeValues = [
  "commit",
  "push",
  "merge",
  "rebase",
  "deploy",
  "release",
  "publish",
  "unknown_landing"
] as const;

export type LandingActionType = (typeof landingActionTypeValues)[number];

export interface LandingActionClassification {
  landingAction: boolean;
  landingActionType?: LandingActionType;
  reason?: string;
}

export interface LandingRiskInput {
  classification: LandingActionClassification;
  command?: string;
  currentBranch?: string;
  protectedBranch?: boolean;
  directMainlinePush?: boolean;
  forcePush?: boolean;
  hookBypass?: boolean;
  isDirtyWorktree?: boolean;
  validationStatus?: StepHarborSignals["validationStatus"];
}

export interface LandingRiskResult {
  landingRisk: NonNullable<StepHarborSignals["landingRisk"]>;
  landingReason: string;
  requiresValidation?: boolean;
  requiresCleanWorktree?: boolean;
  requiresHumanApproval?: boolean;
  deploymentRisk?: NonNullable<StepHarborSignals["deploymentRisk"]>;
  releaseRisk?: NonNullable<StepHarborSignals["releaseRisk"]>;
  environmentClassification?: StepHarborSignals["environmentClassification"];
}
