import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

export interface RunValidationCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export type ValidationCommandRunResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      combinedOutput: string;
      outputHash: string;
      exitCode: number;
      durationMs: number;
      timedOut: boolean;
      startedAt: string;
      completedAt: string;
    }
  | {
      ok: false;
      error: Error;
      timedOut: boolean;
      startedAt: string;
      completedAt: string;
      durationMs: number;
    };

type ValidationCommandRunPendingResult =
  | Omit<
      Extract<ValidationCommandRunResult, { ok: true }>,
      "completedAt" | "durationMs"
    >
  | Omit<
      Extract<ValidationCommandRunResult, { ok: false }>,
      "completedAt" | "durationMs"
    >;

const appendBounded = (
  current: string,
  chunk: string,
  maxBytes: number
): string => {
  const currentBytes = Buffer.byteLength(current, "utf8");

  if (currentBytes >= maxBytes) {
    return current;
  }

  const remainingBytes = maxBytes - currentBytes;
  const chunkBuffer = Buffer.from(chunk, "utf8");

  if (chunkBuffer.byteLength <= remainingBytes) {
    return current + chunk;
  }

  return current + chunkBuffer.subarray(0, remainingBytes).toString("utf8");
};

export const runValidationCommand = (
  command: string,
  options: RunValidationCommandOptions = {}
): Promise<ValidationCommandRunResult> => {
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxOutputBytes = options.maxOutputBytes ?? 20000;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const hash = createHash("sha256");

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let combinedOutput = "";
    let settled = false;
    let timedOut = false;
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const finish = (result: ValidationCommandRunPendingResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      const completedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);

      resolve({
        ...result,
        completedAt,
        durationMs
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");

      hash.update(text);
      stdout = appendBounded(stdout, text, maxOutputBytes);
      combinedOutput = appendBounded(combinedOutput, text, maxOutputBytes);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");

      hash.update(text);
      stderr = appendBounded(stderr, text, maxOutputBytes);
      combinedOutput = appendBounded(combinedOutput, text, maxOutputBytes);
    });

    child.on("error", (error) => {
      finish({
        ok: false,
        error,
        timedOut,
        startedAt
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish({
          ok: false,
          error: new Error("Validation command timed out."),
          timedOut: true,
          startedAt
        });
        return;
      }

      finish({
        ok: true,
        stdout,
        stderr,
        combinedOutput,
        outputHash: hash.digest("hex"),
        exitCode: code ?? 1,
        timedOut: false,
        startedAt
      });
    });
  });
};
