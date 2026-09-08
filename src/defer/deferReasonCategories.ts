import type { PolicyRule } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import type { DeferReasonCategory } from "./deferTypes.js";

const includesConditionValue = (
  condition: unknown,
  values: readonly unknown[]
): boolean => {
  if (Array.isArray(condition)) {
    return values.some((value) => condition.includes(value));
  }

  return values.includes(condition);
};

export const isReducibleDeferRule = (rule: PolicyRule): boolean => {
  if (rule.decision !== "DEFER") {
    return false;
  }

  return (
    includesConditionValue(rule.when["target_file_freshness"], [
      "unknown",
      "stale",
      "missing"
    ]) ||
    includesConditionValue(rule.when["validation_status"], ["not_run", "stale"])
  );
};

export const hasReducibleDeferRule = (rules: PolicyRule[]): boolean =>
  rules.some((rule) => isReducibleDeferRule(rule));

export const isContextCompletenessDeferRule = (rule: PolicyRule): boolean =>
  rule.decision === "DEFER" &&
  rule.when["context_completeness_score"] !== undefined;

export const hasContextCompletenessDeferRule = (rules: PolicyRule[]): boolean =>
  rules.some((rule) => isContextCompletenessDeferRule(rule));

export const isMetadataOnlyObservation = (
  signals: CodingActionGateSignals
): boolean =>
  signals.targetFileFreshness === "unknown" &&
  signals.readBeforeWriteReason === "Latest observation is metadata-only.";

export const classifyDeferReason = (
  matchedRules: PolicyRule[],
  signals: CodingActionGateSignals
): DeferReasonCategory => {
  const hasReducibleDefer = hasReducibleDeferRule(matchedRules);

  if (hasReducibleDefer) {
    if (isMetadataOnlyObservation(signals)) {
      return "metadata_only_observation";
    }

    switch (signals.targetFileFreshness) {
      case "unknown":
        return "target_file_never_read";
      case "stale":
        return "target_file_stale";
      case "missing":
        return "target_file_missing";
      case "fresh":
      case undefined:
        break;
    }

    switch (signals.validationStatus) {
      case "not_run":
        return "validation_not_run";
      case "stale":
        return "validation_stale";
      case "failed":
      case "passed":
      case "running":
      case "unknown":
      case undefined:
        break;
    }
  }

  if (
    hasContextCompletenessDeferRule(matchedRules) ||
    (signals.contextCompletenessScore !== undefined &&
      signals.contextCompletenessScore < 0.7)
  ) {
    return "context_incomplete";
  }

  return "unknown_defer_reason";
};
