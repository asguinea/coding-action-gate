import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { decide } from "../../src/decision/decisionEngine.js";
import {
  createDeferredActionRegistry,
  detectDeferredBypass,
  recordDeferredDecision
} from "../../src/defer/deferredActionRegistry.js";
import { resolveDeferredActionLogPath } from "../../src/defer/deferredActionPaths.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { createFileObservationStore } from "../../src/observations/fileObservationStore.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-defer-reg-")
  );
  tempDirs.push(tempDir);

  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const editAction = (
  targetPath = "README.md",
  id = "edit-readme"
): StepHarborAction => ({
  id,
  type: "edit_file",
  timestamp: "2026-05-01T10:00:00.000Z",
  proposedBy: "agent",
  targetPath,
  diff: "@@\n-old\n+new\n",
  diffStats: {
    files: 1,
    addedLines: 1,
    deletedLines: 1
  }
});

const readAction = (): StepHarborAction => ({
  id: "read-readme",
  type: "read_file",
  timestamp: "2026-05-01T10:00:00.000Z",
  proposedBy: "agent",
  targetPath: "README.md"
});

const normalize = (action: StepHarborAction, cwd = process.cwd()) => {
  const result = normalizeAction(action, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const deferDecisionFor = (action: ReturnType<typeof normalize>) => {
  const result = decide({
    action,
    policy: defaultPolicy,
    signals: {
      targetFileFreshness: "unknown"
    }
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.decision;
};

const recordDeferredReadme = async (
  cwd: string,
  options: {
    sessionId?: string;
    targetPath?: string;
  } = {}
) => {
  const action = normalize(editAction(options.targetPath), cwd);
  const decision = deferDecisionFor(action);
  const result = await recordDeferredDecision({
    action,
    decision,
    cwd,
    sessionId: options.sessionId ?? "s1"
  });

  if (!result.ok || result.value.recorded === false) {
    throw new Error("Deferred action was not recorded.");
  }

  return {
    action,
    record: result.value.record
  };
};

const recordObservation = async (cwd: string) => {
  const store = createFileObservationStore({
    cwd,
    sessionId: "s1"
  });
  const result = await store.recordObservation({
    path: "README.md",
    source: "test"
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }
};

describe("deferred action registry", () => {
  it("records a deferred action", async () => {
    const cwd = await createTempDir();
    const { record } = await recordDeferredReadme(cwd);

    expect(record.status).toBe("pending");
    expect(record.actionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(record.requiredEvidence).toEqual([
      expect.objectContaining({
        type: "file_observation",
        target: "README.md",
        required: true,
        satisfied: false
      })
    ]);
  });

  it("lists pending deferred actions", async () => {
    const cwd = await createTempDir();
    const { record } = await recordDeferredReadme(cwd);
    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });
    const listed = await registry.listDeferredActions({ status: "pending" });

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.map((candidate) => candidate.id)).toEqual([
        record.id
      ]);
    }
  });

  it("gets deferred action by id", async () => {
    const cwd = await createTempDir();
    const { record } = await recordDeferredReadme(cwd);
    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });
    const fetched = await registry.getDeferredAction(record.id);

    expect(fetched.ok).toBe(true);

    if (fetched.ok) {
      expect(fetched.value?.id).toBe(record.id);
    }
  });

  it("finds pending similar action", async () => {
    const cwd = await createTempDir();
    const { record } = await recordDeferredReadme(cwd);
    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });
    const found = await registry.findPendingSimilarAction(
      normalize(editAction("README.md", "new-id"), cwd)
    );

    expect(found.ok).toBe(true);

    if (found.ok) {
      expect(found.value?.id).toBe(record.id);
    }
  });

  it("does not record non-DEFER decisions", async () => {
    const cwd = await createTempDir();
    const action = normalize(readAction(), cwd);
    const decision = decide({
      action,
      policy: defaultPolicy,
      signals: {}
    });

    expect(decision.ok).toBe(true);

    if (decision.ok) {
      const recorded = await recordDeferredDecision({
        action,
        decision: decision.decision,
        cwd,
        sessionId: "s1"
      });

      expect(recorded.ok).toBe(true);

      if (recorded.ok) {
        expect(recorded.value).toEqual({ recorded: false });
      }
    }
  });

  it("detects bypass for similar action without evidence", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await recordDeferredReadme(cwd);

    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });
    const result = await detectDeferredBypass({
      action: normalize(editAction("README.md", "resubmit"), cwd),
      registry,
      context: { cwd }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.possibleBypass).toBe(true);
      expect(result.value.unsatisfiedRequirements).toEqual([
        expect.objectContaining({
          type: "file_observation",
          target: "README.md"
        })
      ]);
    }
  });

  it("does not detect bypass after evidence is satisfied", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await recordDeferredReadme(cwd);
    await recordObservation(cwd);

    const registry = createDeferredActionRegistry({ cwd, sessionId: "s1" });
    const result = await detectDeferredBypass({
      action: normalize(editAction("README.md", "resubmit"), cwd),
      registry,
      context: { cwd }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.possibleBypass).toBe(false);
      expect(result.value.matchingDeferredAction).toBeDefined();
    }
  });

  it("CLI decide records DEFER with deferred action metadata", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    const actionPath = path.join(cwd, "edit-readme.json");
    await writeFile(actionPath, JSON.stringify(editAction()), "utf8");

    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.deferredAction).toEqual(
        expect.objectContaining({
          recorded: true,
          id: expect.any(String)
        })
      );
      expect(
        await readFile(
          resolveDeferredActionLogPath({ cwd, sessionId: "s1" }),
          "utf8"
        )
      ).toContain(result.output.deferredAction?.id ?? "missing");
    }
  });

  it("registry storage is session-scoped", async () => {
    const cwd = await createTempDir();
    await recordDeferredReadme(cwd, { sessionId: "s1" });

    const s1 = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).listDeferredActions();
    const s2 = await createDeferredActionRegistry({
      cwd,
      sessionId: "s2"
    }).listDeferredActions();

    expect(s1.ok).toBe(true);
    expect(s2.ok).toBe(true);

    if (s1.ok && s2.ok) {
      expect(s1.value).toHaveLength(1);
      expect(s2.value).toHaveLength(0);
    }
  });

  it("ignores invalid JSONL lines when listing", async () => {
    const cwd = await createTempDir();
    const { record } = await recordDeferredReadme(cwd);
    const filePath = resolveDeferredActionLogPath({ cwd, sessionId: "s1" });

    await appendFile(filePath, 'not-json\n{"id":\n', "utf8");

    const listed = await createDeferredActionRegistry({
      cwd,
      sessionId: "s1"
    }).listDeferredActions();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.map((candidate) => candidate.id)).toEqual([
        record.id
      ]);
    }
  });
});
