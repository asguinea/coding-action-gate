import { describe, expect, it } from "vitest";

import {
  formatTimestamp,
  formatPolicyTraceEffect,
  getDeferSummary,
  getMatchedPolicyTrace,
  pickKeySignals,
  summarizeAction
} from "../../ui/src/api/decisionFormatters.js";
import type { UiAuditRecord } from "../../ui/src/api/types.js";

const baseRecord = (overrides: Partial<UiAuditRecord> = {}): UiAuditRecord => ({
  decisionId: "dec_test",
  timestamp: "2026-05-03T10:00:00.000Z",
  sessionId: "s1",
  action: {
    id: "act_test",
    type: "edit_file",
    targetPath: "README.md"
  },
  decision: "PROCEED",
  reason: "Allowed.",
  evidence: {
    signalSummary: {
      pathSensitivity: "low",
      commandRiskScore: undefined,
      targetFileFreshness: "fresh",
      landingRisk: "low",
      noisyInternalSignal: "omitted"
    }
  },
  policyTrace: [
    {
      ruleId: "unmatched-rule",
      matched: false
    },
    {
      ruleId: "matched-rule",
      matched: true,
      effect: "PROCEED",
      reason: "Matched."
    }
  ],
  ...overrides
});

describe("decision UI formatters", () => {
  it("summarizeAction handles targetPath", () => {
    const summary = summarizeAction(baseRecord());

    expect(summary).toMatchObject({
      actionType: "edit_file",
      label: "edit_file: README.md",
      targetPaths: ["README.md"]
    });
  });

  it("summarizeAction handles command", () => {
    const summary = summarizeAction(
      baseRecord({
        action: {
          id: "act_command",
          type: "run_command",
          command: "git status"
        }
      })
    );

    expect(summary).toMatchObject({
      actionType: "run_command",
      label: "run_command: git status",
      command: "git status"
    });
  });

  it("pickKeySignals includes important signals and omits noisy or undefined fields", () => {
    const signals = pickKeySignals(baseRecord());

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pathSensitivity",
          value: "low"
        }),
        expect.objectContaining({
          key: "targetFileFreshness",
          value: "fresh"
        }),
        expect.objectContaining({
          key: "landingRisk",
          value: "low"
        })
      ])
    );
    expect(signals.some((signal) => signal.key === "noisyInternalSignal")).toBe(
      false
    );
    expect(signals.some((signal) => signal.key === "commandRiskScore")).toBe(
      false
    );
  });

  it("getMatchedPolicyTrace returns only matched entries", () => {
    const matched = getMatchedPolicyTrace(baseRecord());

    expect(matched).toEqual([
      expect.objectContaining({
        ruleId: "matched-rule",
        effect: "PROCEED"
      })
    ]);
  });

  it("labels pending-after-defer trace entries clearly", () => {
    expect(formatPolicyTraceEffect("PENDING_AFTER_DEFER")).toBe(
      "pending after DEFER"
    );
    expect(formatPolicyTraceEffect("PENDING_RECHECK_AFTER_DEFER")).toBe(
      "pending recheck after DEFER"
    );
  });

  it("DEFER summary includes compact DEFER-specific fields", () => {
    const summary = getDeferSummary(
      baseRecord({
        decision: "DEFER",
        evidence: {
          signalSummary: {
            deferReasonCategory: "validation_not_run",
            expectedNextDecision: "PROCEED",
            reanalysisRequired: true
          }
        },
        missingContext: [
          {
            type: "validation_result",
            required: true
          }
        ],
        fetchPlan: [
          {
            type: "run_validation",
            safe: true
          }
        ]
      })
    );

    expect(summary).toEqual({
      deferReasonCategory: "validation_not_run",
      missingContextCount: 1,
      fetchPlanCount: 1,
      expectedNextDecision: "PROCEED",
      reanalysisRequired: true
    });
  });

  it("helpers handle missing optional fields gracefully", () => {
    const record: UiAuditRecord = {
      decisionId: "dec_minimal",
      timestamp: "not-a-date",
      action: {
        id: "act_minimal",
        type: "run_command"
      },
      decision: "BLOCK",
      reason: "Blocked."
    };

    expect(formatTimestamp(record.timestamp)).toBe("not-a-date");
    expect(summarizeAction(record)).toMatchObject({
      actionType: "run_command",
      label: "run_command"
    });
    expect(pickKeySignals(record)).toEqual([]);
    expect(getMatchedPolicyTrace(record)).toEqual([]);
    expect(getDeferSummary(record)).toBeNull();
  });
});
