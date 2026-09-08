import { describe, expect, it } from "vitest";

import {
  buildEscalationRiskSummary,
  formatValidationStatusForEscalation,
  getAffectedResources,
  getEscalationPolicies,
  hasEscalationReview
} from "../../ui/src/api/escalationFormatters.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import type { UiAuditRecord } from "../../ui/src/api/types.js";

const escalationRecord = (
  signals: Record<string, unknown>,
  overrides: Partial<UiAuditRecord> = {}
): UiAuditRecord => ({
  decisionId: "dec_escalate",
  timestamp: "2026-05-03T10:00:00.000Z",
  sessionId: "s1",
  targetPaths: ["auth/service.ts"],
  action: {
    id: "act_escalate",
    type: "run_command",
    command: "git commit -m test"
  },
  decision: "ESCALATE",
  reason: "Human review required.",
  evidence: {
    signalSummary: signals
  },
  policyTrace: [
    {
      ruleId: "matched-escalate",
      matched: true,
      effect: "ESCALATE",
      reason: "Escalate."
    },
    {
      ruleId: "matched-defer",
      matched: true,
      effect: "DEFER",
      reason: "Defer."
    }
  ],
  ...overrides
});

describe("escalation UI formatters", () => {
  it("hasEscalationReview is true for ESCALATE", () => {
    expect(hasEscalationReview(escalationRecord({}))).toBe(true);
  });

  it("hasEscalationReview is false for non-ESCALATE", () => {
    expect(
      hasEscalationReview(
        escalationRecord(
          {},
          {
            decision: "PROCEED"
          }
        )
      )
    ).toBe(false);
  });

  it("getEscalationPolicies returns only ESCALATE matched policies", () => {
    expect(getEscalationPolicies(escalationRecord({}))).toEqual([
      expect.objectContaining({
        ruleId: "matched-escalate",
        effect: "ESCALATE"
      })
    ]);
  });

  it("buildEscalationRiskSummary includes pathSensitivity", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          pathSensitivity: "high"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Sensitive path",
          value: "high",
          severity: "high"
        })
      ])
    );
  });

  it("buildEscalationRiskSummary includes destructiveOperation and severity", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          destructiveOperation: true,
          destructiveSeverity: "critical"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Destructive operation",
          severity: "critical"
        })
      ])
    );
  });

  it("buildEscalationRiskSummary includes commandRiskScore", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          commandRiskScore: "high"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Command risk",
          value: "high"
        })
      ])
    );
  });

  it("buildEscalationRiskSummary includes git and branch risk", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          branchRisk: "high",
          currentBranch: "main",
          directMainlineCommit: true
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Git branch risk",
          detail: "main"
        }),
        expect.objectContaining({
          label: "Direct mainline commit",
          severity: "high"
        })
      ])
    );
  });

  it("buildEscalationRiskSummary includes landing risk", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          landingAction: true,
          landingActionType: "commit",
          landingRisk: "high"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Landing action",
          value: "commit",
          severity: "high"
        })
      ])
    );
  });

  it("buildEscalationRiskSummary includes validation status", () => {
    expect(
      buildEscalationRiskSummary(
        escalationRecord({
          validationStatus: "passed",
          latestValidationCommand: "npm test"
        })
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Validation status",
          value: "passed",
          detail: "npm test"
        })
      ])
    );
  });

  it("getAffectedResources extracts target paths and command", () => {
    expect(getAffectedResources(escalationRecord({}))).toMatchObject({
      targetPaths: ["auth/service.ts"],
      command: "git commit -m test"
    });
  });

  it("getAffectedResources extracts branch and remote target", () => {
    expect(
      getAffectedResources(
        escalationRecord({
          currentBranch: "main",
          remoteTarget: "origin/main"
        })
      )
    ).toMatchObject({
      currentBranch: "main",
      remoteTarget: "origin/main"
    });
  });

  it("formatValidationStatusForEscalation handles missing validation fields", () => {
    expect(formatValidationStatusForEscalation(escalationRecord({}))).toEqual({
      present: false
    });
  });

  it("ESCALATE mock record contains realistic risk and escalation policy", () => {
    const record = mockAuditRecords.find(
      (entry) => entry.decision === "ESCALATE"
    );

    expect(record).toBeDefined();
    expect(record?.targetPaths).toEqual(["auth/service.ts"]);
    expect(record?.policyTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effect: "ESCALATE"
        })
      ])
    );
    expect(buildEscalationRiskSummary(record as UiAuditRecord)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Sensitive path"
        }),
        expect.objectContaining({
          label: "Landing action"
        })
      ])
    );
  });
});
