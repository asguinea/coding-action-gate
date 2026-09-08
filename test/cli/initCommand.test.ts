import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-init-"));
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

describe("init command", () => {
  it("writes default stepharbor.policy.yml", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured(["init", "--cwd", cwd]);
    const policyPath = path.join(cwd, "stepharbor.policy.yml");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("StepHarbor policy initialized");
    await expect(access(policyPath)).resolves.toBeUndefined();
    await expect(
      loadPolicy({ explicitPath: policyPath })
    ).resolves.toMatchObject({
      ok: true
    });
  });

  it("writes node template", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "init",
      "--cwd",
      cwd,
      "--template",
      "node"
    ]);
    const content = await readFile(
      path.join(cwd, "stepharbor.policy.yml"),
      "utf8"
    );

    expect(result.exitCode).toBe(0);
    expect(content).toContain("# Template: node");
    expect(content).toContain("npm run typecheck");
  });

  it("writes a custom output path", async () => {
    const cwd = await createTempDir();
    const out = "config/stepharbor.yml";

    const result = await runCliCaptured(["init", "--cwd", cwd, "--out", out]);
    const policyPath = path.join(cwd, out);

    expect(result.exitCode).toBe(0);
    await expect(access(policyPath)).resolves.toBeUndefined();
  });

  it("fails if file exists without force", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    await writeFile(policyPath, "version: 0.1\n", "utf8");

    const result = await runCliCaptured(["init", "--cwd", cwd]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CLI_INIT_POLICY_EXISTS");
  });

  it("overwrites with force", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    await writeFile(policyPath, "version: old\n", "utf8");

    const result = await runCliCaptured([
      "init",
      "--cwd",
      cwd,
      "--template",
      "strict",
      "--force",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      template: string;
      overwritten: boolean;
    };
    const content = await readFile(policyPath, "utf8");

    expect(result.exitCode).toBe(0);
    expect(parsed).toMatchObject({
      ok: true,
      template: "strict",
      overwritten: true
    });
    expect(content).toContain("# Template: strict");
  });

  it("fails for unknown template", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "init",
      "--cwd",
      cwd,
      "--template",
      "rails"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CLI_INIT_UNKNOWN_TEMPLATE");
  });

  it("fails for missing cwd", async () => {
    const cwd = path.join(await createTempDir(), "missing");

    const result = await runCliCaptured(["init", "--cwd", cwd]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CLI_INIT_CWD_NOT_FOUND");
  });

  it("json output includes ok, path, and template", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured([
      "init",
      "--cwd",
      cwd,
      "--template",
      "node",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path: string;
      template: string;
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.path).toBe(path.join(cwd, "stepharbor.policy.yml"));
    expect(parsed.template).toBe("node");
  });

  it("human output includes next steps", async () => {
    const cwd = await createTempDir();

    const result = await runCliCaptured(["init", "--cwd", cwd]);

    expect(result.stdout).toContain("Next steps:");
    expect(result.stdout).toContain("Run: stepharbor doctor");
  });

  it("init --help includes templates and options", async () => {
    const result = await runCliCaptured(["init", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor init [options]");
    expect(result.stdout).toContain("--template <name>");
    expect(result.stdout).toContain("basic, node, strict, monorepo-lite");
    expect(result.stdout).toContain("--force");
  });

  it("generated policy can be used by doctor", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    await runCliCaptured(["init", "--cwd", cwd]);

    const result = await runCliCaptured([
      "doctor",
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--skip-port-check"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PASS  Policy load");
  });

  it("creates only analytics runtime data during init", async () => {
    const cwd = await createTempDir();

    await runCliCaptured(["init", "--cwd", cwd]);
    const entries = await readdir(cwd);
    const runtimeEntries = await readdir(path.join(cwd, ".stepharbor"));

    expect(entries.sort()).toEqual([".stepharbor", "stepharbor.policy.yml"]);
    expect(runtimeEntries).toEqual(["analytics"]);
  });

  it("does not change exec authorization behavior for safe commands", async () => {
    const cwd = await createTempDir();
    await runCliCaptured(["init", "--cwd", cwd]);

    const result = await runCliCaptured([
      "exec",
      "echo ok",
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      decision: {
        decision: string;
      };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.decision.decision).toBe("PROCEED");
  });
});
