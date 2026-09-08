import type { ActionType } from "../domain/actions.js";
import type { StepHarborPolicy, ValidationPolicy } from "../domain/policies.js";

export type ValidationPolicyTarget = "before_commit" | "before_push";

export interface ValidationCommandConfig {
  required: boolean;
  commands: string[];
}

export const getValidationCommands = (
  policy: StepHarborPolicy,
  target: ValidationPolicyTarget
): ValidationCommandConfig => {
  const validationPolicy =
    target === "before_commit"
      ? policy.validation?.beforeCommit
      : policy.validation?.beforePush;

  return {
    required: validationPolicy?.required ?? false,
    commands: validationPolicy?.commands ?? []
  };
};

export const getValidationPolicyForAction = (
  policy: StepHarborPolicy,
  actionTypeOrLandingType: ActionType | ValidationPolicyTarget
): ValidationPolicy | undefined => {
  switch (actionTypeOrLandingType) {
    case "before_commit":
    case "git_command":
      return policy.validation?.beforeCommit;
    case "before_push":
      return policy.validation?.beforePush;
    default:
      return undefined;
  }
};
