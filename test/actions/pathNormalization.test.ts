import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizePathForAction } from "../../src/actions/pathNormalization.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-path-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("normalizePathForAction", () => {
  it("normalizes relative targetPath", async () => {
    const cwd = await createTempDir();

    const result = normalizePathForAction("src/index.ts", { cwd });

    expect(result.absoluteTargetPath).toBe(path.join(cwd, "src/index.ts"));
    expect(result.relativeTargetPath).toBe("src/index.ts");
  });

  it("normalizes ./ and ../ path segments", async () => {
    const cwd = await createTempDir();

    const result = normalizePathForAction("./src/../src/domain/./actions.ts", {
      cwd
    });

    expect(result.absoluteTargetPath).toBe(
      path.join(cwd, "src/domain/actions.ts")
    );
    expect(result.relativeTargetPath).toBe("src/domain/actions.ts");
  });

  it("detects isInsideWorkspace when workspaceRoots are provided", async () => {
    const cwd = await createTempDir();
    const inside = normalizePathForAction("src/index.ts", {
      cwd,
      workspaceRoots: ["."]
    });
    const outside = normalizePathForAction("../outside.ts", {
      cwd,
      workspaceRoots: ["."]
    });

    expect(inside.isInsideWorkspace).toBe(true);
    expect(outside.isInsideWorkspace).toBe(false);
  });
});
