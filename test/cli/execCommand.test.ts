import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/cli.js";
import {
  buildExecAction,
  runExecCommand
} from "../../src/cli/commands/execCommand.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-exec-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writePolicy = async (cwd: string, yaml: string): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");

  await writeFile(policyPath, yaml, "utf8");

  return policyPath;
};

const captureCli = async (args: string[]) => {
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

  return {
    exitCode,
    stdout,
    stderr
  };
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

describe("exec command", () => {
  it("constructs a run_command action", async () => {
    const cwd = await createTempDir();
    const action = buildExecAction("npm test", {
      cwd,
      commandId: "custom-command-id"
    });

    expect(action).toMatchObject({
      id: "custom-command-id",
      type: "run_command",
      proposedBy: "agent",
      origin: {
        toolId: "stepharbor-cli"
      },
      command: "npm test",
      cwd,
      raw: {
        source: "stepharbor exec",
        command: "npm test"
      }
    });
  });

  it("returns PROCEED exit code 0 when no rules match", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "exec",
      "npm test",
      "--cwd",
      cwd,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(result.stdout).toContain(
      "StepHarbor exec dry-run: command was NOT executed."
    );
    expect(result.stdout).toContain("StepHarbor decision: PROCEED");
  });

  it("can return DEFER using a policy matching action_type", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: defer-run",
        "    decision: DEFER",
        "    when:",
        "      action_type: run_command",
        "    reason: Run commands defer in this test."
      ].join("\n")
    );
    const result = await captureCli([
      "exec",
      "npm test",
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.defer);
    expect(result.stdout).toContain("StepHarbor decision: DEFER");
  });

  it("can return ESCALATE using a policy matching is_git_like_command", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: escalate-git",
        "    decision: ESCALATE",
        "    when:",
        "      is_git_like_command: true",
        "    reason: Git commands require review in this test."
      ].join("\n")
    );
    const result = await captureCli([
      "exec",
      "git status",
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.escalate);
    expect(result.stdout).toContain("StepHarbor decision: ESCALATE");
  });

  it("can return BLOCK using a policy matching command_executable", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: block-rm",
        "    decision: BLOCK",
        "    when:",
        "      command_executable: rm",
        "    reason: rm is blocked in this test."
      ].join("\n")
    );
    const result = await captureCli([
      "exec",
      "rm -rf .",
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.block);
    expect(result.stdout).toContain("StepHarbor decision: BLOCK");
  });

  it("writes an audit record by default", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit.written).toBe(true);

      if (result.output.audit.written) {
        const records = await readJsonl(result.output.audit.path);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
          decision: "PROCEED",
          action: {
            type: "run_command",
            command: "npm test"
          }
        });
      }
    }
  });

  it("respects --no-audit", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit).toEqual({ written: false });
    }
  });

  it("loads explicit policy with --policy", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(cwd, "version: 0.1\nrules: []\n");
    const result = await runExecCommand({
      command: "npm test",
      cwd,
      policy: policyPath,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.policySource).toEqual({
        type: "explicit",
        path: policyPath
      });
    }
  });

  it("falls back to default policy", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.policySource).toEqual({ type: "default" });
    }
  });

  it("prints JSON output with dryRun true and executed false", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "exec",
      "npm test",
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const output = JSON.parse(result.stdout) as {
      ok: true;
      dryRun: boolean;
      executed: boolean;
      action: {
        type: string;
        command: string;
      };
    };

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(output.dryRun).toBe(true);
    expect(output.executed).toBe(false);
    expect(output.action).toMatchObject({
      type: "run_command",
      command: "npm test"
    });
  });

  it("includes session metadata in audit when flags are provided", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd,
      sessionId: "session-1",
      userId: "user-1",
      agentId: "agent-1",
      repoId: "repo-1",
      workspaceId: "workspace-1"
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toMatchObject({
        sessionId: "session-1",
        userId: "user-1",
        agentId: "agent-1",
        repoId: "repo-1",
        workspaceId: "workspace-1"
      });
    }
  });

  it("uses --command-id when provided", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd,
      commandId: "command-id-1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.action).toMatchObject({
        id: "command-id-1"
      });
    }
  });

  it("returns CLI_BAD_ARGUMENTS when command string is missing", async () => {
    const result = await captureCli(["exec", "--json"]);
    const output = JSON.parse(result.stdout) as {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

    expect(result.exitCode).toBe(cliExitCodes.error);
    expect(output.error).toEqual({
      code: "CLI_BAD_ARGUMENTS",
      message: "Missing command string for exec."
    });
  });

  it("provides help output", async () => {
    const result = await captureCli(["exec", "--help"]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(result.stdout).toContain('stepharbor exec "<command>"');
  });

  it("does not execute the command", async () => {
    const cwd = await createTempDir();
    const targetPath = path.join(cwd, "should-not-exist.txt");
    const result = await captureCli([
      "exec",
      "touch should-not-exist.txt",
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(await exists(targetPath)).toBe(false);
  });
});
