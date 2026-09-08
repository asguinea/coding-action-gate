import { describe, expect, it } from "vitest";
import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import type { StepHarborDecision } from "../../src/decision/decisionErrors.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import type { StepHarborSignals } from "../../src/domain/signals.js";

const fakeToken = "sk-abcdefghijklmnopqrstuvwxyz123456";

const decision: StepHarborDecision = {
  decision: "BLOCK",
  reason: "Proposed mutation appears to contain secret material.",
  matchedPolicies: [
    {
      ruleId: "block-secret-content-in-mutation",
      matched: true,
      effect: "BLOCK",
      reason: "Proposed mutation appears to contain secret material."
    }
  ],
  signalSummary: {
    secretTouch: "confirmed"
  },
  requiredNextSteps: []
};

const signals: StepHarborSignals = {
  secretTouch: "confirmed",
  secretPatternMatch: true,
  matchedSecretPatterns: ["openai_api_key"]
};

const action: StepHarborAction = {
  id: "action-redaction",
  type: "write_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath: "README.md",
  content: `token=${fakeToken}`,
  raw: {
    prompt: `write ${fakeToken}`
  }
};

describe("audit redaction", () => {
  it("redacts action content containing tokens", () => {
    const record = buildAuditRecord({
      action,
      decision,
      signals
    });

    expect(JSON.stringify(record.action)).not.toContain(fakeToken);
    expect(JSON.stringify(record.action)).toContain("[REDACTED]");
  });

  it("redacts rawAction containing tokens", () => {
    const record = buildAuditRecord({
      action,
      rawAction: {
        prompt: `write ${fakeToken}`
      },
      decision,
      signals
    });

    expect(JSON.stringify(record.rawAction)).not.toContain(fakeToken);
    expect(JSON.stringify(record.rawAction)).toContain("[REDACTED]");
  });

  it("preserves core audit metadata", () => {
    const record = buildAuditRecord({
      action,
      decision,
      signals
    });

    expect(record.action.type).toBe("write_file");
    expect(record.decision).toBe("BLOCK");
    expect(record.policyTrace).toEqual(decision.matchedPolicies);
    expect(record.signals).toMatchObject({
      secretTouch: "confirmed",
      matchedSecretPatterns: ["openai_api_key"]
    });
  });

  it("includes redaction metadata in evidence", () => {
    const record = buildAuditRecord({
      action,
      rawAction: {
        prompt: `write ${fakeToken}`
      },
      decision,
      signals,
      evidence: {
        detectorResults: [
          {
            detectorId: "secret-detector",
            ok: true,
            signals: {
              secretTouch: "confirmed"
            }
          }
        ]
      }
    });

    expect(record.evidence).toEqual(
      expect.objectContaining({
        redaction: expect.objectContaining({
          applied: true,
          redactionCount: expect.any(Number),
          matchedPatterns: expect.arrayContaining(["openai_api_key"])
        })
      })
    );
  });
});
