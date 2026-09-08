import type { StepHarborSignals } from "../domain/signals.js";
import type {
  LandingRiskInput,
  LandingRiskResult,
  LandingActionType
} from "./landingActionTypes.js";

const isProductionCommand = (command: string): boolean =>
  /\b(prod|production)\b/.test(command) ||
  command.includes("--prod") ||
  command.includes("--environment production");

const isStagingCommand = (command: string): boolean =>
  /\bstaging\b/.test(command);

const environmentForDeploy = (
  command: string
): StepHarborSignals["environmentClassification"] => {
  if (isProductionCommand(command)) {
    return "production";
  }

  if (isStagingCommand(command)) {
    return "staging";
  }

  return "unknown";
};

const deployRisk = (
  command: string
): Pick<
  LandingRiskResult,
  | "deploymentRisk"
  | "environmentClassification"
  | "landingRisk"
  | "landingReason"
> => {
  if (command.includes("terraform destroy")) {
    return {
      deploymentRisk: "critical",
      environmentClassification: environmentForDeploy(command),
      landingRisk: "critical",
      landingReason: "Terraform destroy is a critical deployment action."
    };
  }

  const environmentClassification = environmentForDeploy(command);

  if (environmentClassification === "production") {
    return {
      deploymentRisk: "critical",
      environmentClassification,
      landingRisk: "critical",
      landingReason: "Production deployment is a critical landing action."
    };
  }

  return {
    deploymentRisk: "high",
    environmentClassification,
    landingRisk: "high",
    landingReason:
      environmentClassification === "staging"
        ? "Staging deployment requires human approval."
        : "Deployment target environment is unknown."
  };
};

const isHistoryLanding = (type: LandingActionType | undefined): boolean =>
  type === "commit" || type === "push" || type === "merge" || type === "rebase";

export const computeLandingRisk = (
  input: LandingRiskInput
): LandingRiskResult => {
  const { classification } = input;

  if (!classification.landingAction) {
    return {
      landingRisk: "low",
      landingReason: classification.reason ?? "Action is not a landing action."
    };
  }

  const type = classification.landingActionType;
  const command = (input.command ?? "").toLowerCase();

  if (input.directMainlinePush === true) {
    return {
      landingRisk: "critical",
      landingReason: "Direct push to a protected branch is critical.",
      requiresValidation: true,
      requiresHumanApproval: true
    };
  }

  if (input.forcePush === true) {
    return {
      landingRisk: "critical",
      landingReason: "Force push is a critical landing action.",
      requiresValidation: true,
      requiresHumanApproval: true
    };
  }

  if (input.hookBypass === true) {
    return {
      landingRisk: "critical",
      landingReason: "Hook bypass is a critical landing action.",
      requiresValidation: true,
      requiresHumanApproval: true
    };
  }

  if (input.validationStatus === "failed") {
    return {
      landingRisk: "high",
      landingReason: "Required validation failed before landing.",
      requiresValidation: true
    };
  }

  if (type === "deploy") {
    return {
      ...deployRisk(command),
      requiresValidation: true,
      requiresCleanWorktree: true,
      requiresHumanApproval: true
    };
  }

  if (type === "publish" || type === "release") {
    if (input.protectedBranch === true) {
      return {
        landingRisk: "critical",
        releaseRisk: "critical",
        landingReason:
          "Publish or release command on a protected branch is critical.",
        requiresValidation: true,
        requiresCleanWorktree: true,
        requiresHumanApproval: true
      };
    }

    return {
      landingRisk: "high",
      releaseRisk: "high",
      landingReason: "Publish or release command requires human approval.",
      requiresValidation: true,
      requiresCleanWorktree: true,
      requiresHumanApproval: true
    };
  }

  if (
    input.protectedBranch === true &&
    (type === "commit" || type === "merge" || type === "rebase")
  ) {
    return {
      landingRisk: "high",
      landingReason: "Landing action targets a protected branch.",
      requiresValidation: true,
      requiresHumanApproval: true
    };
  }

  if (input.isDirtyWorktree === true && type === "push") {
    return {
      landingRisk: "high",
      landingReason: "Dirty worktree increases landing risk.",
      requiresValidation: true,
      requiresCleanWorktree: true
    };
  }

  if (
    input.validationStatus === "not_run" ||
    input.validationStatus === "stale"
  ) {
    return {
      landingRisk: "medium",
      landingReason: "Landing action is missing fresh validation.",
      requiresValidation: true
    };
  }

  if (input.isDirtyWorktree === true && type === "commit") {
    return {
      landingRisk: "medium",
      landingReason: "Commit is proposed with a dirty worktree.",
      requiresValidation: true
    };
  }

  if (isHistoryLanding(type)) {
    return {
      landingRisk: "medium",
      landingReason: "Git landing action on a non-protected branch.",
      requiresValidation: true
    };
  }

  return {
    landingRisk: "unknown",
    landingReason: "Landing action risk could not be determined.",
    requiresValidation: true
  };
};
