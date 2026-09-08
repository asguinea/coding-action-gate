import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { CodingActionGatePolicy } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import { isProtectedBranch } from "./gitBranchProtection.js";
import {
  classifyGitCommand,
  gitCommandSignals,
  type GitCommandClassification
} from "./gitCommandClassifier.js";
import { getGitState } from "./gitStateReader.js";
import type { GitState } from "./gitTypes.js";

export const isGitWorkflowAction = (
  action: NormalizedCodingActionGateAction
): boolean =>
  action.type === "git_command" ||
  (action.type === "run_command" &&
    action.normalized.isGitLikeCommand === true) ||
  (action.type === "validation_command" &&
    action.normalized.isGitLikeCommand === true);

const repoIntegrityStatus = (
  gitState: GitState
): NonNullable<CodingActionGateSignals["repoIntegrityStatus"]> => {
  if (!gitState.isGitRepo) {
    return "not_git_repo";
  }

  if (gitState.isDirty === true) {
    return "dirty";
  }

  if (gitState.isDirty === false) {
    return "clean";
  }

  return "unknown";
};

const highRiskGitCategories = new Set<string>(["git_reset", "git_clean"]);

const computeBranchRisk = (input: {
  gitState: GitState;
  classification: GitCommandClassification | undefined;
  protectedBranch: boolean | undefined;
  directMainlineCommit: boolean | undefined;
  directMainlinePush: boolean | undefined;
}): NonNullable<CodingActionGateSignals["branchRisk"]> => {
  const { gitState, classification } = input;

  if (!gitState.isGitRepo) {
    return "unknown";
  }

  if (classification === undefined) {
    return "unknown";
  }

  if (
    classification.forcePush === true ||
    classification.hookBypass === true ||
    input.directMainlinePush === true ||
    highRiskGitCategories.has(classification.gitCommandCategory)
  ) {
    return "critical";
  }

  if (
    input.directMainlineCommit === true ||
    (input.protectedBranch === true && classification.mutatesGit) ||
    (gitState.isDetachedHead === true && classification.mutatesGit)
  ) {
    return "high";
  }

  if (
    (gitState.isDirty === true && classification.mutatesGit) ||
    (classification.gitCommandCategory === "git_push" &&
      classification.remoteTarget === undefined) ||
    (gitState.currentBranch === undefined && classification.mutatesGit)
  ) {
    return "medium";
  }

  if (!classification.mutatesGit) {
    return "low";
  }

  if (classification.gitCommandCategory === "git_unknown") {
    return "unknown";
  }

  return "low";
};

const workflowReason = (input: {
  gitState: GitState;
  branchRisk: NonNullable<CodingActionGateSignals["branchRisk"]>;
  directMainlineCommit: boolean;
  directMainlinePush: boolean;
  classification: GitCommandClassification | undefined;
}): string => {
  if (!input.gitState.isGitRepo) {
    return "Git state is unavailable because the current directory is not a git repository.";
  }

  if (input.classification?.forcePush === true) {
    return "Git command attempts to force push.";
  }

  if (input.classification?.hookBypass === true) {
    return "Git command attempts to bypass hooks.";
  }

  if (input.directMainlinePush) {
    return "Git command pushes directly to a protected branch.";
  }

  if (input.directMainlineCommit) {
    return "Git command commits directly on a protected branch.";
  }

  if (
    input.gitState.isDetachedHead === true &&
    input.classification?.mutatesGit === true
  ) {
    return "Git mutation is proposed while HEAD is detached.";
  }

  if (
    input.gitState.isDirty === true &&
    input.classification?.mutatesGit === true
  ) {
    return "Git mutation is proposed with a dirty worktree.";
  }

  return `Git workflow branch risk is ${input.branchRisk}.`;
};

export const computeGitWorkflowSignals = async (input: {
  action: NormalizedCodingActionGateAction;
  policy: CodingActionGatePolicy;
  cwd?: string;
}): Promise<CodingActionGateSignals> => {
  if (!isGitWorkflowAction(input.action)) {
    return {};
  }

  const actionCwd = input.action.normalized.absoluteCwd ?? input.cwd;
  const gitState = await getGitState(
    actionCwd === undefined ? {} : { cwd: actionCwd }
  );
  const classification = classifyGitCommand(
    input.action.normalized.commandTokens ?? [],
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
    ? isProtectedBranch(currentBranch, input.policy)
    : undefined;
  const targetBranchProtected =
    classification?.targetBranch !== undefined
      ? isProtectedBranch(classification.targetBranch, input.policy)
      : protectedBranch === true;
  const directMainlineCommit =
    classification?.gitCommandCategory === "git_commit" &&
    protectedBranch === true;
  const directMainlinePush =
    classification?.gitCommandCategory === "git_push" &&
    targetBranchProtected === true;
  const branchRisk = computeBranchRisk({
    gitState,
    classification,
    protectedBranch,
    directMainlineCommit,
    directMainlinePush
  });

  return {
    ...gitCommandSignals(classification),
    ...(currentBranch !== undefined ? { currentBranch } : {}),
    ...(protectedBranch !== undefined ? { protectedBranch } : {}),
    ...(gitState.upstreamBranch !== undefined
      ? { upstreamBranch: gitState.upstreamBranch }
      : {}),
    ...(gitState.isDetachedHead !== undefined
      ? { isDetachedHead: gitState.isDetachedHead }
      : {}),
    ...(gitState.isDirty !== undefined
      ? { isDirtyWorktree: gitState.isDirty }
      : {}),
    ...(gitState.hasUncommittedChanges !== undefined
      ? { hasUncommittedChanges: gitState.hasUncommittedChanges }
      : {}),
    ...(gitState.hasUntrackedFiles !== undefined
      ? { hasUntrackedFiles: gitState.hasUntrackedFiles }
      : {}),
    repoIntegrityStatus: repoIntegrityStatus(gitState),
    branchRisk,
    directMainlineCommit,
    directMainlinePush,
    requiredPrWorkflow:
      directMainlineCommit === true || directMainlinePush === true,
    gitWorkflowReason: workflowReason({
      gitState,
      branchRisk,
      directMainlineCommit,
      directMainlinePush,
      classification
    })
  };
};
