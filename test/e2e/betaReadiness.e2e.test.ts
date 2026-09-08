import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getCliUsage, runCli } from "../../src/cli/cli.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";

const tempDirs: string[] = [];
const repoRoot = process.cwd();
const fakeSecret = "sk-abcdefghijklmnopqrstuvwxyz1234567890";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-beta-ready-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

const captureCli = async (
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array): boolean => {
        stderr += String(chunk);
        return true;
      }
    }
  });

  return { exitCode, stdout, stderr };
};

const expectFile = async (relativePath: string): Promise<void> => {
  const fileStats = await stat(path.join(repoRoot, relativePath));

  expect(fileStats.isFile()).toBe(true);
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("beta readiness smoke tests", () => {
  it("top-level help includes all beta commands and key safety wording", () => {
    const usage = getCliUsage();

    for (const command of [
      "stepharbor decide <actionFile>",
      "stepharbor exec",
      "stepharbor read <path>",
      "stepharbor retry <deferredActionId>",
      "stepharbor validate",
      "stepharbor ui [options]",
      "stepharbor doctor [options]",
      "stepharbor export-feedback [options]",
      "stepharbor init [options]"
    ]) {
      expect(usage).toContain(command);
    }

    expect(usage).toContain("dry-run only");
    expect(usage).toContain("read-only local dashboard");
    expect(usage).toContain("sanitized local JSON feedback bundle");
  });

  it("init then doctor reports policy-load pass", async () => {
    const cwd = await createTempDir();
    const init = await captureCli(["init", "--cwd", cwd, "--template", "node"]);

    expect(init.exitCode).toBe(0);

    const doctor = await captureCli([
      "doctor",
      "--cwd",
      cwd,
      "--policy",
      path.join(cwd, "stepharbor.policy.yml"),
      "--skip-port-check",
      "--json"
    ]);
    const result = JSON.parse(doctor.stdout) as {
      checks: Array<{ id: string; status: string }>;
    };

    expect(doctor.exitCode).toBe(0);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "policy-load",
          status: "pass"
        })
      ])
    );
  });

  it("demo:beta script exists", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["demo:beta"]).toBe(
      "node examples/beta-demo/scripts/generate-demo-data.mjs"
    );
  });

  it("README documents local usage", async () => {
    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toContain("## Try it locally");
    expect(readme).toContain("stepharbor.policy.yml");
    expect(readme).toContain(
      "export-feedback --cwd . --out stepharbor-feedback.json"
    );
    expect(readme).toContain("read-only dashboard");
  });

  it("export-feedback help exists", async () => {
    const result = await captureCli(["export-feedback", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor export-feedback [options]");
    expect(result.stdout).toContain("--out <path>");
  });

  it("ui help includes read-only wording", async () => {
    const result = await captureCli(["ui", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("read-only local dashboard");
    expect(result.stdout).toContain("--no-ui-server");
    expect(result.stdout).toContain("--policy <path>");
  });

  it("stepharbor exec rm -rf returns BLOCK and executed false", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "exec",
      "rm -rf .",
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const output = JSON.parse(result.stdout) as {
      executed: boolean;
      decision: {
        decision: string;
      };
    };

    expect(result.exitCode).toBe(cliExitCodes.block);
    expect(output.executed).toBe(false);
    expect(output.decision.decision).toBe("BLOCK");
  });

  it("stepharbor exec git status remains dry-run", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "exec",
      "git status",
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const output = JSON.parse(result.stdout) as {
      dryRun: boolean;
      executed: boolean;
    };

    expect(result.exitCode).not.toBe(cliExitCodes.error);
    expect(output.dryRun).toBe(true);
    expect(output.executed).toBe(false);
  });

  it("stepharbor init creates only local analytics runtime data", async () => {
    const cwd = await createTempDir();
    const result = await captureCli(["init", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    await expect(
      access(path.join(cwd, ".stepharbor", "analytics"))
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(cwd, ".stepharbor", "audit"))
    ).rejects.toThrow();
    await expect(
      access(path.join(cwd, ".stepharbor", "deferred"))
    ).rejects.toThrow();
    await expect(
      access(path.join(cwd, ".stepharbor", "validation"))
    ).rejects.toThrow();
  });

  it("export-feedback does not include raw fake secret fixture", async () => {
    const cwd = await createTempDir();
    const out = path.join(cwd, "feedback.json");

    await captureCli(["exec", `echo ${fakeSecret}`, "--cwd", cwd]);

    const result = await captureCli([
      "export-feedback",
      "--cwd",
      cwd,
      "--out",
      out,
      "--json"
    ]);
    const exportText = await readFile(out, "utf8");

    expect(result.exitCode).toBe(0);
    expect(exportText).not.toContain(fakeSecret);
  });

  it("beta readiness docs exist", async () => {
    await expectFile("docs/first-run.md");
    await expectFile("docs/reproducibility.md");
    await expectFile("docs/architecture.md");
  });
});
