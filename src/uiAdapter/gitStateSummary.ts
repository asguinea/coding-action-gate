import { getGitState } from "../git/gitStateReader.js";
import type {
  GitStateSummary,
  ReadGitStateSummaryOptions
} from "./uiAdapterTypes.js";

const repoIntegrityStatusForState = (
  isGitRepo: boolean,
  isDirty: boolean | undefined
): GitStateSummary["repoIntegrityStatus"] => {
  if (!isGitRepo) {
    return "not_git_repo";
  }

  if (isDirty === true) {
    return "dirty";
  }

  if (isDirty === false) {
    return "clean";
  }

  return "unknown";
};

export const readGitStateSummary = async (
  options: ReadGitStateSummaryOptions = {}
): Promise<GitStateSummary> => {
  const raw = await getGitState({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {})
  });

  return {
    isGitRepo: raw.isGitRepo,
    ...(raw.repoRoot !== undefined ? { repoRoot: raw.repoRoot } : {}),
    ...(raw.currentBranch !== undefined
      ? { currentBranch: raw.currentBranch }
      : {}),
    ...(raw.isDetachedHead !== undefined
      ? { isDetachedHead: raw.isDetachedHead }
      : {}),
    ...(raw.upstreamBranch !== undefined
      ? { upstreamBranch: raw.upstreamBranch }
      : {}),
    ...(raw.upstreamRemote !== undefined
      ? { upstreamRemote: raw.upstreamRemote }
      : {}),
    ...(raw.isDirty !== undefined ? { isDirty: raw.isDirty } : {}),
    ...(raw.hasUncommittedChanges !== undefined
      ? { hasUncommittedChanges: raw.hasUncommittedChanges }
      : {}),
    ...(raw.hasUntrackedFiles !== undefined
      ? { hasUntrackedFiles: raw.hasUntrackedFiles }
      : {}),
    ...(raw.lastCommitHash !== undefined
      ? { lastCommitHash: raw.lastCommitHash }
      : {}),
    repoIntegrityStatus: repoIntegrityStatusForState(
      raw.isGitRepo,
      raw.isDirty
    ),
    ...(raw.error !== undefined ? { error: raw.error } : {}),
    raw
  };
};
