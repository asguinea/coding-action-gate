import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runCli } from "../../src/cli/cli.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runReadCommand } from "../../src/cli/commands/readCommand.js";
import { runRetryCommand } from "../../src/cli/commands/retryCommand.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";
import { decide } from "../../src/decision/decisionEngine.js";
import {
  createDeferredActionRegistry,
  recordDeferredDecision
} from "../../src/defer/deferredActionRegistry.js";
import type {
  DeferredActionRecord,
  DeferredEvidenceRequirement
} from "../../src/defer/deferredActionTypes.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-retry-"));
  tempDirs.push(tempDir);

  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const baseAction = {
  timestamp: "2026-05-01T10:00:00.000Z",
  proposedBy: "agent" as const
};

const editAction = (
  targetPath = "README.md",
  id = `edit-${targetPath}`
): StepHarborAction => ({
  ...baseAction,
  id,
  type: "edit_file",
  targetPath,
  diff: "@@\n-old\n+new\n",
  diffStats: {
    files: 1,
    addedLines: 1,
    deletedLines: 1
  }
});

const runCommandAction = (command: string): StepHarborAction => ({
  ...baseAction,
  id: "run-command",
  type: "run_command",
  command
});

const readFileAction = (targetPath: string): StepHarborAction => ({
  ...baseAction,
  id: `read-${targetPath}`,
  type: "read_file",
  targetPath
});

const writeActionFile = async (
  cwd: string,
  action: StepHarborAction,
  fileName = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, fileName);

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const normalize = (action: StepHarborAction, cwd: string) => {
  const result = normalizeAction(action, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const recordDeferredAction = async (
  cwd: string,
  action: StepHarborAction,
  options: {
    sessionId?: string;
    deferDir?: string;
    targetFileFreshness?: "unknown" | "stale" | "missing";
  } = {}
) => {
  const normalized = normalize(action, cwd);
  const decision = decide({
    action: normalized,
    policy: defaultPolicy,
    signals: {
      targetFileFreshness: options.targetFileFreshness ?? "unknown"
    }
  });

  if (!decision.ok) {
    throw new Error(decision.error.message);
  }

  const recorded = await recordDeferredDecision({
    action: normalized,
    decision: decision.decision,
    cwd,
    ...(options.deferDir !== undefined ? { deferDir: options.deferDir } : {}),
    sessionId: options.sessionId ?? "s1"
  });

  if (!recorded.ok || recorded.value.recorded === false) {
    throw new Error("Deferred action was not recorded.");
  }

  return recorded.value.record;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

const retry = (
  cwd: string,
  deferredActionId: string,
  options: Partial<Parameters<typeof runRetryCommand>[0]> = {}
) =>
  runRetryCommand({
    deferredActionId,
    cwd,
    sessionId: "s1",
    noAudit: true,
    ...options
  });

const expectOk = async <T extends { ok: boolean }>(
  promise: Promise<T>
): Promise<Extract<T, { ok: true }>> => {
  const result = await promise;

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected ok result.");
  }

  return result as Extract<T, { ok: true }>;
};

const manualRecord = (
  overrides: Partial<DeferredActionRecord> & {
    originalAction: StepHarborAction;
    requiredEvidence?: DeferredEvidenceRequirement[];
  }
): DeferredActionRecord => ({
  id: overrides.id ?? "def_manual",
  sessionId: overrides.sessionId ?? "s1",
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
  status: overrides.status ?? "pending",
  actionFingerprint: overrides.actionFingerprint ?? "manual-fingerprint",
  actionSummary: overrides.actionSummary ?? {
    actionType: overrides.originalAction.type,
    ...("targetPath" in overrides.originalAction
      ? { targetPaths: [overrides.originalAction.targetPath] }
      : {}),
    ...("command" in overrides.originalAction
      ? { command: overrides.originalAction.command }
      : {})
  },
  originalAction: overrides.originalAction,
  decision: overrides.decision ?? {
    decision: "DEFER",
    reason: "Manual deferred action.",
    matchedPolicies: [],
    signalSummary: {},
    requiredNextSteps: []
  },
  missingContext: overrides.missingContext ?? [],
  fetchPlan: overrides.fetchPlan ?? [],
  requiredEvidence: overrides.requiredEvidence ?? [],
  policyTrace: overrides.policyTrace ?? []
});

describe("retry command", () => {
  it("returns error for unknown deferred action id", async () => {
    const cwd = await createTempDir();
    const result = await runRetryCommand({
      deferredActionId: "missing",
      cwd,
      sessionId: "s1"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("CLI_DEFERRED_ACTION_NOT_FOUND");
    }
  });

  it("returns error for non-pending deferred action", async () => {
    const cwd = await createTempDir();
    const record = await recordDeferredAction(cwd, editAction());
    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });

    await registry.markDeferredActionSatisfied(record.id, []);

    const result = await runRetryCommand({
      deferredActionId: record.id,
      cwd,
      sessionId: "s1"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("CLI_DEFERRED_ACTION_NOT_PENDING");
    }
  });

  it("with missing evidence returns DEFER and does not reauthorize", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());
    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.retry).toMatchObject({
      deferredActionId: record.id,
      evidenceSatisfied: false,
      reauthorized: false,
      executed: false
    });
    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.decision.reason).toBe(
      "Deferred action evidence is still missing."
    );
  });

  it("with missing evidence keeps deferred action pending", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());

    await expectOk(retry(cwd, record.id));

    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(fetched.ok).toBe(true);

    if (fetched.ok) {
      expect(fetched.value?.status).toBe("pending");
    }
  });

  it("with satisfied file observation reauthorizes original action", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());

    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );

    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.retry).toMatchObject({
      evidenceSatisfied: true,
      reauthorized: true,
      executed: false
    });
    expect(result.output.decision.signalSummary).toMatchObject({
      targetFileFreshness: "fresh"
    });
  });

  it("README edit flow retries to PROCEED", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const actionPath = await writeActionFile(cwd, editAction());
    const decided = await expectOk(
      runDecideCommand({
        actionFile: actionPath,
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );

    expect(decided.output.decision.decision).toBe("DEFER");
    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );

    const retried = await expectOk(
      retry(cwd, decided.output.deferredAction?.id ?? "missing")
    );

    expect(retried.output.decision.decision).toBe("PROCEED");
  });

  it("auth edit flow retries to ESCALATE", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "auth-service.ts"), "secure\n", "utf8");
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await writeFile(path.join(cwd, "auth"), "", "utf8").catch(() => undefined);
    await rm(path.join(cwd, "auth"), { force: true });
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.join(cwd, "auth"), { recursive: true })
    );
    await writeFile(path.join(cwd, "auth", "service.ts"), "secure\n", "utf8");

    const record = await recordDeferredAction(
      cwd,
      editAction("auth/service.ts")
    );

    await expectOk(
      runReadCommand({
        targetPath: "auth/service.ts",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );

    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.decision.decision).toBe("ESCALATE");
  });

  it("file changed after read returns DEFER again and leaves pending", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());

    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );
    await writeFile(path.join(cwd, "README.md"), "changed\n", "utf8");

    const result = await expectOk(retry(cwd, record.id));
    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.retry?.reauthorized).toBe(false);
    expect(fetched.ok && fetched.value?.status).toBe("pending");
  });

  it("leaves deferred action pending when reauthorization still returns DEFER", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "defer-edit.yml");

    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await writeFile(
      policyPath,
      [
        "version: 0.1",
        "rules:",
        "  - id: defer-edit-again",
        "    decision: DEFER",
        "    when:",
        "      action_type: edit_file",
        "    reason: Reauthorization still requires deferral."
      ].join("\n"),
      "utf8"
    );
    const record = await recordDeferredAction(cwd, editAction());

    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );

    const result = await expectOk(
      retry(cwd, record.id, {
        policy: policyPath
      })
    );
    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(result.output.retry?.reauthorized).toBe(true);
    expect(result.output.decision.decision).toBe("DEFER");
    expect(fetched.ok && fetched.value?.status).toBe("pending");
  });

  it("outside workspace deferred action retries to BLOCK when evidence is satisfied", async () => {
    const cwd = await createTempDir();
    const outside = path.resolve(cwd, "../outside-retry.txt");

    await writeFile(outside, "outside\n", "utf8");
    const target = "../outside-retry.txt";
    const requirement: DeferredEvidenceRequirement = {
      id: "req_outside",
      type: "file_observation",
      target,
      required: true,
      satisfied: false
    };
    const record = manualRecord({
      id: "def_outside",
      originalAction: editAction(target),
      missingContext: [
        {
          type: "current_file_contents",
          target,
          required: true
        }
      ],
      fetchPlan: [
        {
          type: "read_file",
          target,
          safe: true
        }
      ],
      requiredEvidence: [requirement]
    });

    await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).recordDeferredAction({ record });
    await import("../../src/observations/fileObservationStore.js").then(
      async ({ createFileObservationStore }) => {
        const observation = await createFileObservationStore({
          cwd,
          sessionId: "s1"
        }).recordObservation({ path: target, source: "test" });

        if (!observation.ok) {
          throw new Error(observation.error.message);
        }
      }
    );

    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.decision.decision).toBe("BLOCK");
  });

  it("marks deferred action satisfied when final decision is PROCEED", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());

    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );
    await expectOk(retry(cwd, record.id));

    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(fetched.ok && fetched.value?.status).toBe("satisfied");
  });

  it("marks deferred action satisfied when final decision is ESCALATE", async () => {
    const cwd = await createTempDir();
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.join(cwd, "auth"), { recursive: true })
    );
    await writeFile(path.join(cwd, "auth", "service.ts"), "secure\n", "utf8");
    const record = await recordDeferredAction(
      cwd,
      editAction("auth/service.ts")
    );

    await expectOk(
      runReadCommand({
        targetPath: "auth/service.ts",
        cwd,
        sessionId: "s1",
        noAudit: true
      })
    );
    await expectOk(retry(cwd, record.id));

    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(fetched.ok && fetched.value?.status).toBe("satisfied");
  });

  it("marks deferred action satisfied when final decision is BLOCK", async () => {
    const cwd = await createTempDir();
    const record = manualRecord({
      id: "def_block",
      originalAction: readFileAction(".env")
    });

    await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).recordDeferredAction({ record });
    const result = await expectOk(retry(cwd, record.id));
    const fetched = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(record.id);

    expect(result.output.decision.decision).toBe("BLOCK");
    expect(fetched.ok && fetched.value?.status).toBe("satisfied");
  });

  it("audit evidence includes deferred action id and evidence status", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());

    const result = await runRetryCommand({
      deferredActionId: record.id,
      cwd,
      sessionId: "s1"
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toMatchObject({
        evidence: {
          retry: {
            deferredActionId: record.id,
            evidenceSatisfied: false,
            reauthorized: false
          }
        }
      });
    }
  });

  it("JSON output includes executed false", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());
    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.retry?.executed).toBe(false);
  });

  it("human output says original action was NOT executed", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());
    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(
      ["retry", record.id, "--cwd", cwd, "--session-id", "s1", "--no-audit"],
      {
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
      }
    );

    expect(exitCode).toBe(cliExitCodes.defer);
    expect(stderr).toBe("");
    expect(stdout).toContain(
      "StepHarbor retry: original action was NOT executed."
    );
  });

  it("respects --session-id", async () => {
    const cwd = await createTempDir();
    const record = await recordDeferredAction(cwd, editAction(), {
      sessionId: "s1"
    });
    const result = await runRetryCommand({
      deferredActionId: record.id,
      cwd,
      sessionId: "s2",
      noAudit: true
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("CLI_DEFERRED_ACTION_NOT_FOUND");
    }
  });

  it("respects --defer-dir", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const deferDir = path.join(cwd, "custom-defer");
    const record = await recordDeferredAction(cwd, editAction(), { deferDir });
    const result = await expectOk(
      retry(cwd, record.id, {
        deferDir
      })
    );

    expect(result.output.decision.decision).toBe("DEFER");
  });

  it("respects --observation-dir", async () => {
    const cwd = await createTempDir();
    const observationDir = path.join(cwd, "custom-observations");

    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const record = await recordDeferredAction(cwd, editAction());
    await expectOk(
      runReadCommand({
        targetPath: "README.md",
        cwd,
        sessionId: "s1",
        observationDir,
        noAudit: true
      })
    );

    const result = await expectOk(
      retry(cwd, record.id, {
        observationDir
      })
    );

    expect(result.output.decision.decision).toBe("PROCEED");
  });

  it("does not execute commands", async () => {
    const cwd = await createTempDir();
    const marker = path.join(cwd, "created-by-retry");
    const record = manualRecord({
      id: "def_command",
      originalAction: runCommandAction(`touch ${marker}`)
    });

    await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).recordDeferredAction({ record });

    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.retry?.executed).toBe(false);
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });

  it("does not read secret files directly", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, ".env"), "SECRET=value\n", "utf8");
    const record = manualRecord({
      id: "def_secret",
      originalAction: readFileAction(".env")
    });

    await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).recordDeferredAction({ record });

    const result = await expectOk(retry(cwd, record.id));

    expect(result.output.decision.decision).toBe("BLOCK");
    expect(result.output.read).toBeUndefined();
  });
});
