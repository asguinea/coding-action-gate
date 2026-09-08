import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createGitError } from "./gitErrors.js";
import { resolveGitCwd } from "./gitPaths.js";
import type { GitExecResult } from "./gitTypes.js";

const execFileAsync = promisify(execFile);

const toText = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return undefined;
};

const exitCodeFrom = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const isExecLikeError = (
  error: unknown
): error is Error & {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
} => error instanceof Error;

export const runGitCommand = async (
  args: string[],
  options: { cwd?: string } = {}
): Promise<GitExecResult> => {
  const cwd = resolveGitCwd(options.cwd);

  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    return {
      ok: false,
      error: createGitError(
        "GIT_EXEC_ERROR",
        "Invalid git command arguments.",
        {
          args,
          cwd
        }
      )
    };
  }

  try {
    const result = await execFileAsync("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });

    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0
    };
  } catch (error) {
    if (isExecLikeError(error)) {
      const exitCode = exitCodeFrom(error.code);
      const stdout = toText(error.stdout);
      const stderr = toText(error.stderr);

      return {
        ok: false,
        error: createGitError(
          exitCode === undefined ? "GIT_EXEC_ERROR" : "GIT_COMMAND_FAILED",
          error.message,
          {
            args,
            cwd,
            ...(exitCode !== undefined ? { exitCode } : {}),
            ...(stdout !== undefined ? { stdout } : {}),
            ...(stderr !== undefined ? { stderr } : {}),
            details: {
              name: error.name
            }
          }
        )
      };
    }

    return {
      ok: false,
      error: createGitError("GIT_EXEC_ERROR", "Git command failed.", {
        args,
        cwd,
        details: error
      })
    };
  }
};
