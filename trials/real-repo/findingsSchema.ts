import { z } from "zod";
import {
  opportunityProblemFamilies,
  opportunityProblemFamilySchema
} from "../../benchmarks/opportunity-map/scenarioSchema.js";
import { decisionPostureSchema } from "../../src/domain/decisions.js";

export const realRepoTrialFindingsSchemaVersion =
  "real-repo-trial-findings.v1" as const;

export const realRepoTrialRepoCategories = [
  "toy",
  "internal_non_production",
  "open_source",
  "commercial_non_production",
  "other"
] as const;

export const realRepoTrialRepoSizeCategories = [
  "small",
  "medium",
  "large",
  "unknown"
] as const;

export const realRepoTrialModes = [
  "observation_only",
  "dry_run",
  "guided_operator",
  "other"
] as const;

export const realRepoTrialOutcomeCategories = [
  "useful",
  "false_positive",
  "false_negative",
  "confusing",
  "missing_coverage",
  "needs_review"
] as const;

export const realRepoTrialCategoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const realRepoTrialDecisionCountsSchema = z.object({
  PROCEED: nonNegativeIntegerSchema,
  DEFER: nonNegativeIntegerSchema,
  ESCALATE: nonNegativeIntegerSchema,
  BLOCK: nonNegativeIntegerSchema
});

export const realRepoTrialPrivacyReviewSchema = z.object({
  manuallyReviewed: z.boolean(),
  containsSourceCode: z.literal(false),
  containsDiffs: z.literal(false),
  containsSecrets: z.literal(false),
  containsRawCommands: z.literal(false),
  containsPrivatePaths: z.literal(false),
  containsRepoNames: z.literal(false),
  containsBranchNames: z.literal(false),
  containsValidationLogs: z.literal(false),
  containsCustomerData: z.literal(false)
});

export const realRepoTrialCaseSchema = z.object({
  caseId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/),
  opportunityFamily: opportunityProblemFamilySchema,
  expectedPosture: decisionPostureSchema.optional(),
  actualPosture: decisionPostureSchema,
  outcomeCategory: z.enum(realRepoTrialOutcomeCategories),
  driverCategories: z.array(realRepoTrialCategoryIdSchema),
  notesCategory: realRepoTrialCategoryIdSchema.optional()
});

export const realRepoTrialFindingsSchema = z.object({
  schemaVersion: z.literal(realRepoTrialFindingsSchemaVersion),
  trialId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  trialDate: z.string().min(1).optional(),
  stepharborVersion: z.string().min(1).optional(),
  repoCategory: z.enum(realRepoTrialRepoCategories),
  repoSizeCategory: z.enum(realRepoTrialRepoSizeCategories),
  languageCategories: z.array(realRepoTrialCategoryIdSchema),
  frameworkCategories: z.array(realRepoTrialCategoryIdSchema).optional(),
  trialMode: z.enum(realRepoTrialModes),
  policyTemplate: realRepoTrialCategoryIdSchema.optional(),
  decisionCounts: realRepoTrialDecisionCountsSchema,
  topCategories: z.object({
    deferDrivers: z.array(realRepoTrialCategoryIdSchema),
    escalateDrivers: z.array(realRepoTrialCategoryIdSchema),
    blockDrivers: z.array(realRepoTrialCategoryIdSchema)
  }),
  cases: z.array(realRepoTrialCaseSchema),
  qualitativeFeedback: z.object({
    usefulPatterns: z.array(realRepoTrialCategoryIdSchema),
    confusingPatterns: z.array(realRepoTrialCategoryIdSchema),
    missingCoverage: z.array(realRepoTrialCategoryIdSchema),
    requestedImprovements: z.array(realRepoTrialCategoryIdSchema)
  }),
  privacyReview: realRepoTrialPrivacyReviewSchema,
  limitations: z.array(realRepoTrialCategoryIdSchema).min(1)
});

export type RealRepoTrialFindings = z.infer<typeof realRepoTrialFindingsSchema>;
export type RealRepoTrialCase = z.infer<typeof realRepoTrialCaseSchema>;

const forbiddenFindingsPatterns = [
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

export const realRepoTrialFindingsContainForbiddenRawString = (
  findings: unknown
): boolean => {
  const serialized = JSON.stringify(findings);

  return forbiddenFindingsPatterns.some((pattern) => pattern.test(serialized));
};

export const validateRealRepoTrialFindings = (
  findings: unknown
): RealRepoTrialFindings => {
  const parsed = realRepoTrialFindingsSchema.parse(findings);

  if (realRepoTrialFindingsContainForbiddenRawString(parsed)) {
    throw new Error(
      `Real-repo trial findings contain forbidden raw-looking value: ${parsed.trialId}`
    );
  }

  for (const trialCase of parsed.cases) {
    if (!opportunityProblemFamilies.includes(trialCase.opportunityFamily)) {
      throw new Error(
        `Unknown opportunity family in real-repo trial findings: ${trialCase.opportunityFamily}`
      );
    }
  }

  return parsed;
};
