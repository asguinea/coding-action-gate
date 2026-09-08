import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import type { NormalizedCodingActionGateAction } from "../../src/actions/actionErrors.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runReadCommand } from "../../src/cli/commands/readCommand.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { createFileObservationStore } from "../../src/observations/fileObservationStore.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";
import { readBeforeWriteDetector } from "../../src/signals/detectors/readBeforeWriteDetector.js";

const tempDirs: string[] = [];
const envSentinel = "RBW_SENTINEL_SHOULD_NOT_LEAK";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-rbw-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const baseAction = (
  type: "edit_file" | "write_file" | "delete_file" | "read_file",
  targetPath: string,
  overrides: Record<string, unknown> = {}
): CodingActionGateAction =>
  ({
    id: `act_${type}`,
    type,
    timestamp: "2026-04-30T10:00:00.000Z",
    proposedBy: "agent",
    targetPath,
    raw: {
      source: "test"
    },
    ...overrides
  }) as CodingActionGateAction;

const commandAction = (): CodingActionGateAction => ({
  id: "act_run",
  type: "run_command",
  timestamp: "2026-04-30T10:00:00.000Z",
  proposedBy: "agent",
  command: "npm test",
  raw: {
    source: "test"
  }
});

const normalize = (
  action: CodingActionGateAction,
  cwd: string
): NormalizedCodingActionGateAction => {
  const result = normalizeAction(action, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const normalizeWithTargets = (
  action: CodingActionGateAction,
  cwd: string,
  targetPaths: string[]
): NormalizedCodingActionGateAction =>
  ({
    ...normalize(action, cwd),
    targetPaths
  }) as unknown as NormalizedCodingActionGateAction;

const computeSignals = (
  action: NormalizedCodingActionGateAction,
  options: {
    cwd: string;
    sessionId?: string;
    observationDir?: string;
    providedSignals?: Parameters<
      typeof computeSafetySignals
    >[0]["providedSignals"];
  }
) =>
  computeSafetySignals({
    action,
    policy: defaultPolicy,
    ...(options.providedSignals !== undefined
      ? { providedSignals: options.providedSignals }
      : {}),
    context: {
      cwd: options.cwd,
      ...(options.observationDir !== undefined
        ? { observationDir: options.observationDir }
        : {}),
      session: {
        sessionId: options.sessionId ?? "s1"
      }
    }
  });

const recordObservation = async (
  cwd: string,
  filePath: string,
  options: {
    sessionId?: string;
    observationDir?: string;
    metadataOnly?: boolean;
  } = {}
) => {
  const store = createFileObservationStore({
    cwd,
    sessionId: options.sessionId ?? "s1",
    ...(options.observationDir !== undefined
      ? { observationDir: options.observationDir }
      : {})
  });
  const result = await store.recordObservation({
    path: filePath,
    source: "test",
    ...(options.metadataOnly !== undefined
      ? { metadataOnly: options.metadataOnly }
      : {})
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.record;
};

const writeAction = async (
  cwd: string,
  action: CodingActionGateAction
): Promise<string> => {
  const actionPath = path.join(cwd, `action-${action.type}.json`);

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

describe("readBeforeWriteDetector", () => {
  it("sets unknown freshness for edit_file with no prior observation", async () => {
    const cwd = await createTempDir();
    const result = await computeSignals(
      normalize(baseAction("edit_file", "src/file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: false,
        targetFileFreshness: "unknown",
        readBeforeWriteReason:
          "Target file has not been observed in this session."
      });
    }
  });

  it("sets fresh freshness for edit_file after a full observation", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "src-file.ts"), "hello", "utf8");
    await recordObservation(cwd, "src-file.ts");

    const result = await computeSignals(
      normalize(baseAction("edit_file", "src-file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: true,
        targetFileFreshness: "fresh",
        fileChangedSinceRead: false
      });
      expect(result.signals.lastReadHash).toBeDefined();
      expect(result.signals.currentFileHash).toBeDefined();
    }
  });

  it("sets stale freshness after file content changes", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "file.ts"), "old", "utf8");
    await recordObservation(cwd, "file.ts");
    await writeFile(path.join(cwd, "file.ts"), "new", "utf8");

    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileFreshness: "stale",
        fileChangedSinceRead: true
      });
    }
  });

  it("sets unknown freshness for write_file with no prior observation", async () => {
    const cwd = await createTempDir();
    const result = await computeSignals(
      normalize(baseAction("write_file", "new-file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.targetFileFreshness).toBe("unknown");
    }
  });

  it("produces read-before-write signals for delete_file with no prior observation", async () => {
    const cwd = await createTempDir();
    const result = await computeSignals(
      normalize(baseAction("delete_file", "old.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: false,
        targetFileFreshness: "unknown"
      });
    }
  });

  it("sets unknown freshness for metadata-only observations", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "file.ts"), "content", "utf8");
    await recordObservation(cwd, "file.ts", { metadataOnly: true });

    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: false,
        targetFileFreshness: "unknown",
        readBeforeWriteReason: "Latest observation is metadata-only."
      });
      expect(result.signals.lastReadHash).toBeUndefined();
    }
  });

  it("sets missing freshness when the file is deleted after observation", async () => {
    const cwd = await createTempDir();
    const filePath = path.join(cwd, "file.ts");

    await writeFile(filePath, "content", "utf8");
    await recordObservation(cwd, "file.ts");
    await rm(filePath);

    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileFreshness: "missing",
        fileChangedSinceRead: true
      });
    }
  });

  it("aggregates multi-target all-fresh mutations as fresh", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "a.ts"), "a", "utf8");
    await writeFile(path.join(cwd, "b.ts"), "b", "utf8");
    await recordObservation(cwd, "a.ts");
    await recordObservation(cwd, "b.ts");

    const result = await computeSignals(
      normalizeWithTargets(baseAction("edit_file", "a.ts"), cwd, [
        "a.ts",
        "b.ts"
      ]),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: true,
        targetFileFreshness: "fresh"
      });
    }
  });

  it("aggregates one stale multi-target mutation as stale", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "a.ts"), "a", "utf8");
    await writeFile(path.join(cwd, "b.ts"), "b", "utf8");
    await recordObservation(cwd, "a.ts");
    await recordObservation(cwd, "b.ts");
    await writeFile(path.join(cwd, "b.ts"), "changed", "utf8");

    const result = await computeSignals(
      normalizeWithTargets(baseAction("edit_file", "a.ts"), cwd, [
        "a.ts",
        "b.ts"
      ]),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.targetFileFreshness).toBe("stale");
    }
  });

  it("aggregates one unknown multi-target mutation as unknown", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "a.ts"), "a", "utf8");
    await writeFile(path.join(cwd, "b.ts"), "b", "utf8");
    await recordObservation(cwd, "a.ts");

    const result = await computeSignals(
      normalizeWithTargets(baseAction("edit_file", "a.ts"), cwd, [
        "a.ts",
        "b.ts"
      ]),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileReadRecently: false,
        targetFileFreshness: "unknown"
      });
    }
  });

  it("does not apply to read_file", async () => {
    const cwd = await createTempDir();
    const result = await readBeforeWriteDetector.compute({
      action: normalize(baseAction("read_file", "file.ts"), cwd),
      policy: defaultPolicy,
      context: { cwd }
    });

    expect(result).toEqual({});
  });

  it("does not apply to run_command", async () => {
    const cwd = await createTempDir();
    const result = await readBeforeWriteDetector.compute({
      action: normalize(commandAction(), cwd),
      policy: defaultPolicy,
      context: { cwd }
    });

    expect(result).toEqual({});
  });

  it("uses session id to isolate observations", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "file.ts"), "content", "utf8");
    await recordObservation(cwd, "file.ts", { sessionId: "s1" });

    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      { cwd, sessionId: "s2" }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.targetFileFreshness).toBe("unknown");
    }
  });

  it("uses a custom observationDir", async () => {
    const cwd = await createTempDir();
    const observationDir = path.join(cwd, "custom-observations");

    await writeFile(path.join(cwd, "file.ts"), "content", "utf8");
    await recordObservation(cwd, "file.ts", { observationDir });

    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      { cwd, observationDir }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals.targetFileFreshness).toBe("fresh");
    }
  });

  it("does not hash or leak secret path contents for freshness", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, ".env"), envSentinel, "utf8");

    const result = await computeSignals(
      normalize(baseAction("edit_file", ".env"), cwd),
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.signals).toMatchObject({
        targetFileFreshness: "unknown",
        targetFileReadRecently: false,
        readBeforeWriteReason:
          "Secret path freshness is not checked automatically."
      });
      expect(result.signals.currentFileHash).toBeUndefined();
      expect(JSON.stringify(result.signals)).not.toContain(envSentinel);
    }
  });

  it("default policy DEFERs edit_file without prior observation", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(
      cwd,
      baseAction("edit_file", "src/hello.ts", {
        diffStats: {
          files: 1,
          addedLines: 1,
          deletedLines: 0
        }
      })
    );
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.signalSummary).toMatchObject({
        targetFileFreshness: "unknown"
      });
      expect(result.output.decision.fetchPlan).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "read_file"
          })
        ])
      );
    }
  });

  it("after coding-action-gate read records observation, decide on safe edit returns PROCEED", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.ts"), "const x = 1;\n", "utf8");

    const readResult = await runReadCommand({
      targetPath: "hello.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(readResult.ok).toBe(true);

    const actionPath = await writeAction(
      cwd,
      baseAction("edit_file", "hello.ts", {
        diffStats: {
          files: 1,
          addedLines: 1,
          deletedLines: 0
        }
      })
    );
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("PROCEED");
      expect(result.output.decision.signalSummary).toMatchObject({
        targetFileFreshness: "fresh"
      });
    }
  });

  it("after external file change, decide on edit_file returns DEFER", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.ts"), "const x = 1;\n", "utf8");
    await runReadCommand({
      targetPath: "hello.ts",
      cwd,
      sessionId: "s1",
      noAudit: true
    });
    await writeFile(path.join(cwd, "hello.ts"), "const x = 2;\n", "utf8");

    const actionPath = await writeAction(
      cwd,
      baseAction("edit_file", "hello.ts", {
        diffStats: {
          files: 1,
          addedLines: 1,
          deletedLines: 0
        }
      })
    );
    const result = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("DEFER");
      expect(result.output.decision.signalSummary).toMatchObject({
        targetFileFreshness: "stale",
        fileChangedSinceRead: true
      });
    }
  });

  it("audit record includes read-before-write detector result", async () => {
    const cwd = await createTempDir();
    const actionPath = await writeAction(
      cwd,
      baseAction("edit_file", "hello.ts", {
        diffStats: {
          files: 1,
          addedLines: 1,
          deletedLines: 0
        }
      })
    );
    const result = await runDecideCommand({
      actionFile: actionPath,
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
                detectorId: "read-before-write",
                ok: true
              })
            ])
          })
        })
      );
    }
  });

  it("provided targetFileFreshness overrides computed signal", async () => {
    const cwd = await createTempDir();
    const result = await computeSignals(
      normalize(baseAction("edit_file", "file.ts"), cwd),
      {
        cwd,
        providedSignals: {
          targetFileFreshness: "fresh"
        }
      }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.computedSignals.targetFileFreshness).toBe("unknown");
      expect(result.signals.targetFileFreshness).toBe("fresh");
    }
  });
});
