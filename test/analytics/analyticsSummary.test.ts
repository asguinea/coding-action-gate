import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAnalyticsSummary,
  formatAnalyticsSummary
} from "../../src/analytics/index.js";

const createTempDir = async (): Promise<string> =>
  mkdtemp(path.join(os.tmpdir(), "stepharbor-analytics-summary-"));

const writeEvents = async (cwd: string, lines: string[]): Promise<void> => {
  const analyticsDir = path.join(cwd, ".stepharbor", "analytics");
  await mkdir(analyticsDir, { recursive: true });
  await writeFile(
    path.join(analyticsDir, "events.jsonl"),
    `${lines.join("\n")}\n`
  );
};

const event = (
  eventType: string,
  payload: Record<string, unknown>,
  timestamp: string
): string =>
  JSON.stringify({
    eventId: `event-${eventType}-${timestamp}`,
    eventType,
    timestamp,
    schemaVersion: "0.1",
    runId: "run-test",
    source: "cli",
    payload
  });

describe("analytics summary", () => {
  it("summarizes safe local analytics aggregates", async () => {
    const cwd = await createTempDir();

    await writeEvents(cwd, [
      event(
        "decision_created",
        {
          decision: "PROCEED",
          actionType: "run_command",
          riskBucket: "low",
          detectorIds: ["command-risk"],
          ruleIds: ["allow-safe-command"],
          hasDefer: false,
          hasEscalation: false,
          hasBlock: false
        },
        "2026-05-10T10:00:00.000Z"
      ),
      event(
        "decision_created",
        {
          decision: "DEFER",
          actionType: "edit_file",
          riskBucket: "medium",
          detectorIds: ["read-before-write"],
          ruleIds: ["read-before-write"],
          hasDefer: true,
          hasEscalation: false,
          hasBlock: false
        },
        "2026-05-10T10:01:00.000Z"
      ),
      event(
        "retry_completed",
        {
          originalDecision: "DEFER",
          retryDecision: "PROCEED",
          retryOutcome: "resolved",
          elapsedBucket: "under_1m"
        },
        "2026-05-10T10:02:00.000Z"
      ),
      event(
        "doctor_run",
        { result: "passed", checkCounts: {} },
        "2026-05-10T10:03:00.000Z"
      ),
      event(
        "ui_launched",
        { mode: "live", localhostOnly: true },
        "2026-05-10T10:04:00.000Z"
      )
    ]);

    const summary = await buildAnalyticsSummary({ cwd });
    const output = formatAnalyticsSummary(summary);

    expect(summary.status.events).toBe(5);
    expect(summary.eventCounts.decision_created).toBe(2);
    expect(summary.decisionDistribution.PROCEED).toBe(1);
    expect(summary.decisionDistribution.DEFER).toBe(1);
    expect(summary.actionTypeDistribution.run_command).toBe(1);
    expect(summary.actionTypeDistribution.edit_file).toBe(1);
    expect(summary.deferResolution.resolved).toBe(1);
    expect(summary.commandUsage.doctor_run).toBe(1);
    expect(summary.commandUsage.ui_launched).toBe(1);
    expect(output).toContain("StepHarbor Local Analytics Summary");
    expect(output).toContain("- Events: 5");
    expect(output).toContain("- decision_created: 2");
    expect(output).toContain("- PROCEED: 1");
    expect(output).toContain("- resolved: 1");
    expect(output).toContain("- actionType run_command: 1");
  });

  it("does not print unsafe event payload values", async () => {
    const cwd = await createTempDir();

    await writeEvents(cwd, [
      event(
        "decision_created",
        {
          decision: "PROCEED",
          actionType: "run_command",
          path: "/tmp/secret/project/src/auth.ts",
          command: "rm -rf .",
          env: "API_KEY=secret-value",
          token: "super-secret-token",
          diff: "diff --git a/secret b/secret",
          repo: "repo-name-private"
        },
        "2026-05-10T10:00:00.000Z"
      )
    ]);

    const output = formatAnalyticsSummary(await buildAnalyticsSummary({ cwd }));

    expect(output).not.toContain("/tmp/secret/project/src/auth.ts");
    expect(output).not.toContain("rm -rf .");
    expect(output).not.toContain("API_KEY=secret-value");
    expect(output).not.toContain("super-secret-token");
    expect(output).not.toContain("diff --git");
    expect(output).not.toContain("repo-name-private");
  });

  it("skips malformed JSONL lines without printing them", async () => {
    const cwd = await createTempDir();
    const malformed = "not json with super-secret-token and /tmp/private";

    await writeEvents(cwd, [
      event(
        "doctor_run",
        { result: "passed", checkCounts: {} },
        "2026-05-10T10:00:00.000Z"
      ),
      malformed
    ]);

    const output = formatAnalyticsSummary(await buildAnalyticsSummary({ cwd }));

    expect(output).toContain("- Events: 1");
    expect(output).toContain("- Skipped malformed events: 1");
    expect(output).not.toContain(malformed);
    expect(output).not.toContain("super-secret-token");
    expect(output).not.toContain("/tmp/private");
  });
});
