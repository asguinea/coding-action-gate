import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/cli.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-cli-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writeAction = async (
  cwd: string,
  content: unknown = readFileFixture
): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(content), "utf8");

  return actionPath;
};

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

describe("decide command", () => {
  it("returns PROCEED exit code 0 when no policy rule matches", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(result.stdout).toContain("CodingActionGate decision: PROCEED");
    expect(result.stderr).toBe("");
  });

  it("returns DEFER exit code 2 when a policy rule matches action_type", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: defer-read",
        "    decision: DEFER",
        "    when:",
        "      action_type: read_file",
        "    reason: Read should be deferred in this test."
      ].join("\n")
    );
    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.defer);
    expect(result.stdout).toContain("CodingActionGate decision: DEFER");
    expect(result.stdout).toContain("Read should be deferred in this test.");
  });

  it("writes an audit record by default", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit.written).toBe(true);

      if (result.output.audit.written) {
        const records = await readJsonl(result.output.audit.path);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
          decision: "PROCEED"
        });
      }
    }
  });

  it("respects --no-audit", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const result = await runDecideCommand({
      actionFile: actionPath,
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
    const actionPath = await writeAction(cwd);
    const policyPath = await writePolicy(cwd, "version: 0.1\nrules: []\n");
    const result = await runDecideCommand({
      actionFile: actionPath,
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
    const actionPath = await writeAction(cwd);
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.policySource).toEqual({ type: "default" });
    }
  });

  it("returns structured error for missing action file", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "decide",
      "missing.json",
      "--cwd",
      cwd,
      "--json"
    ]);
    const output = JSON.parse(result.stdout) as {
      ok: false;
      error: { code: string };
    };

    expect(result.exitCode).toBe(cliExitCodes.error);
    expect(output.error.code).toBe("CLI_ACTION_FILE_NOT_FOUND");
  });

  it("returns structured error for invalid JSON", async () => {
    const cwd = await createTempDir();
    const actionPath = path.join(cwd, "action.json");

    await writeFile(actionPath, "{", "utf8");

    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--json"
    ]);
    const output = JSON.parse(result.stdout) as {
      ok: false;
      error: { code: string };
    };

    expect(result.exitCode).toBe(cliExitCodes.error);
    expect(output.error.code).toBe("CLI_ACTION_PARSE_ERROR");
  });

  it("returns structured error for invalid action", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...readFileFixture,
      type: "unknown_action"
    });
    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--json"
    ]);
    const output = JSON.parse(result.stdout) as {
      ok: false;
      error: { code: string };
    };

    expect(result.exitCode).toBe(cliExitCodes.error);
    expect(output.error.code).toBe("CLI_ACTION_PARSE_ERROR");
  });

  it("prints JSON output with --json", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const output = JSON.parse(result.stdout) as {
      ok: true;
      decision: { decision: string };
      audit: { written: boolean };
    };

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(output.ok).toBe(true);
    expect(output.decision.decision).toBe("PROCEED");
    expect(output.audit.written).toBe(false);
  });

  it("includes session metadata in audit when flags are provided", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const result = await runDecideCommand({
      actionFile: actionPath,
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

  it("returns exit code 1 when audit write fails", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd);
    const notDirectory = path.join(cwd, "not-a-dir");

    await writeFile(notDirectory, "not a directory\n", "utf8");

    const result = await captureCli([
      "decide",
      actionPath,
      "--cwd",
      cwd,
      "--audit-dir",
      "not-a-dir/nested"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.error);
    expect(result.stderr).toContain("CLI_AUDIT_ERROR");
  });

  it("provides help output", async () => {
    const result = await captureCli(["decide", "--help"]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(result.stdout).toContain("coding-action-gate decide <actionFile>");
  });
});
