import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkValidationFreshness } from "../../src/validation/validationFreshness.js";
import {
  createValidationResultStore,
  hashValidationOutput
} from "../../src/validation/validationResultStore.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-val-fresh-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("validation freshness", () => {
  it("returns not_run when no result exists", async () => {
    const cwd = await createTempDir();

    await expect(
      checkValidationFreshness({ cwd, sessionId: "s1", kind: "test" })
    ).resolves.toMatchObject({
      status: "not_run",
      reason: "Required validation has not been run."
    });
  });

  it("returns passed after a passing result", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "test",
      command: "npm test",
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    await expect(
      checkValidationFreshness({ cwd, sessionId: "s1", kind: "test" })
    ).resolves.toMatchObject({
      status: "passed",
      reason: "Latest validation passed."
    });
  });

  it("returns failed after a failing result", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "lint",
      command: "npm run lint",
      status: "failed",
      exitCode: 1,
      source: "test"
    });

    await expect(
      checkValidationFreshness({ cwd, sessionId: "s1", kind: "lint" })
    ).resolves.toMatchObject({
      status: "failed",
      reason: "Latest validation failed."
    });
  });

  it("returns stale when latest result is older than maxAgeMs", async () => {
    const cwd = await createTempDir();
    const store = createValidationResultStore({ cwd, sessionId: "s1" });

    await store.recordValidationResult({
      kind: "build",
      command: "npm run build",
      status: "passed",
      exitCode: 0,
      startedAt: "2020-01-01T00:00:00.000Z",
      completedAt: "2020-01-01T00:00:01.000Z",
      source: "test"
    });

    await expect(
      checkValidationFreshness({
        cwd,
        sessionId: "s1",
        kind: "build",
        maxAgeMs: 1
      })
    ).resolves.toMatchObject({
      status: "stale",
      reason: "Latest validation is stale."
    });
  });

  it("hashValidationOutput is stable", () => {
    expect(hashValidationOutput("same output")).toBe(
      hashValidationOutput("same output")
    );
    expect(hashValidationOutput("same output")).not.toBe(
      hashValidationOutput("other output")
    );
  });
});
