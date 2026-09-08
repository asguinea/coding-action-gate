import { z } from "zod";
import { decisionPostures } from "../../src/domain/decisions.js";
import {
  realRepoTrialCategoryIdSchema,
  realRepoTrialDecisionCountsSchema,
  type RealRepoTrialFindings,
  validateRealRepoTrialFindings
} from "./findingsSchema.js";

export const realRepoTrialFindingsSummarySchemaVersion =
  "real-repo-trial-findings-summary.v1" as const;

export const realRepoTrialFindingsSummarySchema = z.object({
  schemaVersion: z.literal(realRepoTrialFindingsSummarySchemaVersion),
  trialCount: z.number().int().nonnegative(),
  totalDecisionCounts: realRepoTrialDecisionCountsSchema,
  outcomeCounts: z.record(
    realRepoTrialCategoryIdSchema,
    z.number().int().nonnegative()
  ),
  opportunityFamilyCounts: z.record(
    realRepoTrialCategoryIdSchema,
    z.number().int().nonnegative()
  ),
  topDriverCounts: z.record(
    realRepoTrialCategoryIdSchema,
    z.number().int().nonnegative()
  ),
  privacyReview: z.object({
    allManuallyReviewed: z.boolean(),
    unsafeFindingCount: z.number().int().nonnegative()
  }),
  limitations: z.array(realRepoTrialCategoryIdSchema)
});

export type RealRepoTrialFindingsSummary = z.infer<
  typeof realRepoTrialFindingsSummarySchema
>;

const summaryLimitations = [
  "sanitized_category_level_findings",
  "manual_review_required",
  "not_real_world_validation_claim",
  "no_automatic_collection"
] as const;

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const sensitivePrivacyFlagKeys = [
  "containsSourceCode",
  "containsDiffs",
  "containsSecrets",
  "containsRawCommands",
  "containsPrivatePaths",
  "containsRepoNames",
  "containsBranchNames",
  "containsValidationLogs",
  "containsCustomerData"
] as const;

const hasUnsafePrivacyFlag = (findings: RealRepoTrialFindings): boolean =>
  sensitivePrivacyFlagKeys.some((key) => findings.privacyReview[key]);

export const summarizeRealRepoTrialFindings = (
  findingsList: RealRepoTrialFindings[]
): RealRepoTrialFindingsSummary => {
  const totalDecisionCounts = Object.fromEntries(
    decisionPostures.map((decision) => [decision, 0])
  ) as RealRepoTrialFindingsSummary["totalDecisionCounts"];
  const outcomeCounts: Record<string, number> = {};
  const opportunityFamilyCounts: Record<string, number> = {};
  const topDriverCounts: Record<string, number> = {};

  let allManuallyReviewed = true;
  let unsafeFindingCount = 0;

  for (const rawFindings of findingsList) {
    const findings = validateRealRepoTrialFindings(rawFindings);

    for (const decision of decisionPostures) {
      totalDecisionCounts[decision] += findings.decisionCounts[decision];
    }

    if (!findings.privacyReview.manuallyReviewed) {
      allManuallyReviewed = false;
    }

    if (hasUnsafePrivacyFlag(findings)) {
      unsafeFindingCount += 1;
    }

    for (const trialCase of findings.cases) {
      increment(outcomeCounts, trialCase.outcomeCategory);
      increment(opportunityFamilyCounts, trialCase.opportunityFamily);

      for (const driver of trialCase.driverCategories) {
        increment(topDriverCounts, driver);
      }
    }

    for (const driver of findings.topCategories.deferDrivers) {
      increment(topDriverCounts, driver);
    }
    for (const driver of findings.topCategories.escalateDrivers) {
      increment(topDriverCounts, driver);
    }
    for (const driver of findings.topCategories.blockDrivers) {
      increment(topDriverCounts, driver);
    }
  }

  return realRepoTrialFindingsSummarySchema.parse({
    schemaVersion: realRepoTrialFindingsSummarySchemaVersion,
    trialCount: findingsList.length,
    totalDecisionCounts,
    outcomeCounts,
    opportunityFamilyCounts,
    topDriverCounts,
    privacyReview: {
      allManuallyReviewed,
      unsafeFindingCount
    },
    limitations: [...summaryLimitations]
  });
};
