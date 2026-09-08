import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import {
  appendAuditRecord,
  createAuditLogger
} from "../../src/audit/auditLogger.js";
import { resolveAuditLogPath } from "../../src/audit/auditPaths.js";
import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import { decide } from "../../src/decision/decisionEngine.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import type { CodingActionGateDecision } from "../../src/decision/decisionErrors.js";
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-audit-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const normalizedEditAction = () => {
  const result = parseAndNormalizeAction(editFileFixture, {
    cwd: process.cwd()
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const decision = (reason: string): CodingActionGateDecision => ({
  decision: "PROCEED",
  reason,
  matchedPolicies: [],
  signalSummary: {},
  requiredNextSteps: []
});

const record = (reason = "Allowed.") =>
  buildAuditRecord({
    action: normalizedEditAction(),
    decision: decision(reason)
  });

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

describe("appendAuditRecord", () => {
  it("creates audit directory if missing", async () => {
    const cwd = await createTempDir();
    const result = await appendAuditRecord(record(), { cwd });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.path).toBe(resolveAuditLogPath({ cwd }));
      await expect(readFile(result.path, "utf8")).resolves.toContain(
        '"decision":"PROCEED"'
      );
    }
  });

  it("appends JSONL record", async () => {
    const cwd = await createTempDir();
    const result = await appendAuditRecord(record(), { cwd });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const lines = await readJsonl(result.path);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        decision: "PROCEED",
        reason: "Allowed."
      });
    }
  });

  it("appends multiple records without overwriting", async () => {
    const cwd = await createTempDir();
    const logger = createAuditLogger({ cwd });
    const first = await logger.append(record("First."));
    const second = await logger.append(record("Second."));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const filePath = resolveAuditLogPath({ cwd });
    const lines = await readJsonl(filePath);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ reason: "First." });
    expect(lines[1]).toMatchObject({ reason: "Second." });
  });

  it("returns AUDIT_RECORD_VALIDATION_ERROR for invalid records", async () => {
    const cwd = await createTempDir();
    const result = await appendAuditRecord(
      {
        decisionId: "invalid"
      } as never,
      { cwd }
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "AUDIT_RECORD_VALIDATION_ERROR"
      }
    });
  });

  it("links previousRecordHash from the prior line", async () => {
    const cwd = await createTempDir();
    const first = await appendAuditRecord(record("First."), { cwd });
    const second = await appendAuditRecord(record("Second."), { cwd });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (first.ok && second.ok) {
      expect(second.record.previousRecordHash).toBe(first.record.recordHash);

      const lines = await readJsonl(second.path);

      expect(lines[1]).toMatchObject({
        previousRecordHash: first.record.recordHash
      });
    }
  });

  it("reports directory creation errors", async () => {
    const cwd = await createTempDir();
    const fileWhereDirShouldBe = path.join(cwd, "not-a-dir");

    await writeFile(fileWhereDirShouldBe, "not a directory\n");

    const result = await appendAuditRecord(record(), {
      cwd,
      auditDir: "not-a-dir/nested",
      auditFileName: "decisions.jsonl"
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("AUDIT_DIR_CREATE_ERROR");
    }
  });
});

describe("audit integration", () => {
  it("builds and appends a decision record from default policy flow", async () => {
    const cwd = await createTempDir();
    const actionResult = parseAndNormalizeAction(editFileFixture, { cwd });

    expect(actionResult.ok).toBe(true);

    if (!actionResult.ok) {
      throw new Error(actionResult.error.message);
    }

    const decisionResult = decide({
      action: actionResult.action,
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale"
      }
    });

    expect(decisionResult.ok).toBe(true);

    if (!decisionResult.ok) {
      throw new Error(decisionResult.error.message);
    }

    const auditRecord = buildAuditRecord({
      action: actionResult.action,
      decision: decisionResult.decision,
      signals: {
        targetFileFreshness: "stale"
      },
      policyVersion: defaultPolicy.version
    });
    const appendResult = await appendAuditRecord(auditRecord, { cwd });

    expect(appendResult.ok).toBe(true);

    if (appendResult.ok) {
      const lines = await readJsonl(appendResult.path);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        decision: "DEFER",
        reason: "Target file changed since the last observation."
      });
    }
  });
});
