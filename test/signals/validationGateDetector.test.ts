import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { runValidateCommand } from "../../src/cli/commands/validateCommand.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import type { CodingActionGatePolicy } from "../../src/domain/policies.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { runGitCommand } from "../../src/git/gitExec.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { createValidationResultStore } from "../../src/validation/validationResultStore.js";

const tempDirs: string[] = [];
const validationGateIntegrationTimeoutMs = 30_000;
const validationCommand = 'node -e "process.exit(0)"';
const failingValidationCommand = 'node -e "process.exit(1)"';

vi.setConfig({
  testTimeout: validationGateIntegrationTimeoutMs,
  hookTimeout: validationGateIntegrationTimeoutMs
});

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-val-gate-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const runGit = async (args: string[], cwd: string): Promise<string> => {
  const result = await runGitCommand(args, { cwd });

  if (!result.ok) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.error.message}\n${
        result.error.stderr ?? ""
      }`
    );
  }

  return result.stdout.trim();
};

const createRepo = async (branch = "feature/test"): Promise<string> => {
  const cwd = await createTempDir();

  await runGit(["init", "-b", branch], cwd);
  await runGit(
    ["config", "user.email", "coding-action-gate@example.test"],
    cwd
  );
  await runGit(["config", "user.name", "CodingActionGate Test"], cwd);
  await writeFile(path.join(cwd, "README.md"), "# Repo\n", "utf8");
  await runGit(["add", "README.md"], cwd);
  await runGit(["commit", "-m", "initial"], cwd);

  return cwd;
};

const policyWithValidation = (
  options: {
    beforeCommitCommands?: string[];
    beforePushCommands?: string[];
  } = {}
): CodingActionGatePolicy => ({
  ...defaultPolicy,
  protectedBranches: ["main", "master", "production", "release/*"],
  validation: {
    ...(options.beforeCommitCommands !== undefined
      ? {
          beforeCommit: {
            required: true,
            commands: options.beforeCommitCommands
          }
        }
      : {}),
    ...(options.beforePushCommands !== undefined
      ? {
          beforePush: {
            required: true,
            commands: options.beforePushCommands
          }
        }
      : {})
  }
});

const writePolicy = async (
  cwd: string,
  options: {
    beforeCommitCommands?: string[];
    beforePushCommands?: string[];
  } = {}
): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");
  const lines = ["version: 0.1", "validation:"];

  if (options.beforeCommitCommands !== undefined) {
    lines.push(
      "  beforeCommit:",
      "    required: true",
      "    commands:",
      ...options.beforeCommitCommands.map(
        (command) => `      - ${JSON.stringify(command)}`
      )
    );
  }

  if (options.beforePushCommands !== undefined) {
    lines.push(
      "  beforePush:",
      "    required: true",
      "    commands:",
      ...options.beforePushCommands.map(
        (command) => `      - ${JSON.stringify(command)}`
      )
    );
  }

  lines.push(
    "rules:",
    "  - id: require-validation-before-commit",
    "    decision: DEFER",
    "    when:",
    "      validation_required: true",
    "      validation_scope:",
    "        - before_commit",
    "      validation_status:",
    "        - not_run",
    "        - stale",
    "    reason: Required validation has not passed before commit.",
    "  - id: require-validation-before-push",
    "    decision: DEFER",
    "    when:",
    "      validation_required: true",
    "      validation_scope:",
    "        - before_push",
    "      validation_status:",
    "        - not_run",
    "        - stale",
    "    reason: Required validation has not passed before push.",
    "  - id: block-failed-validation-before-commit",
    "    decision: BLOCK",
    "    when:",
    "      validation_required: true",
    "      validation_scope:",
    "        - before_commit",
    "      validation_status:",
    "        - failed",
    "    reason: Required validation failed before commit.",
    "  - id: block-failed-validation-before-push",
    "    decision: BLOCK",
    "    when:",
    "      validation_required: true",
    "      validation_scope:",
    "        - before_push",
    "      validation_status:",
    "        - failed",
    "    reason: Required validation failed before push.",
    "  - id: block-protected-branch-push",
    "    decision: BLOCK",
    "    when:",
    "      direct_mainline_push: true",
    "    reason: Direct push to a protected branch is prohibited.",
    "  - id: escalate-direct-mainline-commit",
    "    decision: ESCALATE",
    "    when:",
    "      direct_mainline_commit: true",
    "    reason: Direct commit on a protected branch requires human approval."
  );

  await writeFile(policyPath, lines.join("\n"), "utf8");

  return policyPath;
};

const action = (command: string, cwd: string): CodingActionGateAction => ({
  id: `act_${command.replace(/[^a-z0-9]+/gi, "_")}`,
  type: "run_command",
  timestamp: "2026-05-02T00:00:00.000Z",
  proposedBy: "agent",
  command,
  cwd
});

const readAction = (cwd: string): CodingActionGateAction => ({
  id: "read",
  type: "read_file",
  timestamp: "2026-05-02T00:00:00.000Z",
  proposedBy: "agent",
  targetPath: "README.md",
  raw: { cwd }
});

const computeSignals = async (
  command: string,
  cwd: string,
  policy: CodingActionGatePolicy,
  providedSignals = {},
  sessionId = "s1"
) => {
  const normalized = normalizeAction(action(command, cwd), { cwd });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  const result = await computeSafetySignals({
    action: normalized.action,
    policy,
    providedSignals,
    context: {
      cwd,
      session: { sessionId }
    }
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
};

const recordValidation = async (
  cwd: string,
  input: {
    command: string;
    status: "passed" | "failed";
    completedAt?: string;
    sessionId?: string;
  }
) => {
  const store = createValidationResultStore({
    cwd,
    sessionId: input.sessionId ?? "s1"
  });
  const result = await store.recordValidationResult({
    kind: "other",
    command: input.command,
    status: input.status,
    exitCode: input.status === "passed" ? 0 : 1,
    ...(input.completedAt !== undefined
      ? {
          startedAt: input.completedAt,
          completedAt: input.completedAt
        }
      : {}),
    source: "test"
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }
};

const expectExecDecision = async (
  command: string,
  cwd: string,
  policy: string | undefined,
  sessionId = "s1"
) => {
  const result = await runExecCommand({
    command,
    cwd,
    sessionId,
    noAudit: true,
    ...(policy !== undefined ? { policy } : {})
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.output.decision;
};

describe("validation gate detector", () => {
  it("does not apply to read_file", async () => {
    const cwd = await createTempDir();
    const normalized = normalizeAction(readAction(cwd), { cwd });

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    const result = await computeSafetySignals({
      action: normalized.action,
      policy: policyWithValidation({
        beforeCommitCommands: [validationCommand]
      }),
      context: { cwd, session: { sessionId: "s1" } }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.computedSignals.validationRequired).toBeUndefined();
    }
  });

  it("sees beforeCommit policy required true", async () => {
    const cwd = await createRepo();
    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] })
    );

    expect(result.signals).toMatchObject({
      validationRequired: true,
      validationScope: "before_commit",
      requiredValidationCommands: [validationCommand]
    });
  });

  it("returns not_run when required command has no record", async () => {
    const cwd = await createRepo();
    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] })
    );

    expect(result.signals.validationStatus).toBe("not_run");
  });

  it("returns passed when all required commands passed", async () => {
    const cwd = await createRepo();

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed"
    });

    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] })
    );

    expect(result.signals).toMatchObject({
      validationStatus: "passed",
      latestValidationCommand: validationCommand,
      latestValidationKind: "other",
      latestValidationExitCode: 0
    });
  });

  it("returns failed when any required command failed", async () => {
    const cwd = await createRepo();

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed"
    });
    await recordValidation(cwd, {
      command: failingValidationCommand,
      status: "failed"
    });

    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({
        beforeCommitCommands: [validationCommand, failingValidationCommand]
      })
    );

    expect(result.signals.validationStatus).toBe("failed");
  });

  it("returns stale when required result is older than max age", async () => {
    const cwd = await createRepo();

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed",
      completedAt: "2020-01-01T00:00:00.000Z"
    });

    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] })
    );

    expect(result.signals.validationStatus).toBe("stale");
  });

  it("requires all configured commands to pass", async () => {
    const cwd = await createRepo();

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed"
    });

    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({
        beforeCommitCommands: [
          validationCommand,
          "node -e \"console.log('lint')\""
        ]
      })
    );

    expect(result.signals.validationStatus).toBe("not_run");
  });

  it("uses exact command matching", async () => {
    const cwd = await createRepo();

    await recordValidation(cwd, {
      command: `${validationCommand} `,
      status: "passed"
    });

    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] })
    );

    expect(result.signals.validationStatus).toBe("not_run");
  });

  it("uses beforePush commands for git push", async () => {
    const cwd = await createRepo();
    const result = await computeSignals(
      "git push origin feature/test",
      cwd,
      policyWithValidation({ beforePushCommands: [validationCommand] })
    );

    expect(result.signals).toMatchObject({
      validationRequired: true,
      validationScope: "before_push",
      requiredValidationCommands: [validationCommand],
      validationStatus: "not_run"
    });
  });

  it("returns validationRequired false when policy is missing", async () => {
    const cwd = await createRepo();
    const result = await computeSignals("git commit -m test", cwd, {
      ...defaultPolicy,
      validation: undefined
    });

    expect(result.signals).toMatchObject({
      validationRequired: false,
      validationScope: "before_commit",
      requiredValidationCommands: []
    });
  });

  it("default policy DEFERs git commit when validation is not_run", async () => {
    const cwd = await createRepo();
    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      undefined
    );

    expect(decision.decision).toBe("DEFER");
    expect(decision.signalSummary.validationStatus).toBe("not_run");
  });

  it("default policy BLOCKs git commit when validation failed", async () => {
    const cwd = await createRepo();
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [failingValidationCommand]
    });

    await recordValidation(cwd, {
      command: failingValidationCommand,
      status: "failed"
    });

    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.reason).toBe("Required validation failed before commit.");
  });

  it("allows validation-passed feature branch commit to proceed", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [validationCommand]
    });

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed"
    });

    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("PROCEED");
    expect(decision.signalSummary.validationStatus).toBe("passed");
  });

  it("git commit on main with validation not_run defers before escalation", async () => {
    const cwd = await createRepo("main");
    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      undefined
    );

    expect(decision.decision).toBe("DEFER");
    expect(decision.signalSummary.validationStatus).toBe("not_run");
    expect(decision.matchedPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "escalate-direct-mainline-commit",
          matched: true
        })
      ])
    );
  });

  it("git commit on main with validation passed escalates", async () => {
    const cwd = await createRepo("main");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [validationCommand]
    });

    await recordValidation(cwd, {
      command: validationCommand,
      status: "passed"
    });

    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.signalSummary.validationStatus).toBe("passed");
  });

  it("git push feature branch with validation not_run defers", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforePushCommands: [validationCommand]
    });
    const decision = await expectExecDecision(
      "git push origin feature/test",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("DEFER");
    expect(decision.signalSummary.validationScope).toBe("before_push");
  });

  it("git push origin main remains BLOCK when validation is not_run", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforePushCommands: [validationCommand]
    });
    const decision = await expectExecDecision(
      "git push origin main",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.directMainlinePush).toBe(true);
    expect(decision.signalSummary.validationStatus).toBe("not_run");
  });

  it("CLI exec git commit before validation returns DEFER", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [validationCommand]
    });
    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath
    );

    expect(decision.decision).toBe("DEFER");
  });

  it("CLI validate records passing result, then CLI exec git commit proceeds", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [validationCommand]
    });
    const validation = await runValidateCommand({
      kindOrCommand: "other",
      command: validationCommand,
      cwd,
      policy: policyPath,
      sessionId: "s1",
      noAudit: true
    });

    expect(validation.ok).toBe(true);

    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath,
      "s1"
    );

    expect(decision.decision).toBe("PROCEED");
    expect(decision.signalSummary.validationStatus).toBe("passed");
  });

  it("CLI validate records failing result, then CLI exec git commit blocks", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [failingValidationCommand]
    });
    const validation = await runValidateCommand({
      kindOrCommand: "other",
      command: failingValidationCommand,
      cwd,
      policy: policyPath,
      sessionId: "s1",
      noAudit: true
    });

    expect(validation.ok).toBe(true);

    const decision = await expectExecDecision(
      "git commit -m test",
      cwd,
      policyPath,
      "s1"
    );

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.validationStatus).toBe("failed");
  });

  it("audit record includes validation-gate detector result", async () => {
    const cwd = await createRepo("feature/test");
    const policyPath = await writePolicy(cwd, {
      beforeCommitCommands: [validationCommand]
    });
    const result = await runExecCommand({
      command: "git commit -m test",
      cwd,
      policy: policyPath,
      sessionId: "s1"
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readFile(result.output.audit.path, "utf8");
      const auditRecord = JSON.parse(records.trim()) as {
        evidence?: { detectorResults?: unknown[] };
      };

      expect(auditRecord.evidence?.detectorResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detectorId: "validation-gate",
            ok: true,
            signals: expect.objectContaining({
              validationRequired: true,
              validationStatus: "not_run"
            })
          })
        ])
      );
    }
  });

  it("provided signals override computed validationStatus", async () => {
    const cwd = await createRepo("feature/test");
    const result = await computeSignals(
      "git commit -m test",
      cwd,
      policyWithValidation({ beforeCommitCommands: [validationCommand] }),
      {
        validationStatus: "failed"
      }
    );

    expect(result.computedSignals.validationStatus).toBe("not_run");
    expect(result.signals.validationStatus).toBe("failed");
  });
});
