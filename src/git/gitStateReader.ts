import { runGitCommand } from "./gitExec.js";
import type { GitState } from "./gitTypes.js";

const trimOutput = (value: string): string => value.trim();

const gitOptions = (cwd?: string): { cwd?: string } =>
  cwd === undefined ? {} : { cwd };

const addStateError = (state: GitState, message: string): void => {
  state.error =
    state.error === undefined ? message : `${state.error}; ${message}`;
};

const parseUpstreamRemote = (upstreamBranch: string): string | undefined => {
  const separatorIndex = upstreamBranch.indexOf("/");
  if (separatorIndex <= 0) {
    return undefined;
  }

  return upstreamBranch.slice(0, separatorIndex);
};

const parseStatusLines = (
  porcelainStatus: string
): {
  isDirty: boolean;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
} => {
  const lines = porcelainStatus
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return {
    isDirty: lines.length > 0,
    hasUncommittedChanges: lines.some((line) => !line.startsWith("??")),
    hasUntrackedFiles: lines.some((line) => line.startsWith("??"))
  };
};

export const getGitState = async (
  options: { cwd?: string } = {}
): Promise<GitState> => {
  const rootResult = await runGitCommand(
    ["rev-parse", "--show-toplevel"],
    gitOptions(options.cwd)
  );

  if (!rootResult.ok) {
    return { isGitRepo: false };
  }

  const repoRoot = trimOutput(rootResult.stdout);
  const state: GitState = {
    isGitRepo: true,
    ...(repoRoot.length > 0 ? { repoRoot } : {})
  };

  const commandCwd = repoRoot.length > 0 ? repoRoot : options.cwd;

  const branchResult = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    gitOptions(commandCwd)
  );

  if (branchResult.ok) {
    const branch = trimOutput(branchResult.stdout);
    if (branch === "HEAD") {
      state.isDetachedHead = true;
    } else if (branch.length > 0) {
      state.currentBranch = branch;
      state.isDetachedHead = false;
    }
  } else {
    addStateError(state, branchResult.error.message);
  }

  const upstreamResult = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    gitOptions(commandCwd)
  );

  if (upstreamResult.ok) {
    const upstreamBranch = trimOutput(upstreamResult.stdout);
    if (upstreamBranch.length > 0) {
      state.upstreamBranch = upstreamBranch;
      const upstreamRemote = parseUpstreamRemote(upstreamBranch);
      if (upstreamRemote !== undefined) {
        state.upstreamRemote = upstreamRemote;
      }
    }
  }

  const statusResult = await runGitCommand(
    ["status", "--porcelain"],
    gitOptions(commandCwd)
  );

  if (statusResult.ok) {
    Object.assign(state, parseStatusLines(statusResult.stdout));
  } else {
    addStateError(state, statusResult.error.message);
  }

  const lastCommitResult = await runGitCommand(
    ["rev-parse", "HEAD"],
    gitOptions(commandCwd)
  );

  if (lastCommitResult.ok) {
    const lastCommitHash = trimOutput(lastCommitResult.stdout);
    if (lastCommitHash.length > 0) {
      state.lastCommitHash = lastCommitHash;
    }
  }

  return state;
};
