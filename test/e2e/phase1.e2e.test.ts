import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { parseActionJsonString } from "../../src/actions/parseAction.js";
import { appendAuditRecord } from "../../src/audit/auditLogger.js";
import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import { runCli } from "../../src/cli/cli.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";
import { decide } from "../../src/decision/decisionEngine.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const tempDirs: string[] = [];
const repoRoot = process.cwd();

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-e2e-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const exampleActionPath = (name: string): string =>
  path.join(repoRoot, "examples/actions", name);

const examplePolicyPath = (name: string): string =>
  path.join(repoRoot, "examples/policies", name);

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
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

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const runRuntimeFlow = async (
  actionFileName: string,
  policyFileName: string,
  auditCwd: string
) => {
  const actionJson = await readFile(exampleActionPath(actionFileName), "utf8");
  const parsedAction = parseActionJsonString(actionJson);

  if (!parsedAction.ok) {
    throw new Error(parsedAction.error.message);
  }

  const policyResult = await loadPolicy({
    explicitPath: examplePolicyPath(policyFileName),
    cwd: repoRoot
  });

  if (!policyResult.ok) {
    throw new Error(policyResult.error.message);
  }

  const normalizedAction = normalizeAction(
    {
      ...parsedAction.action,
      raw: JSON.parse(actionJson) as unknown
    },
    {
      cwd: repoRoot,
      ...(policyResult.policy.workspace?.allowedRoots !== undefined
        ? { workspaceRoots: policyResult.policy.workspace.allowedRoots }
        : {})
    }
  );

  if (!normalizedAction.ok) {
    throw new Error(normalizedAction.error.message);
  }

  const decisionResult = decide({
    action: normalizedAction.action,
    policy: policyResult.policy,
    signals: {}
  });

  if (!decisionResult.ok) {
    throw new Error(decisionResult.error.message);
  }

  const auditRecord = buildAuditRecord({
    action: normalizedAction.action,
    decision: decisionResult.decision,
    signals: {},
    policyVersion: policyResult.policy.version
  });
  const auditResult = await appendAuditRecord(auditRecord, {
    cwd: auditCwd
  });

  if (!auditResult.ok) {
    throw new Error(auditResult.error.message);
  }

  return {
    decision: decisionResult.decision,
    audit: auditResult
  };
};

describe("Phase 1 end-to-end flow", () => {
  it("all example actions parse and all example policies load", async () => {
    const actionFiles = (
      await readdir(path.join(repoRoot, "examples/actions"), {
        withFileTypes: true
      })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const policyFiles = (
      await readdir(path.join(repoRoot, "examples/policies"), {
        withFileTypes: true
      })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    for (const actionFile of actionFiles) {
      const actionJson = await readFile(exampleActionPath(actionFile), "utf8");
      const parsed = parseActionJsonString(actionJson);

      expect(parsed.ok, `${actionFile} should parse`).toBe(true);
    }

    for (const policyFile of policyFiles) {
      const loaded = await loadPolicy({
        explicitPath: examplePolicyPath(policyFile),
        cwd: repoRoot
      });

      expect(loaded.ok, `${policyFile} should load`).toBe(true);
    }
  });

  it("safe README edit with proceed-only policy returns PROCEED", async () => {
    const cwd = await createTempDir();
    const result = await runRuntimeFlow(
      "safe-readme-edit.json",
      "proceed-only.policy.yml",
      cwd
    );

    expect(result.decision.decision).toBe("PROCEED");

    const records = await readJsonl(result.audit.path);

    expect(records[0]).toMatchObject({
      decision: "PROCEED"
    });
  });

  it("README edit with defer-edits policy returns DEFER", async () => {
    const cwd = await createTempDir();
    const result = await runRuntimeFlow(
      "safe-readme-edit.json",
      "defer-edits.policy.yml",
      cwd
    );

    expect(result.decision.decision).toBe("DEFER");

    const records = await readJsonl(result.audit.path);

    expect(records[0]).toMatchObject({
      decision: "DEFER"
    });
  });

  it("git command with escalate-git policy returns ESCALATE", async () => {
    const cwd = await createTempDir();
    const result = await runRuntimeFlow(
      "commit-before-validation-placeholder.json",
      "escalate-git.policy.yml",
      cwd
    );

    expect(result.decision.decision).toBe("ESCALATE");
  });

  it("rm command with block-rm-executable policy returns BLOCK", async () => {
    const cwd = await createTempDir();
    const result = await runRuntimeFlow(
      "run-dangerous-command-placeholder.json",
      "block-rm-executable.policy.yml",
      cwd
    );

    expect(result.decision.decision).toBe("BLOCK");
  });

  it("CLI decide against example fixture and policy writes audit", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "decide",
      exampleActionPath("safe-readme-edit.json"),
      "--policy",
      examplePolicyPath("defer-edits.policy.yml"),
      "--cwd",
      cwd,
      "--json"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.defer);

    const output = JSON.parse(result.stdout) as {
      ok: true;
      decision: { decision: string };
      audit: { written: true; path: string };
    };

    expect(output.decision.decision).toBe("DEFER");
    expect(output.audit.written).toBe(true);

    const records = await readJsonl(output.audit.path);

    expect(records[0]).toMatchObject({
      decision: "DEFER"
    });
  });

  it("CLI exec dry-run with rm policy returns BLOCK and does not execute", async () => {
    const cwd = await createTempDir();
    const target = path.join(cwd, "should-not-exist.txt");
    const result = await captureCli([
      "exec",
      "touch should-not-exist.txt",
      "--policy",
      examplePolicyPath("block-rm-executable.policy.yml"),
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.success);

    const output = JSON.parse(result.stdout) as {
      ok: true;
      dryRun: boolean;
      executed: boolean;
      decision: { decision: string };
    };

    expect(output).toMatchObject({
      dryRun: true,
      executed: false
    });
    expect(output.decision.decision).toBe("PROCEED");
    expect(await exists(target)).toBe(false);
  });

  it("CLI exec dry-run with rm executable policy returns BLOCK without execution", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "exec",
      "rm -rf .",
      "--policy",
      examplePolicyPath("block-rm-executable.policy.yml"),
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.block);

    const output = JSON.parse(result.stdout) as {
      ok: true;
      dryRun: boolean;
      executed: boolean;
      decision: { decision: string };
    };

    expect(output).toMatchObject({
      dryRun: true,
      executed: false
    });
    expect(output.decision.decision).toBe("BLOCK");
  });

  it("audit hash chain links two appended records", async () => {
    const cwd = await createTempDir();
    const first = await runRuntimeFlow(
      "safe-readme-edit.json",
      "proceed-only.policy.yml",
      cwd
    );
    const second = await runRuntimeFlow(
      "run-safe-command.json",
      "proceed-only.policy.yml",
      cwd
    );

    const records = (await readJsonl(second.audit.path)) as Array<{
      recordHash: string;
      previousRecordHash?: string;
    }>;

    expect(records).toHaveLength(2);
    expect(records[0]?.recordHash).toBe(first.audit.record.recordHash);
    expect(records[1]?.previousRecordHash).toBe(records[0]?.recordHash);
  });
});
