import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";

const captureCli = async (
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array): boolean => {
        stderr += String(chunk);
        return true;
      }
    }
  });

  return {
    exitCode,
    stdout,
    stderr
  };
};

const createTempDir = async (): Promise<string> =>
  mkdtemp(path.join(os.tmpdir(), "stepharbor-policy-command-"));

const writePolicy = async (cwd: string, yaml: string): Promise<string> => {
  const policyPath = path.join(cwd, "stepharbor.policy.yml");
  await writeFile(policyPath, yaml);

  return policyPath;
};

const validPolicy = `version: 0.1
workspace:
  allowed_roots:
    - .
  forbidden_mutation_outside_workspace: true
sensitive_paths:
  critical:
    - .env
    - secrets/**
  high:
    - auth/**
validation:
  before_commit:
    required: false
    commands: []
rules:
  - id: read-before-write
    decision: DEFER
    when:
      action_type:
        - edit_file
    reason: Target file state is not fresh.
  - id: block-critical-command
    decision: BLOCK
    when:
      command_risk_score:
        - critical
`;

describe("policy command", () => {
  it("prints policy command help", async () => {
    const result = await captureCli(["policy"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("stepharbor policy show");
    expect(result.stdout).toContain("stepharbor policy validate");
    expect(result.stdout).toContain("stepharbor policy explain");
    expect(result.stdout).toContain("Read-only policy commands");
  });

  it("shows bundled default policy without exposing temp workspace paths", async () => {
    const cwd = await createTempDir();
    const result = await captureCli(["policy", "show", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Source: bundled default policy");
    expect(result.stdout).toContain("Sections:");
    expect(result.stdout).toContain("Workspace:");
    expect(result.stdout).toContain("Rules:");
    expect(result.stdout).toContain(
      "Available templates: basic, node, strict, monorepo-lite"
    );
    expect(result.stdout).not.toContain(cwd);
  });

  it("shows project policy source and safe policy patterns", async () => {
    const cwd = await createTempDir();
    await writePolicy(cwd, validPolicy);

    const result = await captureCli(["policy", "show", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Source: stepharbor.policy.yml (project)");
    expect(result.stdout).toContain(".env");
    expect(result.stdout).toContain("secrets/**");
    expect(result.stdout).toContain("auth/**");
    expect(result.stdout).toContain("read-before-write");
    expect(result.stdout).not.toContain(cwd);
  });

  it("validates default and project policies", async () => {
    const cwd = await createTempDir();
    await writePolicy(cwd, validPolicy);

    const defaultResult = await captureCli([
      "policy",
      "validate",
      "--cwd",
      await createTempDir()
    ]);
    const projectResult = await captureCli([
      "policy",
      "validate",
      "--cwd",
      cwd
    ]);

    expect(defaultResult.exitCode).toBe(0);
    expect(defaultResult.stdout).toContain("Policy validation: PASS");
    expect(defaultResult.stdout).toContain("bundled default policy");
    expect(projectResult.exitCode).toBe(0);
    expect(projectResult.stdout).toContain("Policy validation: PASS");
    expect(projectResult.stdout).toContain("stepharbor.policy.yml");
  });

  it("reports malformed YAML without a stack trace", async () => {
    const cwd = await createTempDir();
    await writePolicy(cwd, "version: [unterminated\n");

    const result = await captureCli(["policy", "validate", "--cwd", cwd]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Policy validation: FAIL");
    expect(result.stdout).toContain("Policy file contains invalid YAML");
    expect(result.stdout).not.toContain("Error:");
    expect(result.stdout).not.toContain(cwd);
  });

  it("reports schema validation issues without a stack trace", async () => {
    const cwd = await createTempDir();
    await writePolicy(
      cwd,
      "version: 0.1\nrules:\n  - id: missing-decision\n    when: {}\n"
    );

    const result = await captureCli(["policy", "validate", "--cwd", cwd]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Policy validation: FAIL");
    expect(result.stdout).toContain("rules.0.decision");
    expect(result.stdout).not.toContain("ZodError");
    expect(result.stdout).not.toContain(cwd);
  });

  it("explains default policy in practical decision terms", async () => {
    const cwd = await createTempDir();
    const result = await captureCli(["policy", "explain", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("StepHarbor Policy Explanation");
    expect(result.stdout).toContain("Workspace boundaries");
    expect(result.stdout).toContain("Sensitive paths");
    expect(result.stdout).toContain("Validation gates");
    expect(result.stdout).toContain("Git workflow safety");
    expect(result.stdout).toContain("PROCEED");
    expect(result.stdout).toContain("DEFER");
    expect(result.stdout).toContain("ESCALATE");
    expect(result.stdout).toContain("BLOCK");
    expect(result.stdout).toContain("DEFER is not failure");
  });

  it("explains project policy source and configured categories", async () => {
    const cwd = await createTempDir();
    await writePolicy(cwd, validPolicy);

    const result = await captureCli(["policy", "explain", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Source: stepharbor.policy.yml (project)");
    expect(result.stdout).toContain("Workspace boundaries");
    expect(result.stdout).toContain("Sensitive paths");
  });

  it("does not invent explanations for invalid policy", async () => {
    const cwd = await createTempDir();
    await writePolicy(cwd, "version: []\n");

    const result = await captureCli(["policy", "explain", "--cwd", cwd]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Policy could not be loaded");
    expect(result.stderr).toContain("policy validate");
    expect(result.stderr).not.toContain(cwd);
  });

  it("redacts secret-like accidental policy values", async () => {
    const cwd = await createTempDir();
    const secretValue = "super-secret-token";
    await writePolicy(
      cwd,
      `version: 0.1
sensitive_paths:
  high:
    - ${secretValue}
rules:
  - id: api_key=secret-value
    decision: ESCALATE
    when:
      path_sensitivity:
        - high
`
    );

    const show = await captureCli(["policy", "show", "--cwd", cwd]);
    const json = await captureCli(["policy", "show", "--cwd", cwd, "--json"]);

    expect(show.exitCode).toBe(0);
    expect(show.stdout).not.toContain(secretValue);
    expect(show.stdout).not.toContain("api_key=secret-value");
    expect(show.stdout).toContain("[REDACTED]");
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      source: {
        label: "stepharbor.policy.yml"
      }
    });
    expect(json.stdout).not.toContain(secretValue);
    expect(json.stdout).not.toContain("api_key=secret-value");
  });
});
