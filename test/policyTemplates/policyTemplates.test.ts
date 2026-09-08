import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadPolicy } from "../../src/policy/loadPolicy.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import {
  getPolicyTemplate,
  listPolicyTemplates
} from "../../src/policyTemplates/policyTemplates.js";
import { renderPolicyTemplate } from "../../src/policyTemplates/policyTemplateRenderer.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-templates-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("policy templates", () => {
  it("lists supported templates", () => {
    expect(listPolicyTemplates().map((template) => template.name)).toEqual([
      "basic",
      "node",
      "strict",
      "monorepo-lite"
    ]);
  });

  it("renders each template as loadable YAML", async () => {
    const tempDir = await createTempDir();

    for (const template of listPolicyTemplates()) {
      const rendered = renderPolicyTemplate(template.name);
      expect(rendered).toContain(`# Template: ${template.name}`);

      const policyPath = path.join(tempDir, `${template.name}.yml`);
      await writeFile(policyPath, rendered ?? "", "utf8");
      const result = await loadPolicy({ explicitPath: policyPath });

      expect(result.ok).toBe(true);
    }
  });

  it("basic template disables validation", () => {
    const template = getPolicyTemplate("basic");

    expect(template?.policy.validation?.beforeCommit?.required).toBe(false);
    expect(template?.policy.validation?.beforeCommit?.commands).toEqual([]);
    expect(template?.policy.validation?.beforePush?.required).toBe(false);
  });

  it("node template has npm validation commands", () => {
    const template = getPolicyTemplate("node");

    expect(template?.policy.validation?.beforeCommit?.commands).toEqual([
      "npm test",
      "npm run lint",
      "npm run typecheck"
    ]);
    expect(template?.policy.validation?.beforePush?.commands).toEqual([
      "npm test",
      "npm run build"
    ]);
  });

  it("strict template has lower thresholds than basic", () => {
    const basic = getPolicyTemplate("basic");
    const strict = getPolicyTemplate("strict");

    expect(strict?.policy.thresholds?.largeDiffFiles).toBeLessThan(
      basic?.policy.thresholds?.largeDiffFiles ?? 0
    );
    expect(strict?.policy.thresholds?.largeDiffLines).toBeLessThan(
      basic?.policy.thresholds?.largeDiffLines ?? 0
    );
    expect(
      strict?.policy.thresholds?.contextCompletenessMinimum
    ).toBeGreaterThan(
      basic?.policy.thresholds?.contextCompletenessMinimum ?? 1
    );
  });

  it("monorepo-lite template includes apps and packages sensitive paths", () => {
    const template = getPolicyTemplate("monorepo-lite");

    expect(template?.policy.sensitivePaths?.high).toContain("apps/*/auth/**");
    expect(template?.policy.sensitivePaths?.high).toContain(
      "packages/*/security/**"
    );
  });

  it("reuses default policy rules", () => {
    for (const template of listPolicyTemplates()) {
      expect(template.policy.rules).toEqual(defaultPolicy.rules);
    }
  });

  it("rendered template uses snake_case keys", () => {
    const rendered = renderPolicyTemplate("node");

    expect(rendered).toContain("protected_branches:");
    expect(rendered).toContain("sensitive_paths:");
    expect(rendered).toContain("before_commit:");
    expect(rendered).toContain("large_diff_files:");
  });

  it("can write rendered policy in a nested directory and load it", async () => {
    const tempDir = await createTempDir();
    const nested = path.join(tempDir, "config");
    await mkdir(nested);
    const policyPath = path.join(nested, "coding-action-gate.policy.yml");
    await writeFile(policyPath, renderPolicyTemplate("basic") ?? "", "utf8");

    const result = await loadPolicy({ explicitPath: policyPath });

    expect(result.ok).toBe(true);
  });
});
