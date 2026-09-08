import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { createFileObservationStore } from "../../src/observations/fileObservationStore.js";
import { resolveObservationLogPath } from "../../src/observations/observationPaths.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-obs-"));
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

describe("file observation store", () => {
  it("recordFileObservation writes a JSONL record", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(cwd, "file.txt");
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(filePath, "hello", "utf8");

    const result = await store.recordObservation({
      path: "file.txt",
      source: "test"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const records = await readJsonl(result.path);

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: expect.any(String),
        sessionId: "s1",
        path: "file.txt",
        absolutePath: filePath,
        relativePath: "file.txt",
        hashAlgorithm: "sha256",
        sizeBytes: 5,
        exists: true,
        source: "test"
      });
    }
  });

  it("getLatestObservation returns the latest record for a path", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(path.join(cwd, "file.txt"), "first", "utf8");
    await store.recordObservation({ path: "file.txt", source: "test" });
    await writeFile(path.join(cwd, "file.txt"), "second", "utf8");
    await store.recordObservation({ path: "file.txt", source: "test" });

    const latest = await store.getLatestObservation("file.txt");

    expect(latest.ok).toBe(true);

    if (latest.ok) {
      expect(latest.record?.sizeBytes).toBe(6);
    }
  });

  it("listObservations returns records in append order", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(path.join(cwd, "a.txt"), "a", "utf8");
    await writeFile(path.join(cwd, "b.txt"), "bb", "utf8");
    await store.recordObservation({ path: "a.txt", source: "test" });
    await store.recordObservation({ path: "b.txt", source: "test" });

    const listed = await store.listObservations();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.records.map((record) => record.path)).toEqual([
        "a.txt",
        "b.txt"
      ]);
    }
  });

  it("separate sessions use separate observation files", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "file.txt"), "hello", "utf8");

    const first = createFileObservationStore({ cwd, sessionId: "s1" });
    const second = createFileObservationStore({ cwd, sessionId: "s2" });
    const firstResult = await first.recordObservation({
      path: "file.txt",
      source: "test"
    });
    const secondResult = await second.recordObservation({
      path: "file.txt",
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
    const observationPath = resolveObservationLogPath({ cwd, sessionId: "s1" });

    await mkdir(path.dirname(observationPath), { recursive: true });
    await writeFile(observationPath, '{"id":"invalid"}\nnot-json\n', "utf8");

    const store = createFileObservationStore({ cwd, sessionId: "s1" });
    const listed = await store.listObservations();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.records).toEqual([]);
    }
  });

  it("decide and exec do not create observation files yet", async () => {
    const cwd = await createTempDir();
    const actionPath = path.join(cwd, "action.json");
    const observationPath = resolveObservationLogPath({ cwd });

    await writeFile(actionPath, JSON.stringify(readFileFixture), "utf8");

    const decideResult = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });
    const execResult = await runExecCommand({
      command: "git status",
      cwd,
      noAudit: true
    });

    expect(decideResult.ok).toBe(true);
    expect(execResult.ok).toBe(true);

    await expect(readFile(observationPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
