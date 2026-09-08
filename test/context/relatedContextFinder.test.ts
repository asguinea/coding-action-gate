import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findRelatedContext,
  inferRelatedTestPaths
} from "../../src/context/relatedContextFinder.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-related-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("related context finder", () => {
  it("infers deterministic related test paths", () => {
    expect(inferRelatedTestPaths("src/service.ts")).toEqual([
      "src/service.test.ts",
      "src/service.spec.ts",
      "tests/service.test.ts",
      "__tests__/service.test.ts"
    ]);
  });

  it("reports no related tests when no candidate exists", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "service.ts"), "export {}\n", "utf8");

    const result = await findRelatedContext({
      targetPath: "src/service.ts",
      cwd
    });

    expect(result.existingRelatedTests).toEqual([]);
    expect(result.relatedTestCandidates).toEqual(
      expect.arrayContaining([
        {
          path: "src/service.test.ts",
          exists: false
        }
      ])
    );
  });

  it("finds an inferred test file when present", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "service.ts"), "export {}\n", "utf8");
    await writeFile(
      path.join(cwd, "src", "service.test.ts"),
      "test()\n",
      "utf8"
    );

    const result = await findRelatedContext({
      targetPath: "src/service.ts",
      cwd
    });

    expect(result.existingRelatedTests).toEqual(["src/service.test.ts"]);
  });
});
