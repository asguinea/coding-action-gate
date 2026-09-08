import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { cliExitCodes, exitCodeForDecision } from "../../src/cli/exitCodes.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import deleteFileFixture from "../../src/fixtures/actions/delete-file.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import type { SafetySignalDetector } from "../../src/signals/detectors/index.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-signals-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const normalizeFixture = (fixture: unknown) => {
  const result = parseAndNormalizeAction(fixture, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const writeAction = async (cwd: string, fixture: unknown): Promise<string> => {
  const actionPath = path.join(cwd, "action.json");

  await writeFile(actionPath, JSON.stringify(fixture), "utf8");

  return actionPath;
};

const writePolicy = async (cwd: string, yaml: string): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");

  await writeFile(policyPath, yaml, "utf8");

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

describe("computeSafetySignals", () => {
  it("returns ok true for a normalized action", async () => {
    const result = await computeSafetySignals({
      action: normalizeFixture(readFileFixture),
      policy: {
        version: "test"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        destructiveOperation: false
      });
    }
  });

  it("includes detectorResults", async () => {
    const result = await computeSafetySignals({
      action: normalizeFixture(readFileFixture),
      policy: {
        version: "test"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.detectorResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detectorId: "action-metadata",
            ok: true
          }),
          expect.objectContaining({
            detectorId: "workspace-boundary",
            ok: true
          })
        ])
      );
    }
  });

  it("returns detector errors when a detector fails", async () => {
    const detector: SafetySignalDetector = {
      id: "failing-detector",
      compute: () => {
        throw new Error("failed");
      }
    };
    const result = await computeSafetySignals(
      {
        action: normalizeFixture(readFileFixture),
        policy: {
          version: "test"
        }
      },
      {
        detectors: [detector]
      }
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SIGNAL_DETECTOR_ERROR",
        detectorId: "failing-detector"
      }
    });
  });
});

describe("signal integration", () => {
  it("decide uses merged computed signals through CLI decide", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, deleteFileFixture);
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: block-delete-signal",
        "    decision: BLOCK",
        "    when:",
        "      destructive_operation: true",
        "    reason: Computed destructive operation is blocked."
      ].join("\n")
    );
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      policy: policyPath,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(exitCodeForDecision(result.output.decision.decision)).toBe(
        cliExitCodes.block
      );
    }
  });

  it("CLI decide writes audit record containing merged signals", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(cwd, deleteFileFixture);
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toMatchObject({
        signals: {
          destructiveOperation: true,
          destructiveSubtype: "delete_file",
          mutatesFilesystem: true
        },
        evidence: {
          detectorResults: expect.arrayContaining([
            expect.objectContaining({
              detectorId: "action-metadata",
              ok: true
            })
          ])
        }
      });
    }
  });

  it("CLI exec writes audit record containing merged signals", async () => {
    const cwd = await createTempDir();
    const result = await runExecCommand({
      command: "npm test",
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readJsonl(result.output.audit.path);

      expect(records[0]).toMatchObject({
        signals: {
          destructiveOperation: false,
          delegationProvenance: "partial"
        },
        evidence: {
          detectorResults: expect.arrayContaining([
            expect.objectContaining({
              detectorId: "action-metadata",
              ok: true
            })
          ])
        }
      });
    }
  });
});
