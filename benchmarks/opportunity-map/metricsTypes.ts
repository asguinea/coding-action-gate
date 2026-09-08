import { z } from "zod";
import { decisionPostures } from "../../src/domain/decisions.js";
import {
  opportunityCategoryIdSchema,
  opportunityProblemFamilies,
  opportunityProblemFamilySchema
} from "./scenarioSchema.js";

export const opportunityBenchmarkMetricsSchemaVersion =
  "opportunity-benchmark-metrics.v1" as const;

const metricRateSchema = z.number().min(0).max(1);

export const opportunityBenchmarkMetricBucketSchema = z.object({
  matched: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  matchRate: metricRateSchema
});

const decisionBucketRecordSchema = z.object(
  Object.fromEntries(
    decisionPostures.map((decision) => [
      decision,
      opportunityBenchmarkMetricBucketSchema
    ])
  ) as Record<
    (typeof decisionPostures)[number],
    typeof opportunityBenchmarkMetricBucketSchema
  >
);

const familyCountRecordSchema = z.object(
  Object.fromEntries(
    opportunityProblemFamilies.map((family) => [
      family,
      z.number().int().nonnegative()
    ])
  ) as Record<(typeof opportunityProblemFamilies)[number], z.ZodNumber>
);

export const opportunityBenchmarkMetricsSchema = z.object({
  schemaVersion: z.literal(opportunityBenchmarkMetricsSchemaVersion),
  scenarioCount: z.number().int().nonnegative(),
  passedScenarios: z.number().int().nonnegative(),
  failedScenarios: z.number().int().nonnegative(),
  skippedScenarios: z.number().int().nonnegative(),
  advisoryDecision: z.object({
    matched: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    matchRate: metricRateSchema,
    byExpectedDecision: decisionBucketRecordSchema
  }),
  uncertaintyDrivers: z.object({
    matchedExpectedDrivers: z.number().int().nonnegative(),
    totalExpectedDrivers: z.number().int().nonnegative(),
    matchRate: metricRateSchema,
    missingExpectedDrivers: z.record(
      opportunityCategoryIdSchema,
      z.number().int().positive()
    )
  }),
  reductionSteps: z.object({
    matchedExpectedSteps: z.number().int().nonnegative(),
    totalExpectedSteps: z.number().int().nonnegative(),
    matchRate: metricRateSchema,
    missingExpectedSteps: z.record(
      opportunityCategoryIdSchema,
      z.number().int().positive()
    )
  }),
  coverage: z.object({
    problemFamiliesCovered: z.array(opportunityProblemFamilySchema),
    scenarioCountByFamily: familyCountRecordSchema,
    passCountByFamily: familyCountRecordSchema,
    failCountByFamily: familyCountRecordSchema
  }),
  safety: z.object({
    unsafeExecutionCount: z.number().int().nonnegative(),
    networkRequiredCount: z.number().int().nonnegative(),
    repositoryMutationCount: z.number().int().nonnegative(),
    realSecretTouchCount: z.number().int().nonnegative(),
    privacyLeakCount: z.number().int().nonnegative()
  }),
  limitations: z.array(opportunityCategoryIdSchema)
});

export type OpportunityBenchmarkMetrics = z.infer<
  typeof opportunityBenchmarkMetricsSchema
>;
