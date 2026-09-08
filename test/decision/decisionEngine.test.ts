import { describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { decide } from "../../src/decision/decisionEngine.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import type {
  StepHarborPolicy,
  PolicyRule
} from "../../src/domain/policies.js";
import editFileFixture from "../../src/fixtures/actions/edit-file.json" with { type: "json" };
import gitCommandFixture from "../../src/fixtures/actions/git-command.json" with { type: "json" };
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const normalizeFixture = (fixture: unknown) => {
  const result = parseAndNormalizeAction(fixture, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const policyWithRules = (rules: PolicyRule[]): StepHarborPolicy => ({
  version: "test",
  rules
});

describe("decide", () => {
  it("returns PROCEED when no rules match", () => {
    const result = decide({
      action: normalizeFixture(readFileFixture),
      policy: policyWithRules([
        {
          id: "write-only",
          decision: "DEFER",
          when: {
            action_type: "write_file"
          }
        }
      ])
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("PROCEED");
      expect(result.decision.reason).toBe(
        "No policy rules required deferral, escalation, or blocking."
      );
      expect(result.decision.requiredNextSteps).toEqual([]);
    }
  });

  it("returns DEFER when read-before-write rule matches", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("DEFER");
      expect(result.decision.reason).toBe(
        "Target file changed since the last observation."
      );
    }
  });

  it("returns ESCALATE when sensitive change rule matches", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: defaultPolicy,
      signals: {
        pathSensitivity: "high",
        targetFileFreshness: "fresh"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("ESCALATE");
      expect(result.decision.reason).toBe(
        "Sensitive path changes require human review."
      );
    }
  });

  it("returns BLOCK when block-workspace-escape rule matches", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: defaultPolicy,
      signals: {
        workspaceBoundaryViolation: true
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
      expect(result.decision.reason).toBe(
        "Mutation escapes allowed workspace roots."
      );
    }
  });

  it("BLOCK overrides ESCALATE and DEFER", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: policyWithRules([
        {
          id: "defer",
          decision: "DEFER",
          when: {
            action_type: "edit_file"
          },
          reason: "Need context."
        },
        {
          id: "escalate",
          decision: "ESCALATE",
          when: {
            action_type: "edit_file"
          },
          reason: "Need approval."
        },
        {
          id: "block",
          decision: "BLOCK",
          when: {
            action_type: "edit_file"
          },
          reason: "Do not mutate."
        }
      ])
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
      expect(result.decision.reason).toBe("Do not mutate.");
    }
  });

  it("ESCALATE overrides non-reducible DEFER", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: policyWithRules([
        {
          id: "defer",
          decision: "DEFER",
          when: {
            action_type: "edit_file"
          },
          reason: "Need context."
        },
        {
          id: "escalate",
          decision: "ESCALATE",
          when: {
            action_type: "edit_file"
          },
          reason: "Need approval."
        }
      ])
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("ESCALATE");
      expect(result.decision.reason).toBe("Need approval.");
    }
  });

  it("uses the highest-severity matched rule reason", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: policyWithRules([
        {
          id: "defer",
          decision: "DEFER",
          when: {
            action_type: "edit_file"
          },
          reason: "Lower severity reason."
        },
        {
          id: "block-without-reason",
          decision: "BLOCK",
          when: {
            action_type: "edit_file"
          }
        }
      ])
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.reason).toBe(
        "Policy rule block-without-reason matched."
      );
    }
  });

  it("signal summary includes provided signals and action metadata", () => {
    const result = decide({
      action: normalizeFixture(gitCommandFixture),
      policy: policyWithRules([]),
      signals: {
        validationStatus: "passed",
        branchRisk: "low"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.signalSummary).toMatchObject({
        validationStatus: "passed",
        branchRisk: "low",
        action_type: "git_command",
        command: "git status --short",
        command_executable: "git",
        is_git_like_command: true
      });
    }
  });

  it("DEFER from stale target freshness includes missingContext and fetchPlan", () => {
    const result = decide({
      action: normalizeFixture(editFileFixture),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.missingContext).toEqual([
        {
          type: "current_file_contents",
          target: "src/domain/actions.ts",
          reason: "Target file changed since the last observation.",
          required: true
        }
      ]);
      expect(result.decision.fetchPlan).toEqual([
        {
          type: "read_file",
          target: "src/domain/actions.ts",
          safe: true,
          reason: "Refresh the target file and recompute its current hash."
        }
      ]);
    }
  });

  it("DEFER from stale validation includes validation fetchPlan", () => {
    const result = decide({
      action: normalizeFixture(gitCommandFixture),
      policy: defaultPolicy,
      signals: {
        validationRequired: true,
        validationScope: "before_commit",
        validationStatus: "stale"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("DEFER");
      expect(result.decision.missingContext).toEqual([
        {
          type: "validation_result",
          reason: "Validation is stale relative to the current action.",
          required: true
        }
      ]);
      expect(result.decision.fetchPlan).toEqual([
        {
          type: "run_validation",
          safe: true,
          reason: "Run required validation before retrying authorization."
        }
      ]);
    }
  });
});
