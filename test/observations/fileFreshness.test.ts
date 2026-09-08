import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkFileFreshness } from "../../src/observations/fileFreshness.js";
import { createFileObservationStore } from "../../src/observations/fileObservationStore.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-fresh-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("checkFileFreshness", () => {
  it("returns unknown when no observation exists", async () => {
    const cwd = await createTempDir();
    const result = await checkFileFreshness({ path: "file.txt", cwd });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "No file observation exists for this path."
    });
  });

  it("returns fresh when hash matches", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(path.join(cwd, "file.txt"), "hello", "utf8");
    await store.recordObservation({ path: "file.txt", source: "test" });

    const result = await checkFileFreshness({
      path: "file.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result).toMatchObject({
      status: "fresh",
      currentSizeBytes: 5
    });
  });

  it("returns stale after file content changes", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(path.join(cwd, "file.txt"), "hello", "utf8");
    await store.recordObservation({ path: "file.txt", source: "test" });
    await writeFile(path.join(cwd, "file.txt"), "changed", "utf8");

    const result = await checkFileFreshness({
      path: "file.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result.status).toBe("stale");
  });

  it("returns missing when file is deleted after observation", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(cwd, "file.txt");
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(filePath, "hello", "utf8");
    await store.recordObservation({ path: "file.txt", source: "test" });
    await unlink(filePath);

    const result = await checkFileFreshness({
      path: "file.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result.status).toBe("missing");
  });

  it("metadataOnly observation does not count as fresh", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await writeFile(path.join(cwd, "file.txt"), "hello", "utf8");
    await store.recordObservation({
      path: "file.txt",
      source: "test",
      metadataOnly: true
    });

    const result = await checkFileFreshness({
      path: "file.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "Latest observation is metadata-only."
    });
  });

  it("returns missing when latest observation recorded missing and file is still missing", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await store.recordObservation({ path: "missing.txt", source: "test" });

    const result = await checkFileFreshness({
      path: "missing.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result.status).toBe("missing");
  });

  it("returns stale when latest observation recorded missing and file now exists", async () => {
    const cwd = await createTempDir();
    const store = createFileObservationStore({ cwd, sessionId: "s1" });

    await store.recordObservation({ path: "file.txt", source: "test" });
    await writeFile(path.join(cwd, "file.txt"), "new", "utf8");

    const result = await checkFileFreshness({
      path: "file.txt",
      cwd,
      sessionId: "s1"
    });

    expect(result.status).toBe("stale");
  });
});
