import { z } from "zod";
import { realRepoTrialCategoryIdSchema } from "./findingsSchema.js";

export const realVsBenchmarkGapAnalysisSchemaVersion =
  "real-vs-benchmark-gap-analysis.v1" as const;

export const realVsBenchmarkCalibrationCandidateCategories = [
  "policy_tuning",
  "benchmark_expansion",
  "ux_clarity",
  "detector_gap",
  "needs_human_review"
] as const;

export const realVsBenchmarkCalibrationCandidateSchema = z.object({
  category: z.enum(realVsBenchmarkCalibrationCandidateCategories),
  reason: realRepoTrialCategoryIdSchema,
  opportunityFamily: realRepoTrialCategoryIdSchema.optional(),
  driverCategories: z.array(realRepoTrialCategoryIdSchema),
  outcomeCategories: z.array(realRepoTrialCategoryIdSchema)
});

const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const realVsBenchmarkGapAnalysisSchema = z.object({
  schemaVersion: z.literal(realVsBenchmarkGapAnalysisSchemaVersion),
  inputSummary: z.object({
    trialCount: nonNegativeIntegerSchema,
    caseCount: nonNegativeIntegerSchema,
    benchmarkScenarioCount: nonNegativeIntegerSchema,
    benchmarkProblemFamilyCount: nonNegativeIntegerSchema
  }),
  familyCoverage: z.object({
    observedFamilies: z.array(realRepoTrialCategoryIdSchema),
    benchmarkFamilies: z.array(realRepoTrialCategoryIdSchema),
    familiesObservedAndBenchmarked: z.array(realRepoTrialCategoryIdSchema),
    benchmarkFamiliesNotObserved: z.array(realRepoTrialCategoryIdSchema),
    observedFamiliesWithoutBenchmarkCoverage: z.array(
      realRepoTrialCategoryIdSchema
    )
  }),
  outcomeSummary: z.object({
    useful: nonNegativeIntegerSchema,
    falsePositive: nonNegativeIntegerSchema,
    falseNegative: nonNegativeIntegerSchema,
    confusing: nonNegativeIntegerSchema,
    missingCoverage: nonNegativeIntegerSchema,
    needsReview: nonNegativeIntegerSchema
  }),
  postureComparison: z.object({
    matchedExpectedPosture: nonNegativeIntegerSchema,
    mismatchedExpectedPosture: nonNegativeIntegerSchema,
    missingExpectedPosture: nonNegativeIntegerSchema
  }),
  driverAnalysis: z.object({
    observedDriverCounts: z.record(
      realRepoTrialCategoryIdSchema,
      nonNegativeIntegerSchema
    ),
    benchmarkExpectedDriverCounts: z.record(
      realRepoTrialCategoryIdSchema,
      nonNegativeIntegerSchema
    ),
    observedDriversNotInBenchmark: z.array(realRepoTrialCategoryIdSchema),
    benchmarkDriversNotObserved: z.array(realRepoTrialCategoryIdSchema)
  }),
  calibrationCandidates: z.array(realVsBenchmarkCalibrationCandidateSchema),
  safety: z.object({
    analyzedOnlySanitizedFindings: z.literal(true),
    containsRawPrivateData: z.literal(false),
    remoteTelemetryUsed: z.literal(false),
    networkRequired: z.literal(false)
  }),
  limitations: z.array(realRepoTrialCategoryIdSchema)
});

export type RealVsBenchmarkGapAnalysis = z.infer<
  typeof realVsBenchmarkGapAnalysisSchema
>;

export type RealVsBenchmarkCalibrationCandidate = z.infer<
  typeof realVsBenchmarkCalibrationCandidateSchema
>;
