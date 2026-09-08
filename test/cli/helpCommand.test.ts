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

describe("help command", () => {
  it("prints main help with purpose and major commands", async () => {
    const result = await captureCli(["help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("runtime authorization layer");
    expect(result.stdout).toContain("PROCEED");
    expect(result.stdout).toContain("DEFER");
    expect(result.stdout).toContain("ESCALATE");
    expect(result.stdout).toContain("BLOCK");
    expect(result.stdout).toContain("decide <actionFile>");
    expect(result.stdout).toContain('exec "<command>"');
    expect(result.stdout).toContain("read <path>");
    expect(result.stdout).toContain("retry <deferredActionId>");
    expect(result.stdout).toContain("validate <kind>");
    expect(result.stdout).toContain("ui");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("policy");
    expect(result.stdout).toContain("export-feedback");
    expect(result.stdout).toContain("analytics summary");
  });

  it("explains decision outcomes", async () => {
    const result = await captureCli(["help", "decisions"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PROCEED");
    expect(result.stdout).toContain("DEFER");
    expect(result.stdout).toContain("ESCALATE");
    expect(result.stdout).toContain("BLOCK");
    expect(result.stdout).toContain("DEFER does not mean failure");
  });

  it("explains DEFER read and retry flow", async () => {
    const result = await captureCli(["help", "defer"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("read-before-write");
    expect(result.stdout).toContain("missing related context");
    expect(result.stdout).toContain("stepharbor read");
    expect(result.stdout).toContain("stepharbor retry");
  });

  it("explains policy without editing it", async () => {
    const result = await captureCli(["help", "policy"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor.policy.yml");
    expect(result.stdout).toContain("does not edit policy");
    expect(result.stdout).toContain("stepharbor policy show");
    expect(result.stdout).toContain("stepharbor policy validate");
    expect(result.stdout).toContain("stepharbor policy explain");
    expect(result.stdout).toContain("read-only");
    expect(result.stdout).toContain("basic");
    expect(result.stdout).toContain("node");
    expect(result.stdout).toContain("strict");
    expect(result.stdout).toContain("monorepo-lite");
  });

  it("explains security and privacy boundaries", async () => {
    const result = await captureCli(["help", "security"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("local-first");
    expect(result.stdout).toContain(".stepharbor/analytics/");
    expect(result.stdout).toContain("read-only");
    expect(result.stdout).toContain("No remote telemetry is sent");
    expect(result.stdout).toContain("STEPHARBOR_ANALYTICS=0");
    expect(result.stdout).toContain("redacted");
    expect(result.stdout).toContain("dry-run only");
    expect(result.stdout).toContain("stepharbor analytics summary");
    expect(result.stdout).toContain("stepharbor analytics clear --yes");
  });

  it("explains local analytics commands and privacy", async () => {
    const result = await captureCli(["help", "analytics"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("local-only");
    expect(result.stdout).toContain(".stepharbor/analytics/events.jsonl");
    expect(result.stdout).toContain("No remote telemetry is sent");
    expect(result.stdout).toContain("raw paths");
    expect(result.stdout).toContain("raw commands");
    expect(result.stdout).toContain("stepharbor analytics summary");
    expect(result.stdout).toContain("stepharbor analytics clear --yes");
    expect(result.stdout).toContain("STEPHARBOR_ANALYTICS=0");
  });

  it("explains installed and source UI behavior", async () => {
    const result = await captureCli(["help", "ui"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor ui");
    expect(result.stdout).toContain("read-only");
    expect(result.stdout).toContain("ui/dist");
    expect(result.stdout).toContain("npm run ui:build");
  });

  it("explains private beta install, uninstall, reset, and RC checks", async () => {
    const result = await captureCli(["help", "install"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("npm pack");
    expect(result.stdout).toContain("npm install -g ./<tarball>");
    expect(result.stdout).toContain("stepharbor --version");
    expect(result.stdout).toContain("stepharbor doctor");
    expect(result.stdout).toContain("npm uninstall -g stepharbor");
    expect(result.stdout).toContain(".stepharbor/");
    expect(result.stdout).toContain("npm run smoke:install is mandatory");
    expect(result.stdout).toContain("clean machine or fresh VM");
  });

  it("explains first-run flow", async () => {
    const result = await captureCli(["help", "first-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor --version");
    expect(result.stdout).toContain("stepharbor doctor");
    expect(result.stdout).toContain("stepharbor init");
    expect(result.stdout).toContain('stepharbor exec "echo hello"');
    expect(result.stdout).toContain("stepharbor ui");
    expect(result.stdout).toContain("stepharbor export-feedback");
  });

  it("reports unknown help topics with available topics", async () => {
    const result = await captureCli(["help", "does-not-exist"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown help topic: does-not-exist");
    expect(result.stderr).toContain("Available topics:");
    expect(result.stderr).toContain("decisions");
    expect(result.stderr).toContain("install");
    expect(result.stderr).toContain("analytics");
  });
});
