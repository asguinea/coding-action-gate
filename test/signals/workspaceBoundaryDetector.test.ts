import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { decide } from "../../src/decision/decisionEngine.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { workspaceBoundaryDetector } from "../../src/signals/detectors/workspaceBoundaryDetector.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import runCommandFixture from "../../src/fixtures/actions/run-command.json" with { type: "json" };
import writeFileFixture from "../../src/fixtures/actions/write-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-ws-"));
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

const computeDetector = async (
  action: ReturnType<typeof normalizeFixture>,
  cwd: string
) =>
  workspaceBoundaryDetector.compute({
    action,
    policy: defaultPolicy,
    providedSignals: {
      mutatesFilesystem:
        action.type === "write_file" ||
        action.type === "edit_file" ||
        action.type === "delete_file"
    },
    context: {
      cwd,
      workspaceRoots: ["."]
    }
  });

const writeAction = async (cwd: string, action: unknown): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const writePolicy = async (cwd: string): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");

  await writeFile(
    policyPath,
    [
      "version: 0.1",
      "workspace:",
      "  allowed_roots:",
      "    - .",
      "rules:",
      "  - id: block-workspace-escape",
      "    decision: BLOCK",
      "    when:",
      "      workspace_boundary_violation: true",
      "      mutates_filesystem: true",
      "    reason: Mutation escapes workspace."
    ].join("\n"),
    "utf8"
  );

  return policyPath;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

describe("workspaceBoundaryDetector", () => {
  it("edit_file inside workspace sets workspaceBoundaryViolation false", async () => {
    const cwd = await createTempDir();
    const signals = await computeDetector(
      normalizeFixture(editFileFixture, { cwd, targetPath: "src/file.ts" }),
      cwd
    );

    expect(signals).toMatchObject({
      workspaceBoundaryViolation: false,
      workspaceBoundaryStatus: "inside"
    });
  });

  it("write_file inside workspace sets workspaceBoundaryViolation false", async () => {
    const cwd = await createTempDir();
    const signals = await computeDetector(
      normalizeFixture(writeFileFixture, { cwd, targetPath: "src/file.ts" }),
      cwd
    );

    expect(signals).toMatchObject({
      workspaceBoundaryViolation: false,
      workspaceBoundaryStatus: "inside"
    });
  });

  it("delete_file outside workspace sets workspaceBoundaryViolation true", async () => {
    const cwd = await createTempDir();
    const signals = await computeDetector(
      normalizeFixture(deleteFileFixture, { cwd, targetPath: "../outside.ts" }),
      cwd
    );

    expect(signals).toMatchObject({
      workspaceBoundaryViolation: true,
      workspaceBoundaryStatus: "outside"
    });
  });

  it("read_file outside workspace does not produce blocking mutation violation", async () => {
    const cwd = await createTempDir();
    const signals = await computeDetector(
      normalizeFixture(readFileFixture, { cwd, targetPath: "../outside.ts" }),
      cwd
    );

    expect(signals.workspaceBoundaryViolation).toBeUndefined();
    expect(signals.workspaceBoundaryStatus).toBe("not_applicable");
  });

  it("multi-path mutation outside any root sets violation true", async () => {
    const cwd = await createTempDir();
    const editAction = {
      ...(editFileFixture as unknown as StepHarborAction),
      targetPath: "src/inside.ts"
    } as StepHarborAction;
    const normalized = normalizeAction(editAction, { cwd });

    expect(normalized.ok).toBe(true);

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    const action = {
      ...normalized.action,
      normalized: {
        ...normalized.action.normalized,
        absoluteTargetPaths: [
          path.join(cwd, "src/inside.ts"),
          path.resolve(cwd, "../outside.ts")
        ]
      }
    };
    const signals = await workspaceBoundaryDetector.compute({
      action,
      policy: defaultPolicy,
      providedSignals: {
        mutatesFilesystem: true
      },
      context: {
        cwd,
        workspaceRoots: ["."]
      }
    });

    expect(signals.workspaceBoundaryViolation).toBe(true);
  });

  it("run_command with dangerous-looking path does not produce violation yet", async () => {
    const cwd = await createTempDir();
    const action = normalizeFixture(runCommandFixture, { cwd });
    const signals = await workspaceBoundaryDetector.compute({
      action,
      policy: defaultPolicy,
      context: {
        cwd,
        workspaceRoots: ["."]
      }
    });

    expect(signals.workspaceBoundaryViolation).toBeUndefined();
    expect(signals.workspaceBoundaryStatus).toBe("not_applicable");
  });
});

describe("workspace boundary integration", () => {
  it("default policy blocks mutating outside-workspace file action", async () => {
    const cwd = await createTempDir();
    const action = normalizeFixture(deleteFileFixture, {
      cwd,
      targetPath: "../outside.ts"
    });
    const signalResult = await computeSafetySignals({
      action,
      policy: defaultPolicy,
      context: {
        cwd,
        workspaceRoots: ["."]
      }
    });

    expect(signalResult.ok).toBe(true);

    if (!signalResult.ok) {
      throw new Error(signalResult.error.message);
    }

    const decisionResult = decide({
      action,
      policy: defaultPolicy,
      signals: signalResult.signals
    });

    expect(decisionResult.ok).toBe(true);

    if (decisionResult.ok) {
      expect(decisionResult.decision.decision).toBe("BLOCK");
    }
  });

  it("CLI decide returns BLOCK for outside-workspace delete using default policy", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, {
      ...(deleteFileFixture as unknown as Record<string, unknown>),
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
      expect(result.output.decision.signalSummary).toMatchObject({
        workspaceBoundaryViolation: true,
        mutatesFilesystem: true
      });
    }
  });

  it("audit record includes workspace-boundary detector result", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(cwd);
    const actionPath = await writeAction(cwd, {
      ...(deleteFileFixture as unknown as Record<string, unknown>),
      targetPath: "../outside/file.ts"
    });
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      policy: policyPath
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toMatchObject({
        signals: {
          workspaceBoundaryViolation: true
        }
      });
      expect(records[0]).toEqual(
        expect.objectContaining({
          evidence: expect.objectContaining({
            detectorResults: expect.arrayContaining([
              expect.objectContaining({
                detectorId: "workspace-boundary",
                ok: true
              })
            ])
          })
        })
      );
    }
  });
});
