import { z } from "zod";
import { realRepoTrialCategoryIdSchema } from "./findingsSchema.js";

export const realRepoCalibrationPlanSchemaVersion =
  "real-repo-calibration-plan.v1" as const;

export const realRepoCalibrationCategories = [
  "policy_tuning",
  "detector_gap",
  "benchmark_expansion",
  "ux_clarity",
  "documentation",
  "needs_more_evidence"
] as const;

export const realRepoCalibrationPriorities = [
  "low",
  "medium",
  "high",
  "critical"
] as const;

export const realRepoCalibrationPlanItemSchema = z.object({
  id: realRepoTrialCategoryIdSchema,
  category: z.enum(realRepoCalibrationCategories),
  priority: z.enum(realRepoCalibrationPriorities),
  sourceSignals: z.array(realRepoTrialCategoryIdSchema),
  opportunityFamilies: z.array(realRepoTrialCategoryIdSchema),
  driverCategories: z.array(realRepoTrialCategoryIdSchema),
  outcomeCategories: z.array(realRepoTrialCategoryIdSchema),
  recommendedAction: realRepoTrialCategoryIdSchema,
  evidenceCount: z.number().int().nonnegative(),
  safeForImplementation: z.boolean()
});

export const realRepoCalibrationPlanSchema = z.object({
  schemaVersion: z.literal(realRepoCalibrationPlanSchemaVersion),
  inputSummary: z.object({
    acceptedTrialCount: z.number().int().nonnegative(),
    intakePacketCount: z.number().int().nonnegative(),
    gapAnalysisCount: z.number().int().nonnegative(),
    caseCount: z.number().int().nonnegative()
  }),
  readiness: z.object({
    readyForCalibration: z.boolean(),
    blockers: z.array(realRepoTrialCategoryIdSchema),
    requiredNextSteps: z.array(realRepoTrialCategoryIdSchema)
  }),
  calibrationItems: z.array(realRepoCalibrationPlanItemSchema),
  summary: z.object({
    byCategory: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    ),
    byPriority: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    ),
    topOpportunityFamilies: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    ),
    topDriverCategories: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    )
  }),
  safety: z.object({
    categoryOnly: z.literal(true),
    containsRawPrivateData: z.literal(false),
    remoteTelemetryUsed: z.literal(false),
    productionBehaviorChanged: z.literal(false)
  }),
  limitations: z.array(realRepoTrialCategoryIdSchema)
});

export type RealRepoCalibrationCategory =
  (typeof realRepoCalibrationCategories)[number];

export type RealRepoCalibrationPriority =
  (typeof realRepoCalibrationPriorities)[number];

export type RealRepoCalibrationPlanItem = z.infer<
  typeof realRepoCalibrationPlanItemSchema
>;

export type RealRepoCalibrationPlan = z.infer<
  typeof realRepoCalibrationPlanSchema
>;
