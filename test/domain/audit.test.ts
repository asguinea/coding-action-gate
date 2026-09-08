import { describe, expect, it } from "vitest";
import { auditRecordSchema } from "../../src/domain/audit.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

describe("audit records", () => {
  const baseAuditRecord = {
    decisionId: "decision-1",
    timestamp: "2026-04-25T20:00:00.000Z",
    sessionId: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    repoId: "repo-1",
    workspaceId: "workspace-1",
    action: readFileFixture,
    rawAction: readFileFixture.raw,
    normalizedAction: readFileFixture,
    targetPaths: [readFileFixture.targetPath],
    decision: "PROCEED",
    reason: "Read-only action within workspace.",
    signals: {
      pathSensitivity: "low",
      validationStatus: "not_run",
      contextCompletenessScore: 1
    },
    policyTrace: [
      {
        ruleId: "allow-read-workspace",
        matched: true,
        effect: "PROCEED",
        reason: "Read within allowed workspace."
      }
    ],
    evidence: {
      workspaceRoot: "/workspace/stepharbor"
    },
    missingContext: [],
    fetchPlan: [],
    validationStatus: "not_run",
    approvalStatus: "not_required",
    beforeHashes: {
      "src/index.ts": "sha256:placeholder-before"
    }
  };

  it("parses a basic audit record", () => {
    expect(auditRecordSchema.safeParse(baseAuditRecord).success).toBe(true);
  });

  it("rejects invalid decision values", () => {
    const result = auditRecordSchema.safeParse({
      ...baseAuditRecord,
      decision: "ALLOW"
    });

    expect(result.success).toBe(false);
  });
});
