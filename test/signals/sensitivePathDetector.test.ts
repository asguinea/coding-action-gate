import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { sensitivePathDetector } from "../../src/signals/detectors/sensitivePathDetector.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-path-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const editAction = (targetPath: string): StepHarborAction => ({
  id: `action-${targetPath.replace(/\W+/g, "-")}`,
  type: "edit_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath,
  diffStats: {
    files: 1,
    addedLines: 2,
    deletedLines: 1
  }
});

const deleteAction = (targetPath: string): StepHarborAction => ({
  id: `action-${targetPath.replace(/\W+/g, "-")}`,
  type: "delete_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath
});

const commandAction = (): StepHarborAction => ({
  id: "action-command",
  type: "run_command",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  command: "npm test"
});

const normalize = (action: StepHarborAction, cwd = process.cwd()) => {
  const normalized = normalizeAction(action, { cwd });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  return normalized.action;
};

const writeAction = async (
  cwd: string,
  action: StepHarborAction
): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(action), "utf8");

  return actionPath;
};

const writePolicy = async (cwd: string): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");

  await writeFile(
    policyPath,
    `
version: "0.1"
workspace:
  allowed_roots:
    - src
  forbidden_mutation_outside_workspace: true
sensitive_paths:
  high:
    - auth/**
rules:
  - id: block-workspace-escape
    decision: BLOCK
    when:
      workspace_boundary_violation: true
      mutates_filesystem: true
    reason: "Mutation escapes allowed workspace roots."
  - id: escalate-sensitive-change
    decision: ESCALATE
    when:
      path_sensitivity:
        - high
        - critical
      action_type:
        - edit_file
        - write_file
        - delete_file
    reason: "Sensitive path changes require human review."
`,
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

describe("sensitivePathDetector", () => {
  it("computes pathSensitivity for edit_file", () => {
    expect(
      sensitivePathDetector.compute({
        action: normalize(editAction("auth/service.ts")),
        policy: defaultPolicy
      })
    ).toMatchObject({
      pathSensitivity: "high",
      matchedSensitivePath: "auth/service.ts"
    });
  });

  it("computes pathSensitivity for delete_file", () => {
    expect(
      sensitivePathDetector.compute({
        action: normalize(deleteAction(".env")),
        policy: defaultPolicy
      })
    ).toMatchObject({
      pathSensitivity: "critical",
      matchedSensitivePath: ".env"
    });
  });

  it("does not over-classify command actions without target paths", () => {
    expect(
      sensitivePathDetector.compute({
        action: normalize(commandAction()),
        policy: defaultPolicy
      })
    ).toMatchObject({
      pathSensitivity: "unknown"
    });
  });

  it("default policy defers unread auth edit before escalation", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeAction(cwd, editAction("auth/service.ts")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
      expect(result.output.decision.signalSummary).toMatchObject({
        pathSensitivity: "high",
        targetFileFreshness: "unknown"
      });
    }
  });

  it("default policy defers unread billing edit before escalation", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeAction(cwd, editAction("billing/checkout.ts")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
    }
  });

  it("default policy defers unread workflow edit before escalation", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeAction(
        cwd,
        editAction(".github/workflows/ci.yml")
      ),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.expectedNextDecision).toBe("ESCALATE");
    }
  });

  it("default policy does not escalate README edit, but freshness can defer it", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeAction(cwd, editAction("README.md")),
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.signalSummary).toMatchObject({
        pathSensitivity: "low",
        targetFileFreshness: "unknown"
      });
    }
  });

  it("workspace BLOCK overrides sensitive ESCALATE", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(cwd);
    const result = await runDecideCommand({
      actionFile: await writeAction(cwd, deleteAction("auth/service.ts")),
      policy: policyPath,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        pathSensitivity: "high",
        workspaceBoundaryViolation: true
      });
    }
  });

  it("audit record includes sensitive-path detector result", async () => {
    const cwd = await createTempDir();
    const result = await runDecideCommand({
      actionFile: await writeAction(cwd, editAction("auth/service.ts")),
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
                detectorId: "sensitive-path",
                ok: true
              })
            ])
          })
        })
      );
    }
  });

  it("provided signals override computed pathSensitivity", async () => {
    const result = await computeSafetySignals({
      action: normalize(editAction("auth/service.ts")),
      policy: defaultPolicy,
      providedSignals: {
        pathSensitivity: "low"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.pathSensitivity).toBe("low");
      expect(result.computedSignals.pathSensitivity).toBe("high");
    }
  });
});
