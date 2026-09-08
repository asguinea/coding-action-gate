import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runGitCommand } from "../../src/git/gitExec.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-git-exec-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("runGitCommand", () => {
  it("runs git without a shell", async () => {
    const result = await runGitCommand(["--version"]);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.stdout).toContain("git version");
      expect(result.exitCode).toBe(0);
    }
  });

  it("returns a structured error for command failures", async () => {
    const cwd = await createTempDir();

    const result = await runGitCommand(["not-a-real-stepharbor-subcommand"], {
      cwd
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("GIT_COMMAND_FAILED");
      expect(result.error.args).toEqual(["not-a-real-stepharbor-subcommand"]);
      expect(result.error.cwd).toBe(cwd);
      expect(result.error.exitCode).toBeGreaterThan(0);
    }
  });
});
