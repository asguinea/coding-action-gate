import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseActionJsonString } from "../../src/actions/parseAction.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const repoRoot = process.cwd();
const betaDemoRoot = path.join(repoRoot, "examples", "beta-demo");
const actionDir = path.join(betaDemoRoot, "actions");
const policyPath = path.join(betaDemoRoot, "policies", "beta-demo.policy.yml");
const repoFixtureDir = path.join(betaDemoRoot, "repo");
const scriptPath = path.join(betaDemoRoot, "scripts", "generate-demo-data.mjs");
const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-beta-demo-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const readJson = async (filePath: string): Promise<string> =>
  readFile(filePath, "utf8");

describe("beta demo fixtures", () => {
  it("beta demo action fixtures are valid CodingActionGate actions", async () => {
    for (const fileName of [
      "proceed-readme-edit.json",
      "defer-service-edit.json",
      "escalate-auth-edit.json",
      "block-secret-read.json",
      "block-rm-command.json",
      "landing-prod-deploy.json"
    ]) {
      const content = await readJson(path.join(actionDir, fileName));
      const parsed = parseActionJsonString(content);

      expect(parsed.ok, `${fileName} should parse`).toBe(true);
    }
  });

  it("beta demo policy loads successfully", async () => {
    const policy = await loadPolicy({
      cwd: repoRoot,
      explicitPath: policyPath
    });

    expect(policy.ok).toBe(true);

    if (policy.ok) {
      expect(policy.policy.validation?.beforeCommit?.commands).toContain(
        'node -e "process.exit(0)"'
      );
    }
  });

  it("demo repo fixture contains expected files", async () => {
    for (const relativePath of [
      "README.md",
      "src/service.ts",
      "src/service.test.ts",
      "auth/service.ts"
    ]) {
      const fileStats = await stat(path.join(repoFixtureDir, relativePath));

      expect(fileStats.isFile()).toBe(true);
    }
  });

  it("demo script refuses to run when dist CLI is missing", async () => {
    const module = (await import(pathToFileURL(scriptPath).href)) as {
      ensureBuiltCli(cliPath: string): Promise<void>;
    };
    const tempDir = await createTempDir();
    const missingCli = path.join(tempDir, "dist", "cli", "cli.js");

    await expect(module.ensureBuiltCli(missingCli)).rejects.toThrow(
      "Run npm run build and npm run ui:build first."
    );
  });

  it("demo script routes dangerous examples through coding-action-gate exec", async () => {
    const script = await readFile(scriptPath, "utf8");

    expect(script).toContain('"exec", "rm -rf ."');
    expect(script).toContain('"exec", "vercel deploy --prod"');
    expect(script).not.toContain('spawn("rm"');
    expect(script).not.toContain('spawn("vercel"');
  });

  it("npm script demo:beta exists", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8")
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["demo:beta"]).toBe(
      "node examples/beta-demo/scripts/generate-demo-data.mjs"
    );
  });

  it("default generated workdir is under examples/beta-demo/workdir", async () => {
    const module = (await import(pathToFileURL(scriptPath).href)) as {
      defaultWorkdir: string;
    };

    expect(module.defaultWorkdir).toBe(path.join(betaDemoRoot, "workdir"));
  });

  it("README documents how to run demo and launch UI", async () => {
    const content = await readFile(
      path.join(betaDemoRoot, "README.md"),
      "utf8"
    );

    expect(content).toContain("npm run demo:beta");
    expect(content).toContain(
      "node dist/cli/cli.js ui --cwd examples/beta-demo/workdir"
    );
    expect(content).toContain("coding-action-gate exec");
    expect(content).toContain("dry-run");
  });
});
