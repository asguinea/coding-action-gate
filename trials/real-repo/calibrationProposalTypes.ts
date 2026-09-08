import { z } from "zod";
import {
  realRepoCalibrationCategories,
  realRepoCalibrationPlanSchemaVersion,
  realRepoCalibrationPriorities
} from "./calibrationPlanTypes.js";
import { realRepoTrialCategoryIdSchema } from "./findingsSchema.js";

export const realRepoCalibrationProposalSetSchemaVersion =
  "real-repo-calibration-proposals.v1" as const;

export const realRepoCalibrationProposalTargets = [
  "policy",
  "detector",
  "benchmark",
  "docs",
  "ux",
  "analysis_only"
] as const;

export const realRepoCalibrationProposalReviewStatuses = [
  "pending_review",
  "approved_for_implementation",
  "rejected",
  "needs_more_evidence"
] as const;

export const realRepoCalibrationProposalReadinessStates = [
  "not_ready",
  "ready_for_design",
  "ready_for_implementation",
  "blocked"
] as const;

export const realRepoCalibrationProposalSchema = z.object({
  id: realRepoTrialCategoryIdSchema,
  sourceCalibrationItemId: realRepoTrialCategoryIdSchema,
  category: z.enum(realRepoCalibrationCategories),
  priority: z.enum(realRepoCalibrationPriorities),
  proposedAction: realRepoTrialCategoryIdSchema,
  implementationTarget: z.enum(realRepoCalibrationProposalTargets),
  reviewStatus: z.enum(realRepoCalibrationProposalReviewStatuses),
  implementationReadiness: z.enum(realRepoCalibrationProposalReadinessStates),
  sourceSignals: z.array(realRepoTrialCategoryIdSchema),
  opportunityFamilies: z.array(realRepoTrialCategoryIdSchema),
  driverCategories: z.array(realRepoTrialCategoryIdSchema),
  outcomeCategories: z.array(realRepoTrialCategoryIdSchema),
  evidenceCount: z.number().int().nonnegative(),
  safeguards: z.array(realRepoTrialCategoryIdSchema)
});

export const realRepoCalibrationProposalSetSchema = z.object({
  schemaVersion: z.literal(realRepoCalibrationProposalSetSchemaVersion),
  sourcePlanSchemaVersion: z.literal(realRepoCalibrationPlanSchemaVersion),
  proposalCount: z.number().int().nonnegative(),
  proposals: z.array(realRepoCalibrationProposalSchema),
  reviewSummary: z.object({
    pendingReview: z.number().int().nonnegative(),
    approvedForImplementation: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    needsMoreEvidence: z.number().int().nonnegative()
  }),
  safety: z.object({
    categoryOnly: z.literal(true),
    containsRawPrivateData: z.literal(false),
    productionBehaviorChanged: z.literal(false),
    automaticTuningApplied: z.literal(false),
    remoteTelemetryUsed: z.literal(false)
  }),
  limitations: z.array(realRepoTrialCategoryIdSchema)
});

export type RealRepoCalibrationProposalTarget =
  (typeof realRepoCalibrationProposalTargets)[number];

export type RealRepoCalibrationProposalReviewStatus =
  (typeof realRepoCalibrationProposalReviewStatuses)[number];

export type RealRepoCalibrationProposalReadinessState =
  (typeof realRepoCalibrationProposalReadinessStates)[number];

export type RealRepoCalibrationProposal = z.infer<
  typeof realRepoCalibrationProposalSchema
>;

export type RealRepoCalibrationProposalSet = z.infer<
  typeof realRepoCalibrationProposalSetSchema
>;
