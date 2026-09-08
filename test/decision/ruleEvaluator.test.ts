import { describe, expect, it } from "vitest";
import {
  buildEvaluationContext,
  evaluateRules,
  ruleConditionMatches
} from "../../src/decision/ruleEvaluator.js";
import type { PolicyRule } from "../../src/domain/policies.js";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const normalizedReadAction = () => {
  const result = parseAndNormalizeAction(readFileFixture, {
    cwd: process.cwd()
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

describe("ruleConditionMatches", () => {
  it("supports array rule matching", () => {
    expect(ruleConditionMatches("edit_file", ["edit_file", "write_file"])).toBe(
      true
    );
    expect(ruleConditionMatches("read_file", ["edit_file", "write_file"])).toBe(
      false
    );
  });

  it("supports scalar boolean matching", () => {
    expect(ruleConditionMatches(true, true)).toBe(true);
    expect(ruleConditionMatches(false, true)).toBe(false);
  });

  it("supports numeric threshold string matching", () => {
    expect(ruleConditionMatches(0.6, "<0.70")).toBe(true);
    expect(ruleConditionMatches(0.8, "<0.70")).toBe(false);
    expect(ruleConditionMatches(0.7, "==0.70")).toBe(true);
  });

  it("does not match missing context keys", () => {
    expect(ruleConditionMatches(undefined, true)).toBe(false);
  });
});

describe("evaluateRules", () => {
  it("includes matched and unmatched trace entries", () => {
    const context = buildEvaluationContext(normalizedReadAction(), {
      destructiveOperation: true
    });
    const rules: PolicyRule[] = [
      {
        id: "matched-rule",
        decision: "BLOCK",
        when: {
          destructive_operation: true
        },
        reason: "Destructive operation."
      },
      {
        id: "unmatched-rule",
        decision: "DEFER",
        when: {
          action_type: "write_file"
        }
      }
    ];

    const results = evaluateRules(rules, context);

    expect(results.map((result) => result.trace)).toEqual([
      {
        ruleId: "matched-rule",
        matched: true,
        effect: "BLOCK",
        reason: "Destructive operation."
      },
      {
        ruleId: "unmatched-rule",
        matched: false
      }
    ]);
  });
});
