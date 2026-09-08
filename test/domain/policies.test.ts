import { describe, expect, it } from "vitest";
import { codingActionGatePolicySchema } from "../../src/domain/policies.js";

describe("CodingActionGate policies", () => {
  it("parses a basic policy object", () => {
    const result = codingActionGatePolicySchema.safeParse({
      version: "1",
      workspace: {
        allowedRoots: ["."],
        forbiddenMutationOutsideWorkspace: true
      },
      protectedBranches: ["main"],
      sensitivePaths: {
        critical: [".env", "secrets/**"],
        high: ["src/auth/**"],
        medium: ["package.json"]
      },
      validation: {
        beforeCommit: {
          required: true,
          commands: ["npm test"],
          allowStaleResults: false,
          maxAgeMinutes: 15
        }
      },
      thresholds: {
        largeDiffFiles: 10,
        largeDiffLines: 500,
        contextCompletenessMinimum: 0.5,
        sensitiveContextCompletenessMinimum: 0.8,
        maxRetriesSameGoal: 3,
        maxSessionMinutesWithoutProgress: 30
      },
      rules: [
        {
          id: "block-critical-delete",
          decision: "BLOCK",
          when: {
            actionType: "delete_file",
            pathSensitivity: "critical"
          },
          reason: "Critical paths cannot be deleted automatically."
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects a policy rule with an invalid decision", () => {
    const result = codingActionGatePolicySchema.safeParse({
      version: "1",
      rules: [
        {
          id: "invalid-rule",
          decision: "ALLOW",
          when: {}
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
