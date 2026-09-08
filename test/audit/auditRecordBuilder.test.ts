import { describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import type { StepHarborDecision } from "../../src/decision/decisionErrors.js";
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };

const normalizedEditAction = () => {
  const result = parseAndNormalizeAction(editFileFixture, {
    cwd: process.cwd()
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const decision = (
  posture: StepHarborDecision["decision"]
): StepHarborDecision => ({
  decision: posture,
  reason: `${posture} reason`,
  matchedPolicies: [
    {
      ruleId: "test-rule",
      matched: true,
      effect: posture,
      reason: `${posture} reason`
    }
  ],
  signalSummary: {
    validationStatus: "stale"
  },
  requiredNextSteps: [],
  missingContext: [
    {
      type: "validation",
      reason: "Required validation has not passed.",
      required: true
    }
  ],
  fetchPlan: [
    {
      type: "run_validation",
      safe: true,
      reason: "Run required validation before retrying authorization."
    }
  ]
});

describe("buildAuditRecord", () => {
  it("creates required fields", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("PROCEED")
    });

    expect(record.decisionId).toMatch(/^dec_/);
    expect(record.timestamp).toEqual(expect.any(String));
    expect(record.action.type).toBe("edit_file");
    expect(record.decision).toBe("PROCEED");
    expect(record.reason).toBe("PROCEED reason");
    expect(record.recordHash).toEqual(expect.any(String));
  });

  it("includes session metadata", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("PROCEED"),
      session: {
        sessionId: "session-1",
        userId: "user-1",
        agentId: "agent-1",
        repoId: "repo-1",
        workspaceId: "workspace-1"
      }
    });

    expect(record).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      agentId: "agent-1",
      repoId: "repo-1",
      workspaceId: "workspace-1"
    });
  });

  it("sets approvalStatus pending for ESCALATE", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("ESCALATE")
    });

    expect(record.approvalStatus).toBe("pending");
  });

  it.each(["PROCEED", "DEFER", "BLOCK"] as const)(
    "sets approvalStatus not_required for %s",
    (posture) => {
      const record = buildAuditRecord({
        action: normalizedEditAction(),
        decision: decision(posture)
      });

      expect(record.approvalStatus).toBe("not_required");
    }
  );

  it("includes validationStatus from signals", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("DEFER"),
      signals: {
        validationStatus: "stale"
      }
    });

    expect(record.validationStatus).toBe("stale");
  });

  it("extracts targetPaths from file actions", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("PROCEED")
    });

    expect(record.targetPaths).toEqual(["src/domain/actions.ts"]);
  });

  it("includes policyTrace from decision", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("BLOCK")
    });

    expect(record.policyTrace).toEqual([
      {
        ruleId: "test-rule",
        matched: true,
        effect: "BLOCK",
        reason: "BLOCK reason"
      }
    ]);
  });

  it("includes missingContext and fetchPlan from decision", () => {
    const record = buildAuditRecord({
      action: normalizedEditAction(),
      decision: decision("DEFER")
    });

    expect(record.missingContext).toEqual([
      {
        type: "validation",
        reason: "Required validation has not passed.",
        required: true
      }
    ]);
    expect(record.fetchPlan).toEqual([
      {
        type: "run_validation",
        safe: true,
        reason: "Run required validation before retrying authorization."
      }
    ]);
  });

  it("includes rawAction and normalizedAction when available", () => {
    const action = normalizedEditAction();
    const record = buildAuditRecord({
      action,
      decision: decision("PROCEED")
    });

    expect(record.rawAction).toEqual(action.raw);
    expect(record.normalizedAction).toEqual(action);
  });
});
