import { isProtectedBranch } from "../../git/gitBranchProtection.js";
import { classifyGitCommand } from "../../git/gitCommandClassifier.js";
import { getGitState } from "../../git/gitStateReader.js";
import { classifyLandingAction } from "../../landing/landingActionClassifier.js";
import { computeLandingRisk } from "../../landing/landingRisk.js";
import { computeValidationGateSignals } from "../../validation/validationGateDetector.js";
import type { CodingActionGateSignals } from "../../domain/signals.js";
import type { SafetySignalDetector } from "./baseDetector.js";

export const landingGateDetector: SafetySignalDetector = {
  id: "landing-gate",
  compute: async ({
    action,
    policy,
    context
  }): Promise<CodingActionGateSignals> => {
    const classification = classifyLandingAction(action);

    if (!classification.landingAction) {
      return {
        landingAction: false,
        landingRisk: "low",
        landingReason: classification.reason
      };
    }

    const actionCwd = action.normalized.absoluteCwd ?? context?.cwd;
    const gitState = await getGitState(
      actionCwd === undefined ? {} : { cwd: actionCwd }
    );
    const gitClassification = classifyGitCommand(
      action.normalized.commandTokens ?? [],
      {
        ...(gitState.currentBranch !== undefined
          ? { currentBranch: gitState.currentBranch }
          : {}),
        ...(gitState.upstreamRemote !== undefined
          ? { upstreamRemote: gitState.upstreamRemote }
          : {})
      }
    );
    const currentBranch = gitState.currentBranch;
    const protectedBranch = gitState.isGitRepo
      ? isProtectedBranch(currentBranch, policy)
      : undefined;
    const targetBranchProtected =
      gitClassification?.targetBranch !== undefined
        ? isProtectedBranch(gitClassification.targetBranch, policy)
        : protectedBranch === true;
    const directMainlinePush =
      gitClassification?.gitCommandCategory === "git_push" &&
      targetBranchProtected === true;
    const validationSignals = await computeValidationGateSignals({
      action,
      policy,
      ...(context?.cwd !== undefined ? { cwd: context.cwd } : {}),
      ...(context?.session?.sessionId !== undefined
        ? { sessionId: context.session.sessionId }
        : {}),
      ...(context?.validationDir !== undefined
        ? { validationDir: context.validationDir }
        : {})
    });
    const risk = computeLandingRisk({
      classification,
      ...(action.normalized.command !== undefined
        ? { command: action.normalized.command }
        : {}),
      ...(currentBranch !== undefined ? { currentBranch } : {}),
      ...(protectedBranch !== undefined ? { protectedBranch } : {}),
      directMainlinePush,
      ...(gitClassification?.forcePush !== undefined
        ? { forcePush: gitClassification.forcePush }
        : {}),
      ...(gitClassification?.hookBypass !== undefined
        ? { hookBypass: gitClassification.hookBypass }
        : {}),
      ...(gitState.isDirty !== undefined
        ? { isDirtyWorktree: gitState.isDirty }
        : {}),
      ...(validationSignals.validationStatus !== undefined
        ? { validationStatus: validationSignals.validationStatus }
        : {})
    });

    return {
      landingAction: true,
      ...(classification.landingActionType !== undefined
        ? { landingActionType: classification.landingActionType }
        : {}),
      landingRisk: risk.landingRisk,
      landingReason: risk.landingReason,
      ...(risk.requiresValidation !== undefined
        ? { requiresValidation: risk.requiresValidation }
        : {}),
      ...(risk.requiresCleanWorktree !== undefined
        ? { requiresCleanWorktree: risk.requiresCleanWorktree }
        : {}),
      ...(risk.requiresHumanApproval !== undefined
        ? { requiresHumanApproval: risk.requiresHumanApproval }
        : {}),
      ...(risk.deploymentRisk !== undefined
        ? { deploymentRisk: risk.deploymentRisk }
        : {}),
      ...(risk.releaseRisk !== undefined
        ? { releaseRisk: risk.releaseRisk }
        : {}),
      ...(risk.environmentClassification !== undefined
        ? { environmentClassification: risk.environmentClassification }
        : {})
    };
  }
};
