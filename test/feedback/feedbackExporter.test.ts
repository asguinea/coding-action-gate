import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildFeedbackBundle,
  exportFeedbackBundle
} from "../../src/feedback/feedbackExporter.js";
import { resolveAuditLogPath } from "../../src/audit/auditPaths.js";
import { resolveDeferredActionLogPath } from "../../src/defer/deferredActionPaths.js";
import { resolveObservationLogPath } from "../../src/observations/observationPaths.js";
import { resolveValidationLogPath } from "../../src/validation/validationPaths.js";

const tempDirs: string[] = [];
const fakeToken = "sk-abcdefghijklmnopqrstuvwxyz1234567890";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-feedback-"));
  tempDirs.push(tempDir);
  return tempDir;
};

const now = "2026-05-06T12:00:00.000Z";

const writeJsonl = async (
  filePath: string,
  records: unknown[]
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8"
  );
};

const auditRecord = (index: number, decision: string) => ({
  decisionId: `decision-${index}`,
  timestamp: now,
  sessionId: "default",
  action: {
    id: `action-${index}`,
    timestamp: now,
    proposedBy: "agent",
    type: index === 1 ? "run_command" : "edit_file",
    ...(index === 1
      ? { command: `echo ${fakeToken}` }
      : {
          targetPath: index === 2 ? ".env" : "src/service.ts",
          diff: `raw diff ${fakeToken}`,
          diffStats: {
            files: 1,
            addedLines: 1,
            deletedLines: 0
          }
        })
  },
  rawAction: {
    content: `raw ${fakeToken}`
  },
  normalizedAction: {
    content: "source code"
  },
  targetPaths:
    index === 1 ? undefined : [index === 2 ? ".env" : "src/service.ts"],
  decision,
  reason: `${decision} reason`,
  signals: {
    commandRiskScore: decision === "BLOCK" ? "critical" : "low",
    pathSensitivity: index === 2 ? "critical" : "low",
    validationStatus: "not_run",
    latestValidationCommand: `node -e "console.log('${fakeToken}')"`
  },
  policyTrace: [
    {
      ruleId: `rule-${decision.toLowerCase()}`,
      matched: true,
      effect: decision,
      reason: `${decision} policy`
    }
  ],
  evidence: {
    deferReasonCategory: "target_file_not_read",
    detectorResults: [
      {
        detectorId: "validation-gate"
      },
      {
        id: "git-workflow"
      }
    ]
  }
});

const deferredRecord = () => ({
  id: "defer-1",
  decisionId: "decision-2",
  sessionId: "default",
  createdAt: now,
  updatedAt: now,
  status: "pending",
  actionFingerprint: "fingerprint",
  actionSummary: {
    actionType: "edit_file",
    targetPaths: ["src/service.ts"],
    command: `echo ${fakeToken}`
  },
  originalAction: {
    content: `secret ${fakeToken}`
  },
  decision: {
    decision: "DEFER",
    reason: "Need context.",
    matchedPolicies: [],
    signalSummary: {},
    missingContext: [
      {
        type: "current_file_contents",
        target: "src/service.ts",
        required: true
      }
    ],
    fetchPlan: [
      {
        type: "read_file",
        target: "src/service.ts",
        safe: true
      }
    ]
  },
  missingContext: [
    {
      type: "current_file_contents",
      target: "src/service.ts",
      required: true
    }
  ],
  fetchPlan: [
    {
      type: "read_file",
      target: "src/service.ts",
      safe: true
    }
  ],
  requiredEvidence: [
    {
      id: "evidence-1",
      type: "file_observation",
      target: "src/service.ts",
      required: true,
      satisfied: false
    }
  ],
  satisfiedEvidence: []
});

const validationRecord = () => ({
  id: "validation-1",
  sessionId: "default",
  cwd: "/tmp/project",
  kind: "test",
  command: `node -e "console.log('${fakeToken}')"`,
  status: "passed",
  exitCode: 0,
  startedAt: now,
  completedAt: now,
  durationMs: 12,
  outputSummary: `output ${fakeToken}`,
  outputHash: "abc123",
  policyVersion: "0.1",
  source: "cli_validate"
});

const observationRecord = () => ({
  id: "obs-1",
  sessionId: "default",
  path: "src/service.ts",
  absolutePath: "/tmp/project/src/service.ts",
  relativePath: "src/service.ts",
  observedAt: now,
  contentHash: "content-hash",
  hashAlgorithm: "sha256",
  sizeBytes: 10,
  exists: true,
  source: "cli_read",
  metadataOnly: false
});

const writeRuntimeData = async (cwd: string): Promise<void> => {
  await writeJsonl(resolveAuditLogPath({ cwd }), [
    auditRecord(1, "PROCEED"),
    auditRecord(2, "DEFER"),
    auditRecord(3, "BLOCK")
  ]);
  await writeJsonl(resolveDeferredActionLogPath({ cwd }), [deferredRecord()]);
  await writeJsonl(resolveValidationLogPath({ cwd }), [validationRecord()]);
  await writeJsonl(resolveObservationLogPath({ cwd }), [observationRecord()]);
  await writeFile(
    path.join(cwd, "stepharbor.policy.yml"),
    "version: 0.1\nprotected_branches:\n  - main\n",
    "utf8"
  );
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("feedback exporter", () => {
  it("creates a sanitized JSON file", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);
    const out = path.join(await createTempDir(), "feedback.json");

    const result = await exportFeedbackBundle({ cwd, out });
    const content = await readFile(result.path, "utf8");
    const parsed = JSON.parse(content) as { redacted: boolean };

    expect(parsed.redacted).toBe(true);
    expect(result.summary).toEqual({
      auditRecords: 3,
      deferredActions: 1,
      validationRecords: 1
    });
  });

  it("fails if the output file already exists", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);
    const out = path.join(await createTempDir(), "feedback.json");
    await writeFile(out, "exists", "utf8");

    await expect(exportFeedbackBundle({ cwd, out })).rejects.toThrow(
      "Feedback output already exists"
    );
  });

  it("includes doctor, policy, decisions, validation, deferred, and git summaries", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);

    const bundle = await buildFeedbackBundle({ cwd });

    expect(bundle.environment).toMatchObject({
      nodeVersion: expect.any(String),
      platform: expect.any(String),
      stepharborVersion: expect.any(String)
    });
    expect(
      bundle.doctor.summary.pass + bundle.doctor.summary.warn
    ).toBeGreaterThan(0);
    expect(bundle.policy?.summary.protectedBranchCount).toBe(1);
    expect(bundle.decisions.counts).toMatchObject({
      PROCEED: 1,
      DEFER: 1,
      BLOCK: 1
    });
    expect(bundle.decisions.records[0]?.policyRuleIds).toContain(
      "rule-proceed"
    );
    expect(bundle.decisions.records[0]?.detectorIds).toContain(
      "validation-gate"
    );
    expect(bundle.deferred.records[0]?.requiredEvidenceTypes).toContain(
      "file_observation"
    );
    expect(bundle.validation.records[0]).toMatchObject({
      kind: "test",
      status: "passed",
      outputHash: "abc123"
    });
    expect(bundle.git).toHaveProperty("isGitRepo");
  });

  it("does not contain raw content, raw actions, original actions, or fake tokens", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);

    const bundle = await buildFeedbackBundle({ cwd });
    const serialized = JSON.stringify(bundle);

    expect(serialized).not.toContain(fakeToken);
    expect(serialized).not.toContain(cwd);
    expect(serialized).not.toContain("/tmp/project");
    expect(serialized).not.toContain("rm -rf");
    expect(serialized).not.toContain(`echo ${fakeToken}`);
    expect(serialized).not.toContain("node -e");
    expect(serialized).not.toContain("rawAction");
    expect(serialized).not.toContain("normalizedAction");
    expect(serialized).not.toContain("originalAction");
    expect(serialized).not.toContain("raw diff");
    expect(serialized).not.toContain("source code");
    expect(serialized).not.toContain("outputSummary");
  });

  it("respects the audit record limit", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);

    const bundle = await buildFeedbackBundle({ cwd, limit: 2 });

    expect(bundle.decisions.records).toHaveLength(2);
  });

  it("writes only the requested output file outside cwd", async () => {
    const cwd = await createTempDir();
    await writeRuntimeData(cwd);
    const before = await readdir(cwd);
    const outDir = await createTempDir();
    const out = path.join(outDir, "feedback.json");

    await exportFeedbackBundle({ cwd, out });

    const after = await readdir(cwd);
    expect(after).toEqual(before);
    await expect(stat(out)).resolves.toBeTruthy();
  });
});
