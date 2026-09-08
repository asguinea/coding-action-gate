import { z } from "zod";
import { opportunityProblemFamilySchema } from "../../benchmarks/opportunity-map/scenarioSchema.js";
import {
  realRepoTrialCategoryIdSchema,
  realRepoTrialDecisionCountsSchema,
  realRepoTrialModes,
  realRepoTrialRepoCategories,
  realRepoTrialRepoSizeCategories
} from "./findingsSchema.js";

export const realRepoTrialIntakePacketSchemaVersion =
  "real-repo-trial-intake-packet.v1" as const;

export const realRepoTrialIntakeStatuses = [
  "accepted_for_summary",
  "needs_redaction",
  "rejected_contains_private_data",
  "rejected_invalid_schema",
  "needs_operator_clarification"
] as const;

const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const realRepoTrialIntakePacketSchema = z.object({
  schemaVersion: z.literal(realRepoTrialIntakePacketSchemaVersion),
  packetId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sourceFindingsId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  intakeStatus: z.enum(realRepoTrialIntakeStatuses),
  trialMode: z.enum(realRepoTrialModes),
  repoCategory: z.enum(realRepoTrialRepoCategories),
  repoSizeCategory: z.enum(realRepoTrialRepoSizeCategories),
  languageCategories: z.array(realRepoTrialCategoryIdSchema),
  frameworkCategories: z.array(realRepoTrialCategoryIdSchema).optional(),
  codingActionGateVersion: z.string().min(1).optional(),
  privacyReview: z.object({
    reviewed: z.boolean(),
    safeToSummarize: z.boolean(),
    safeForExternalSharing: z.boolean()
  }),
  summary: z.object({
    decisionCounts: realRepoTrialDecisionCountsSchema,
    outcomeCounts: z.record(
      realRepoTrialCategoryIdSchema,
      nonNegativeIntegerSchema
    ),
    observedFamilies: z.array(opportunityProblemFamilySchema),
    topDriverCategories: z.array(realRepoTrialCategoryIdSchema)
  }),
  gapAnalysisReady: z.boolean(),
  limitations: z.array(realRepoTrialCategoryIdSchema).min(1)
});

export type RealRepoTrialIntakePacket = z.infer<
  typeof realRepoTrialIntakePacketSchema
>;

const forbiddenIntakePacketPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/tmp\/private/,
  /diff --git/,
  /API_KEY=/,
  /SECRET=/,
  /TOKEN=/,
  /PRIVATE_KEY/,
  /-----BEGIN/,
  /https?:\/\//,
  /\.internal\b/i,
  /npm\s+run/,
  /rm\s+-rf/,
  /git\s+push/,
  /private-repo/i,
  /feature\/[a-z0-9_-]+/i,
  /validation log:/i
] as const;

export const realRepoTrialIntakePacketContainsForbiddenRawString = (
  packet: unknown
): boolean => {
  const serialized = JSON.stringify(packet);

  return forbiddenIntakePacketPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};

export const validateRealRepoTrialIntakePacket = (
  packet: unknown
): RealRepoTrialIntakePacket => {
  const parsed = realRepoTrialIntakePacketSchema.parse(packet);

  if (realRepoTrialIntakePacketContainsForbiddenRawString(parsed)) {
    throw new Error(
      `Real-repo trial intake packet contains forbidden raw-looking value: ${parsed.packetId}`
    );
  }

  if (
    parsed.gapAnalysisReady &&
    (parsed.intakeStatus !== "accepted_for_summary" ||
      !parsed.privacyReview.safeToSummarize)
  ) {
    throw new Error(
      `Real-repo trial intake packet is not ready for gap analysis: ${parsed.packetId}`
    );
  }

  return parsed;
};
