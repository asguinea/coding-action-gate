import type { GitError } from "./gitErrors.js";

export interface GitState {
  isGitRepo: boolean;
  repoRoot?: string;
  currentBranch?: string;
  isDetachedHead?: boolean;
  upstreamBranch?: string;
  upstreamRemote?: string;
  isDirty?: boolean;
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
  lastCommitHash?: string;
  error?: string;
}

export type GitExecResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
    }
  | {
      ok: false;
      error: GitError;
    };
