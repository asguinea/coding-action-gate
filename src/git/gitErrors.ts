export type GitErrorCode = "GIT_COMMAND_FAILED" | "GIT_EXEC_ERROR";

export interface GitError {
  code: GitErrorCode;
  message: string;
  args: string[];
  cwd?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  details?: unknown;
}

export const createGitError = (
  code: GitErrorCode,
  message: string,
  options: {
    args: string[];
    cwd?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    details?: unknown;
  }
): GitError => ({
  code,
  message,
  args: options.args,
  ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  ...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
  ...(options.stdout !== undefined ? { stdout: options.stdout } : {}),
  ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
  ...(options.details !== undefined ? { details: options.details } : {})
});
