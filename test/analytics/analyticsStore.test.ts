import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readAnalyticsEvents,
  recordAnalyticsEvent,
  resolveAnalyticsEventsPath
} from "../../src/analytics/index.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-analytics-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

const withAnalyticsEnv = async (
  value: string | undefined,
  fn: () => Promise<void>
): Promise<void> => {
  const previous = process.env["CODING_ACTION_GATE_ANALYTICS"];

  if (value === undefined) {
    delete process.env["CODING_ACTION_GATE_ANALYTICS"];
  } else {
    process.env["CODING_ACTION_GATE_ANALYTICS"] = value;
  }

  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env["CODING_ACTION_GATE_ANALYTICS"];
    } else {
      process.env["CODING_ACTION_GATE_ANALYTICS"] = previous;
    }
  }
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("analytics store", () => {
  it("writes append-only JSONL events under .coding-action-gate/analytics", async () => {
    const cwd = await createTempDir();

    await recordAnalyticsEvent({
      cwd,
      eventType: "doctor_run",
      source: "cli",
      payload: {
        result: "passed",
        checkCounts: {
          pass: 1,
          warn: 0,
          fail: 0,
          info: 0
        }
      }
    });

    const events = await readAnalyticsEvents({ cwd });

    expect(resolveAnalyticsEventsPath({ cwd })).toBe(
      path.join(cwd, ".coding-action-gate", "analytics", "events.jsonl")
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "doctor_run",
      schemaVersion: "0.1",
      source: "cli",
      payload: {
        result: "passed"
      }
    });
    expect(events[0]?.eventId).toEqual(expect.any(String));
    expect(events[0]?.timestamp).toEqual(expect.any(String));
    expect(events[0]?.runId).toEqual(expect.any(String));
  });

  it("does not create an event file when disabled", async () => {
    const cwd = await createTempDir();

    await withAnalyticsEnv("0", async () => {
      await recordAnalyticsEvent({
        cwd,
        eventType: "doctor_run",
        source: "cli",
        payload: {
          result: "passed",
          checkCounts: {
            pass: 1,
            warn: 0,
            fail: 0,
            info: 0
          }
        }
      });
    });

    await expect(access(resolveAnalyticsEventsPath({ cwd }))).rejects.toThrow();
  });

  it("treats false and off as disabled values", async () => {
    for (const value of ["false", "off"]) {
      const cwd = await createTempDir();

      await withAnalyticsEnv(value, async () => {
        await recordAnalyticsEvent({
          cwd,
          eventType: "init_run",
          source: "cli",
          payload: {
            result: "created",
            template: "basic"
          }
        });
      });

      await expect(
        access(resolveAnalyticsEventsPath({ cwd }))
      ).rejects.toThrow();
    }
  });

  it("strips unsafe keys and values from payloads", async () => {
    const cwd = await createTempDir();
    const sensitivePath = "/tmp/private/project/src/secret.ts";
    const sensitiveCommand = "cat .env";
    const sensitiveToken = "sk-abcdefghijklmnopqrstuvwxyz1234567890";

    await recordAnalyticsEvent({
      cwd,
      eventType: "decision_created",
      source: "runtime",
      payload: {
        decision: "PROCEED",
        actionType: "run_command",
        riskBucket: "low",
        detectorIds: [],
        ruleIds: [],
        hasDefer: false,
        hasEscalation: false,
        hasBlock: false,
        path: sensitivePath,
        command: sensitiveCommand,
        nested: {
          token: sensitiveToken,
          safeCategory: "ok"
        }
      }
    });

    const raw = await readFile(resolveAnalyticsEventsPath({ cwd }), "utf8");
    const events = await readAnalyticsEvents({ cwd });

    expect(raw).not.toContain(sensitivePath);
    expect(raw).not.toContain(sensitiveCommand);
    expect(raw).not.toContain(sensitiveToken);
    expect(events[0]?.payload).toMatchObject({
      nested: {
        safeCategory: "ok"
      }
    });
  });
});
