import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { runGitCommand } from "../../src/git/gitExec.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { createValidationResultStore } from "../../src/validation/validationResultStore.js";

const tempDirs: string[] = [];
const landingGateIntegrationTimeoutMs = 30_000;
const defaultCommitCommands = ["npm test", "npm run lint", "npm run typecheck"];

vi.setConfig({
  testTimeout: landingGateIntegrationTimeoutMs,
  hookTimeout: landingGateIntegrationTimeoutMs
});

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-landing-")
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

const createRepo = async (branch = "feature/landing"): Promise<string> => {
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

const commandAction = (
  command: string,
  cwd: string
): CodingActionGateAction => ({
  id: `act_${command.replace(/[^a-z0-9]+/gi, "_")}`,
  type: "run_command",
  timestamp: "2026-05-02T00:00:00.000Z",
  proposedBy: "agent",
  command,
  cwd
});

const computeSignals = async (
  command: string,
  cwd: string,
  providedSignals = {}
) => {
  const normalized = normalizeAction(commandAction(command, cwd), { cwd });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  const result = await computeSafetySignals({
    action: normalized.action,
    policy: defaultPolicy,
    providedSignals,
    context: {
      cwd,
      session: { sessionId: "s1" }
    }
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
};

const recordCommitValidation = async (cwd: string): Promise<void> => {
  const store = createValidationResultStore({ cwd, sessionId: "s1" });

  for (const command of defaultCommitCommands) {
    const result = await store.recordValidationResult({
      kind: "other",
      command,
      status: "passed",
      exitCode: 0,
      source: "test"
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
};

const execDecision = async (command: string, cwd: string) => {
  const result = await runExecCommand({
    command,
    cwd,
    sessionId: "s1",
    noAudit: true
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.output.decision;
};

describe("landing gate detector", () => {
  it("default policy blocks critical landing action", async () => {
    const cwd = await createRepo();
    const decision = await execDecision("vercel deploy --prod", cwd);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.landingRisk).toBe("critical");
  });

  it("default policy escalates high-risk landing action", async () => {
    const cwd = await createRepo();
    const decision = await execDecision("vercel deploy", cwd);

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.signalSummary.landingRisk).toBe("high");
  });

  it("git commit on feature branch with validation not_run defers", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("git commit -m test", cwd);

    expect(decision.decision).toBe("DEFER");
    expect(decision.signalSummary.validationStatus).toBe("not_run");
  });

  it("git commit on feature branch with validation passed proceeds", async () => {
    const cwd = await createRepo("feature/landing");

    await recordCommitValidation(cwd);

    const decision = await execDecision("git commit -m test", cwd);

    expect(decision.decision).toBe("PROCEED");
    expect(decision.signalSummary.validationStatus).toBe("passed");
    expect(decision.signalSummary.landingRisk).toBe("medium");
  });

  it("git commit on main with validation not_run defers before escalation", async () => {
    const cwd = await createRepo("main");
    const decision = await execDecision("git commit -m test", cwd);

    expect(decision.decision).toBe("DEFER");
    expect(decision.signalSummary.validationStatus).toBe("not_run");
    expect(decision.signalSummary.landingRisk).toBe("high");
  });

  it("git commit on main with validation passed escalates", async () => {
    const cwd = await createRepo("main");

    await recordCommitValidation(cwd);

    const decision = await execDecision("git commit -m test", cwd);

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.signalSummary.landingRisk).toBe("high");
  });

  it("git push origin main blocks", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("git push origin main", cwd);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.landingRisk).toBe("critical");
  });

  it("git push --force blocks", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("git push --force", cwd);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.forcePush).toBe(true);
  });

  it("vercel deploy escalates", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("vercel deploy", cwd);

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.signalSummary.deploymentRisk).toBe("high");
  });

  it("vercel deploy --prod blocks", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("vercel deploy --prod", cwd);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.environmentClassification).toBe("production");
  });

  it("npm publish escalates", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("npm publish", cwd);

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.signalSummary.landingActionType).toBe("publish");
  });

  it("terraform destroy blocks", async () => {
    const cwd = await createRepo("feature/landing");
    const decision = await execDecision("terraform destroy", cwd);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.signalSummary.landingRisk).toBe("critical");
  });

  it("audit record includes landing-gate detector result", async () => {
    const cwd = await createRepo("feature/landing");
    const result = await runExecCommand({
      command: "vercel deploy",
      cwd
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
            detectorId: "landing-gate",
            ok: true,
            signals: expect.objectContaining({
              landingAction: true,
              landingRisk: "high"
            })
          })
        ])
      );
    }
  });

  it("provided signals override computed landingRisk", async () => {
    const cwd = await createRepo("feature/landing");
    const result = await computeSignals("vercel deploy --prod", cwd, {
      landingRisk: "low"
    });

    expect(result.computedSignals.landingRisk).toBe("critical");
    expect(result.signals.landingRisk).toBe("low");
  });
});
