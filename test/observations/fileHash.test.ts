import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeFileHash } from "../../src/observations/fileHash.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-hash-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("computeFileHash", () => {
  it("returns sha256 hash and size for an existing file", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(cwd, "file.txt");

    await writeFile(filePath, "hello", "utf8");

    const result = await computeFileHash(filePath);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result).toEqual({
        ok: true,
        hash: createHash("sha256").update("hello").digest("hex"),
        algorithm: "sha256",
        sizeBytes: 5
      });
    }
  });

  it("returns FILE_NOT_FOUND for a missing file", async () => {
    const cwd = await createTempDir();
    const result = await computeFileHash(path.join(cwd, "missing.txt"));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });
});
