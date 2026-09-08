import { describe, expect, it } from "vitest";
import {
  decisionOutputSchema,
  decisionPostureSchema,
  decisionPostures,
  isDecisionPosture
} from "../../src/domain/decisions.js";

describe("decision postures", () => {
  it("accepts all supported decision postures", () => {
    expect(decisionPostures).toEqual(["PROCEED", "DEFER", "ESCALATE", "BLOCK"]);

    for (const posture of decisionPostures) {
      expect(decisionPostureSchema.parse(posture)).toBe(posture);
      expect(isDecisionPosture(posture)).toBe(true);
    }
  });

  it("rejects an invalid decision posture", () => {
    expect(decisionPostureSchema.safeParse("ALLOW").success).toBe(false);
    expect(isDecisionPosture("ALLOW")).toBe(false);
  });

  it("accepts structured DEFER fields", () => {
    const result = decisionOutputSchema.safeParse({
      decision: "DEFER",
      reason: "Target file has not been observed in this session.",
      matchedPolicies: [],
      signalSummary: {},
      deferReasonCategory: "target_file_never_read",
      missingContext: [
        {
          type: "current_file_contents",
          target: "README.md",
          required: true
        }
      ],
      fetchPlan: [
        {
          type: "read_file",
          target: "README.md",
          safe: true
        }
      ],
      riskIfProceeding: ["The agent may edit a file it has not inspected."],
      reanalysisRequired: true,
      expectedNextDecision: "PROCEED"
    });

    expect(result.success).toBe(true);
  });
});
