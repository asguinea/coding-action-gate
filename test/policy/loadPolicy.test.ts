import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stepHarborPolicySchema } from "../../src/domain/policies.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const tempDirs: string[] = [];
const fixtureDir = path.resolve("test/fixtures/policies");

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-load-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("loadPolicy", () => {
  it("loads an explicit valid YAML policy", async () => {
    const policyPath = path.join(fixtureDir, "valid-policy.yml");

    const result = await loadPolicy({ explicitPath: policyPath });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.source).toEqual({ type: "explicit", path: policyPath });
      expect(result.policy.version).toBe("0.1");
      expect(result.policy.rules?.[0]?.decision).toBe("DEFER");
    }
  });

  it("returns POLICY_FILE_NOT_FOUND for a missing explicit path", async () => {
    const tempDir = await createTempDir();
    const missingPath = path.join(tempDir, "missing-policy.yml");

    const result = await loadPolicy({ explicitPath: missingPath });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "POLICY_FILE_NOT_FOUND",
        path: missingPath
      }
    });
  });

  it("returns POLICY_PARSE_ERROR for invalid YAML", async () => {
    const policyPath = path.join(fixtureDir, "invalid-yaml.yml");

    const result = await loadPolicy({ explicitPath: policyPath });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "POLICY_PARSE_ERROR",
        path: policyPath
      }
    });
  });

  it("returns POLICY_VALIDATION_ERROR for schema-invalid YAML", async () => {
    const policyPath = path.join(fixtureDir, "invalid-policy.yml");

    const result = await loadPolicy({ explicitPath: policyPath });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "POLICY_VALIDATION_ERROR",
        path: policyPath
      }
    });
  });

  it("discovers policy from cwd", async () => {
    const tempDir = await createTempDir();
    const discoveredPath = path.join(tempDir, "stepharbor.policy.yml");

    await writeFile(discoveredPath, "version: 0.1\n");

    const result = await loadPolicy({ cwd: tempDir });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.source).toEqual({
        type: "discovered",
        path: discoveredPath
      });
      expect(result.policy.version).toBe("0.1");
    }
  });

  it("falls back to the default policy when no file is found", async () => {
    const tempDir = await createTempDir();

    const result = await loadPolicy({ cwd: tempDir });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.source).toEqual({ type: "default" });
      expect(result.policy).toEqual(defaultPolicy);
    }
  });

  it("does not fall back when useDefaultFallback is false", async () => {
    const tempDir = await createTempDir();

    const result = await loadPolicy({
      cwd: tempDir,
      useDefaultFallback: false
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "POLICY_FILE_NOT_FOUND"
      }
    });
  });

  it("validates the default policy against the domain schema", () => {
    expect(stepHarborPolicySchema.safeParse(defaultPolicy).success).toBe(true);
  });

  it("normalizes snake_case YAML into internal camelCase fields", async () => {
    const policyPath = path.join(fixtureDir, "valid-policy.yml");

    const result = await loadPolicy({ explicitPath: policyPath });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.policy.workspace?.allowedRoots).toEqual(["."]);
      expect(result.policy.workspace?.forbiddenMutationOutsideWorkspace).toBe(
        true
      );
      expect(result.policy.protectedBranches).toEqual(["main", "release/*"]);
      expect(result.policy.sensitivePaths?.high).toEqual(["security/**"]);
      expect(result.policy.validation?.beforeCommit?.commands).toEqual([
        "npm test"
      ]);
      expect(result.policy.thresholds?.largeDiffFiles).toBe(4);
      expect(result.policy.thresholds?.contextCompletenessMinimum).toBe(0.6);
      expect(result.policy.rules?.[0]?.when).toEqual({
        action_type: ["edit_file"],
        target_file_freshness: ["stale"]
      });
    }
  });

  it("loads a minimal YAML policy", async () => {
    const tempDir = await createTempDir();
    const nestedDir = path.join(tempDir, "nested");
    const policyPath = path.join(fixtureDir, "minimal-policy.yml");

    await mkdir(nestedDir);

    const result = await loadPolicy({
      cwd: nestedDir,
      explicitPath: policyPath
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.policy).toEqual({ version: "0.1" });
    }
  });
});
