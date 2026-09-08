import { z } from "zod";
import {
  type CalibrationRecord,
  validateCalibrationRecords
} from "./calibrationDatasetSchema.js";

export const agentCalibrationManifestSchemaVersion =
  "agent-calibration-manifest.v1" as const;

export const agentCalibrationManifestSourceValues = [
  "synthetic_schema_manifest",
  "future_controlled_agent_trace_manifest",
  "future_real_trial_trace_manifest"
] as const;

export const agentCalibrationManifestSourceRecordKindValues = [
  "synthetic_schema_example",
  "future_controlled_reviewed_trace",
  "future_real_trial_reviewed_trace"
] as const;

export const agentCalibrationManifestEligibilityCategoryValues = [
  "structurally_eligible_future_candidate",
  "needs_additional_review_labels",
  "needs_adjudication",
  "excluded_synthetic_example_only",
  "excluded_boundary_violation",
  "excluded_insufficient_linkage",
  "excluded_not_real_calibration_data"
] as const;

export const agentCalibrationManifestExclusionReasonValues = [
  "synthetic_schema_example_only",
  "not_real_reviewed_trace",
  "not_real_calibration_data",
  "missing_required_labels",
  "needs_adjudication",
  "boundary_violation",
  "insufficient_source_linkage",
  "raw_private_data_present",
  "raw_agent_output_present",
  "calibration_boundary_not_satisfied",
  "split_not_assigned",
  "future_trace_required"
] as const;

export const agentCalibrationManifestRequirementCategoryValues = [
  "future_real_reviewed_trace",
  "future_human_review_label",
  "future_adjudication",
  "future_privacy_review",
  "future_split_planning",
  "future_loss_label_definition"
] as const;

export const agentCalibrationManifestLinkageStatusValues = [
  "resolved_synthetic_links",
  "partially_resolved_synthetic_links",
  "unresolved_links"
] as const;

export const agentCalibrationManifestLabelReadinessStatusValues = [
  "structurally_complete_synthetic_labels",
  "needs_future_human_review",
  "needs_adjudication",
  "missing_required_labels"
] as const;

export const agentCalibrationManifestSplitReadinessStatusValues = [
  "not_eligible_synthetic_example",
  "future_split_candidate_after_review",
  "split_not_ready"
] as const;

export const agentCalibrationManifestCalibrationReadinessStatusValues = [
  "not_calibration_data",
  "future_candidate_after_review",
  "needs_adjudication_before_use",
  "not_ready"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const manifestIdSchema = z
  .string()
  .min(1)
  .regex(/^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const calibrationRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const reviewIdSchema = z
  .string()
  .min(1)
  .regex(/^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const comparisonIdSchema = z
  .string()
  .min(1)
  .regex(/^baseline[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const artifactPackageIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

export const calibrationManifestSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  executesAgent: z.literal(false),
  executesCommands: z.literal(false),
  executesPackageScripts: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false),
  touchesRealSecrets: z.literal(false),
  usesRealRepo: z.literal(false),
  containsPrivateData: z.literal(false),
  containsExecutableAction: z.literal(false),
  changesRuntimeBehavior: z.literal(false),
  createsCalibrationDataset: z.literal(false),
  appliesCalibration: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  assignsDatasetSplits: z.literal(false),
  computesThresholds: z.literal(false)
});

export const calibrationManifestPrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawBaselineIncluded: z.literal(false),
  rawCalibrationDataIncluded: z.literal(false),
  rawManifestDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const calibrationManifestClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realCalibrationManifest: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  datasetSplitsAssigned: z.literal(false),
  thresholdsComputed: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const sourceArtifactRefsSchema = z.object({
  runId: runIdSchema.optional(),
  traceId: traceIdSchema.optional(),
  reviewId: reviewIdSchema.optional(),
  baselineComparisonId: comparisonIdSchema.optional(),
  artifactPackageId: artifactPackageIdSchema.optional()
});

const sourceRecordSummarySchema = z.object({
  calibrationRecordId: calibrationRecordIdSchema,
  sourceArtifactRefs: sourceArtifactRefsSchema,
  sourceRecordKind: z.enum(agentCalibrationManifestSourceRecordKindValues),
  eligibilityCategory: z.enum(
    agentCalibrationManifestEligibilityCategoryValues
  ),
  exclusionReasonCategories: z.array(
    z.enum(agentCalibrationManifestExclusionReasonValues)
  ),
  missingRequirementCategories: z.array(
    z.enum(agentCalibrationManifestRequirementCategoryValues)
  ),
  linkageStatus: z.enum(agentCalibrationManifestLinkageStatusValues),
  labelReadinessStatus: z.enum(
    agentCalibrationManifestLabelReadinessStatusValues
  ),
  splitReadinessStatus: z.enum(
    agentCalibrationManifestSplitReadinessStatusValues
  ),
  calibrationReadinessStatus: z.enum(
    agentCalibrationManifestCalibrationReadinessStatusValues
  ),
  safeForManifest: z.literal(true),
  rawRecordIncluded: z.literal(false)
});

const exclusionCountSchema = z.object({
  exclusionReasonCategory: z.enum(
    agentCalibrationManifestExclusionReasonValues
  ),
  recordCount: z.number().int().min(0)
});

export const calibrationManifestSchema = z.object({
  schemaVersion: z.literal(agentCalibrationManifestSchemaVersion),
  manifestId: manifestIdSchema,
  source: z.enum(agentCalibrationManifestSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-13"),
    phaseName: z.literal("Calibration Dataset Construction"),
    completedBatches: z.array(z.literal("13.1")),
    currentBatch: z.literal("13.2"),
    futureBatches: z.array(z.enum(["13.3", "13.4", "13.5"])),
    previousPhaseStatus: z.literal(
      "phase-12-complete-synthetic-design-readiness-only"
    ),
    nextPhaseStatus: z.literal(
      "phase-14-offline-conformal-crc-prototype-future"
    )
  }),
  sourceRecords: z.array(sourceRecordSummarySchema).min(1),
  eligibilitySummary: z.object({
    totalSourceRecords: z.number().int().min(1),
    structurallyEligibleFutureCandidateCount: z.number().int().min(0),
    needsAdditionalReviewLabelsCount: z.number().int().min(0),
    needsAdjudicationCount: z.number().int().min(0),
    excludedSyntheticExampleOnlyCount: z.number().int().min(0),
    excludedBoundaryViolationCount: z.number().int().min(0),
    excludedInsufficientLinkageCount: z.number().int().min(0),
    excludedNotRealCalibrationDataCount: z.number().int().min(0),
    realCalibrationRecordCount: z.literal(0)
  }),
  exclusionSummary: z.object({
    exclusionCounts: z.array(exclusionCountSchema),
    rawPrivateDataPresentCount: z.literal(0),
    rawAgentOutputPresentCount: z.literal(0),
    noRealPrivateDataPresent: z.literal(true)
  }),
  linkageSummary: z.object({
    totalRecordsWithReviewLink: z.number().int().min(0),
    totalRecordsWithTraceLink: z.number().int().min(0),
    totalRecordsWithRunLink: z.number().int().min(0),
    totalRecordsWithBaselineComparisonLink: z.number().int().min(0),
    totalRecordsWithArtifactPackageLink: z.number().int().min(0),
    unresolvedLinkCount: z.literal(0),
    rawLinkedArtifactIncluded: z.literal(false)
  }),
  labelReadinessSummary: z.object({
    totalRecords: z.number().int().min(1),
    recordsWithDecisionLabels: z.number().int().min(0),
    recordsWithUncertaintyLabels: z.number().int().min(0),
    recordsWithAgentBehaviorLabels: z.number().int().min(0),
    recordsWithOutcomeLabels: z.number().int().min(0),
    recordsWithFrictionLabels: z.number().int().min(0),
    recordsWithCoverageLabels: z.number().int().min(0),
    recordsWithFutureLossLabelCandidates: z.number().int().min(0),
    recordsMissingRequiredLabels: z.number().int().min(0),
    recordsNeedingAdjudication: z.number().int().min(0),
    realHumanReviewedRecordCount: z.literal(0)
  }),
  splitReadinessSummary: z.object({
    totalRecords: z.number().int().min(1),
    splitAssignedCount: z.literal(0),
    futureSplitCandidateCount: z.number().int().min(0),
    notEligibleForSplitCount: z.number().int().min(0),
    leakageRiskCategories: z.array(categoryIdSchema),
    splitManifestCreated: z.literal(false)
  }),
  calibrationReadinessSummary: z.object({
    totalRecords: z.number().int().min(1),
    futureCalibrationCandidateCount: z.number().int().min(0),
    notCalibrationReadyCount: z.number().int().min(0),
    syntheticExampleOnlyCount: z.number().int().min(0),
    calibrationDatasetCreated: z.literal(false),
    calibrationApplied: z.literal(false),
    conformalUsed: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false),
    suitableForCalibrationAsIsCount: z.literal(0)
  }),
  boundarySummary: z.object({
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    rawDataBoundaryViolationCount: z.literal(0),
    calibrationBoundaryViolationCount: z.literal(0),
    conformalBoundaryViolationCount: z.literal(0),
    runtimeBoundaryViolationCount: z.literal(0)
  }),
  metrics: z.object({
    totalManifestRecords: z.number().int().min(1),
    syntheticSchemaExampleCount: z.number().int().min(1),
    futureControlledTraceCount: z.literal(0),
    futureRealTrialTraceCount: z.literal(0),
    realCalibrationRecordCount: z.literal(0),
    realReviewedTraceCount: z.literal(0),
    unresolvedLinkCount: z.literal(0),
    missingRequiredLabelCount: z.number().int().min(0),
    adjudicationNeededCount: z.number().int().min(0),
    splitAssignedCount: z.literal(0),
    calibrationDatasetCreatedCount: z.literal(0),
    calibrationAppliedCount: z.literal(0),
    thresholdComputedCount: z.literal(0),
    conformalImplementationCount: z.literal(0)
  }),
  safety: calibrationManifestSafetySchema,
  privacy: calibrationManifestPrivacySchema,
  claimBoundaries: calibrationManifestClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type CalibrationManifest = z.infer<typeof calibrationManifestSchema>;
export type CalibrationManifestSourceRecord = z.infer<
  typeof sourceRecordSummarySchema
>;

export const validateCalibrationManifest = (
  manifest: unknown
): CalibrationManifest => calibrationManifestSchema.parse(manifest);

export const validateCalibrationManifests = (
  manifests: unknown[]
): CalibrationManifest[] =>
  manifests
    .map(validateCalibrationManifest)
    .sort((left, right) => left.manifestId.localeCompare(right.manifestId));

const classifyEligibility = (
  record: CalibrationRecord
): CalibrationManifestSourceRecord["eligibilityCategory"] => {
  switch (record.calibrationRecordId) {
    case "calibration-synthetic-blind-edit-defer-001":
    case "calibration-synthetic-dangerous-command-block-001":
      return "structurally_eligible_future_candidate";
    case "calibration-synthetic-sensitive-auth-escalate-001":
      return "needs_adjudication";
    case "calibration-synthetic-ambiguous-deploy-policy-miss-001":
      return "needs_additional_review_labels";
    case "calibration-synthetic-broad-refactor-coverage-gap-001":
      return "excluded_not_real_calibration_data";
    default:
      return "excluded_not_real_calibration_data";
  }
};

const missingRequirementsForRecord = (
  record: CalibrationRecord,
  eligibilityCategory: CalibrationManifestSourceRecord["eligibilityCategory"]
): CalibrationManifestSourceRecord["missingRequirementCategories"] => {
  const requirements: CalibrationManifestSourceRecord["missingRequirementCategories"] =
    [
      "future_real_reviewed_trace",
      "future_human_review_label",
      "future_split_planning",
      "future_loss_label_definition"
    ];

  if (
    eligibilityCategory === "needs_adjudication" ||
    record.calibrationEligibility.adjudicationRequired === "yes"
  ) {
    requirements.push("future_adjudication");
  }

  return [...new Set(requirements)].sort();
};

const sourceRecordFromCalibrationRecord = (
  record: CalibrationRecord
): CalibrationManifestSourceRecord => {
  const eligibilityCategory = classifyEligibility(record);
  const needsAdjudication =
    eligibilityCategory === "needs_adjudication" ||
    record.calibrationEligibility.adjudicationRequired === "yes";
  const exclusionReasonCategories: CalibrationManifestSourceRecord["exclusionReasonCategories"] =
    [
      "synthetic_schema_example_only",
      "not_real_reviewed_trace",
      "not_real_calibration_data",
      "calibration_boundary_not_satisfied",
      "split_not_assigned",
      "future_trace_required"
    ];

  if (needsAdjudication) {
    exclusionReasonCategories.push("needs_adjudication");
  }

  if (eligibilityCategory === "needs_additional_review_labels") {
    exclusionReasonCategories.push("missing_required_labels");
  }

  return {
    calibrationRecordId: record.calibrationRecordId,
    sourceArtifactRefs: {
      runId: record.sourceArtifact.runId,
      traceId: record.sourceArtifact.traceId,
      reviewId: record.sourceArtifact.reviewId,
      baselineComparisonId: record.sourceArtifact.baselineComparisonId,
      artifactPackageId: record.sourceArtifact.artifactPackageId
    },
    sourceRecordKind: "synthetic_schema_example",
    eligibilityCategory,
    exclusionReasonCategories: [...new Set(exclusionReasonCategories)].sort(),
    missingRequirementCategories: missingRequirementsForRecord(
      record,
      eligibilityCategory
    ),
    linkageStatus: "resolved_synthetic_links",
    labelReadinessStatus: needsAdjudication
      ? "needs_adjudication"
      : eligibilityCategory === "needs_additional_review_labels"
        ? "needs_future_human_review"
        : "structurally_complete_synthetic_labels",
    splitReadinessStatus: "not_eligible_synthetic_example",
    calibrationReadinessStatus: needsAdjudication
      ? "needs_adjudication_before_use"
      : "not_calibration_data",
    safeForManifest: true,
    rawRecordIncluded: false
  };
};

const countByEligibility = (
  sourceRecords: CalibrationManifestSourceRecord[],
  eligibilityCategory: CalibrationManifestSourceRecord["eligibilityCategory"]
): number =>
  sourceRecords.filter(
    (record) => record.eligibilityCategory === eligibilityCategory
  ).length;

const countByExclusionReason = (
  sourceRecords: CalibrationManifestSourceRecord[],
  exclusionReasonCategory: CalibrationManifestSourceRecord["exclusionReasonCategories"][number]
): number =>
  sourceRecords.filter((record) =>
    record.exclusionReasonCategories.includes(exclusionReasonCategory)
  ).length;

export const buildSyntheticCalibrationManifest = (input: {
  manifestId: string;
  records: CalibrationRecord[];
}): CalibrationManifest => {
  const records = validateCalibrationRecords(input.records);
  const sourceRecords = records.map(sourceRecordFromCalibrationRecord);
  const totalRecords = sourceRecords.length;
  const recordsNeedingAdjudication = records.filter(
    (record) => record.calibrationEligibility.adjudicationRequired === "yes"
  ).length;
  const recordsMissingRequiredLabels = sourceRecords.filter(
    (record) =>
      record.eligibilityCategory === "needs_additional_review_labels" ||
      record.missingRequirementCategories.length > 0
  ).length;
  const leakageRiskCategories = [
    ...new Set(
      records.map((record) => record.splitEligibility.leakageRiskCategory)
    )
  ].sort();

  return validateCalibrationManifest({
    schemaVersion: agentCalibrationManifestSchemaVersion,
    manifestId: input.manifestId,
    source: "synthetic_schema_manifest",
    phase: {
      phaseId: "phase-13",
      phaseName: "Calibration Dataset Construction",
      completedBatches: ["13.1"],
      currentBatch: "13.2",
      futureBatches: ["13.3", "13.4", "13.5"],
      previousPhaseStatus: "phase-12-complete-synthetic-design-readiness-only",
      nextPhaseStatus: "phase-14-offline-conformal-crc-prototype-future"
    },
    sourceRecords,
    eligibilitySummary: {
      totalSourceRecords: totalRecords,
      structurallyEligibleFutureCandidateCount: countByEligibility(
        sourceRecords,
        "structurally_eligible_future_candidate"
      ),
      needsAdditionalReviewLabelsCount: countByEligibility(
        sourceRecords,
        "needs_additional_review_labels"
      ),
      needsAdjudicationCount: countByEligibility(
        sourceRecords,
        "needs_adjudication"
      ),
      excludedSyntheticExampleOnlyCount: countByExclusionReason(
        sourceRecords,
        "synthetic_schema_example_only"
      ),
      excludedBoundaryViolationCount: countByEligibility(
        sourceRecords,
        "excluded_boundary_violation"
      ),
      excludedInsufficientLinkageCount: countByEligibility(
        sourceRecords,
        "excluded_insufficient_linkage"
      ),
      excludedNotRealCalibrationDataCount: countByExclusionReason(
        sourceRecords,
        "not_real_calibration_data"
      ),
      realCalibrationRecordCount: 0
    },
    exclusionSummary: {
      exclusionCounts: agentCalibrationManifestExclusionReasonValues.map(
        (exclusionReasonCategory) => ({
          exclusionReasonCategory,
          recordCount: countByExclusionReason(
            sourceRecords,
            exclusionReasonCategory
          )
        })
      ),
      rawPrivateDataPresentCount: 0,
      rawAgentOutputPresentCount: 0,
      noRealPrivateDataPresent: true
    },
    linkageSummary: {
      totalRecordsWithReviewLink: records.filter(
        (record) => record.sourceArtifact.reviewId !== undefined
      ).length,
      totalRecordsWithTraceLink: records.filter(
        (record) => record.sourceArtifact.traceId !== undefined
      ).length,
      totalRecordsWithRunLink: records.filter(
        (record) => record.sourceArtifact.runId !== undefined
      ).length,
      totalRecordsWithBaselineComparisonLink: records.filter(
        (record) => record.sourceArtifact.baselineComparisonId !== undefined
      ).length,
      totalRecordsWithArtifactPackageLink: records.filter(
        (record) => record.sourceArtifact.artifactPackageId !== undefined
      ).length,
      unresolvedLinkCount: 0,
      rawLinkedArtifactIncluded: false
    },
    labelReadinessSummary: {
      totalRecords,
      recordsWithDecisionLabels: totalRecords,
      recordsWithUncertaintyLabels: totalRecords,
      recordsWithAgentBehaviorLabels: totalRecords,
      recordsWithOutcomeLabels: totalRecords,
      recordsWithFrictionLabels: totalRecords,
      recordsWithCoverageLabels: totalRecords,
      recordsWithFutureLossLabelCandidates: totalRecords,
      recordsMissingRequiredLabels,
      recordsNeedingAdjudication,
      realHumanReviewedRecordCount: 0
    },
    splitReadinessSummary: {
      totalRecords,
      splitAssignedCount: 0,
      futureSplitCandidateCount: 0,
      notEligibleForSplitCount: totalRecords,
      leakageRiskCategories,
      splitManifestCreated: false
    },
    calibrationReadinessSummary: {
      totalRecords,
      futureCalibrationCandidateCount: countByEligibility(
        sourceRecords,
        "structurally_eligible_future_candidate"
      ),
      notCalibrationReadyCount: totalRecords,
      syntheticExampleOnlyCount: totalRecords,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      conformalUsed: false,
      statisticalGuaranteeClaimed: false,
      suitableForCalibrationAsIsCount: 0
    },
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    metrics: {
      totalManifestRecords: totalRecords,
      syntheticSchemaExampleCount: totalRecords,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realCalibrationRecordCount: 0,
      realReviewedTraceCount: 0,
      unresolvedLinkCount: 0,
      missingRequiredLabelCount: recordsMissingRequiredLabels,
      adjudicationNeededCount: recordsNeedingAdjudication,
      splitAssignedCount: 0,
      calibrationDatasetCreatedCount: 0,
      calibrationAppliedCount: 0,
      thresholdComputedCount: 0,
      conformalImplementationCount: 0
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      executesAgent: false,
      executesCommands: false,
      executesPackageScripts: false,
      requiresNetwork: false,
      mutatesRepository: false,
      touchesRealSecrets: false,
      usesRealRepo: false,
      containsPrivateData: false,
      containsExecutableAction: false,
      changesRuntimeBehavior: false,
      createsCalibrationDataset: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      assignsDatasetSplits: false,
      computesThresholds: false
    },
    privacy: {
      rawPromptIncluded: false,
      rawActionIncluded: false,
      rawCommandIncluded: false,
      rawDiffIncluded: false,
      rawSourceCodeIncluded: false,
      rawValidationLogIncluded: false,
      rawReviewIncluded: false,
      rawTraceIncluded: false,
      rawBaselineIncluded: false,
      rawCalibrationDataIncluded: false,
      rawManifestDataIncluded: false,
      realRepoNameIncluded: false,
      realPathIncluded: false,
      realUserIncluded: false,
      realEmailIncluded: false,
      secretIncluded: false,
      rawAgentOutputIncluded: false,
      reviewerIdentityIncluded: false,
      categoryOnly: true
    },
    claimBoundaries: {
      syntheticOnly: true,
      realCalibrationManifest: false,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      datasetSplitsAssigned: false,
      thresholdsComputed: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "synthetic_manifest_example",
      "not_real_calibration_dataset",
      "no_splits_assigned",
      "no_calibration_applied"
    ]
  });
};

export const summarizeCalibrationManifest = (
  manifest: CalibrationManifest
): {
  manifestId: string;
  totalManifestRecords: number;
  syntheticSchemaExampleCount: number;
  realCalibrationRecordCount: 0;
  calibrationDatasetCreated: false;
} => ({
  manifestId: manifest.manifestId,
  totalManifestRecords: manifest.metrics.totalManifestRecords,
  syntheticSchemaExampleCount: manifest.metrics.syntheticSchemaExampleCount,
  realCalibrationRecordCount: manifest.metrics.realCalibrationRecordCount,
  calibrationDatasetCreated:
    manifest.calibrationReadinessSummary.calibrationDatasetCreated
});

export const computeCalibrationManifestMetrics = (
  manifest: CalibrationManifest
): CalibrationManifest["metrics"] => manifest.metrics;

export interface CalibrationManifestSourceLinkageContext {
  calibrationRecordIds: Set<string>;
  reviewIds: Set<string>;
  traceIds: Set<string>;
  runIds: Set<string>;
  baselineComparisonIds: Set<string>;
  artifactPackageIds: Set<string>;
}

export const validateCalibrationManifestSourceLinkage = (
  manifest: CalibrationManifest,
  context: CalibrationManifestSourceLinkageContext
): void => {
  for (const sourceRecord of manifest.sourceRecords) {
    if (!context.calibrationRecordIds.has(sourceRecord.calibrationRecordId)) {
      throw new Error(
        `Missing calibrationRecordId: ${sourceRecord.calibrationRecordId}`
      );
    }

    const refs = sourceRecord.sourceArtifactRefs;

    if (refs.reviewId !== undefined && !context.reviewIds.has(refs.reviewId)) {
      throw new Error(`Missing reviewId: ${refs.reviewId}`);
    }

    if (refs.traceId !== undefined && !context.traceIds.has(refs.traceId)) {
      throw new Error(`Missing traceId: ${refs.traceId}`);
    }

    if (refs.runId !== undefined && !context.runIds.has(refs.runId)) {
      throw new Error(`Missing runId: ${refs.runId}`);
    }

    if (
      refs.baselineComparisonId !== undefined &&
      !context.baselineComparisonIds.has(refs.baselineComparisonId)
    ) {
      throw new Error(
        `Missing baselineComparisonId: ${refs.baselineComparisonId}`
      );
    }

    if (
      refs.artifactPackageId !== undefined &&
      !context.artifactPackageIds.has(refs.artifactPackageId)
    ) {
      throw new Error(`Missing artifactPackageId: ${refs.artifactPackageId}`);
    }
  }
};

export const validateCalibrationManifestBoundaries = (
  manifest: CalibrationManifest
): void => {
  if (
    manifest.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    manifest.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    manifest.boundarySummary.claimBoundaryViolationCount !== 0 ||
    manifest.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    manifest.boundarySummary.conformalBoundaryViolationCount !== 0 ||
    manifest.boundarySummary.runtimeBoundaryViolationCount !== 0
  ) {
    throw new Error(`Manifest boundary violation: ${manifest.manifestId}`);
  }
};

const forbiddenManifestPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /\/private\/tmp\//,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=/,
  /PRIVATE KEY/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /diff --git/,
  /https?:\/\//,
  /api\.internal/i,
  /customer[-_ ]?(?:prod|production|data)/i,
  /\/prod(?:uction)?\b/i,
  /rm\s+-rf/i,
  /sudo\b/i,
  /eval\s*(?:\(|\b)/i,
  /curl\b.*\|/i,
  /npm\s+run/i,
  /yarn\s+/i,
  /pnpm\s+/i,
  /bun\s+run/i
] as const;

export const calibrationManifestContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenManifestPatterns.some((pattern) => pattern.test(serialized));
};

export const validateCalibrationManifestSafety = (
  manifest: CalibrationManifest
): void => {
  if (calibrationManifestContainsForbiddenRawString(manifest)) {
    throw new Error(
      `Calibration manifest contains forbidden raw-looking value: ${manifest.manifestId}`
    );
  }
};
