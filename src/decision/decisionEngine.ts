import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import {
  buildDeferDecisionDetails,
  type DeferDecisionDetails
} from "../defer/deferDecisionBuilder.js";
import {
  isContextCompletenessDeferRule,
  isReducibleDeferRule
} from "../defer/deferReasonCategories.js";
import {
  decisionOutputSchema,
  type DecisionPosture
} from "../domain/decisions.js";
import type { StepHarborPolicy, PolicyRule } from "../domain/policies.js";
import {
  stepHarborSignalsSchema,
  type StepHarborSignals
} from "../domain/signals.js";
import {
  createDecisionEngineError,
  type StepHarborDecision,
  type DecisionEngineResult
} from "./decisionErrors.js";
import {
  defaultProceedReason,
  reasonForMatchedRule,
  requiredNextStepsForDecision
} from "./decisionReasons.js";
import { isMoreSevereDecision } from "./decisionOrdering.js";
import {
  buildEvaluationContext,
  evaluateRules,
  type DecisionSignals
} from "./ruleEvaluator.js";

export interface DecisionEngineInput {
  action: NormalizedStepHarborAction;
  policy: StepHarborPolicy;
  signals?: DecisionSignals;
  session?: {
    sessionId?: string;
    userId?: string;
    agentId?: string;
    repoId?: string;
    workspaceId?: string;
  };
}

const chooseBySeverity = (matchedRules: PolicyRule[]): PolicyRule | undefined =>
  matchedRules.reduce<PolicyRule | undefined>(
    (current, candidate) =>
      current === undefined ||
      isMoreSevereDecision(candidate.decision, current.decision)
        ? candidate
        : current,
    undefined
  );

const chooseWinningRule = (
  matchedRules: PolicyRule[]
): PolicyRule | undefined => {
  const blockRule = matchedRules.find((rule) => rule.decision === "BLOCK");

  if (blockRule !== undefined) {
    return blockRule;
  }

  const reducibleDeferRule = matchedRules.find((rule) =>
    isReducibleDeferRule(rule)
  );

  if (reducibleDeferRule !== undefined) {
    return reducibleDeferRule;
  }

  const contextDeferRule = matchedRules.find((rule) =>
    isContextCompletenessDeferRule(rule)
  );

  if (contextDeferRule !== undefined) {
    return contextDeferRule;
  }

  return chooseBySeverity(matchedRules);
};

const buildSignalSummary = (
  action: NormalizedStepHarborAction,
  signals: DecisionSignals
): Record<string, unknown> => {
  const parsedSignals = stepHarborSignalsSchema.passthrough().parse(signals);

  return {
    ...parsedSignals,
    action_type: action.type,
    target_path:
      "targetPath" in action && typeof action.targetPath === "string"
        ? action.targetPath
        : undefined,
    command:
      "command" in action && typeof action.command === "string"
        ? action.command
        : undefined,
    normalized_relative_target_path: action.normalized.relativeTargetPath,
    command_executable: action.normalized.commandExecutable,
    is_git_like_command: action.normalized.isGitLikeCommand,
    is_validation_like_command: action.normalized.isValidationLikeCommand
  };
};

const buildDecision = (
  action: NormalizedStepHarborAction,
  policy: StepHarborPolicy,
  signals: DecisionSignals
): StepHarborDecision => {
  const context = buildEvaluationContext(action, signals);
  const ruleResults = evaluateRules(policy.rules ?? [], context);
  const matchedRules = ruleResults
    .filter((result) => result.matched)
    .map((result) => result.rule);
  const winningRule = chooseWinningRule(matchedRules);
  const decision: DecisionPosture = winningRule?.decision ?? "PROCEED";
  const deferDetails: Partial<DeferDecisionDetails> =
    decision === "DEFER"
      ? buildDeferDecisionDetails(
          matchedRules,
          action,
          stepHarborSignalsSchema.parse(signals)
        )
      : {};
  const {
    reason: deferReason,
    requiredNextSteps: deferRequiredNextSteps,
    ...structuredDeferDetails
  } = deferDetails;

  const output: StepHarborDecision = {
    decision,
    reason:
      decision === "DEFER" &&
      deferReason !== undefined &&
      deferDetails.deferReasonCategory !== "unknown_defer_reason"
        ? deferReason
        : winningRule !== undefined
          ? reasonForMatchedRule(winningRule)
          : defaultProceedReason,
    matchedPolicies: ruleResults.map((result) => result.trace),
    signalSummary: buildSignalSummary(action, signals),
    requiredNextSteps:
      decision === "DEFER" && deferRequiredNextSteps !== undefined
        ? deferRequiredNextSteps
        : requiredNextStepsForDecision(decision),
    ...structuredDeferDetails
  };

  return decisionOutputSchema.parse(output);
};

export const decide = (input: DecisionEngineInput): DecisionEngineResult => {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      input.action === undefined ||
      input.policy === undefined
    ) {
      return {
        ok: false,
        error: createDecisionEngineError(
          "DECISION_INVALID_INPUT",
          "Decision engine input must include an action and policy."
        )
      };
    }

    return {
      ok: true,
      decision: buildDecision(input.action, input.policy, input.signals ?? {})
    };
  } catch (error) {
    return {
      ok: false,
      error: createDecisionEngineError(
        "DECISION_RULE_EVALUATION_ERROR",
        "Decision rule evaluation failed.",
        error
      )
    };
  }
};

export type { StepHarborSignals };
