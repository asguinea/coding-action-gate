import { z } from "zod";
import {
  type CalibrationManifest,
  type CalibrationManifestSourceRecord,
  validateCalibrationManifest
} from "./calibrationManifestSchema.js";
import {
  type CalibrationRecord,
  validateCalibrationRecords
} from "./calibrationDatasetSchema.js";

export const agentCalibrationLabelCompletenessSchemaVersion =
  "agent-calibration-label-completeness-report.v1" as const;

export const agentCalibrationLabelCompletenessSourceValues = [
  "synthetic_schema_label_completeness_report",
  "future_controlled_agent_trace_label_completeness_report",
  "future_real_trial_trace_label_completeness_report"
] as const;

export const agentCalibrationLabelGroupValues = [
  "decision_labels",
  "uncertainty_labels",
  "agent_behavior_labels",
  "outcome_labels",
  "friction_labels",
  "coverage_labels",
  "future_loss_label_candidates",
  "source_artifact_linkage",
  "safety_privacy_flags",
  "claim_boundary_flags"
] as const;

export const agentCalibrationOptionalLabelGroupValues = [
  "notes_categories",
  "future_split_metadata",
  "reviewer_confidence_categories"
] as const;

export const agentCalibrationAdjudicationTriggerValues = [
  "conflicting_decision_labels",
  "low_review_confidence",
  "missing_required_label_group",
  "inconsistent_agent_behavior_label",
  "safety_outcome_unclear",
  "friction_justification_unclear",
  "coverage_gap_unclear",
  "source_linkage_unclear",
  "boundary_status_unclear"
] as const;

export const agentCalibrationExclusionTriggerValues = [
  "privacy_boundary_violation",
  "safety_boundary_violation",
  "claim_boundary_violation",
  "raw_private_data_present",
  "raw_agent_output_present",
  "unresolved_source_linkage",
  "unresolved_adjudication",
  "synthetic_example_treated_as_real_calibration_data",
  "aborted_pilot_ineligible_future"
] as const;

export const agentCalibrationEvaluatedRecordKindValues = [
  "synthetic_schema_example",
  "future_controlled_reviewed_trace",
  "future_real_trial_reviewed_trace"
] as const;

export const agentCalibrationCompletenessStatusValues = [
  "complete_for_future_dataset_design",
  "incomplete_missing_required_labels",
  "complete_but_synthetic_only",
  "needs_adjudication",
  "excluded_due_to_conflict",
  "excluded_due_to_boundary_violation",
  "synthetic_example_only"
] as const;

export const agentCalibrationRequiredLabelGroupStatusValues = [
  "present",
  "missing",
  "incomplete",
  "conflicting",
  "not_applicable_for_synthetic_example"
] as const;

export const agentCalibrationConflictCategoryValues = [
  "no_conflict_detected",
  "decision_label_conflict",
  "advisory_uncertainty_conflict",
  "defer_quality_conflict",
  "escalation_quality_conflict",
  "block_quality_conflict",
  "agent_behavior_conflict",
  "outcome_label_conflict",
  "friction_label_conflict",
  "coverage_label_conflict",
  "source_linkage_conflict",
  "boundary_flag_conflict"
] as const;

export const agentCalibrationAdjudicationStatusValues = [
  "not_required_for_synthetic_example",
  "required_before_future_calibration_use",
  "needs_adjudication",
  "adjudication_blocked",
  "adjudication_not_performed"
] as const;

export const agentCalibrationAdjudicationReasonValues = [
  "no_adjudication_needed_for_synthetic_example",
  "missing_required_label_group",
  "conflicting_label_group",
  "low_confidence_future_review",
  "unclear_agent_behavior",
  "unclear_safety_outcome",
  "unclear_friction_justification",
  "unclear_coverage_gap",
  "unclear_source_linkage",
  "boundary_status_unclear",
  "future_human_review_required"
] as const;

export const agentCalibrationExclusionStatusValues = [
  "not_excluded_for_synthetic_planning",
  "excluded_synthetic_only",
  "excluded_missing_required_labels",
  "excluded_unresolved_adjudication",
  "excluded_due_to_conflict",
  "excluded_due_to_boundary_violation"
] as const;

export const agentCalibrationReadinessStatusValues = [
  "ready_for_future_manifest_planning",
  "needs_additional_labels_before_future_dataset_use",
  "needs_adjudication_before_future_dataset_use",
  "excluded_from_future_dataset_use",
  "synthetic_example_only_not_real_data"
] as const;

export const agentCalibrationBoundaryStatusValues = [
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

const requiredLabelGroupStatusSchema = z.object({
  decision_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  uncertainty_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  agent_behavior_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  outcome_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  friction_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  coverage_labels: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  future_loss_label_candidates: z.enum(
    agentCalibrationRequiredLabelGroupStatusValues
  ),
  source_artifact_linkage: z.enum(
    agentCalibrationRequiredLabelGroupStatusValues
  ),
  safety_privacy_flags: z.enum(agentCalibrationRequiredLabelGroupStatusValues),
  claim_boundary_flags: z.enum(agentCalibrationRequiredLabelGroupStatusValues)
});

export const labelCompletenessSafetySchema = z.object({
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
  computesThresholds: z.literal(false),
  performsAdjudication: z.literal(false),
  assignsReviewers: z.literal(false)
});

export const labelCompletenessPrivacySchema = z.object({
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
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const labelCompletenessClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realLabelCompletenessReport: z.literal(false),
  realCalibrationManifest: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realHumanAdjudication: z.literal(false),
  realReviewerAssigned: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
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

const evaluatedRecordSchema = z.object({
  calibrationRecordId: calibrationRecordIdSchema,
  manifestSourceRecordRef: z.object({
    manifestId: manifestIdSchema,
    calibrationRecordId: calibrationRecordIdSchema
  }),
  sourceRecordKind: z.enum(agentCalibrationEvaluatedRecordKindValues),
  completenessStatus: z.enum(agentCalibrationCompletenessStatusValues),
  requiredLabelGroupStatus: requiredLabelGroupStatusSchema,
  missingLabelGroups: z.array(z.enum(agentCalibrationLabelGroupValues)),
  conflictCategories: z.array(z.enum(agentCalibrationConflictCategoryValues)),
  adjudicationStatus: z.enum(agentCalibrationAdjudicationStatusValues),
  adjudicationReasonCategories: z.array(
    z.enum(agentCalibrationAdjudicationReasonValues)
  ),
  exclusionStatus: z.enum(agentCalibrationExclusionStatusValues),
  exclusionReasonCategories: z.array(
    z.enum(agentCalibrationExclusionTriggerValues)
  ),
  readinessStatus: z.enum(agentCalibrationReadinessStatusValues),
  boundaryStatus: z.enum(agentCalibrationBoundaryStatusValues),
  rawRecordIncluded: z.literal(false),
  realHumanAdjudicationPerformed: z.literal(false)
});

export const labelCompletenessReportSchema = z.object({
  schemaVersion: z.literal(agentCalibrationLabelCompletenessSchemaVersion),
  reportId: reportIdSchema,
  source: z.enum(agentCalibrationLabelCompletenessSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-13"),
    phaseName: z.literal("Calibration Dataset Construction"),
    completedBatches: z.array(z.enum(["13.1", "13.2"])),
    currentBatch: z.literal("13.3"),
    futureBatches: z.array(z.enum(["13.4", "13.5"])),
    previousPhaseStatus: z.literal(
      "phase-12-complete-synthetic-design-readiness-only"
    ),
    nextPhaseStatus: z.literal(
      "phase-14-offline-conformal-crc-prototype-future"
    )
  }),
  evaluatedRecords: z.array(evaluatedRecordSchema).min(1),
  completenessPolicy: z.object({
    policyId: categoryIdSchema,
    requiredLabelGroups: z.array(z.enum(agentCalibrationLabelGroupValues)),
    optionalLabelGroups: z.array(
      z.enum(agentCalibrationOptionalLabelGroupValues)
    ),
    adjudicationTriggerCategories: z.array(
      z.enum(agentCalibrationAdjudicationTriggerValues)
    ),
    exclusionTriggerCategories: z.array(
      z.enum(agentCalibrationExclusionTriggerValues)
    ),
    boundaryRequired: z.literal(true),
    realHumanReviewRequiredForRealCalibration: z.literal(true),
    syntheticExamplesCanSatisfyRealCalibration: z.literal(false)
  }),
  completenessSummary: z.object({
    totalEvaluatedRecords: z.number().int().min(1),
    completeForFutureDatasetDesignCount: z.number().int().min(0),
    completeButSyntheticOnlyCount: z.number().int().min(0),
    missingRequiredLabelsCount: z.number().int().min(0),
    needsAdjudicationCount: z.number().int().min(0),
    excludedDueToConflictCount: z.number().int().min(0),
    excludedDueToBoundaryViolationCount: z.literal(0),
    syntheticExampleOnlyCount: z.number().int().min(0),
    realHumanAdjudicatedRecordCount: z.literal(0)
  }),
  missingLabelSummary: z.object({
    totalRecordsWithMissingLabels: z.number().int().min(0),
    missingDecisionLabelsCount: z.number().int().min(0),
    missingUncertaintyLabelsCount: z.number().int().min(0),
    missingAgentBehaviorLabelsCount: z.number().int().min(0),
    missingOutcomeLabelsCount: z.number().int().min(0),
    missingFrictionLabelsCount: z.number().int().min(0),
    missingCoverageLabelsCount: z.number().int().min(0),
    missingFutureLossLabelCandidatesCount: z.number().int().min(0),
    missingSourceLinkageCount: z.number().int().min(0),
    missingBoundaryFlagsCount: z.literal(0)
  }),
  conflictSummary: z.object({
    totalRecordsWithConflicts: z.number().int().min(0),
    decisionLabelConflictCount: z.number().int().min(0),
    uncertaintyLabelConflictCount: z.number().int().min(0),
    agentBehaviorConflictCount: z.number().int().min(0),
    outcomeLabelConflictCount: z.number().int().min(0),
    frictionLabelConflictCount: z.number().int().min(0),
    coverageLabelConflictCount: z.number().int().min(0),
    sourceLinkageConflictCount: z.number().int().min(0),
    boundaryFlagConflictCount: z.literal(0)
  }),
  adjudicationSummary: z.object({
    totalRecordsNeedingAdjudication: z.number().int().min(0),
    totalRecordsAdjudicated: z.literal(0),
    futureHumanReviewRequiredCount: z.number().int().min(0),
    adjudicationBlockedCount: z.number().int().min(0),
    adjudicationNotPerformedCount: z.number().int().min(0),
    realReviewerAssignedCount: z.literal(0)
  }),
  exclusionSummary: z.object({
    totalExcludedRecords: z.number().int().min(0),
    excludedSyntheticOnlyCount: z.number().int().min(0),
    excludedBoundaryViolationCount: z.literal(0),
    excludedConflictCount: z.number().int().min(0),
    excludedUnresolvedAdjudicationCount: z.number().int().min(0),
    excludedRawPrivateDataCount: z.literal(0),
    excludedRawAgentOutputCount: z.literal(0),
    excludedUnresolvedSourceLinkageCount: z.number().int().min(0)
  }),
  readinessSummary: z.object({
    readyForFutureManifestPlanningCount: z.number().int().min(0),
    needsAdditionalLabelsBeforeFutureDatasetUseCount: z.number().int().min(0),
    needsAdjudicationBeforeFutureDatasetUseCount: z.number().int().min(0),
    excludedFromFutureDatasetUseCount: z.number().int().min(0),
    syntheticExampleOnlyNotRealDataCount: z.number().int().min(0),
    realCalibrationReadyCount: z.literal(0)
  }),
  boundarySummary: z.object({
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    rawDataBoundaryViolationCount: z.literal(0),
    calibrationBoundaryViolationCount: z.literal(0),
    adjudicationBoundaryViolationCount: z.literal(0),
    runtimeBoundaryViolationCount: z.literal(0)
  }),
  metrics: z.object({
    totalEvaluatedRecords: z.number().int().min(1),
    syntheticSchemaExampleCount: z.number().int().min(1),
    futureControlledTraceCount: z.literal(0),
    futureRealTrialTraceCount: z.literal(0),
    realReviewedTraceCount: z.literal(0),
    realHumanAdjudicatedRecordCount: z.literal(0),
    realCalibrationReadyCount: z.literal(0),
    missingRequiredLabelsCount: z.number().int().min(0),
    needsAdjudicationCount: z.number().int().min(0),
    unresolvedConflictCount: z.number().int().min(0),
    boundaryViolationCount: z.literal(0),
    calibrationDatasetCreatedCount: z.literal(0),
    calibrationAppliedCount: z.literal(0),
    thresholdComputedCount: z.literal(0),
    conformalImplementationCount: z.literal(0)
  }),
  safety: labelCompletenessSafetySchema,
  privacy: labelCompletenessPrivacySchema,
  claimBoundaries: labelCompletenessClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type LabelCompletenessReport = z.infer<
  typeof labelCompletenessReportSchema
>;
export type LabelCompletenessEvaluatedRecord = z.infer<
  typeof evaluatedRecordSchema
>;
export type LabelCompletenessRequiredLabelGroupStatus = z.infer<
  typeof requiredLabelGroupStatusSchema
>;

export const validateLabelCompletenessReport = (
  report: unknown
): LabelCompletenessReport => labelCompletenessReportSchema.parse(report);

export const validateLabelCompletenessReports = (
  reports: unknown[]
): LabelCompletenessReport[] =>
  reports
    .map(validateLabelCompletenessReport)
    .sort((left, right) => left.reportId.localeCompare(right.reportId));

const presentLabelGroups = (): LabelCompletenessRequiredLabelGroupStatus =>
  Object.fromEntries(
    agentCalibrationLabelGroupValues.map((labelGroup) => [
      labelGroup,
      "present"
    ])
  ) as LabelCompletenessRequiredLabelGroupStatus;

export const detectMissingLabelGroups = (
  groupStatus: LabelCompletenessRequiredLabelGroupStatus
): LabelCompletenessEvaluatedRecord["missingLabelGroups"] =>
  agentCalibrationLabelGroupValues.filter((labelGroup) =>
    ["missing", "incomplete"].includes(groupStatus[labelGroup])
  );

export const detectSyntheticLabelConflicts = (
  groupStatus: LabelCompletenessRequiredLabelGroupStatus
): LabelCompletenessEvaluatedRecord["conflictCategories"] => {
  const conflicts: LabelCompletenessEvaluatedRecord["conflictCategories"] = [];

  if (groupStatus.decision_labels === "conflicting") {
    conflicts.push("decision_label_conflict");
  }

  if (groupStatus.uncertainty_labels === "conflicting") {
    conflicts.push("advisory_uncertainty_conflict");
  }

  if (groupStatus.agent_behavior_labels === "conflicting") {
    conflicts.push("agent_behavior_conflict");
  }

  if (groupStatus.outcome_labels === "conflicting") {
    conflicts.push("outcome_label_conflict");
  }

  if (groupStatus.friction_labels === "conflicting") {
    conflicts.push("friction_label_conflict");
  }

  if (groupStatus.coverage_labels === "conflicting") {
    conflicts.push("coverage_label_conflict");
  }

  if (groupStatus.source_artifact_linkage === "conflicting") {
    conflicts.push("source_linkage_conflict");
  }

  if (
    groupStatus.safety_privacy_flags === "conflicting" ||
    groupStatus.claim_boundary_flags === "conflicting"
  ) {
    conflicts.push("boundary_flag_conflict");
  }

  return conflicts.length > 0 ? conflicts.sort() : ["no_conflict_detected"];
};

const sourceRecordByCalibrationId = (
  manifest: CalibrationManifest,
  calibrationRecordId: string
): CalibrationManifestSourceRecord => {
  const sourceRecord = manifest.sourceRecords.find(
    (candidate) => candidate.calibrationRecordId === calibrationRecordId
  );

  if (sourceRecord === undefined) {
    throw new Error(`Missing manifest source record: ${calibrationRecordId}`);
  }

  return sourceRecord;
};

const statusForRecord = (
  record: CalibrationRecord
): LabelCompletenessRequiredLabelGroupStatus => {
  const status = presentLabelGroups();

  switch (record.calibrationRecordId) {
    case "calibration-synthetic-ambiguous-deploy-policy-miss-001":
      status.decision_labels = "incomplete";
      status.agent_behavior_labels = "incomplete";
      break;
    case "calibration-synthetic-broad-refactor-coverage-gap-001":
      status.coverage_labels = "conflicting";
      status.outcome_labels = "incomplete";
      break;
    default:
      break;
  }

  return status;
};

const evaluatedRecordFromCalibrationRecord = (
  record: CalibrationRecord,
  manifest: CalibrationManifest
): LabelCompletenessEvaluatedRecord => {
  const sourceRecord = sourceRecordByCalibrationId(
    manifest,
    record.calibrationRecordId
  );
  const requiredLabelGroupStatus = statusForRecord(record);
  const missingLabelGroups = detectMissingLabelGroups(requiredLabelGroupStatus);
  const conflictCategories = detectSyntheticLabelConflicts(
    requiredLabelGroupStatus
  );
  const hasConflict = !conflictCategories.includes("no_conflict_detected");
  const needsAdjudication =
    record.calibrationEligibility.adjudicationRequired === "yes" || hasConflict;

  const completenessStatus: LabelCompletenessEvaluatedRecord["completenessStatus"] =
    missingLabelGroups.length > 0
      ? "incomplete_missing_required_labels"
      : needsAdjudication
        ? "needs_adjudication"
        : "complete_but_synthetic_only";

  const adjudicationReasonCategories: LabelCompletenessEvaluatedRecord["adjudicationReasonCategories"] =
    [];

  if (missingLabelGroups.length > 0) {
    adjudicationReasonCategories.push("missing_required_label_group");
  }

  if (hasConflict) {
    adjudicationReasonCategories.push("conflicting_label_group");
  }

  if (needsAdjudication) {
    adjudicationReasonCategories.push(
      "future_human_review_required",
      "low_confidence_future_review"
    );
  }

  if (
    record.calibrationRecordId ===
    "calibration-synthetic-broad-refactor-coverage-gap-001"
  ) {
    adjudicationReasonCategories.push("unclear_coverage_gap");
  }

  if (
    record.calibrationRecordId ===
    "calibration-synthetic-ambiguous-deploy-policy-miss-001"
  ) {
    adjudicationReasonCategories.push("unclear_agent_behavior");
  }

  if (adjudicationReasonCategories.length === 0) {
    adjudicationReasonCategories.push(
      "no_adjudication_needed_for_synthetic_example"
    );
  }

  const exclusionReasonCategories: LabelCompletenessEvaluatedRecord["exclusionReasonCategories"] =
    ["synthetic_example_treated_as_real_calibration_data"];

  if (missingLabelGroups.length > 0) {
    exclusionReasonCategories.push("unresolved_adjudication");
  }

  if (needsAdjudication) {
    exclusionReasonCategories.push("unresolved_adjudication");
  }

  return {
    calibrationRecordId: record.calibrationRecordId,
    manifestSourceRecordRef: {
      manifestId: manifest.manifestId,
      calibrationRecordId: sourceRecord.calibrationRecordId
    },
    sourceRecordKind: "synthetic_schema_example",
    completenessStatus,
    requiredLabelGroupStatus,
    missingLabelGroups,
    conflictCategories,
    adjudicationStatus: needsAdjudication
      ? "needs_adjudication"
      : "not_required_for_synthetic_example",
    adjudicationReasonCategories: [
      ...new Set(adjudicationReasonCategories)
    ].sort(),
    exclusionStatus: "excluded_synthetic_only",
    exclusionReasonCategories: [...new Set(exclusionReasonCategories)].sort(),
    readinessStatus:
      missingLabelGroups.length > 0
        ? "needs_additional_labels_before_future_dataset_use"
        : needsAdjudication
          ? "needs_adjudication_before_future_dataset_use"
          : "synthetic_example_only_not_real_data",
    boundaryStatus: "boundary_safe",
    rawRecordIncluded: false,
    realHumanAdjudicationPerformed: false
  };
};

const countByCompletenessStatus = (
  records: LabelCompletenessEvaluatedRecord[],
  completenessStatus: LabelCompletenessEvaluatedRecord["completenessStatus"]
): number =>
  records.filter((record) => record.completenessStatus === completenessStatus)
    .length;

const countByReadinessStatus = (
  records: LabelCompletenessEvaluatedRecord[],
  readinessStatus: LabelCompletenessEvaluatedRecord["readinessStatus"]
): number =>
  records.filter((record) => record.readinessStatus === readinessStatus).length;

const countMissingGroup = (
  records: LabelCompletenessEvaluatedRecord[],
  group: (typeof agentCalibrationLabelGroupValues)[number]
): number =>
  records.filter((record) => record.missingLabelGroups.includes(group)).length;

const countConflict = (
  records: LabelCompletenessEvaluatedRecord[],
  conflict: LabelCompletenessEvaluatedRecord["conflictCategories"][number]
): number =>
  records.filter((record) => record.conflictCategories.includes(conflict))
    .length;

export const buildSyntheticLabelCompletenessReport = (input: {
  reportId: string;
  records: CalibrationRecord[];
  manifest: CalibrationManifest;
}): LabelCompletenessReport => {
  const records = validateCalibrationRecords(input.records);
  const manifest = validateCalibrationManifest(input.manifest);
  const evaluatedRecords = records.map((record) =>
    evaluatedRecordFromCalibrationRecord(record, manifest)
  );
  const totalEvaluatedRecords = evaluatedRecords.length;
  const missingRequiredLabelsCount = evaluatedRecords.filter(
    (record) => record.missingLabelGroups.length > 0
  ).length;
  const needsAdjudicationCount = evaluatedRecords.filter(
    (record) => record.adjudicationStatus === "needs_adjudication"
  ).length;
  const totalRecordsWithConflicts = evaluatedRecords.filter(
    (record) => !record.conflictCategories.includes("no_conflict_detected")
  ).length;

  return validateLabelCompletenessReport({
    schemaVersion: agentCalibrationLabelCompletenessSchemaVersion,
    reportId: input.reportId,
    source: "synthetic_schema_label_completeness_report",
    phase: {
      phaseId: "phase-13",
      phaseName: "Calibration Dataset Construction",
      completedBatches: ["13.1", "13.2"],
      currentBatch: "13.3",
      futureBatches: ["13.4", "13.5"],
      previousPhaseStatus: "phase-12-complete-synthetic-design-readiness-only",
      nextPhaseStatus: "phase-14-offline-conformal-crc-prototype-future"
    },
    evaluatedRecords,
    completenessPolicy: {
      policyId: "synthetic_label_completeness_policy",
      requiredLabelGroups: [...agentCalibrationLabelGroupValues],
      optionalLabelGroups: [...agentCalibrationOptionalLabelGroupValues],
      adjudicationTriggerCategories: [
        ...agentCalibrationAdjudicationTriggerValues
      ],
      exclusionTriggerCategories: [...agentCalibrationExclusionTriggerValues],
      boundaryRequired: true,
      realHumanReviewRequiredForRealCalibration: true,
      syntheticExamplesCanSatisfyRealCalibration: false
    },
    completenessSummary: {
      totalEvaluatedRecords,
      completeForFutureDatasetDesignCount: countByCompletenessStatus(
        evaluatedRecords,
        "complete_for_future_dataset_design"
      ),
      completeButSyntheticOnlyCount: countByCompletenessStatus(
        evaluatedRecords,
        "complete_but_synthetic_only"
      ),
      missingRequiredLabelsCount,
      needsAdjudicationCount,
      excludedDueToConflictCount: countByCompletenessStatus(
        evaluatedRecords,
        "excluded_due_to_conflict"
      ),
      excludedDueToBoundaryViolationCount: 0,
      syntheticExampleOnlyCount: totalEvaluatedRecords,
      realHumanAdjudicatedRecordCount: 0
    },
    missingLabelSummary: {
      totalRecordsWithMissingLabels: missingRequiredLabelsCount,
      missingDecisionLabelsCount: countMissingGroup(
        evaluatedRecords,
        "decision_labels"
      ),
      missingUncertaintyLabelsCount: countMissingGroup(
        evaluatedRecords,
        "uncertainty_labels"
      ),
      missingAgentBehaviorLabelsCount: countMissingGroup(
        evaluatedRecords,
        "agent_behavior_labels"
      ),
      missingOutcomeLabelsCount: countMissingGroup(
        evaluatedRecords,
        "outcome_labels"
      ),
      missingFrictionLabelsCount: countMissingGroup(
        evaluatedRecords,
        "friction_labels"
      ),
      missingCoverageLabelsCount: countMissingGroup(
        evaluatedRecords,
        "coverage_labels"
      ),
      missingFutureLossLabelCandidatesCount: countMissingGroup(
        evaluatedRecords,
        "future_loss_label_candidates"
      ),
      missingSourceLinkageCount: countMissingGroup(
        evaluatedRecords,
        "source_artifact_linkage"
      ),
      missingBoundaryFlagsCount: 0
    },
    conflictSummary: {
      totalRecordsWithConflicts,
      decisionLabelConflictCount: countConflict(
        evaluatedRecords,
        "decision_label_conflict"
      ),
      uncertaintyLabelConflictCount: countConflict(
        evaluatedRecords,
        "advisory_uncertainty_conflict"
      ),
      agentBehaviorConflictCount: countConflict(
        evaluatedRecords,
        "agent_behavior_conflict"
      ),
      outcomeLabelConflictCount: countConflict(
        evaluatedRecords,
        "outcome_label_conflict"
      ),
      frictionLabelConflictCount: countConflict(
        evaluatedRecords,
        "friction_label_conflict"
      ),
      coverageLabelConflictCount: countConflict(
        evaluatedRecords,
        "coverage_label_conflict"
      ),
      sourceLinkageConflictCount: countConflict(
        evaluatedRecords,
        "source_linkage_conflict"
      ),
      boundaryFlagConflictCount: 0
    },
    adjudicationSummary: {
      totalRecordsNeedingAdjudication: needsAdjudicationCount,
      totalRecordsAdjudicated: 0,
      futureHumanReviewRequiredCount: totalEvaluatedRecords,
      adjudicationBlockedCount: 0,
      adjudicationNotPerformedCount: needsAdjudicationCount,
      realReviewerAssignedCount: 0
    },
    exclusionSummary: {
      totalExcludedRecords: totalEvaluatedRecords,
      excludedSyntheticOnlyCount: totalEvaluatedRecords,
      excludedBoundaryViolationCount: 0,
      excludedConflictCount: totalRecordsWithConflicts,
      excludedUnresolvedAdjudicationCount: needsAdjudicationCount,
      excludedRawPrivateDataCount: 0,
      excludedRawAgentOutputCount: 0,
      excludedUnresolvedSourceLinkageCount: 0
    },
    readinessSummary: {
      readyForFutureManifestPlanningCount: countByReadinessStatus(
        evaluatedRecords,
        "ready_for_future_manifest_planning"
      ),
      needsAdditionalLabelsBeforeFutureDatasetUseCount: countByReadinessStatus(
        evaluatedRecords,
        "needs_additional_labels_before_future_dataset_use"
      ),
      needsAdjudicationBeforeFutureDatasetUseCount: countByReadinessStatus(
        evaluatedRecords,
        "needs_adjudication_before_future_dataset_use"
      ),
      excludedFromFutureDatasetUseCount: countByReadinessStatus(
        evaluatedRecords,
        "excluded_from_future_dataset_use"
      ),
      syntheticExampleOnlyNotRealDataCount: countByReadinessStatus(
        evaluatedRecords,
        "synthetic_example_only_not_real_data"
      ),
      realCalibrationReadyCount: 0
    },
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      adjudicationBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    metrics: {
      totalEvaluatedRecords,
      syntheticSchemaExampleCount: totalEvaluatedRecords,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realReviewedTraceCount: 0,
      realHumanAdjudicatedRecordCount: 0,
      realCalibrationReadyCount: 0,
      missingRequiredLabelsCount,
      needsAdjudicationCount,
      unresolvedConflictCount: totalRecordsWithConflicts,
      boundaryViolationCount: 0,
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
      realLabelCompletenessReport: false,
      realCalibrationManifest: false,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realHumanAdjudication: false,
      realReviewerAssigned: false,
      realAgentExecution: false,
      realCodingActionGateExecution: false,
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
      "synthetic_label_completeness_report",
      "not_real_adjudication",
      "not_real_calibration_data",
      "no_reviewers_assigned"
    ]
  });
};

export const summarizeLabelCompletenessReport = (
  report: LabelCompletenessReport
): {
  reportId: string;
  totalEvaluatedRecords: number;
  realHumanAdjudicatedRecordCount: 0;
  realCalibrationReadyCount: 0;
  calibrationDatasetCreated: false;
} => ({
  reportId: report.reportId,
  totalEvaluatedRecords: report.metrics.totalEvaluatedRecords,
  realHumanAdjudicatedRecordCount:
    report.metrics.realHumanAdjudicatedRecordCount,
  realCalibrationReadyCount: report.metrics.realCalibrationReadyCount,
  calibrationDatasetCreated: report.claimBoundaries.calibrationDatasetCreated
});

export const computeLabelCompletenessMetrics = (
  report: LabelCompletenessReport
): LabelCompletenessReport["metrics"] => report.metrics;

export const validateLabelCompletenessBoundaries = (
  report: LabelCompletenessReport
): void => {
  if (
    report.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    report.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    report.boundarySummary.claimBoundaryViolationCount !== 0 ||
    report.boundarySummary.rawDataBoundaryViolationCount !== 0 ||
    report.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    report.boundarySummary.adjudicationBoundaryViolationCount !== 0 ||
    report.boundarySummary.runtimeBoundaryViolationCount !== 0
  ) {
    throw new Error(
      `Label completeness boundary violation: ${report.reportId}`
    );
  }
};

const forbiddenLabelCompletenessPatterns = [
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

export const labelCompletenessContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenLabelCompletenessPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};

export const validateLabelCompletenessSafety = (
  report: LabelCompletenessReport
): void => {
  if (labelCompletenessContainsForbiddenRawString(report)) {
    throw new Error(
      `Label completeness report contains forbidden raw-looking value: ${report.reportId}`
    );
  }
};
