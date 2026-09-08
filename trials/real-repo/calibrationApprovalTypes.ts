import { z } from "zod";
import { realRepoCalibrationCategories } from "./calibrationPlanTypes.js";
import {
  realRepoCalibrationProposalSetSchemaVersion,
  realRepoCalibrationProposalTargets
} from "./calibrationProposalTypes.js";
import { realRepoCalibrationPriorities } from "./calibrationPlanTypes.js";
import { realRepoTrialCategoryIdSchema } from "./findingsSchema.js";

export const realRepoCalibrationApprovalSchemaVersion =
  "real-repo-calibration-approval.v1" as const;

export const realRepoCalibrationImplementationTicketSchemaVersion =
  "real-repo-calibration-implementation-ticket.v1" as const;

export const realRepoCalibrationApprovalStatuses = [
  "approved_for_design",
  "approved_for_implementation_planning",
  "rejected",
  "needs_more_evidence",
  "deferred"
] as const;

export const realRepoCalibrationReviewerRoles = [
  "maintainer",
  "security_reviewer",
  "product_reviewer",
  "technical_reviewer",
  "other"
] as const;

export const realRepoCalibrationApprovalScopes = [
  "docs_only",
  "benchmark_only",
  "policy_design_only",
  "detector_design_only",
  "implementation_planning_only"
] as const;

export const realRepoCalibrationTicketStatuses = [
  "draft",
  "ready_for_design",
  "ready_for_implementation",
  "blocked"
] as const;

const safetySchema = z.object({
  categoryOnly: z.literal(true),
  containsRawPrivateData: z.literal(false),
  productionBehaviorChanged: z.literal(false),
  automaticTuningApplied: z.literal(false),
  remoteTelemetryUsed: z.literal(false)
});

export const realRepoCalibrationApprovalRecordSchema = z.object({
  schemaVersion: z.literal(realRepoCalibrationApprovalSchemaVersion),
  approvalId: realRepoTrialCategoryIdSchema,
  sourceProposalSetSchemaVersion: z.literal(
    realRepoCalibrationProposalSetSchemaVersion
  ),
  sourceProposalIds: z.array(realRepoTrialCategoryIdSchema),
  approvalStatus: z.enum(realRepoCalibrationApprovalStatuses),
  approvedCategories: z.array(z.enum(realRepoCalibrationCategories)),
  approvedTargets: z.array(z.enum(realRepoCalibrationProposalTargets)),
  reviewerRole: z.enum(realRepoCalibrationReviewerRoles),
  approvalScope: z.enum(realRepoCalibrationApprovalScopes),
  safeguards: z.array(realRepoTrialCategoryIdSchema),
  limitations: z.array(realRepoTrialCategoryIdSchema),
  safety: safetySchema
});

export const realRepoCalibrationImplementationTicketSchema = z.object({
  schemaVersion: z.literal(
    realRepoCalibrationImplementationTicketSchemaVersion
  ),
  ticketId: realRepoTrialCategoryIdSchema,
  sourceApprovalId: realRepoTrialCategoryIdSchema,
  sourceProposalIds: z.array(realRepoTrialCategoryIdSchema),
  implementationTarget: z.enum(realRepoCalibrationProposalTargets),
  proposedAction: realRepoTrialCategoryIdSchema,
  priority: z.enum(realRepoCalibrationPriorities),
  requiredSafeguards: z.array(realRepoTrialCategoryIdSchema),
  requiredTests: z.array(realRepoTrialCategoryIdSchema),
  nonGoals: z.array(realRepoTrialCategoryIdSchema),
  acceptanceCriteria: z.array(realRepoTrialCategoryIdSchema),
  privacyRequirements: z.array(realRepoTrialCategoryIdSchema),
  status: z.enum(realRepoCalibrationTicketStatuses)
});

export type RealRepoCalibrationApprovalStatus =
  (typeof realRepoCalibrationApprovalStatuses)[number];

export type RealRepoCalibrationReviewerRole =
  (typeof realRepoCalibrationReviewerRoles)[number];

export type RealRepoCalibrationApprovalScope =
  (typeof realRepoCalibrationApprovalScopes)[number];

export type RealRepoCalibrationTicketStatus =
  (typeof realRepoCalibrationTicketStatuses)[number];

export type RealRepoCalibrationApprovalRecord = z.infer<
  typeof realRepoCalibrationApprovalRecordSchema
>;

export type RealRepoCalibrationImplementationTicket = z.infer<
  typeof realRepoCalibrationImplementationTicketSchema
>;
