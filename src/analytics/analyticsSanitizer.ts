const unsafeKeys = new Set([
  "path",
  "paths",
  "file",
  "files",
  "filename",
  "filepath",
  "absolutepath",
  "command",
  "rawcommand",
  "content",
  "contents",
  "diff",
  "patch",
  "env",
  "environment",
  "secret",
  "token",
  "apikey",
  "password",
  "repo",
  "repository",
  "cwd",
  "home"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const categoryIdPattern = /^[a-z][a-z0-9_]*$/;

const safeCategoryIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (entry): entry is string =>
              typeof entry === "string" && categoryIdPattern.test(entry)
          )
        )
      ).sort()
    : [];

const safeEnum = <TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  fallback: TValue
): TValue => (allowed.includes(value as TValue) ? (value as TValue) : fallback);

const safeOptionalEnum = <TValue extends string>(
  value: unknown,
  allowed: readonly TValue[]
): TValue | undefined =>
  allowed.includes(value as TValue) ? (value as TValue) : undefined;

const safeBoolean = (value: unknown): boolean => value === true;

const safeCount = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;

const uncertaintyLevels = ["low", "medium", "high", "critical"] as const;
const uncertaintyReducibility = [
  "reducible",
  "partially_reducible",
  "irreducible"
] as const;
const uncertaintyScoreBuckets = [
  "zero",
  "low",
  "medium",
  "high",
  "critical"
] as const;
const decisionPostures = ["PROCEED", "DEFER", "ESCALATE", "BLOCK"] as const;
const routerConfidenceLevels = ["low", "medium", "high"] as const;
const actionTypeCategories = [
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "install_dependency",
  "run_tests",
  "git",
  "deploy",
  "unknown"
] as const;
const expectedNextDecisions = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "PROCEED_OR_ESCALATE",
  "UNKNOWN"
] as const;

const safeCategoryRecord = <TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  fallback: TValue
): Record<string, TValue> => {
  if (!isRecord(value)) {
    return {};
  }

  const safe: Record<string, TValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (categoryIdPattern.test(key)) {
      safe[key] = safeEnum(entry, allowed, fallback);
    }
  }

  return safe;
};

export const isUnsafeAnalyticsKey = (key: string): boolean =>
  unsafeKeys.has(key.replace(/[_-]/g, "").toLowerCase());

export const sanitizeAnalyticsPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeAnalyticsPayload);
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isUnsafeAnalyticsKey(key)) {
      continue;
    }

    sanitized[key] = sanitizeAnalyticsPayload(entry);
  }

  return sanitized;
};

export const sanitizeAnalyticsEventPayload = (
  eventType: string,
  value: unknown
): unknown => {
  if (!isRecord(value)) {
    return sanitizeAnalyticsPayload(value);
  }

  if (eventType === "uncertainty_profile_created") {
    const actionTypeCategory = safeOptionalEnum(
      value.actionTypeCategory,
      actionTypeCategories
    );
    const decisionCategory = safeOptionalEnum(
      value.decisionCategory,
      decisionPostures
    );

    return {
      schemaVersion:
        typeof value.schemaVersion === "string" &&
        categoryIdPattern.test(value.schemaVersion.replace(/\./g, "_"))
          ? value.schemaVersion
          : "uncertainty-profile.v1",
      overallLevel: safeEnum(value.overallLevel, uncertaintyLevels, "low"),
      overallScoreBucket: safeEnum(
        value.overallScoreBucket,
        uncertaintyScoreBuckets,
        "zero"
      ),
      impact: safeEnum(value.impact, uncertaintyLevels, "low"),
      reducibility: safeEnum(
        value.reducibility,
        uncertaintyReducibility,
        "reducible"
      ),
      dimensionsPresent: safeCategoryIds(value.dimensionsPresent),
      topDrivers: safeCategoryIds(value.topDrivers).slice(0, 5),
      dimensionLevels: safeCategoryRecord(
        value.dimensionLevels,
        uncertaintyLevels,
        "low"
      ),
      dimensionImpacts: safeCategoryRecord(
        value.dimensionImpacts,
        uncertaintyLevels,
        "low"
      ),
      dimensionReducibility: safeCategoryRecord(
        value.dimensionReducibility,
        uncertaintyReducibility,
        "reducible"
      ),
      reductionPlanAvailable: safeBoolean(value.reductionPlanAvailable),
      reductionStepCount: safeCount(value.reductionStepCount),
      ...(actionTypeCategory !== undefined ? { actionTypeCategory } : {}),
      ...(decisionCategory !== undefined ? { decisionCategory } : {})
    };
  }

  if (eventType === "uncertainty_reduction_plan_created") {
    const actionTypeCategory = safeOptionalEnum(
      value.actionTypeCategory,
      actionTypeCategories
    );
    const decisionCategory = safeOptionalEnum(
      value.decisionCategory,
      decisionPostures
    );

    return {
      schemaVersion:
        typeof value.schemaVersion === "string" &&
        categoryIdPattern.test(value.schemaVersion.replace(/\./g, "_"))
          ? value.schemaVersion
          : "uncertainty-reduction-plan.v1",
      reductionStepKinds: safeCategoryIds(value.reductionStepKinds),
      reductionStepCount: safeCount(value.reductionStepCount),
      expectedNextDecision: safeEnum(
        value.expectedNextDecision,
        expectedNextDecisions,
        "UNKNOWN"
      ),
      topDrivers: safeCategoryIds(value.topDrivers).slice(0, 5),
      ...(actionTypeCategory !== undefined ? { actionTypeCategory } : {}),
      ...(decisionCategory !== undefined ? { decisionCategory } : {})
    };
  }

  if (eventType === "uncertainty_router_recommendation_created") {
    const actionTypeCategory = safeOptionalEnum(
      value.actionTypeCategory,
      actionTypeCategories
    );
    const decisionCategory = safeOptionalEnum(
      value.decisionCategory,
      decisionPostures
    );

    return {
      schemaVersion:
        typeof value.schemaVersion === "string" &&
        categoryIdPattern.test(value.schemaVersion.replace(/\./g, "_"))
          ? value.schemaVersion
          : "uncertainty-router-result.v1",
      routerRecommendedDecision: safeEnum(
        value.routerRecommendedDecision,
        decisionPostures,
        "DEFER"
      ),
      routerConfidence: safeEnum(
        value.routerConfidence,
        routerConfidenceLevels,
        "low"
      ),
      routerRationale: safeCategoryIds(value.routerRationale),
      blockingDriverCount: safeCount(value.blockingDriverCount),
      deferDriverCount: safeCount(value.deferDriverCount),
      escalationDriverCount: safeCount(value.escalationDriverCount),
      reductionPlanAvailable: safeBoolean(value.reductionPlanAvailable),
      topDrivers: safeCategoryIds(value.topDrivers).slice(0, 5),
      ...(actionTypeCategory !== undefined ? { actionTypeCategory } : {}),
      ...(decisionCategory !== undefined ? { decisionCategory } : {})
    };
  }

  return sanitizeAnalyticsPayload(value);
};
