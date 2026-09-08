import type { DecisionPosture } from "../domain/decisions.js";
import type {
  UncertaintyDimension,
  UncertaintyProfile,
  UncertaintyReductionPlan
} from "../uncertainty/uncertaintyTypes.js";
import type { UncertaintyRouterResult } from "../uncertainty/uncertaintyRouter.js";
import { recordAnalyticsEvent } from "./analyticsRecorder.js";
import type {
  AnalyticsActionType,
  AnalyticsUncertaintyScoreBucket
} from "./analyticsTypes.js";

const categoryIdPattern = /^[a-z][a-z0-9_]*$/;
const topDriverLimit = 5;

const safeCategoryIds = (values: string[], limit?: number): string[] => {
  const filtered = Array.from(
    new Set(values.filter((value) => categoryIdPattern.test(value)))
  ).sort();

  return limit === undefined ? filtered : filtered.slice(0, limit);
};

const scoreBucket = (score: number): AnalyticsUncertaintyScoreBucket => {
  if (!Number.isFinite(score) || score <= 0) {
    return "zero";
  }

  if (score < 0.25) {
    return "low";
  }

  if (score < 0.5) {
    return "medium";
  }

  if (score < 0.8) {
    return "high";
  }

  return "critical";
};

const dimensionsPresent = (
  profile: UncertaintyProfile
): UncertaintyDimension[] =>
  Object.keys(profile.dimensions).sort() as UncertaintyDimension[];

const dimensionLevels = (profile: UncertaintyProfile) =>
  Object.fromEntries(
    dimensionsPresent(profile).map((dimension) => [
      dimension,
      profile.dimensions[dimension].level
    ])
  );

const dimensionImpacts = (profile: UncertaintyProfile) =>
  Object.fromEntries(
    dimensionsPresent(profile).map((dimension) => [
      dimension,
      profile.dimensions[dimension].impact
    ])
  );

const dimensionReducibility = (profile: UncertaintyProfile) =>
  Object.fromEntries(
    dimensionsPresent(profile).map((dimension) => [
      dimension,
      profile.dimensions[dimension].reducibility
    ])
  );

const optionalContext = (context: {
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}) => ({
  ...(context.actionTypeCategory !== undefined
    ? { actionTypeCategory: context.actionTypeCategory }
    : {}),
  ...(context.decisionCategory !== undefined
    ? { decisionCategory: context.decisionCategory }
    : {})
});

export const sanitizedUncertaintyProfilePayload = (
  profile: UncertaintyProfile,
  context: {
    actionTypeCategory?: AnalyticsActionType;
    decisionCategory?: DecisionPosture;
  } = {}
) => ({
  schemaVersion: profile.schemaVersion,
  overallLevel: profile.overallLevel,
  overallScoreBucket: scoreBucket(profile.overallScore),
  impact: profile.impact,
  reducibility: profile.reducibility,
  dimensionsPresent: dimensionsPresent(profile),
  topDrivers: safeCategoryIds(profile.topDrivers, topDriverLimit),
  dimensionLevels: dimensionLevels(profile),
  dimensionImpacts: dimensionImpacts(profile),
  dimensionReducibility: dimensionReducibility(profile),
  reductionPlanAvailable: profile.uncertaintyReductionPlan !== undefined,
  reductionStepCount: profile.uncertaintyReductionPlan?.steps.length ?? 0,
  ...optionalContext(context)
});

export const sanitizedUncertaintyReductionPlanPayload = (
  plan: UncertaintyReductionPlan,
  context: {
    topDrivers?: string[];
    actionTypeCategory?: AnalyticsActionType;
    decisionCategory?: DecisionPosture;
  } = {}
) => ({
  schemaVersion: plan.schemaVersion,
  reductionStepKinds: safeCategoryIds(plan.steps.map((step) => step.kind)),
  reductionStepCount: plan.steps.length,
  expectedNextDecision: plan.expectedNextDecision ?? "UNKNOWN",
  topDrivers: safeCategoryIds(context.topDrivers ?? [], topDriverLimit),
  ...optionalContext(context)
});

export const sanitizedUncertaintyRouterPayload = (
  routerResult: UncertaintyRouterResult,
  context: {
    topDrivers?: string[];
    actionTypeCategory?: AnalyticsActionType;
    decisionCategory?: DecisionPosture;
  } = {}
) => ({
  schemaVersion: routerResult.schemaVersion,
  routerRecommendedDecision: routerResult.recommendedDecision,
  routerConfidence: routerResult.confidence,
  routerRationale: safeCategoryIds(routerResult.rationale),
  blockingDriverCount: routerResult.blockingDrivers.length,
  deferDriverCount: routerResult.deferDrivers.length,
  escalationDriverCount: routerResult.escalationDrivers.length,
  reductionPlanAvailable: routerResult.reductionPlanAvailable,
  topDrivers: safeCategoryIds(
    context.topDrivers ?? routerResult.drivers,
    topDriverLimit
  ),
  ...optionalContext(context)
});

export const recordUncertaintyProfileCreated = async (input: {
  cwd?: string;
  profile: UncertaintyProfile;
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "uncertainty_profile_created",
    source: "runtime",
    payload: sanitizedUncertaintyProfilePayload(input.profile, {
      ...(input.actionTypeCategory !== undefined
        ? { actionTypeCategory: input.actionTypeCategory }
        : {}),
      ...(input.decisionCategory !== undefined
        ? { decisionCategory: input.decisionCategory }
        : {})
    })
  });

export const recordUncertaintyReductionPlanCreated = async (input: {
  cwd?: string;
  plan: UncertaintyReductionPlan;
  topDrivers?: string[];
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "uncertainty_reduction_plan_created",
    source: "runtime",
    payload: sanitizedUncertaintyReductionPlanPayload(input.plan, {
      ...(input.topDrivers !== undefined
        ? { topDrivers: input.topDrivers }
        : {}),
      ...(input.actionTypeCategory !== undefined
        ? { actionTypeCategory: input.actionTypeCategory }
        : {}),
      ...(input.decisionCategory !== undefined
        ? { decisionCategory: input.decisionCategory }
        : {})
    })
  });

export const recordUncertaintyRouterRecommendationCreated = async (input: {
  cwd?: string;
  routerResult: UncertaintyRouterResult;
  topDrivers?: string[];
  actionTypeCategory?: AnalyticsActionType;
  decisionCategory?: DecisionPosture;
}): Promise<void> =>
  recordAnalyticsEvent({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    eventType: "uncertainty_router_recommendation_created",
    source: "runtime",
    payload: sanitizedUncertaintyRouterPayload(input.routerResult, {
      ...(input.topDrivers !== undefined
        ? { topDrivers: input.topDrivers }
        : {}),
      ...(input.actionTypeCategory !== undefined
        ? { actionTypeCategory: input.actionTypeCategory }
        : {}),
      ...(input.decisionCategory !== undefined
        ? { decisionCategory: input.decisionCategory }
        : {})
    })
  });
