import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseActionJsonString } from "../../src/actions/parseAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runReadCommand } from "../../src/cli/commands/readCommand.js";
import { runRetryCommand } from "../../src/cli/commands/retryCommand.js";
import { runCli } from "../../src/cli/cli.js";
import { createDeferredActionRegistry } from "../../src/defer/deferredActionRegistry.js";
import type { DeferredActionRecord } from "../../src/defer/deferredActionTypes.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const tempDirs: string[] = [];
const repoRoot = process.cwd();
const phase3ActionDir = path.join(repoRoot, "examples/actions/phase3");
const phase3RepoDir = path.join(repoRoot, "examples/repos/phase3-demo");
const envSentinel = "PHASE3_SENTINEL_SHOULD_NOT_APPEAR";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-p3-e2e-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const createPhase3Repo = async (): Promise<string> => {
  const cwd = await createTempDir();

  await cp(phase3RepoDir, cwd, { recursive: true });

  return cwd;
};

const actionPath = (name: string): string => path.join(phase3ActionDir, name);

const decide = (
  cwd: string,
  name: string,
  options: {
    sessionId?: string;
    auditDir?: string;
    noAudit?: boolean;
  } = {}
) =>
  runDecideCommand({
    actionFile: actionPath(name),
    cwd,
    sessionId: options.sessionId ?? "s1",
    noAudit: options.noAudit ?? true,
    ...(options.auditDir !== undefined ? { auditDir: options.auditDir } : {})
  });

const read = (
  cwd: string,
  targetPath: string,
  options: {
    sessionId?: string;
    metadataOnly?: boolean;
  } = {}
) =>
  runReadCommand({
    targetPath,
    cwd,
    sessionId: options.sessionId ?? "s1",
    ...(options.metadataOnly !== undefined
      ? { metadataOnly: options.metadataOnly }
      : {}),
    noAudit: true
  });

const retry = (
  cwd: string,
  deferredActionId: string,
  options: {
    sessionId?: string;
    noAudit?: boolean;
    auditDir?: string;
  } = {}
) =>
  runRetryCommand({
    deferredActionId,
    cwd,
    sessionId: options.sessionId ?? "s1",
    noAudit: options.noAudit ?? true,
    ...(options.auditDir !== undefined ? { auditDir: options.auditDir } : {})
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

const manualDeferredCommandRecord = (
  id: string,
  command: string
): DeferredActionRecord => ({
  id,
  sessionId: "s1",
  createdAt: "2026-05-02T10:00:00.000Z",
  updatedAt: "2026-05-02T10:00:00.000Z",
  status: "pending",
  actionFingerprint: `manual-${id}`,
  actionSummary: {
    actionType: "run_command",
    command
  },
  originalAction: {
    id: `action-${id}`,
    type: "run_command",
    timestamp: "2026-05-02T10:00:00.000Z",
    proposedBy: "agent",
    command
  },
  decision: {
    decision: "DEFER",
    reason: "Manual deferred command.",
    matchedPolicies: [],
    signalSummary: {},
    requiredNextSteps: []
  },
  missingContext: [],
  fetchPlan: [],
  requiredEvidence: [],
  policyTrace: []
});

describe("Phase 3 end-to-end flow", () => {
  it("Phase 3 example actions parse and Phase 3 demo policy loads", async () => {
    for (const fileName of [
      "safe-readme-edit.json",
      "stale-readme-edit.json",
      "auth-edit.json",
      "service-edit-with-test.json",
      "high-deletion-edit.json",
      "read-env.json",
      "outside-workspace-delete.json"
    ]) {
      const content = await readFile(actionPath(fileName), "utf8");
      const parsed = parseActionJsonString(content);

      expect(parsed.ok, `${fileName} should parse`).toBe(true);
    }

    const policy = await loadPolicy({
      explicitPath: path.join(
        repoRoot,
        "examples/policies/phase3-demo.policy.yml"
      ),
      cwd: repoRoot
    });

    expect(policy.ok).toBe(true);
  });

  it("README edit without read DEFERs and records a deferred action", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(decide(cwd, "safe-readme-edit.json"));

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.deferredAction).toEqual(
      expect.objectContaining({
        recorded: true,
        id: expect.any(String)
      })
    );
  });

  it("retry before read returns DEFER with evidenceSatisfied false", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "safe-readme-edit.json"));
    const result = await expectOk(
      retry(cwd, deferred.output.deferredAction?.id ?? "missing")
    );

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.retry).toMatchObject({
      evidenceSatisfied: false,
      reauthorized: false,
      executed: false
    });
  });

  it("read README records an observation", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(read(cwd, "README.md"));

    expect(result.output.decision.decision).toBe("PROCEED");
    expect(result.output.observation).toMatchObject({
      recorded: true,
      metadataOnly: false
    });
  });

  it("retry README edit after read PROCEEDs and marks registry satisfied", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "safe-readme-edit.json"));
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "README.md"));

    const result = await expectOk(retry(cwd, deferredActionId));
    const registryRecord = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(deferredActionId);

    expect(result.output.decision.decision).toBe("PROCEED");
    expect(result.output.retry).toMatchObject({
      evidenceSatisfied: true,
      reauthorized: true,
      executed: false
    });
    expect(registryRecord.ok && registryRecord.value?.status).toBe("satisfied");
  });

  it("after external README change, decide returns stale DEFER", async () => {
    const cwd = await createPhase3Repo();

    await expectOk(read(cwd, "README.md"));
    await writeFile(
      path.join(cwd, "README.md"),
      "# Changed externally\n",
      "utf8"
    );

    const result = await expectOk(decide(cwd, "stale-readme-edit.json"));

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.decision.deferReasonCategory).toBe(
      "target_file_stale"
    );
    expect(result.output.decision.signalSummary).toMatchObject({
      targetFileFreshness: "stale"
    });
  });

  it("auth edit without read DEFERs with expectedNextDecision ESCALATE", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(
      decide(cwd, "auth-edit.json", { sessionId: "auth" })
    );

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
  });

  it("read auth/service.ts then retry ESCALATEs and marks registry satisfied", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(
      decide(cwd, "auth-edit.json", { sessionId: "auth" })
    );
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "auth/service.ts", { sessionId: "auth" }));

    const result = await expectOk(
      retry(cwd, deferredActionId, { sessionId: "auth" })
    );
    const registryRecord = await createDeferredActionRegistry({
      cwd,
      sessionId: "auth"
    }).getDeferredAction(deferredActionId);

    expect(result.output.decision.decision).toBe("ESCALATE");
    expect(registryRecord.ok && registryRecord.value?.status).toBe("satisfied");
  });

  it("service edit remains DEFER after only target read because related test is missing", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "service-edit-with-test.json"));
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "src/service.ts"));

    const result = await expectOk(retry(cwd, deferredActionId));

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.retry?.unsatisfiedRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "src/service.test.ts"
        })
      ])
    );
  });

  it("read service.test.ts then retry service edit PROCEEDs", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "service-edit-with-test.json"));
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "src/service.ts"));
    await expectOk(read(cwd, "src/service.test.ts"));

    const result = await expectOk(retry(cwd, deferredActionId));

    expect(result.output.decision.decision).toBe("PROCEED");
    expect(result.output.decision.signalSummary).toMatchObject({
      contextCompletenessScore: 1,
      relatedTestsRead: true
    });
  });

  it("high deletion edit DEFERs first with expected escalation after evidence", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(decide(cwd, "high-deletion-edit.json"));

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
  });

  it("high deletion retry after target and related test reads ESCALATEs", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "high-deletion-edit.json"));
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "src/service.ts"));
    await expectOk(read(cwd, "src/service.test.ts"));

    const result = await expectOk(retry(cwd, deferredActionId));

    expect(result.output.decision.decision).toBe("ESCALATE");
  });

  it("related context evidence is satisfied only by fresh full observation", async () => {
    const cwd = await createPhase3Repo();
    const deferred = await expectOk(decide(cwd, "service-edit-with-test.json"));
    const deferredActionId = deferred.output.deferredAction?.id ?? "missing";

    await expectOk(read(cwd, "src/service.ts"));
    await expectOk(read(cwd, "src/service.test.ts", { metadataOnly: true }));

    const result = await expectOk(retry(cwd, deferredActionId));

    expect(result.output.decision.decision).toBe("DEFER");
    expect(result.output.retry?.unsatisfiedRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "src/service.test.ts",
          satisfied: false
        })
      ])
    );
  });

  it("secret read .env blocks and records no observation", async () => {
    const cwd = await createPhase3Repo();

    await writeFile(path.join(cwd, ".env"), envSentinel, "utf8");

    const result = await expectOk(
      runReadCommand({
        targetPath: ".env",
        cwd,
        sessionId: "secret",
        noAudit: true
      })
    );

    expect(result.output.decision.decision).toBe("BLOCK");
    expect(result.output.read?.content).toBeNull();
    expect(result.output.observation?.recorded).toBe(false);
    expect(JSON.stringify(result.output)).not.toContain(envSentinel);
  });

  it("outside workspace delete BLOCKs", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(decide(cwd, "outside-workspace-delete.json"));

    expect(result.output.decision.decision).toBe("BLOCK");
  });

  it("audit logs include DEFER structured fields", async () => {
    const cwd = await createPhase3Repo();
    const auditDir = path.join(cwd, "audit");
    const result = await expectOk(
      decide(cwd, "service-edit-with-test.json", {
        auditDir,
        noAudit: false
      })
    );

    if (!result.output.audit.written) {
      throw new Error("Expected audit to be written.");
    }

    const records = await readJsonl(result.output.audit.path);

    expect(records[0]).toMatchObject({
      decision: "DEFER",
      missingContext: expect.arrayContaining([
        expect.objectContaining({
          type: "related_tests"
        })
      ]),
      fetchPlan: expect.arrayContaining([
        expect.objectContaining({
          type: "read_related_tests"
        })
      ])
    });
  });

  it("deferred registry records pending action", async () => {
    const cwd = await createPhase3Repo();
    const result = await expectOk(decide(cwd, "safe-readme-edit.json"));
    const registryRecord = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).getDeferredAction(result.output.deferredAction?.id ?? "missing");

    expect(registryRecord.ok && registryRecord.value?.status).toBe("pending");
  });

  it("CLI human output for DEFER includes missing context and fetch plan", async () => {
    const cwd = await createPhase3Repo();
    let stdout = "";
    let stderr = "";

    await runCli(
      [
        "decide",
        actionPath("service-edit-with-test.json"),
        "--cwd",
        cwd,
        "--session-id",
        "human",
        "--no-audit"
      ],
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

    expect(stderr).toBe("");
    expect(stdout).toContain("Missing context:");
    expect(stdout).toContain("Fetch plan:");
    expect(stdout).toContain("related_tests");
    expect(stdout).toContain("read_related_tests");
  });

  it("observation files are session-scoped", async () => {
    const cwd = await createPhase3Repo();

    await expectOk(read(cwd, "README.md", { sessionId: "s1" }));

    const s1Result = await expectOk(
      decide(cwd, "safe-readme-edit.json", { sessionId: "s1" })
    );
    const s2Result = await expectOk(
      decide(cwd, "safe-readme-edit.json", { sessionId: "s2" })
    );

    expect(s1Result.output.decision.decision).toBe("PROCEED");
    expect(s2Result.output.decision.decision).toBe("DEFER");
    expect(
      await exists(path.join(cwd, ".stepharbor/observations/session_s1.jsonl"))
    ).toBe(true);
  });

  it("retry does not execute command actions", async () => {
    const cwd = await createPhase3Repo();
    const marker = path.join(cwd, "should-not-exist");
    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });

    await registry.recordDeferredAction({
      record: manualDeferredCommandRecord("def_no_exec", `touch ${marker}`)
    });

    const result = await expectOk(retry(cwd, "def_no_exec"));

    expect(result.output.retry?.executed).toBe(false);
    expect(await exists(marker)).toBe(false);
  });
});
