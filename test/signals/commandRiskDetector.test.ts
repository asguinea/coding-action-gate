import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { cliExitCodes, exitCodeForDecision } from "../../src/cli/exitCodes.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { commandRiskDetector } from "../../src/signals/detectors/commandRiskDetector.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-cmd-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const commandAction = (command: string): CodingActionGateAction => ({
  id: `action-${command.replace(/\W+/g, "-")}`,
  type: "run_command",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  command,
  raw: {
    command
  }
});

const normalizeCommand = (command: string) => {
  const normalized = normalizeAction(commandAction(command), {
    cwd: process.cwd()
  });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  return normalized.action;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

describe("commandRiskDetector", () => {
  it("only applies to command-like actions", () => {
    const normalized = normalizeAction(
      readFileFixture as unknown as CodingActionGateAction
    );

    expect(normalized.ok).toBe(true);

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    expect(
      commandRiskDetector.compute({
        action: normalized.action,
        policy: defaultPolicy
      })
    ).toEqual({});
  });

  it("default policy blocks critical command", async () => {
    const result = await runExecCommand({
      command: "rm -rf .",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        commandRiskScore: "critical"
      });
    }
  });

  it("default policy escalates high-risk command", async () => {
    const result = await runExecCommand({
      command: "sudo npm install -g foo",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("ESCALATE");
      expect(result.output.decision.signalSummary).toMatchObject({
        commandRiskScore: "high",
        usesSudo: true
      });
    }
  });

  it("default policy blocks force push", async () => {
    const result = await runExecCommand({
      command: "git push --force",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        forcePush: true
      });
    }
  });

  it("default policy blocks hook bypass", async () => {
    const result = await runExecCommand({
      command: "git commit --no-verify -m test",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.decision.signalSummary).toMatchObject({
        hookBypass: true
      });
    }
  });

  it("CLI exec rm -rf returns BLOCK and does not execute", async () => {
    const cwd = await createTempDir();
    const target = path.join(cwd, "should-not-exist.txt");
    const result = await runExecCommand({
      command: "rm -rf .",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(exitCodeForDecision(result.output.decision.decision)).toBe(
        cliExitCodes.block
      );
      expect(result.output.dryRun).toBe(true);
      expect(result.output.executed).toBe(false);
    }

    expect(await exists(target)).toBe(false);
  });

  it("CLI exec git status returns PROCEED", async () => {
    const cwd = await createTempDir();
    execFileSync("git", ["init", "-b", "test-work"], { cwd, stdio: "ignore" });
    const result = await runExecCommand({
      command: "git status",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("PROCEED");
      expect(result.output.decision.signalSummary).toMatchObject({
        commandRiskScore: "low"
      });
    }
  });

  it("CLI exec sudo npm install returns ESCALATE", async () => {
    const result = await runExecCommand({
      command: "sudo npm install -g foo",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("ESCALATE");
    }
  });

  it("audit record includes command-risk detector result", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "git status",
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
                detectorId: "command-risk",
                ok: true
              })
            ])
          })
        })
      );
    }
  });

  it("provided signals override computed commandRiskScore", async () => {
    const result = await computeSafetySignals({
      action: normalizeCommand("rm -rf ."),
      policy: defaultPolicy,
      providedSignals: {
        commandRiskScore: "low"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.commandRiskScore).toBe("low");
      expect(result.computedSignals.commandRiskScore).toBe("critical");
    }
  });
});
