import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findPolicyFile,
  policyFileNames
} from "../../src/policy/policyDiscovery.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-policy-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("findPolicyFile", () => {
  it("returns null when no policy exists", async () => {
    const tempDir = await createTempDir();

    await expect(findPolicyFile(tempDir)).resolves.toBeNull();
  });

  it("respects discovery order", async () => {
    const tempDir = await createTempDir();
    const laterPolicy = path.join(tempDir, ".coding-action-gate.policy.yaml");
    const earlierPolicy = path.join(tempDir, "coding-action-gate.policy.yaml");

    await writeFile(laterPolicy, "version: 0.1\n");
    await writeFile(earlierPolicy, "version: 0.1\n");

    await expect(findPolicyFile(tempDir)).resolves.toBe(earlierPolicy);
    expect(policyFileNames[1]).toBe("coding-action-gate.policy.yaml");
  });
});
