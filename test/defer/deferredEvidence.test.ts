import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveRequiredEvidence,
  evaluateDeferredEvidence
} from "../../src/defer/deferredEvidence.js";
import type { DeferredActionRecord } from "../../src/defer/deferredActionTypes.js";
import { createFileObservationStore } from "../../src/observations/fileObservationStore.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-defer-ev-")
  );
  tempDirs.push(tempDir);

  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const baseDecision = {
  decision: "DEFER" as const,
  reason: "Target file has not been observed in this session.",
  matchedPolicies: [],
  signalSummary: {},
  missingContext: [
    {
      type: "current_file_contents",
      target: "README.md",
      reason: "Target file has not been observed in this session.",
      required: true
    }
  ],
  fetchPlan: [
    {
      type: "read_file" as const,
      target: "README.md",
      safe: true,
      reason: "Read the current target file before retrying authorization."
    }
  ]
};

const recordWithRequirements = (
  requirements = deriveRequiredEvidence({
    missingContext: baseDecision.missingContext,
    fetchPlan: baseDecision.fetchPlan
  })
): DeferredActionRecord => ({
  id: "def_1",
  sessionId: "s1",
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
  status: "pending",
  actionFingerprint: "fingerprint",
  actionSummary: {
    actionType: "edit_file",
    targetPaths: ["README.md"],
    normalizedRelativeTargetPaths: ["README.md"]
  },
  originalAction: {
    type: "edit_file",
    targetPath: "README.md"
  },
  decision: baseDecision,
  missingContext: baseDecision.missingContext,
  fetchPlan: baseDecision.fetchPlan,
  requiredEvidence: requirements,
  policyTrace: []
});

const recordObservation = async (
  cwd: string,
  options: {
    metadataOnly?: boolean;
  } = {}
) => {
  const store = createFileObservationStore({
    cwd,
    sessionId: "s1"
  });
  const result = await store.recordObservation({
    path: "README.md",
    source: "test",
    ...(options.metadataOnly !== undefined
      ? { metadataOnly: options.metadataOnly }
      : {})
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }
};

describe("deferred evidence", () => {
  it("derives file_observation from current_file_contents", () => {
    expect(
      deriveRequiredEvidence({
        missingContext: [
          {
            type: "current_file_contents",
            target: "README.md",
            required: true
          }
        ],
        fetchPlan: []
      })
    ).toEqual([
      expect.objectContaining({
        type: "file_observation",
        target: "README.md",
        required: true,
        satisfied: false
      })
    ]);
  });

  it("derives validation_result from validation_result", () => {
    expect(
      deriveRequiredEvidence({
        missingContext: [
          {
            type: "validation_result",
            reason: "Required validation has not been run.",
            required: true
          }
        ],
        fetchPlan: []
      })
    ).toEqual([
      expect.objectContaining({
        type: "validation_result",
        required: true,
        satisfied: false
      })
    ]);
  });

  it("derives file_observation from related_tests", () => {
    expect(
      deriveRequiredEvidence({
        missingContext: [
          {
            type: "related_tests",
            target: "src/service.test.ts",
            required: true
          }
        ],
        fetchPlan: []
      })
    ).toEqual([
      expect.objectContaining({
        type: "file_observation",
        target: "src/service.test.ts",
        required: true,
        satisfied: false
      })
    ]);
  });

  it("evaluates false when file observation is missing", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");

    const evaluation = await evaluateDeferredEvidence(
      recordWithRequirements(),
      {
        cwd
      }
    );

    expect(evaluation.allRequiredSatisfied).toBe(false);
    expect(evaluation.satisfactions).toEqual([]);
  });

  it("evaluates true after full fresh observation", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await recordObservation(cwd);

    const evaluation = await evaluateDeferredEvidence(
      recordWithRequirements(),
      {
        cwd
      }
    );

    expect(evaluation.allRequiredSatisfied).toBe(true);
    expect(evaluation.satisfactions).toEqual([
      expect.objectContaining({
        requirementId: recordWithRequirements().requiredEvidence[0]?.id,
        evidenceType: "file_observation",
        evidenceRef: "README.md"
      })
    ]);
  });

  it("metadata-only observation does not satisfy evidence", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await recordObservation(cwd, { metadataOnly: true });

    const evaluation = await evaluateDeferredEvidence(
      recordWithRequirements(),
      {
        cwd
      }
    );

    expect(evaluation.allRequiredSatisfied).toBe(false);
  });

  it("stale observation does not satisfy evidence", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "README.md"), "hello\n", "utf8");
    await recordObservation(cwd);
    await writeFile(path.join(cwd, "README.md"), "changed\n", "utf8");

    const evaluation = await evaluateDeferredEvidence(
      recordWithRequirements(),
      {
        cwd
      }
    );

    expect(evaluation.allRequiredSatisfied).toBe(false);
  });
});
