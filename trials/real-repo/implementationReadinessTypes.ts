import { z } from "zod";
import {
  realRepoCalibrationApprovalSchemaVersion,
  realRepoCalibrationImplementationTicketSchemaVersion
} from "./calibrationApprovalTypes.js";
import { realRepoCalibrationProposalTargets } from "./calibrationProposalTypes.js";
import { realRepoTrialCategoryIdSchema } from "./findingsSchema.js";

export const realRepoCalibrationImplementationReadinessSchemaVersion =
  "real-repo-calibration-implementation-readiness.v1" as const;

export const realRepoCalibrationImplementationReadinessStates = [
  "ready_for_scoped_batch",
  "needs_design",
  "needs_more_evidence",
  "blocked"
] as const;

export const realRepoCalibrationImplementationReadinessTicketSchema = z.object({
  ticketId: realRepoTrialCategoryIdSchema,
  implementationTarget: z.enum(realRepoCalibrationProposalTargets),
  readiness: z.enum(realRepoCalibrationImplementationReadinessStates),
  blockers: z.array(realRepoTrialCategoryIdSchema),
  requiredBeforeImplementation: z.array(realRepoTrialCategoryIdSchema),
  allowedImplementationScope: z.array(realRepoTrialCategoryIdSchema),
  forbiddenImplementationScope: z.array(realRepoTrialCategoryIdSchema),
  requiredTests: z.array(realRepoTrialCategoryIdSchema),
  privacyRequirements: z.array(realRepoTrialCategoryIdSchema)
});

export const realRepoCalibrationImplementationReadinessReviewSchema = z.object({
  schemaVersion: z.literal(
    realRepoCalibrationImplementationReadinessSchemaVersion
  ),
  sourceApprovalSchemaVersion: z.literal(
    realRepoCalibrationApprovalSchemaVersion
  ),
  sourceTicketSchemaVersion: z.literal(
    realRepoCalibrationImplementationTicketSchemaVersion
  ),
  reviewId: realRepoTrialCategoryIdSchema,
  ticketCount: z.number().int().nonnegative(),
  readyTicketCount: z.number().int().nonnegative(),
  blockedTicketCount: z.number().int().nonnegative(),
  tickets: z.array(realRepoCalibrationImplementationReadinessTicketSchema),
  summary: z.object({
    byTarget: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    ),
    byReadiness: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    ),
    blockers: z.record(
      realRepoTrialCategoryIdSchema,
      z.number().int().nonnegative()
    )
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

export type RealRepoCalibrationImplementationReadinessState =
  (typeof realRepoCalibrationImplementationReadinessStates)[number];

export type RealRepoCalibrationImplementationReadinessTicket = z.infer<
  typeof realRepoCalibrationImplementationReadinessTicketSchema
>;

export type RealRepoCalibrationImplementationReadinessReview = z.infer<
  typeof realRepoCalibrationImplementationReadinessReviewSchema
>;
