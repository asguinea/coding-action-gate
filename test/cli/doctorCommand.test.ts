import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-doctor-cli-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

const runCliCaptured = async (
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      }
    }
  });

  return {
    exitCode,
    stdout,
    stderr
  };
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("doctor command", () => {
  it("prints valid JSON with checks", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "doctor",
      "--cwd",
      cwd,
      "--json",
      "--skip-port-check"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: Array<{ id: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.map((check) => check.id)).toContain("cwd-exists");
  });

  it("prints human output with summary and remediation", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "doctor",
      "--cwd",
      cwd,
      "--skip-port-check"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("StepHarbor doctor");
    expect(result.stdout).toContain("Summary:");
    expect(result.stdout).toContain("Next steps:");
    expect(result.stdout).toContain("stepharbor init");
    expect(result.stdout).toContain('stepharbor exec "echo hello"');
    expect(result.stdout).toContain("stepharbor help defer");
    expect(result.stdout).toContain("stepharbor ui");
    expect(result.stdout).toContain("stepharbor help install");
  });

  it("doctor --help includes key options", async () => {
    const result = await runCliCaptured(["doctor", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor doctor [options]");
    expect(result.stdout).toContain("--check-api-port <number>");
    expect(result.stdout).toContain("--skip-port-check");
  });

  it("exits 0 when no check fails", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "doctor",
      "--cwd",
      cwd,
      "--skip-port-check"
    ]);

    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when cwd is missing", async () => {
    const cwd = await createTempDir();
    const missing = path.join(cwd, "missing");

    const result = await runCliCaptured([
      "doctor",
      "--cwd",
      missing,
      "--skip-port-check"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("FAIL");
    expect(result.stdout).toContain("Working directory does not exist");
  });

  it("rejects invalid check API port", async () => {
    const result = await runCliCaptured([
      "doctor",
      "--check-api-port",
      "70000"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "--check-api-port must be an integer between 1 and 65535."
    );
  });
});
