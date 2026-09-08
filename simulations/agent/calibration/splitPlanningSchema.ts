import { z } from "zod";
import {
  type CalibrationRecord,
  validateCalibrationRecords
} from "./calibrationDatasetSchema.js";
import {
  type CalibrationManifest,
  validateCalibrationManifest
} from "./calibrationManifestSchema.js";
import {
  type LabelCompletenessEvaluatedRecord,
  type LabelCompletenessReport,
  validateLabelCompletenessReport
} from "./labelCompletenessSchema.js";

export const agentCalibrationSplitPlanningSchemaVersion =
  "agent-calibration-split-planning-report.v1" as const;

export const agentCalibrationSplitPlanningSourceValues = [
  "synthetic_schema_split_planning_report",
  "future_controlled_agent_trace_split_planning_report",
  "future_real_trial_trace_split_planning_report"
] as const;

export const agentCalibrationSplitFutureCategoryValues = [
  "future_train",
  "future_calibration",
  "future_test",
  "future_holdout",
  "not_eligible"
] as const;

export const agentCalibrationSplitLeakageRiskValues = [
  "same_scenario_family",
  "same_fixture_family",
  "same_trace_source",
  "same_agent_session_future",
  "same_reviewer_batch_future",
  "duplicated_or_near_duplicate_record",
  "same_normalized_action_category",
  "same_baseline_comparison_family",
  "synthetic_example_only",
  "unresolved_source_linkage",
  "no_leakage_risk_detected"
] as const;

export const agentCalibrationSplitGroupingKeyValues = [
  "scenario_family",
  "fixture_family",
  "trace_source",
  "action_category",
  "uncertainty_dimension",
  "decision_category",
  "review_label_family",
  "baseline_comparison_family"
] as const;

export const agentCalibrationSplitExclusionTriggerValues = [
  "synthetic_example_only_not_real_data",
  "missing_required_labels",
  "needs_adjudication",
  "unresolved_source_linkage",
  "boundary_violation",
  "raw_private_data_present",
  "raw_agent_output_present",
  "split_assignment_not_allowed",
  "real_review_required",
  "future_trace_required"
] as const;

export const agentCalibrationSplitRecordKindValues = [
  "synthetic_schema_example",
  "future_controlled_reviewed_trace",
  "future_real_trial_reviewed_trace"
] as const;

export const agentCalibrationSplitReadinessStatusValues = [
  "ready_for_future_split_design",
  "needs_labels_before_future_split",
  "needs_adjudication_before_future_split",
  "excluded_from_future_split",
  "synthetic_example_only_not_real_data"
] as const;

export const agentCalibrationRequiredBeforeSplitValues = [
  "real_reviewed_trace_required",
  "real_human_review_required",
  "adjudication_required",
  "complete_required_label_groups",
  "source_linkage_resolution_required",
  "privacy_boundary_clearance_required",
  "safety_boundary_clearance_required",
  "claim_boundary_clearance_required",
  "calibration_dataset_approval_required",
  "future_split_policy_approval_required"
] as const;

export const agentCalibrationSplitBoundaryStatusValues = [
  "boundary_safe",
  "boundary_violation",
  "boundary_unclear"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const reportIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const calibrationRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const manifestIdSchema = z
  .string()
  .min(1)
  .regex(/^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const labelCompletenessReportIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

export const splitPlanningSafetySchema = z.object({
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
  createsSplitManifest: z.literal(false),
  computesThresholds: z.literal(false),
  performsAdjudication: z.literal(false),
  assignsReviewers: z.literal(false)
});

export const splitPlanningPrivacySchema = z.object({
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
  rawAdjudicationDataIncluded: z.literal(false),
  rawSplitDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const splitPlanningClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realSplitPlanningReport: z.literal(false),
  realCalibrationManifest: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realHumanAdjudication: z.literal(false),
  realReviewerAssigned: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  datasetSplitsAssigned: z.literal(false),
  splitManifestCreated: z.literal(false),
  thresholdsComputed: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const evaluatedSplitRecordSchema = z.object({
  calibrationRecordId: calibrationRecordIdSchema,
  manifestSourceRecordRef: z.object({
    manifestId: manifestIdSchema,
    calibrationRecordId: calibrationRecordIdSchema
  }),
  labelCompletenessRecordRef: z.object({
    reportId: labelCompletenessReportIdSchema,
    calibrationRecordId: calibrationRecordIdSchema
  }),
  sourceRecordKind: z.enum(agentCalibrationSplitRecordKindValues),
  proposedFutureSplitCategory: z.enum(
    agentCalibrationSplitFutureCategoryValues
  ),
  splitAssigned: z.literal(false),
  splitReadinessStatus: z.enum(agentCalibrationSplitReadinessStatusValues),
  leakageRiskCategories: z.array(
    z.enum(agentCalibrationSplitLeakageRiskValues)
  ),
  groupingKeyCategories: z.array(
    z.enum(agentCalibrationSplitGroupingKeyValues)
  ),
  exclusionReasonCategories: z.array(
    z.enum(agentCalibrationSplitExclusionTriggerValues)
  ),
  requiredBeforeSplitCategories: z.array(
    z.enum(agentCalibrationRequiredBeforeSplitValues)
  ),
  boundaryStatus: z.enum(agentCalibrationSplitBoundaryStatusValues),
  rawRecordIncluded: z.literal(false)
});

export const splitPlanningReportSchema = z.object({
  schemaVersion: z.literal(agentCalibrationSplitPlanningSchemaVersion),
  reportId: reportIdSchema,
  source: z.enum(agentCalibrationSplitPlanningSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-13"),
    phaseName: z.literal("Calibration Dataset Construction"),
    completedBatches: z.array(z.enum(["13.1", "13.2", "13.3"])),
    currentBatch: z.literal("13.4"),
    futureBatches: z.array(z.literal("13.5")),
    previousPhaseStatus: z.literal(
      "phase-12-complete-synthetic-design-readiness-only"
    ),
    nextPhaseStatus: z.literal(
      "phase-14-offline-conformal-crc-prototype-future"
    )
  }),
  splitPolicy: z.object({
    policyId: categoryIdSchema,
    allowedFutureSplitCategories: z.array(
      z.enum(agentCalibrationSplitFutureCategoryValues)
    ),
    leakageRiskCategories: z.array(
      z.enum(agentCalibrationSplitLeakageRiskValues)
    ),
    groupingKeys: z.array(z.enum(agentCalibrationSplitGroupingKeyValues)),
    exclusionTriggerCategories: z.array(
      z.enum(agentCalibrationSplitExclusionTriggerValues)
    ),
    splitAssignmentAllowed: z.literal(false),
    realReviewedTracesRequiredForRealSplit: z.literal(true),
    syntheticExamplesCanBeAssignedToRealSplit: z.literal(false)
  }),
  evaluatedRecords: z.array(evaluatedSplitRecordSchema).min(1),
  splitReadinessSummary: z.object({
    totalEvaluatedRecords: z.number().int().min(1),
    readyForFutureSplitDesignCount: z.number().int().min(0),
    needsLabelsBeforeFutureSplitCount: z.number().int().min(0),
    needsAdjudicationBeforeFutureSplitCount: z.number().int().min(0),
    excludedFromFutureSplitCount: z.number().int().min(0),
    syntheticExampleOnlyNotRealDataCount: z.number().int().min(0),
    actualSplitAssignedCount: z.literal(0),
    realSplitReadyCount: z.literal(0)
  }),
  leakageRiskSummary: z.object({
    totalRecordsWithLeakageRisk: z.number().int().min(0),
    sameScenarioFamilyCount: z.number().int().min(0),
    sameFixtureFamilyCount: z.number().int().min(0),
    sameTraceSourceCount: z.number().int().min(0),
    sameAgentSessionFutureCount: z.literal(0),
    sameReviewerBatchFutureCount: z.literal(0),
    duplicatedOrNearDuplicateRecordCount: z.literal(0),
    sameNormalizedActionCategoryCount: z.number().int().min(0),
    sameBaselineComparisonFamilyCount: z.number().int().min(0),
    syntheticExampleOnlyCount: z.number().int().min(0),
    unresolvedSourceLinkageCount: z.literal(0),
    noLeakageRiskDetectedCount: z.number().int().min(0)
  }),
  exclusionSummary: z.object({
    totalExcludedFromFutureSplit: z.number().int().min(0),
    excludedSyntheticExampleOnlyCount: z.number().int().min(0),
    excludedMissingLabelsCount: z.number().int().min(0),
    excludedNeedsAdjudicationCount: z.number().int().min(0),
    excludedUnresolvedSourceLinkageCount: z.literal(0),
    excludedBoundaryViolationCount: z.literal(0),
    excludedRawPrivateDataCount: z.literal(0),
    excludedRawAgentOutputCount: z.literal(0),
    excludedSplitAssignmentNotAllowedCount: z.number().int().min(0)
  }),
  labelDependencySummary: z.object({
    totalRecordsDependingOnLabelCompleteness: z.number().int().min(0),
    recordsNeedingDecisionLabels: z.number().int().min(0),
    recordsNeedingUncertaintyLabels: z.number().int().min(0),
    recordsNeedingAgentBehaviorLabels: z.number().int().min(0),
    recordsNeedingOutcomeLabels: z.number().int().min(0),
    recordsNeedingFrictionLabels: z.number().int().min(0),
    recordsNeedingCoverageLabels: z.number().int().min(0),
    recordsNeedingAdjudicationResolution: z.number().int().min(0),
    realHumanReviewRequiredCount: z.number().int().min(0)
  }),
  futureSplitPlanSummary: z.object({
    futureTrainCandidateCount: z.number().int().min(0),
    futureCalibrationCandidateCount: z.number().int().min(0),
    futureTestCandidateCount: z.number().int().min(0),
    futureHoldoutCandidateCount: z.number().int().min(0),
    notEligibleCount: z.number().int().min(0),
    splitAssignmentPerformed: z.literal(false),
    splitManifestCreated: z.literal(false),
    realDatasetSplitExists: z.literal(false)
  }),
  boundarySummary: z.object({
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    rawDataBoundaryViolationCount: z.literal(0),
    splitBoundaryViolationCount: z.literal(0),
    calibrationBoundaryViolationCount: z.literal(0),
    conformalBoundaryViolationCount: z.literal(0),
    runtimeBoundaryViolationCount: z.literal(0)
  }),
  metrics: z.object({
    totalEvaluatedRecords: z.number().int().min(1),
    syntheticSchemaExampleCount: z.number().int().min(1),
    futureControlledTraceCount: z.literal(0),
    futureRealTrialTraceCount: z.literal(0),
    realReviewedTraceCount: z.literal(0),
    actualSplitAssignedCount: z.literal(0),
    realSplitReadyCount: z.literal(0),
    splitManifestCreatedCount: z.literal(0),
    realDatasetSplitCount: z.literal(0),
    leakageRiskCategoryCount: z.number().int().min(0),
    excludedFromFutureSplitCount: z.number().int().min(0),
    calibrationDatasetCreatedCount: z.literal(0),
    calibrationAppliedCount: z.literal(0),
    thresholdComputedCount: z.literal(0),
    conformalImplementationCount: z.literal(0)
  }),
  safety: splitPlanningSafetySchema,
  privacy: splitPlanningPrivacySchema,
  claimBoundaries: splitPlanningClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type SplitPlanningReport = z.infer<typeof splitPlanningReportSchema>;
export type SplitPlanningEvaluatedRecord = z.infer<
  typeof evaluatedSplitRecordSchema
>;

export const validateSplitPlanningReport = (
  report: unknown
): SplitPlanningReport => splitPlanningReportSchema.parse(report);

export const validateSplitPlanningReports = (
  reports: unknown[]
): SplitPlanningReport[] =>
  reports
    .map(validateSplitPlanningReport)
    .sort((left, right) => left.reportId.localeCompare(right.reportId));

const labelRecordByCalibrationId = (
  report: LabelCompletenessReport,
  calibrationRecordId: string
): LabelCompletenessEvaluatedRecord => {
  const record = report.evaluatedRecords.find(
    (candidate) => candidate.calibrationRecordId === calibrationRecordId
  );

  if (record === undefined) {
    throw new Error(
      `Missing label completeness record: ${calibrationRecordId}`
    );
  }

  return record;
};

export const detectSyntheticLeakageRisks = (
  record: CalibrationRecord,
  allRecords: CalibrationRecord[]
): SplitPlanningEvaluatedRecord["leakageRiskCategories"] => {
  const risks: SplitPlanningEvaluatedRecord["leakageRiskCategories"] = [
    "synthetic_example_only"
  ];
  const duplicateActionCategoryCount = allRecords.filter(
    (candidate) =>
      candidate.decisionContext.actionCategory ===
      record.decisionContext.actionCategory
  ).length;

  if (record.sourceArtifact.traceId !== undefined) {
    risks.push("same_trace_source");
  }

  if (record.sourceArtifact.fixtureRefs.length > 0) {
    risks.push("same_fixture_family");
  }

  if (record.sourceArtifact.baselineComparisonId !== undefined) {
    risks.push("same_baseline_comparison_family");
  }

  if (duplicateActionCategoryCount > 1) {
    risks.push("same_normalized_action_category");
  }

  return [...new Set(risks)].sort();
};

const groupingKeysForRecord = (
  record: CalibrationRecord
): SplitPlanningEvaluatedRecord["groupingKeyCategories"] => {
  const groupingKeys: SplitPlanningEvaluatedRecord["groupingKeyCategories"] = [
    "scenario_family",
    "fixture_family",
    "action_category",
    "uncertainty_dimension",
    "decision_category",
    "review_label_family"
  ];

  if (record.sourceArtifact.traceId !== undefined) {
    groupingKeys.push("trace_source");
  }

  if (record.sourceArtifact.baselineComparisonId !== undefined) {
    groupingKeys.push("baseline_comparison_family");
  }

  return [...new Set(groupingKeys)].sort();
};

const evaluatedSplitRecordFromCalibrationRecord = (
  record: CalibrationRecord,
  manifest: CalibrationManifest,
  labelCompletenessReport: LabelCompletenessReport,
  allRecords: CalibrationRecord[]
): SplitPlanningEvaluatedRecord => {
  const manifestRecord = manifest.sourceRecords.find(
    (candidate) => candidate.calibrationRecordId === record.calibrationRecordId
  );

  if (manifestRecord === undefined) {
    throw new Error(`Missing manifest record: ${record.calibrationRecordId}`);
  }

  const labelRecord = labelRecordByCalibrationId(
    labelCompletenessReport,
    record.calibrationRecordId
  );
  const requiresLabels =
    labelRecord.readinessStatus ===
    "needs_additional_labels_before_future_dataset_use";
  const requiresAdjudication =
    labelRecord.readinessStatus ===
      "needs_adjudication_before_future_dataset_use" ||
    labelRecord.adjudicationStatus === "needs_adjudication";
  const splitReadinessStatus: SplitPlanningEvaluatedRecord["splitReadinessStatus"] =
    requiresLabels
      ? "needs_labels_before_future_split"
      : requiresAdjudication
        ? "needs_adjudication_before_future_split"
        : "synthetic_example_only_not_real_data";
  const exclusionReasonCategories: SplitPlanningEvaluatedRecord["exclusionReasonCategories"] =
    [
      "synthetic_example_only_not_real_data",
      "split_assignment_not_allowed",
      "real_review_required",
      "future_trace_required"
    ];
  const requiredBeforeSplitCategories: SplitPlanningEvaluatedRecord["requiredBeforeSplitCategories"] =
    [
      "real_reviewed_trace_required",
      "real_human_review_required",
      "privacy_boundary_clearance_required",
      "safety_boundary_clearance_required",
      "claim_boundary_clearance_required",
      "calibration_dataset_approval_required",
      "future_split_policy_approval_required"
    ];

  if (requiresLabels) {
    exclusionReasonCategories.push("missing_required_labels");
    requiredBeforeSplitCategories.push("complete_required_label_groups");
  }

  if (requiresAdjudication) {
    exclusionReasonCategories.push("needs_adjudication");
    requiredBeforeSplitCategories.push("adjudication_required");
  }

  return {
    calibrationRecordId: record.calibrationRecordId,
    manifestSourceRecordRef: {
      manifestId: manifest.manifestId,
      calibrationRecordId: manifestRecord.calibrationRecordId
    },
    labelCompletenessRecordRef: {
      reportId: labelCompletenessReport.reportId,
      calibrationRecordId: labelRecord.calibrationRecordId
    },
    sourceRecordKind: "synthetic_schema_example",
    proposedFutureSplitCategory: "not_eligible",
    splitAssigned: false,
    splitReadinessStatus,
    leakageRiskCategories: detectSyntheticLeakageRisks(record, allRecords),
    groupingKeyCategories: groupingKeysForRecord(record),
    exclusionReasonCategories: [...new Set(exclusionReasonCategories)].sort(),
    requiredBeforeSplitCategories: [
      ...new Set(requiredBeforeSplitCategories)
    ].sort(),
    boundaryStatus: "boundary_safe",
    rawRecordIncluded: false
  };
};

const countByReadiness = (
  records: SplitPlanningEvaluatedRecord[],
  status: SplitPlanningEvaluatedRecord["splitReadinessStatus"]
): number =>
  records.filter((record) => record.splitReadinessStatus === status).length;

const countByLeakageRisk = (
  records: SplitPlanningEvaluatedRecord[],
  risk: SplitPlanningEvaluatedRecord["leakageRiskCategories"][number]
): number =>
  records.filter((record) => record.leakageRiskCategories.includes(risk))
    .length;

const countByExclusionReason = (
  records: SplitPlanningEvaluatedRecord[],
  reason: SplitPlanningEvaluatedRecord["exclusionReasonCategories"][number]
): number =>
  records.filter((record) => record.exclusionReasonCategories.includes(reason))
    .length;

export const summarizeFutureSplitReadiness = (
  records: SplitPlanningEvaluatedRecord[]
): SplitPlanningReport["splitReadinessSummary"] => ({
  totalEvaluatedRecords: records.length,
  readyForFutureSplitDesignCount: countByReadiness(
    records,
    "ready_for_future_split_design"
  ),
  needsLabelsBeforeFutureSplitCount: countByReadiness(
    records,
    "needs_labels_before_future_split"
  ),
  needsAdjudicationBeforeFutureSplitCount: countByReadiness(
    records,
    "needs_adjudication_before_future_split"
  ),
  excludedFromFutureSplitCount: countByReadiness(
    records,
    "excluded_from_future_split"
  ),
  syntheticExampleOnlyNotRealDataCount: countByReadiness(
    records,
    "synthetic_example_only_not_real_data"
  ),
  actualSplitAssignedCount: 0,
  realSplitReadyCount: 0
});

export const buildSyntheticSplitPlanningReport = (input: {
  reportId: string;
  records: CalibrationRecord[];
  manifest: CalibrationManifest;
  labelCompletenessReport: LabelCompletenessReport;
}): SplitPlanningReport => {
  const records = validateCalibrationRecords(input.records);
  const manifest = validateCalibrationManifest(input.manifest);
  const labelCompletenessReport = validateLabelCompletenessReport(
    input.labelCompletenessReport
  );
  const evaluatedRecords = records.map((record) =>
    evaluatedSplitRecordFromCalibrationRecord(
      record,
      manifest,
      labelCompletenessReport,
      records
    )
  );
  const totalEvaluatedRecords = evaluatedRecords.length;
  const totalRecordsWithLeakageRisk = evaluatedRecords.filter(
    (record) =>
      !record.leakageRiskCategories.includes("no_leakage_risk_detected")
  ).length;
  const uniqueLeakageRiskCategoryCount = new Set(
    evaluatedRecords.flatMap((record) => record.leakageRiskCategories)
  ).size;

  return validateSplitPlanningReport({
    schemaVersion: agentCalibrationSplitPlanningSchemaVersion,
    reportId: input.reportId,
    source: "synthetic_schema_split_planning_report",
    phase: {
      phaseId: "phase-13",
      phaseName: "Calibration Dataset Construction",
      completedBatches: ["13.1", "13.2", "13.3"],
      currentBatch: "13.4",
      futureBatches: ["13.5"],
      previousPhaseStatus: "phase-12-complete-synthetic-design-readiness-only",
      nextPhaseStatus: "phase-14-offline-conformal-crc-prototype-future"
    },
    splitPolicy: {
      policyId: "synthetic_split_planning_policy",
      allowedFutureSplitCategories: [
        ...agentCalibrationSplitFutureCategoryValues
      ],
      leakageRiskCategories: [...agentCalibrationSplitLeakageRiskValues],
      groupingKeys: [...agentCalibrationSplitGroupingKeyValues],
      exclusionTriggerCategories: [
        ...agentCalibrationSplitExclusionTriggerValues
      ],
      splitAssignmentAllowed: false,
      realReviewedTracesRequiredForRealSplit: true,
      syntheticExamplesCanBeAssignedToRealSplit: false
    },
    evaluatedRecords,
    splitReadinessSummary: summarizeFutureSplitReadiness(evaluatedRecords),
    leakageRiskSummary: {
      totalRecordsWithLeakageRisk,
      sameScenarioFamilyCount: countByLeakageRisk(
        evaluatedRecords,
        "same_scenario_family"
      ),
      sameFixtureFamilyCount: countByLeakageRisk(
        evaluatedRecords,
        "same_fixture_family"
      ),
      sameTraceSourceCount: countByLeakageRisk(
        evaluatedRecords,
        "same_trace_source"
      ),
      sameAgentSessionFutureCount: 0,
      sameReviewerBatchFutureCount: 0,
      duplicatedOrNearDuplicateRecordCount: 0,
      sameNormalizedActionCategoryCount: countByLeakageRisk(
        evaluatedRecords,
        "same_normalized_action_category"
      ),
      sameBaselineComparisonFamilyCount: countByLeakageRisk(
        evaluatedRecords,
        "same_baseline_comparison_family"
      ),
      syntheticExampleOnlyCount: countByLeakageRisk(
        evaluatedRecords,
        "synthetic_example_only"
      ),
      unresolvedSourceLinkageCount: 0,
      noLeakageRiskDetectedCount: countByLeakageRisk(
        evaluatedRecords,
        "no_leakage_risk_detected"
      )
    },
    exclusionSummary: {
      totalExcludedFromFutureSplit: totalEvaluatedRecords,
      excludedSyntheticExampleOnlyCount: countByExclusionReason(
        evaluatedRecords,
        "synthetic_example_only_not_real_data"
      ),
      excludedMissingLabelsCount: countByExclusionReason(
        evaluatedRecords,
        "missing_required_labels"
      ),
      excludedNeedsAdjudicationCount: countByExclusionReason(
        evaluatedRecords,
        "needs_adjudication"
      ),
      excludedUnresolvedSourceLinkageCount: 0,
      excludedBoundaryViolationCount: 0,
      excludedRawPrivateDataCount: 0,
      excludedRawAgentOutputCount: 0,
      excludedSplitAssignmentNotAllowedCount: countByExclusionReason(
        evaluatedRecords,
        "split_assignment_not_allowed"
      )
    },
    labelDependencySummary: {
      totalRecordsDependingOnLabelCompleteness: totalEvaluatedRecords,
      recordsNeedingDecisionLabels:
        labelCompletenessReport.missingLabelSummary.missingDecisionLabelsCount,
      recordsNeedingUncertaintyLabels:
        labelCompletenessReport.missingLabelSummary
          .missingUncertaintyLabelsCount,
      recordsNeedingAgentBehaviorLabels:
        labelCompletenessReport.missingLabelSummary
          .missingAgentBehaviorLabelsCount,
      recordsNeedingOutcomeLabels:
        labelCompletenessReport.missingLabelSummary.missingOutcomeLabelsCount,
      recordsNeedingFrictionLabels:
        labelCompletenessReport.missingLabelSummary.missingFrictionLabelsCount,
      recordsNeedingCoverageLabels:
        labelCompletenessReport.missingLabelSummary.missingCoverageLabelsCount,
      recordsNeedingAdjudicationResolution:
        labelCompletenessReport.adjudicationSummary
          .totalRecordsNeedingAdjudication,
      realHumanReviewRequiredCount:
        labelCompletenessReport.adjudicationSummary
          .futureHumanReviewRequiredCount
    },
    futureSplitPlanSummary: {
      futureTrainCandidateCount: 0,
      futureCalibrationCandidateCount: 0,
      futureTestCandidateCount: 0,
      futureHoldoutCandidateCount: 0,
      notEligibleCount: totalEvaluatedRecords,
      splitAssignmentPerformed: false,
      splitManifestCreated: false,
      realDatasetSplitExists: false
    },
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      splitBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    metrics: {
      totalEvaluatedRecords,
      syntheticSchemaExampleCount: totalEvaluatedRecords,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realReviewedTraceCount: 0,
      actualSplitAssignedCount: 0,
      realSplitReadyCount: 0,
      splitManifestCreatedCount: 0,
      realDatasetSplitCount: 0,
      leakageRiskCategoryCount: uniqueLeakageRiskCategoryCount,
      excludedFromFutureSplitCount: totalEvaluatedRecords,
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
      createsSplitManifest: false,
      computesThresholds: false,
      performsAdjudication: false,
      assignsReviewers: false
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
      rawAdjudicationDataIncluded: false,
      rawSplitDataIncluded: false,
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
      realSplitPlanningReport: false,
      realCalibrationManifest: false,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realHumanAdjudication: false,
      realReviewerAssigned: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      datasetSplitsAssigned: false,
      splitManifestCreated: false,
      thresholdsComputed: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "synthetic_split_planning_report",
      "no_real_splits_assigned",
      "no_split_manifest_created",
      "not_real_calibration_data"
    ]
  });
};

export const summarizeSplitPlanningReport = (
  report: SplitPlanningReport
): {
  reportId: string;
  totalEvaluatedRecords: number;
  actualSplitAssignedCount: 0;
  realSplitReadyCount: 0;
  splitManifestCreated: false;
} => ({
  reportId: report.reportId,
  totalEvaluatedRecords: report.metrics.totalEvaluatedRecords,
  actualSplitAssignedCount: report.metrics.actualSplitAssignedCount,
  realSplitReadyCount: report.metrics.realSplitReadyCount,
  splitManifestCreated: report.futureSplitPlanSummary.splitManifestCreated
});

export const computeSplitPlanningMetrics = (
  report: SplitPlanningReport
): SplitPlanningReport["metrics"] => report.metrics;

export const validateSplitPlanningBoundaries = (
  report: SplitPlanningReport
): void => {
  if (
    report.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    report.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    report.boundarySummary.claimBoundaryViolationCount !== 0 ||
    report.boundarySummary.rawDataBoundaryViolationCount !== 0 ||
    report.boundarySummary.splitBoundaryViolationCount !== 0 ||
    report.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    report.boundarySummary.conformalBoundaryViolationCount !== 0 ||
    report.boundarySummary.runtimeBoundaryViolationCount !== 0
  ) {
    throw new Error(`Split planning boundary violation: ${report.reportId}`);
  }
};

const forbiddenSplitPlanningPatterns = [
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

export const splitPlanningContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenSplitPlanningPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};

export const validateSplitPlanningSafety = (
  report: SplitPlanningReport
): void => {
  if (splitPlanningContainsForbiddenRawString(report)) {
    throw new Error(
      `Split planning report contains forbidden raw-looking value: ${report.reportId}`
    );
  }
};
