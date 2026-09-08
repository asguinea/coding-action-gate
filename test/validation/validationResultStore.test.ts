import { appendFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createValidationResultStore } from "../../src/validation/validationResultStore.js";
import { resolveValidationLogPath } from "../../src/validation/validationPaths.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-val-store-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

describe("validation result store", () => {
  it("recordValidationResult writes JSONL", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });
    const result = await store.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.path !== undefined) {
      const records = await readJsonl(result.path);

      expect(records).toHaveLength(1);
    }
  });

  it("recordValidationResult includes core fields", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });
    const result = await store.recordValidationResult({
      kind: "lint",
      command: "npm run lint",
      status: "failed",
      exitCode: 1,
      startedAt: "2026-05-02T00:00:00.000Z",
      completedAt: "2026-05-02T00:00:01.000Z",
      source: "test"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toMatchObject({
        id: expect.any(String),
        sessionId: "s1",
        cwd,
        kind: "lint",
        command: "npm run lint",
        status: "failed",
        exitCode: 1,
        durationMs: 1000,
        source: "test"
      });
    }
  });

  it("listValidationResults returns append order", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });
    await store.recordValidationResult({
      kind: "lint",
      command: "npm run lint",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    const listed = await store.listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.map((record) => record.command)).toEqual([
        "npm test",
        "npm run lint"
      ]);
    }
  });

  it("getLatestValidationResult returns latest matching kind", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "failed",
      exitCode: 1,
      source: "test"
    });
    await store.recordValidationResult({
      kind: "test",
      command: "npm test -- --runInBand",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    const latest = await store.getLatestValidationResult({ kind: "test" });

    expect(latest.ok).toBe(true);

    if (latest.ok) {
      expect(latest.value?.command).toBe("npm test -- --runInBand");
    }
  });

  it("getLatestValidationResult returns latest matching command", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "failed",
      exitCode: 1,
      source: "test"
    });
    await store.recordValidationResult({
      kind: "lint",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    const latest = await store.getLatestValidationResult({
      command: "npm test"
    });

    expect(latest.ok).toBe(true);

    if (latest.ok) {
      expect(latest.value?.kind).toBe("lint");
    }
  });

  it("separate sessions use separate validation files", async () => {
    const cwd = await createTempDir();
    const first = createValidationResultStore({ cwd, sessionId: "s1" });
    const second = createValidationResultStore({ cwd, sessionId: "s2" });
    const firstResult = await first.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });
    const secondResult = await second.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);

    if (firstResult.ok && secondResult.ok) {
      expect(firstResult.path).not.toBe(secondResult.path);
    }
  });

  it("invalid JSONL lines are ignored", async () => {
    const cwd = await createTempDir();
    const validationPath = resolveValidationLogPath({ cwd, sessionId: "s1" });

    await mkdir(path.dirname(validationPath), { recursive: true });
    await appendFile(validationPath, '{"id":"invalid"}\nnot-json\n', "utf8");

    const listed = await createValidationResultStore({
      cwd,
      sessionId: "s1"
    }).listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value).toEqual([]);
    }
  });
});
