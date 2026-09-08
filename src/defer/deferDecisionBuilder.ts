import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { DecisionOutput } from "../domain/decisions.js";
import type { PolicyRule } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import {
  classifyDeferReason,
  hasReducibleDeferRule
} from "./deferReasonCategories.js";
import type { FetchPlanStep, MissingContextEntry } from "../domain/common.js";
import type {
  DeferReasonCategory,
  ExpectedNextDecision
} from "./deferTypes.js";
import { buildFetchPlan } from "./fetchPlanBuilder.js";
import { buildMissingContext } from "./missingContextBuilder.js";
import { buildRiskIfProceeding } from "./riskIfProceedingBuilder.js";

export type DeferDecisionDetails = Pick<
  DecisionOutput,
  | "deferReasonCategory"
  | "missingContext"
  | "fetchPlan"
  | "riskIfProceeding"
  | "reanalysisRequired"
  | "expectedNextDecision"
  | "requiredNextSteps"
> & {
  reason: string;
};

const targetPathForAction = (
  action: NormalizedCodingActionGateAction
): string | undefined => action.normalized.relativeTargetPath;

const isPendingEscalation = (matchedRules: PolicyRule[]): boolean =>
  matchedRules.some((rule) => rule.decision === "ESCALATE");

const isTargetFreshnessCategory = (category: DeferReasonCategory): boolean =>
  category === "target_file_never_read" ||
  category === "target_file_stale" ||
  category === "target_file_missing" ||
  category === "metadata_only_observation";

const isSensitiveOrDestructive = (signals: CodingActionGateSignals): boolean =>
  signals.pathSensitivity === "high" ||
  signals.pathSensitivity === "critical" ||
  signals.destructiveOperation === true;

const expectedNextDecisionForCategory = (
  category: DeferReasonCategory,
  signals: CodingActionGateSignals
): ExpectedNextDecision => {
  if (isTargetFreshnessCategory(category)) {
    return isSensitiveOrDestructive(signals) ? "ESCALATE" : "PROCEED";
  }

  if (category === "validation_not_run" || category === "validation_stale") {
    return "PROCEED";
  }

  if (category === "context_incomplete") {
    return isSensitiveOrDestructive(signals) ? "ESCALATE" : "PROCEED";
  }

  return "UNKNOWN";
};

const reasonForCategory = (category: DeferReasonCategory): string => {
  switch (category) {
    case "target_file_never_read":
      return "Target file has not been observed in this session.";
    case "target_file_stale":
      return "Target file changed since the last observation.";
    case "target_file_missing":
      return "Target file is missing or no longer available.";
    case "metadata_only_observation":
      return "Latest observation is metadata-only and cannot authorize mutation.";
    case "validation_not_run":
      return "Required validation has not been run.";
    case "validation_stale":
      return "Required validation is stale.";
    case "context_incomplete":
      return "Related context has not been sufficiently inspected.";
    case "environment_unknown":
    case "branch_unknown":
    case "large_change_lacks_plan":
    case "agent_loop_detected":
    case "unknown_defer_reason":
      return "Additional context is required before this action can be authorized.";
  }
};

const buildReason = (
  category: DeferReasonCategory,
  pendingEscalation: boolean
): string => {
  const reason = reasonForCategory(category);

  return pendingEscalation
    ? `${reason} After context is refreshed, this action may still require human approval.`
    : reason;
};

const buildRequiredNextSteps = (
  category: DeferReasonCategory,
  pendingEscalation: boolean
): string[] => {
  const steps: string[] = [];

  switch (category) {
    case "target_file_never_read":
      steps.push("Read the current target file, then retry authorization.");
      break;
    case "target_file_stale":
      steps.push("Refresh the target file, then retry authorization.");
      break;
    case "target_file_missing":
      steps.push(
        "Confirm whether the target file exists, then retry authorization."
      );
      break;
    case "metadata_only_observation":
      steps.push("Perform a full file read, then retry authorization.");
      break;
    case "validation_not_run":
    case "validation_stale":
      steps.push("Run required validation, then retry authorization.");
      break;
    case "context_incomplete":
      steps.push("Inspect related context, then retry authorization.");
      break;
    case "environment_unknown":
    case "branch_unknown":
    case "large_change_lacks_plan":
    case "agent_loop_detected":
    case "unknown_defer_reason":
      steps.push(
        "Gather missing context or satisfy the matched policy condition, then retry authorization."
      );
      break;
  }

  if (pendingEscalation) {
    steps.push(
      "Prepare for human approval if the refreshed context still matches escalation policy."
    );
  }

  return steps;
};

const appendRelatedTestMissingContext = (
  missingContext: MissingContextEntry[],
  category: DeferReasonCategory,
  signals: CodingActionGateSignals
): MissingContextEntry[] => {
  if (
    category === "context_incomplete" ||
    signals.relatedTestsFound !== true ||
    signals.relatedTestsRead !== false
  ) {
    return missingContext;
  }

  const existingTargets = new Set(
    missingContext
      .filter((entry) => entry.type === "related_tests")
      .map((entry) => entry.target)
  );
  const relatedTestEntries = (signals.relatedTestPaths ?? [])
    .filter((relatedTestPath) => !existingTargets.has(relatedTestPath))
    .map<MissingContextEntry>((relatedTestPath) => ({
      type: "related_tests",
      target: relatedTestPath,
      reason: "Related tests have not been inspected.",
      required: true
    }));

  return [...missingContext, ...relatedTestEntries];
};

const appendRelatedTestFetchPlan = (
  fetchPlan: FetchPlanStep[],
  category: DeferReasonCategory,
  signals: CodingActionGateSignals
): FetchPlanStep[] => {
  if (
    category === "context_incomplete" ||
    signals.relatedTestsFound !== true ||
    signals.relatedTestsRead !== false
  ) {
    return fetchPlan;
  }

  const existingTargets = new Set(
    fetchPlan
      .filter((step) => step.type === "read_related_tests")
      .map((step) => step.target)
  );
  const relatedTestSteps = (signals.relatedTestPaths ?? [])
    .filter((relatedTestPath) => !existingTargets.has(relatedTestPath))
    .map<FetchPlanStep>((relatedTestPath) => ({
      type: "read_related_tests",
      target: relatedTestPath,
      safe: true,
      reason: "Inspect related tests before modifying this file."
    }));

  return [...fetchPlan, ...relatedTestSteps];
};

export const buildDeferDecisionDetails = (
  matchedRules: PolicyRule[],
  action: NormalizedCodingActionGateAction,
  signals: CodingActionGateSignals
): DeferDecisionDetails => {
  const category = classifyDeferReason(matchedRules, signals);
  const target = targetPathForAction(action);
  const pendingEscalation = isPendingEscalation(matchedRules);
  const missingContext = appendRelatedTestMissingContext(
    buildMissingContext(category, target, signals),
    category,
    signals
  );
  const fetchPlan = appendRelatedTestFetchPlan(
    buildFetchPlan(category, target, signals),
    category,
    signals
  );
  const riskIfProceeding = buildRiskIfProceeding(category, pendingEscalation);

  return {
    deferReasonCategory: category,
    reason: buildReason(category, pendingEscalation),
    ...(missingContext.length > 0 ? { missingContext } : {}),
    ...(fetchPlan.length > 0 ? { fetchPlan } : {}),
    ...(riskIfProceeding.length > 0 ? { riskIfProceeding } : {}),
    reanalysisRequired:
      hasReducibleDeferRule(matchedRules) || category === "context_incomplete",
    expectedNextDecision: expectedNextDecisionForCategory(category, signals),
    requiredNextSteps: buildRequiredNextSteps(category, pendingEscalation)
  };
};
