import type { DecisionPosture } from "../domain/decisions.js";
import type { FetchPlanStep, MissingContextEntry } from "../domain/common.js";
import type { PolicyRule } from "../domain/policies.js";
import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";

export const reasonForMatchedRule = (rule: PolicyRule): string =>
  rule.reason ?? `Policy rule ${rule.id} matched.`;

export const defaultProceedReason =
  "No policy rules required deferral, escalation, or blocking.";

export const requiredNextStepsForDecision = (
  decision: DecisionPosture
): string[] => {
  switch (decision) {
    case "PROCEED":
      return [];
    case "DEFER":
      return [
        "Gather missing context or satisfy the matched policy condition, then retry authorization."
      ];
    case "ESCALATE":
      return ["Request human approval before executing this action."];
    case "BLOCK":
      return [
        "Do not execute this action. Review the policy violation and choose a safer alternative."
      ];
  }
};

const conditionIncludes = (
  condition: unknown,
  values: readonly unknown[]
): boolean => {
  if (Array.isArray(condition)) {
    return values.some((value) => condition.includes(value));
  }

  return values.includes(condition);
};

export const buildDeferMissingContext = (
  matchedRules: PolicyRule[],
  action: NormalizedStepHarborAction
): {
  missingContext?: MissingContextEntry[];
  fetchPlan?: FetchPlanStep[];
} => {
  const missingContext: MissingContextEntry[] = [];
  const fetchPlan: FetchPlanStep[] = [];
  const target = action.normalized.relativeTargetPath;

  if (
    matchedRules.some((rule) =>
      conditionIncludes(rule.when["target_file_freshness"], [
        "stale",
        "unknown",
        "missing"
      ])
    )
  ) {
    missingContext.push({
      type: "target_file_freshness",
      ...(target !== undefined ? { target } : {}),
      reason: "Target file state is not fresh.",
      required: true
    });
    fetchPlan.push({
      type: "read_file",
      ...(target !== undefined ? { target } : {}),
      safe: true,
      reason: "Refresh target file before mutation."
    });
  }

  if (
    matchedRules.some((rule) =>
      conditionIncludes(rule.when["validation_status"], ["not_run", "stale"])
    )
  ) {
    missingContext.push({
      type: "validation",
      reason: "Required validation has not passed.",
      required: true
    });
    fetchPlan.push({
      type: "run_validation",
      safe: true,
      reason: "Run required validation before retrying authorization."
    });
  }

  return {
    ...(missingContext.length > 0 ? { missingContext } : {}),
    ...(fetchPlan.length > 0 ? { fetchPlan } : {})
  };
};
