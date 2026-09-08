import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import {
  readAuditRecords,
  readLatestAuditRecord
} from "../../src/uiAdapter/auditReader.js";
import { readDeferredActions } from "../../src/uiAdapter/deferredReader.js";
import { readGitStateSummary } from "../../src/uiAdapter/gitStateSummary.js";
import { readObservations } from "../../src/uiAdapter/observationReader.js";
import { readValidationRecords } from "../../src/uiAdapter/validationReader.js";
import type { DeferredActionRecord } from "../../src/defer/deferredActionTypes.js";
import type { FileObservationRecord } from "../../src/observations/fileObservationTypes.js";
import type { ValidationResultRecord } from "../../src/validation/validationTypes.js";

const tempDirs: string[] = [];
const timestamp = "2026-05-02T00:00:00.000Z";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-ui-adapter-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writeJsonl = async (
  filePath: string,
  records: unknown[],
  extras: string[] = []
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    [...records.map((record) => JSON.stringify(record)), ...extras].join("\n"),
    "utf8"
  );
};

const auditRecord = (id: string) =>
  buildAuditRecord({
    action: {
      id: `act_${id}`,
      type: "run_command",
      timestamp,
      proposedBy: "agent",
      command: "git status"
    },
    decision: {
      decision: "PROCEED",
      reason: "Allowed.",
      matchedPolicies: [],
      signalSummary: {}
    },
    session: {
      sessionId: "s1"
    }
  });

const deferredRecord = (id: string): DeferredActionRecord => ({
  id,
  sessionId: "s1",
  createdAt: timestamp,
  updatedAt: timestamp,
  status: "pending",
  actionFingerprint: `fingerprint_${id}`,
  actionSummary: {
    actionType: "edit_file",
    targetPaths: ["README.md"]
  },
  originalAction: {
    id: `act_${id}`,
    type: "edit_file",
    timestamp,
    proposedBy: "agent",
    targetPath: "README.md"
  },
  decision: {
    decision: "DEFER",
    reason: "Target file has not been observed in this session.",
    matchedPolicies: [],
    signalSummary: {}
  },
  missingContext: [
    {
      type: "current_file_contents",
      target: "README.md",
      reason: "Target file has not been observed in this session.",
      required: true
    }
  ],
  fetchPlan: [
    {
      type: "read_file",
      target: "README.md",
      safe: true,
      reason: "Read the current target file before retrying authorization."
    }
  ],
  requiredEvidence: [
    {
      id: `req_${id}`,
      type: "file_observation",
      target: "README.md",
      required: true,
      satisfied: false
    }
  ],
  policyTrace: []
});

const observationRecord = (id: string): FileObservationRecord => ({
  id,
  sessionId: "s1",
  path: "README.md",
  absolutePath: "/tmp/repo/README.md",
  relativePath: "README.md",
  observedAt: timestamp,
  contentHash: `hash_${id}`,
  hashAlgorithm: "sha256",
  sizeBytes: 10,
  exists: true,
  source: "cli_read",
  metadataOnly: false
});

const validationRecord = (id: string): ValidationResultRecord => ({
  id,
  sessionId: "s1",
  cwd: "/tmp/repo",
  kind: "test",
  command: "npm test",
  status: "passed",
  exitCode: 0,
  startedAt: timestamp,
  completedAt: timestamp,
  durationMs: 12,
  outputSummary: "ok",
  outputHash: `hash_${id}`,
  source: "test"
});

describe("runtime UI adapter readers", () => {
  it("readAuditRecords returns [] if audit file is missing", async () => {
    const cwd = await createTempDir();

    await expect(readAuditRecords({ cwd })).resolves.toEqual([]);
  });

  it("readAuditRecords reads JSONL audit records and respects limit", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(
      cwd,
      ".coding-action-gate/audit/decisions.jsonl"
    );

    await writeJsonl(filePath, [
      auditRecord("one"),
      auditRecord("two"),
      auditRecord("three")
    ]);

    const records = await readAuditRecords({ cwd, limit: 2 });

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.action.id)).toEqual([
      "act_two",
      "act_three"
    ]);
  });

  it("readLatestAuditRecord returns null when no audit file exists", async () => {
    const cwd = await createTempDir();

    await expect(readLatestAuditRecord({ cwd })).resolves.toBeNull();
  });

  it("readLatestAuditRecord returns the last valid audit record", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(
      cwd,
      ".coding-action-gate/audit/decisions.jsonl"
    );

    await writeJsonl(
      filePath,
      [auditRecord("one"), auditRecord("two")],
      ["not-json"]
    );

    const record = await readLatestAuditRecord({ cwd });

    expect(record?.action.id).toBe("act_two");
  });

  it("readDeferredActions returns [] if missing and reads session JSONL", async () => {
    const cwd = await createTempDir();

    await expect(
      readDeferredActions({ cwd, sessionId: "s1" })
    ).resolves.toEqual([]);

    const filePath = path.join(
      cwd,
      ".coding-action-gate/deferred/session_s1.jsonl"
    );
    await writeJsonl(filePath, [deferredRecord("def_one")]);

    const records = await readDeferredActions({ cwd, sessionId: "s1" });

    expect(records).toEqual([
      expect.objectContaining({
        id: "def_one",
        status: "pending"
      })
    ]);
  });

  it("readObservations returns [] if missing and reads session JSONL", async () => {
    const cwd = await createTempDir();

    await expect(readObservations({ cwd, sessionId: "s1" })).resolves.toEqual(
      []
    );

    const filePath = path.join(
      cwd,
      ".coding-action-gate/observations/session_s1.jsonl"
    );
    await writeJsonl(filePath, [observationRecord("obs_one")]);

    const records = await readObservations({ cwd, sessionId: "s1" });

    expect(records).toEqual([
      expect.objectContaining({
        id: "obs_one",
        source: "cli_read"
      })
    ]);
  });

  it("readValidationRecords returns [] if missing and reads session JSONL", async () => {
    const cwd = await createTempDir();

    await expect(
      readValidationRecords({ cwd, sessionId: "s1" })
    ).resolves.toEqual([]);

    const filePath = path.join(
      cwd,
      ".coding-action-gate/validation/session_s1.jsonl"
    );
    await writeJsonl(filePath, [validationRecord("val_one")]);

    const records = await readValidationRecords({ cwd, sessionId: "s1" });

    expect(records).toEqual([
      expect.objectContaining({
        id: "val_one",
        status: "passed"
      })
    ]);
  });

  it("readGitStateSummary returns non-git summary outside repo", async () => {
    const cwd = await createTempDir();
    const summary = await readGitStateSummary({ cwd });

    expect(summary).toMatchObject({
      isGitRepo: false,
      repoIntegrityStatus: "not_git_repo"
    });
  });

  it("adapter functions do not mutate data files", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(
      cwd,
      ".coding-action-gate/validation/session_s1.jsonl"
    );

    await writeJsonl(filePath, [validationRecord("val_one")]);

    const before = await readFile(filePath, "utf8");
    await readValidationRecords({ cwd, sessionId: "s1" });
    const after = await readFile(filePath, "utf8");

    expect(after).toBe(before);
  });

  it("invalid JSONL handling is consistent across readers", async () => {
    const cwd = await createTempDir();

    await writeJsonl(
      path.join(cwd, ".coding-action-gate/audit/decisions.jsonl"),
      [auditRecord("one")],
      ["not-json", JSON.stringify({ id: "invalid" })]
    );
    await writeJsonl(
      path.join(cwd, ".coding-action-gate/deferred/session_s1.jsonl"),
      [deferredRecord("def_one")],
      ["not-json", JSON.stringify({ id: "invalid" })]
    );
    await writeJsonl(
      path.join(cwd, ".coding-action-gate/observations/session_s1.jsonl"),
      [observationRecord("obs_one")],
      ["not-json", JSON.stringify({ id: "invalid" })]
    );
    await writeJsonl(
      path.join(cwd, ".coding-action-gate/validation/session_s1.jsonl"),
      [validationRecord("val_one")],
      ["not-json", JSON.stringify({ id: "invalid" })]
    );

    await expect(readAuditRecords({ cwd })).resolves.toHaveLength(1);
    await expect(
      readDeferredActions({ cwd, sessionId: "s1" })
    ).resolves.toHaveLength(1);
    await expect(
      readObservations({ cwd, sessionId: "s1" })
    ).resolves.toHaveLength(1);
    await expect(
      readValidationRecords({ cwd, sessionId: "s1" })
    ).resolves.toHaveLength(1);
  });
});
