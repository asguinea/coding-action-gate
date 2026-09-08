import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { destructiveActionDetector } from "../../src/signals/detectors/destructiveActionDetector.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-destr-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const normalizeFixture = (
  fixture: unknown,
  options: {
    cwd: string;
    targetPath?: string;
  }
) => {
  const action = {
    ...(fixture as Record<string, unknown>),
    ...(options.targetPath !== undefined
      ? { targetPath: options.targetPath }
      : {})
  };
  const result = parseAndNormalizeAction(action, { cwd: options.cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const writeAction = async (cwd: string, action: unknown): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

describe("destructiveActionDetector", () => {
  it("richer destructive output survives merge with action-metadata detector", async () => {
    const cwd = await createTempDir();
    const result = await computeSafetySignals({
      action: normalizeFixture(deleteFileFixture, { cwd }),
      policy: defaultPolicy,
      context: {
        cwd,
        workspaceRoots: ["."]
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        destructiveOperation: true,
        destructiveSubtype: "delete_file",
        destructiveSeverity: "high",
        destructiveReason: "File deletion is destructive."
      });
      expect(result.detectorResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detectorId: "action-metadata"
          }),
          expect.objectContaining({
            detectorId: "destructive-action"
          })
        ])
      );
    }
  });

  it("default policy defers unread inside-workspace delete_file before escalation", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...(deleteFileFixture as Record<string, unknown>),
      targetPath: "src/old.ts"
    });
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
      expect(result.output.decision.reason).toContain(
        "After context is refreshed, this action may still require human approval."
      );
    }
  });

  it("default policy blocks outside-workspace delete_file", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...(deleteFileFixture as Record<string, unknown>),
      targetPath: "../outside/file.ts"
    });
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
    }
  });

  it("default policy defers unread high-deletion edit before escalation", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...(editFileFixture as Record<string, unknown>),
      targetPath: "src/service.ts",
      diffStats: {
        files: 1,
        addedLines: 10,
        deletedLines: 501
      }
    });
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
      expect(result.output.decision.signalSummary).toMatchObject({
        destructiveOperation: true,
        destructiveSubtype: "high_deletion_ratio"
      });
    }
  });

  it("audit record includes destructive-action detector result", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...(deleteFileFixture as Record<string, unknown>),
      targetPath: "src/old.ts"
    });
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toEqual(
        expect.objectContaining({
          evidence: expect.objectContaining({
            detectorResults: expect.arrayContaining([
              expect.objectContaining({
                detectorId: "destructive-action",
                ok: true
              })
            ])
          })
        })
      );
    }
  });

  it("provided signals override computed destructive signals", async () => {
    const cwd = await createTempDir();
    const result = await computeSafetySignals({
      action: normalizeFixture(deleteFileFixture, { cwd }),
      policy: defaultPolicy,
      providedSignals: {
        destructiveOperation: false,
        destructiveSubtype: "unknown_destructive_edit",
        destructiveSeverity: "low"
      },
      context: {
        cwd,
        workspaceRoots: ["."]
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        destructiveOperation: false,
        destructiveSubtype: "unknown_destructive_edit",
        destructiveSeverity: "low"
      });
    }
  });

  it("returns non-destructive signal for read_file", () => {
    const action = normalizeFixture(readFileFixture, {
      cwd: process.cwd()
    });

    expect(
      destructiveActionDetector.compute({
        action,
        policy: defaultPolicy
      })
    ).toEqual({
      destructiveOperation: false
    });
  });
});
