import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runReadCommand } from "../../src/cli/commands/readCommand.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { relatedContextDetector } from "../../src/signals/detectors/relatedContextDetector.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-related-det-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const baseAction = {
  timestamp: "2026-05-02T10:00:00.000Z",
  proposedBy: "agent" as const
};

const fileAction = (
  type: "edit_file" | "write_file" | "read_file",
  targetPath: string
): CodingActionGateAction =>
  ({
    ...baseAction,
    id: `${type}-${targetPath}`,
    type,
    targetPath,
    ...(type === "edit_file" ? { diff: "@@\n-old\n+new\n" } : {})
  }) as CodingActionGateAction;

const runCommandAction = (): CodingActionGateAction => ({
  ...baseAction,
  id: "run",
  type: "run_command",
  command: "npm test"
});

const normalize = (action: CodingActionGateAction, cwd: string) => {
  const result = normalizeAction(action, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const setupService = async (cwd: string): Promise<void> => {
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await writeFile(path.join(cwd, "src", "service.ts"), "export {}\n", "utf8");
  await writeFile(
    path.join(cwd, "src", "service.test.ts"),
    "test('service', () => {})\n",
    "utf8"
  );
};

const writeActionFile = async (
  cwd: string,
  action: CodingActionGateAction
): Promise<string> => {
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

describe("relatedContextDetector", () => {
  it("sets score 1.0 for a file with no related tests", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "service.ts"), "export {}\n", "utf8");

    const result = await relatedContextDetector.compute({
      action: normalize(fileAction("edit_file", "src/service.ts"), cwd),
      policy: defaultPolicy,
      context: { cwd }
    });

    expect(result).toMatchObject({
      relatedTestsFound: false,
      relatedTestsRead: false,
      contextCompletenessScore: 1
    });
  });

  it("finds related tests and marks them unread when not observed", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    const result = await relatedContextDetector.compute({
      action: normalize(fileAction("edit_file", "src/service.ts"), cwd),
      policy: defaultPolicy,
      context: { cwd, session: { sessionId: "s1" } }
    });

    expect(result).toMatchObject({
      relatedTestsFound: true,
      relatedTestsRead: false,
      contextCompletenessScore: 0.5,
      relatedTestPaths: ["src/service.test.ts"]
    });
  });

  it("marks related tests read after a fresh full observation", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    await runReadCommand({
      targetPath: "src/service.test.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    const result = await relatedContextDetector.compute({
      action: normalize(fileAction("edit_file", "src/service.ts"), cwd),
      policy: defaultPolicy,
      context: { cwd, session: { sessionId: "s1" } }
    });

    expect(result).toMatchObject({
      relatedTestsFound: true,
      relatedTestsRead: true,
      contextCompletenessScore: 1
    });
  });

  it("does not apply to read_file", async () => {
    const cwd = await createTempDir();

    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src", "service.ts"), "export {}\n", "utf8");

    expect(
      await relatedContextDetector.compute({
        action: normalize(fileAction("read_file", "src/service.ts"), cwd),
        policy: defaultPolicy,
        context: { cwd }
      })
    ).toEqual({});
  });

  it("does not apply to run_command", async () => {
    const cwd = await createTempDir();

    expect(
      await relatedContextDetector.compute({
        action: normalize(runCommandAction(), cwd),
        policy: defaultPolicy,
        context: { cwd }
      })
    ).toEqual({});
  });

  it("default policy DEFERs when contextCompletenessScore is below threshold", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);
    await runReadCommand({
      targetPath: "src/service.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        fileAction("edit_file", "src/service.ts")
      ),
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.deferReasonCategory).toBe(
        "context_incomplete"
      );
      expect(result.output.decision.missingContext).toEqual([
        {
          type: "related_tests",
          target: "src/service.test.ts",
          reason: "Related tests have not been inspected.",
          required: true
        }
      ]);
      expect(result.output.decision.fetchPlan).toEqual([
        {
          type: "read_related_tests",
          target: "src/service.test.ts",
          safe: true,
          reason: "Inspect related tests before modifying this file."
        }
      ]);
    }
  });

  it("after reading related tests, context completeness no longer defers", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    await runReadCommand({
      targetPath: "src/service.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });
    await runReadCommand({
      targetPath: "src/service.test.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        fileAction("edit_file", "src/service.ts")
      ),
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("PROCEED");
      expect(result.output.decision.signalSummary).toMatchObject({
        contextCompletenessScore: 1,
        relatedTestsRead: true
      });
    }
  });

  it("read-before-write DEFER takes precedence over context completeness", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        fileAction("edit_file", "src/service.ts")
      ),
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.deferReasonCategory).toBe(
        "target_file_never_read"
      );
      expect(result.output.decision.reason).toBe(
        "Target file has not been observed in this session."
      );
      expect(result.output.decision.missingContext).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "related_tests",
            target: "src/service.test.ts"
          })
        ])
      );
    }
  });

  it("audit record includes related-context detector result", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    const result = await runDecideCommand({
      actionFile: await writeActionFile(
        cwd,
        fileAction("edit_file", "src/service.ts")
      ),
      cwd,
      sessionId: "s1"
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toEqual(
        expect.objectContaining({
          evidence: expect.objectContaining({
            detectorResults: expect.arrayContaining([
              expect.objectContaining({
                detectorId: "related-context",
                ok: true,
                signals: expect.objectContaining({
                  contextCompletenessScore: 0.5,
                  relatedTestsFound: true,
                  relatedTestsRead: false
                })
              })
            ])
          })
        })
      );
    }
  });

  it("provided signals override computed contextCompletenessScore", async () => {
    const cwd = await createTempDir();
    await setupService(cwd);

    const result = await computeSafetySignals({
      action: normalize(fileAction("edit_file", "src/service.ts"), cwd),
      policy: defaultPolicy,
      providedSignals: {
        contextCompletenessScore: 1
      },
      context: {
        cwd,
        session: {
          sessionId: "s1"
        }
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.computedSignals.contextCompletenessScore).toBe(0.5);
      expect(result.signals.contextCompletenessScore).toBe(1);
    }
  });
});
