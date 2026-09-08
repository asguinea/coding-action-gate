import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  mkdtemp(path.join(os.tmpdir(), "coding-action-gate-analytics-command-"));

const eventPath = (cwd: string): string =>
  path.join(cwd, ".coding-action-gate", "analytics", "events.jsonl");

const writeAnalyticsFile = async (
  cwd: string,
  lines: string[]
): Promise<void> => {
  await mkdir(path.dirname(eventPath(cwd)), { recursive: true });
  await writeFile(eventPath(cwd), `${lines.join("\n")}\n`);
};

const event = (
  eventType: string,
  payload: Record<string, unknown>,
  timestamp = "2026-05-10T10:00:00.000Z"
): string =>
  JSON.stringify({
    eventId: `${eventType}-event`,
    eventType,
    timestamp,
    schemaVersion: "0.1",
    runId: "run-test",
    source: "cli",
    payload
  });

describe("analytics command", () => {
  it("prints analytics command help", async () => {
    const result = await captureCli(["analytics"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("coding-action-gate analytics summary");
    expect(result.stdout).toContain("coding-action-gate analytics clear --yes");
    expect(result.stdout).toContain("local-only");
    expect(result.stdout).toContain(
      ".coding-action-gate/analytics/events.jsonl"
    );
    expect(result.stdout).toContain("remote telemetry");
    expect(result.stdout).toContain("CODING_ACTION_GATE_ANALYTICS=0");
  });

  it("prints a helpful message when no events exist", async () => {
    const cwd = await createTempDir();
    const result = await captureCli(["analytics", "summary", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No local analytics events found");
    expect(result.stdout).toContain(
      ".coding-action-gate/analytics/events.jsonl"
    );
  });

  it("summarizes local analytics events", async () => {
    const cwd = await createTempDir();
    await writeAnalyticsFile(cwd, [
      event("decision_created", {
        decision: "BLOCK",
        actionType: "run_command",
        riskBucket: "critical",
        detectorIds: ["command-risk"],
        ruleIds: ["block-dangerous-command"],
        hasDefer: false,
        hasEscalation: false,
        hasBlock: true
      }),
      event("retry_completed", {
        originalDecision: "DEFER",
        retryDecision: "BLOCK",
        retryOutcome: "blocked",
        elapsedBucket: "unknown"
      }),
      event("init_run", { result: "created", template: "node" }),
      event("export_feedback_run", { result: "created", includedSections: [] })
    ]);

    const result = await captureCli(["analytics", "summary", "--cwd", cwd]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CodingActionGate Local Analytics Summary");
    expect(result.stdout).toContain("- Events: 4");
    expect(result.stdout).toContain("- decision_created: 1");
    expect(result.stdout).toContain("- BLOCK: 1");
    expect(result.stdout).toContain("- blocked: 1");
    expect(result.stdout).toContain("- init_run: 1");
    expect(result.stdout).toContain("- export_feedback_run: 1");
  });

  it("prints sanitized summary JSON", async () => {
    const cwd = await createTempDir();
    await writeAnalyticsFile(cwd, [
      event("decision_created", {
        decision: "PROCEED",
        actionType: "run_command",
        command: "rm -rf .",
        path: "/tmp/private/project"
      })
    ]);

    const result = await captureCli([
      "analytics",
      "summary",
      "--cwd",
      cwd,
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      status: { events: number };
      decisionDistribution: { PROCEED: number };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.status.events).toBe(1);
    expect(parsed.decisionDistribution.PROCEED).toBe(1);
    expect(result.stdout).not.toContain("rm -rf .");
    expect(result.stdout).not.toContain("/tmp/private/project");
  });

  it("does not clear events without explicit confirmation", async () => {
    const cwd = await createTempDir();
    await writeAnalyticsFile(cwd, [
      event("doctor_run", { result: "passed", checkCounts: {} })
    ]);

    const result = await captureCli(["analytics", "clear", "--cwd", cwd]);
    const content = await readFile(eventPath(cwd), "utf8");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Run `coding-action-gate analytics clear --yes`"
    );
    expect(content).toContain("doctor_run");
  });

  it("clears analytics events only with confirmation", async () => {
    const cwd = await createTempDir();
    await writeAnalyticsFile(cwd, [
      event("doctor_run", { result: "passed", checkCounts: {} })
    ]);
    await mkdir(path.join(cwd, ".coding-action-gate", "audit"), {
      recursive: true
    });
    await mkdir(path.join(cwd, ".coding-action-gate", "deferred"), {
      recursive: true
    });
    await mkdir(path.join(cwd, ".coding-action-gate", "validation"), {
      recursive: true
    });
    await mkdir(path.join(cwd, ".coding-action-gate", "observations"), {
      recursive: true
    });
    await writeFile(
      path.join(cwd, ".coding-action-gate", "audit", "audit.jsonl"),
      "keep\n"
    );
    await writeFile(
      path.join(cwd, "coding-action-gate.policy.yml"),
      "version: 1\n"
    );

    const result = await captureCli([
      "analytics",
      "clear",
      "--cwd",
      cwd,
      "--yes"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Cleared local CodingActionGate analytics events"
    );
    await expect(access(eventPath(cwd))).rejects.toThrow();
    await expect(
      access(path.join(cwd, ".coding-action-gate", "audit", "audit.jsonl"))
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(cwd, ".coding-action-gate", "deferred"))
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(cwd, ".coding-action-gate", "validation"))
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(cwd, ".coding-action-gate", "observations"))
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(cwd, "coding-action-gate.policy.yml"))
    ).resolves.toBeUndefined();
  });

  it("allows summary and clear while recording is disabled", async () => {
    const cwd = await createTempDir();
    const previous = process.env["CODING_ACTION_GATE_ANALYTICS"];
    process.env["CODING_ACTION_GATE_ANALYTICS"] = "0";

    try {
      await writeAnalyticsFile(cwd, [
        event("doctor_run", { result: "passed", checkCounts: {} })
      ]);

      const summary = await captureCli(["analytics", "summary", "--cwd", cwd]);
      const clear = await captureCli([
        "analytics",
        "clear",
        "--cwd",
        cwd,
        "--yes"
      ]);

      expect(summary.exitCode).toBe(0);
      expect(summary.stdout).toContain("- Local analytics: disabled");
      expect(summary.stdout).toContain("- Events: 1");
      expect(clear.exitCode).toBe(0);
      await expect(access(eventPath(cwd))).rejects.toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env["CODING_ACTION_GATE_ANALYTICS"];
      } else {
        process.env["CODING_ACTION_GATE_ANALYTICS"] = previous;
      }
    }
  });
});
