import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readAnalyticsEvents,
  resolveAnalyticsEventsPath
} from "../../src/analytics/index.js";
import { runCli } from "../../src/cli/cli.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { startUiCommand } from "../../src/cli/commands/uiCommand.js";
import { runRetryCommand } from "../../src/cli/commands/retryCommand.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-analytics-cli-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

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

const getAvailablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Failed to allocate port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const writeActionFile = async (
  cwd: string,
  action: CodingActionGateAction,
  fileName = "action.json"
): Promise<string> => {
  const actionPath = path.join(cwd, fileName);

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const readRawAnalytics = (cwd: string): Promise<string> =>
  readFile(resolveAnalyticsEventsPath({ cwd }), "utf8");

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("analytics CLI events", () => {
  it("records sanitized decision_created for exec dry-runs", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      cwd,
      command: "echo hello",
      noAudit: true
    });
    const events = await readAnalyticsEvents({ cwd });
    const raw = await readRawAnalytics(cwd);

    expect(result.ok).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "decision_created",
          payload: expect.objectContaining({
            decision: "PROCEED",
            actionType: "run_command",
            hasDefer: false
          })
        })
      ])
    );
    expect(raw).not.toContain("echo hello");
    expect(raw).not.toContain(cwd);
  });

  it("records sanitized defer_recorded for deferred decisions", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeActionFile(cwd, {
      id: "edit-readme",
      timestamp: "2026-05-10T10:00:00.000Z",
      proposedBy: "agent",
      type: "edit_file",
      targetPath: "README.md",
      diff: "@@\n-old\n+new\n"
    });
    const result = await runDecideCommand({
      cwd,
      actionFile: actionPath,
      noAudit: true
    });
    const events = await readAnalyticsEvents({ cwd });
    const raw = await readRawAnalytics(cwd);

    expect(result.ok).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "defer_recorded",
          payload: expect.objectContaining({
            deferReasonIds: expect.arrayContaining(["target_file_never_read"]),
            fetchPlanStepKinds: expect.arrayContaining(["read_file"])
          })
        })
      ])
    );
    expect(raw).not.toContain("README.md");
    expect(raw).not.toContain("-old");
    expect(raw).not.toContain("+new");
  });

  it("records retry_completed without raw paths or contents", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeActionFile(cwd, {
      id: "edit-readme",
      timestamp: "2026-05-10T10:00:00.000Z",
      proposedBy: "agent",
      type: "edit_file",
      targetPath: "README.md",
      diff: "@@\n-old\n+new\n"
    });
    const decision = await runDecideCommand({
      cwd,
      actionFile: actionPath,
      noAudit: true
    });

    expect(decision.ok).toBe(true);

    if (!decision.ok || decision.output.deferredAction?.recorded !== true) {
      throw new Error("Expected deferred action to be recorded.");
    }

    const deferredActionId = decision.output.deferredAction.id;

    if (deferredActionId === undefined) {
      throw new Error("Expected deferred action id.");
    }

    const retry = await runRetryCommand({
      cwd,
      deferredActionId,
      noAudit: true
    });
    const events = await readAnalyticsEvents({ cwd });
    const raw = await readRawAnalytics(cwd);

    expect(retry.ok).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "retry_completed",
          payload: expect.objectContaining({
            originalDecision: "DEFER",
            retryDecision: "DEFER",
            retryOutcome: "still_deferred"
          })
        })
      ])
    );
    expect(raw).not.toContain("README.md");
    expect(raw).not.toContain("-old");
  });

  it("records doctor, init, export-feedback, and UI launch events", async () => {
    const cwd = await createTempDir();
    const feedbackPath = path.join(cwd, "feedback.json");
    const uiResult = await startUiCommand({
      cwd,
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(uiResult.ok).toBe(true);

    if (!uiResult.ok) {
      return;
    }

    try {
      const doctor = await captureCli([
        "doctor",
        "--cwd",
        cwd,
        "--skip-port-check"
      ]);
      const init = await captureCli(["init", "--cwd", cwd]);
      const exportFeedback = await captureCli([
        "export-feedback",
        "--cwd",
        cwd,
        "--out",
        feedbackPath
      ]);
      const events = await readAnalyticsEvents({ cwd });
      const eventTypes = events.map((event) => event.eventType);
      const raw = await readRawAnalytics(cwd);

      expect(doctor.exitCode).toBe(0);
      expect(init.exitCode).toBe(0);
      expect(exportFeedback.exitCode).toBe(0);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          "ui_launched",
          "doctor_run",
          "init_run",
          "export_feedback_run"
        ])
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "ui_launched",
            payload: expect.objectContaining({
              mode: "live",
              localhostOnly: true,
              uiServerEnabled: false
            })
          }),
          expect.objectContaining({
            eventType: "init_run",
            payload: expect.objectContaining({
              result: "created",
              template: "basic"
            })
          }),
          expect.objectContaining({
            eventType: "export_feedback_run",
            payload: expect.objectContaining({
              result: "created",
              includedSections: expect.arrayContaining(["audit_summary"])
            })
          })
        ])
      );
      expect(raw).not.toContain(feedbackPath);
      expect(raw).not.toContain(cwd);
    } finally {
      await uiResult.started.stop();
    }
  });

  it("does not record analytics for ui --help", async () => {
    const cwd = await createTempDir();
    const result = await captureCli(["ui", "--help"]);

    expect(result.exitCode).toBe(0);
    await expect(access(resolveAnalyticsEventsPath({ cwd }))).rejects.toThrow();
  });

  it("keeps command behavior working when analytics is disabled", async () => {
    const cwd = await createTempDir();
    const previous = process.env["CODING_ACTION_GATE_ANALYTICS"];
    process.env["CODING_ACTION_GATE_ANALYTICS"] = "0";

    try {
      const result = await captureCli([
        "doctor",
        "--cwd",
        cwd,
        "--skip-port-check"
      ]);

      expect(result.exitCode).toBe(0);
      await expect(
        access(resolveAnalyticsEventsPath({ cwd }))
      ).rejects.toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env["CODING_ACTION_GATE_ANALYTICS"];
      } else {
        process.env["CODING_ACTION_GATE_ANALYTICS"] = previous;
      }
    }
  });
});
