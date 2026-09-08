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
  type LabelCompletenessReport,
  validateLabelCompletenessReport
} from "./labelCompletenessSchema.js";
import {
  type SplitPlanningReport,
  validateSplitPlanningReport
} from "./splitPlanningSchema.js";

export const agentCalibrationReadinessSchemaVersion =
  "agent-calibration-readiness-summary.v1" as const;

export const agentCalibrationReadinessSourceValues = [
  "synthetic_phase_13_readiness_summary",
  "future_controlled_trace_readiness_summary",
  "future_real_trial_readiness_summary"
] as const;

export const agentCalibrationReadinessBatchValues = [
  "13.1",
  "13.2",
  "13.3",
  "13.4",
  "13.5"
] as const;

export const agentCalibrationReadinessMissingEvidenceValues = [
  "real_controlled_agent_traces",
  "real_reviewed_traces",
  "real_human_adjudication",
  "eligible_reviewed_trace_pool",
  "calibration_dataset_approval",
  "train_calibration_test_split_approval",
  "real_split_manifest",
  "numeric_loss_definitions",
  "risk_score_definitions",
  "nonconformity_score_definitions",
  "threshold_selection_procedure",
  "offline_conformal_crc_experiment_results",
  "advisory_calibrated_routing_results",
  "production_authoritative_calibrated_routing_approval"
] as const;

export const agentCalibrationReadinessArtifactKindValues = [
  "calibration_record_schema",
  "synthetic_schema_examples",
  "inclusion_exclusion_criteria",
  "label_taxonomy",
  "calibration_boundary_docs",
  "synthetic_manifest_layer",
  "label_completeness_adjudication_readiness_layer",
  "split_planning_leakage_check_layer",
  "readiness_summary",
  "phase_14_handoff",
  "boundary_checklist"
] as const;

export const agentCalibrationReadinessAvailableInputValues = [
  "calibration_schema",
  "inclusion_exclusion_criteria",
  "label_taxonomy",
  "synthetic_manifest_structure",
  "label_completeness_structure",
  "split_planning_structure",
  "boundary_checklists",
  "synthetic_examples_for_schema_testing"
] as const;

export const agentCalibrationReadinessMissingInputValues = [
  "real_calibration_dataset",
  "eligible_reviewed_traces",
  "train_calibration_test_splits",
  "numeric_loss_functions",
  "risk_scores",
  "nonconformity_scores",
  "thresholds",
  "empirical_risk_results",
  "conformal_crc_results"
] as const;

export const agentCalibrationReadinessPhase14AllowedScopeValues = [
  "offline_prototype_design_over_synthetic_inputs",
  "offline_prototype_design_over_mock_inputs",
  "schema_compatibility_planning",
  "loss_definition_design_without_computation",
  "nonconformity_score_design_without_computation",
  "threshold_procedure_design_without_selection"
] as const;

export const agentCalibrationReadinessPhase14ForbiddenClaimValues = [
  "real_calibration_exists",
  "conformal_guarantee_exists",
  "risk_is_controlled_at_alpha",
  "production_routing_is_calibrated",
  "real_world_validation_exists"
] as const;

export const agentCalibrationReadinessBlockerValues = [
  "no_real_reviewed_traces",
  "no_real_human_adjudication",
  "no_eligible_trace_pool",
  "no_real_calibration_dataset",
  "no_real_split_manifest",
  "no_numeric_loss_functions",
  "no_risk_scores",
  "no_nonconformity_scores",
  "no_thresholds",
  "no_offline_conformal_crc_results",
  "no_approval_for_production_routing"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const readinessSummaryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

export const calibrationReadinessSafetySchema = z.object({
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
  createsCalibrationManifest: z.literal(false),
  createsSplitManifest: z.literal(false),
  assignsDatasetSplits: z.literal(false),
  appliesCalibration: z.literal(false),
  computesNumericLosses: z.literal(false),
  computesRiskScores: z.literal(false),
  computesNonconformityScores: z.literal(false),
  computesThresholds: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  performsAdjudication: z.literal(false),
  assignsReviewers: z.literal(false)
});

export const calibrationReadinessPrivacySchema = z.object({
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

export const calibrationReadinessClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realCalibrationReadinessReport: z.literal(false),
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
  numericLossesComputed: z.literal(false),
  riskScoresComputed: z.literal(false),
  nonconformityScoresComputed: z.literal(false),
  thresholdsComputed: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const completedPhase13BatchSchema = z.object({
  batchId: z.enum(agentCalibrationReadinessBatchValues),
  batchName: categoryIdSchema,
  artifactKindsProduced: z.array(categoryIdSchema).min(1),
  readinessContribution: categoryIdSchema,
  boundarySummary: categoryIdSchema,
  createsRealCalibrationData: z.literal(false),
  appliesCalibration: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  changesRuntimeBehavior: z.literal(false)
});

const implementedReadinessArtifactSchema = z.object({
  artifactKind: z.enum(agentCalibrationReadinessArtifactKindValues),
  sourceBatch: z.enum(agentCalibrationReadinessBatchValues),
  schemaVersion: z.string().min(1).optional(),
  syntheticOnly: z.literal(true),
  realCalibrationData: z.literal(false),
  runtimeIntegrated: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalImplemented: z.literal(false)
});

const blockerSchema = z.object({
  blockerCategory: z.enum(agentCalibrationReadinessBlockerValues),
  blocksRealCalibrationDataset: z.boolean(),
  blocksConformalClaims: z.boolean(),
  blocksProductionRouting: z.boolean(),
  resolutionRequiresFutureBatch: z.literal(true),
  resolved: z.literal(false)
});

export const calibrationReadinessSummarySchema = z.object({
  schemaVersion: z.literal(agentCalibrationReadinessSchemaVersion),
  readinessSummaryId: readinessSummaryIdSchema,
  source: z.enum(agentCalibrationReadinessSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-13"),
    phaseName: z.literal("Calibration Dataset Construction"),
    completedBatches: z.array(z.enum(agentCalibrationReadinessBatchValues)),
    currentBatch: z.literal("13.5"),
    phaseStatus: z.literal(
      "complete_as_calibration_dataset_readiness_infrastructure_only"
    ),
    previousPhaseStatus: z.literal(
      "phase-12-complete-synthetic-design-readiness-only"
    ),
    nextPhaseStatus: z.literal(
      "phase-14-offline-conformal-crc-prototype-future"
    )
  }),
  completedPhase13Batches: z.array(completedPhase13BatchSchema).length(5),
  implementedReadinessArtifacts: z.object({
    artifacts: z.array(implementedReadinessArtifactSchema).min(1)
  }),
  missingEvidenceSummary: z.object({
    missingEvidenceCategories: z.array(
      z.enum(agentCalibrationReadinessMissingEvidenceValues)
    ),
    allRequiredEvidenceStillFuture: z.literal(true),
    realEvidenceIncluded: z.literal(false)
  }),
  datasetReadinessSummary: z.object({
    schemaExists: z.literal(true),
    inclusionCriteriaExist: z.literal(true),
    manifestLayerExists: z.literal(true),
    labelCompletenessLayerExists: z.literal(true),
    splitPlanningLayerExists: z.literal(true),
    realCalibrationDatasetExists: z.literal(false),
    realCalibrationRecordsExist: z.literal(false),
    eligibleReviewedTracePoolExists: z.literal(false),
    datasetExportWorkflowExists: z.literal(false),
    calibrationDatasetApproved: z.literal(false)
  }),
  labelReadinessSummary: z.object({
    labelSchemaExists: z.literal(true),
    labelCompletenessWorkflowExists: z.literal(true),
    adjudicationReadinessWorkflowExists: z.literal(true),
    realHumanReviewPerformed: z.literal(false),
    realHumanAdjudicationPerformed: z.literal(false),
    realReviewerAssigned: z.literal(false),
    labelCompletenessReportIsSyntheticOnly: z.literal(true),
    realCalibrationLabelsExist: z.literal(false)
  }),
  splitReadinessSummary: z.object({
    splitPlanningSchemaExists: z.literal(true),
    leakageCheckLayerExists: z.literal(true),
    futureSplitCategoriesDefined: z.literal(true),
    leakageRiskCategoriesDefined: z.literal(true),
    realTrainCalibrationTestSplitAssigned: z.literal(false),
    splitManifestExists: z.literal(false),
    realDatasetSplitExists: z.literal(false),
    conformalCalibrationSplitExists: z.literal(false)
  }),
  phase14HandoffSummary: z.object({
    handoffReadyForOfflinePrototypeDesign: z.literal(true),
    handoffReadyForRealCalibration: z.literal(false),
    handoffReadyForProductionRouting: z.literal(false),
    availableInputs: z.array(
      z.enum(agentCalibrationReadinessAvailableInputValues)
    ),
    missingInputs: z.array(z.enum(agentCalibrationReadinessMissingInputValues)),
    phase14AllowedStartingScope: z.array(
      z.enum(agentCalibrationReadinessPhase14AllowedScopeValues)
    ),
    phase14ForbiddenStartingClaims: z.array(
      z.enum(agentCalibrationReadinessPhase14ForbiddenClaimValues)
    )
  }),
  blockerSummary: z.object({
    blockers: z.array(blockerSchema),
    unresolvedBlockerCount: z.number().int().min(0)
  }),
  boundarySummary: z.object({
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    rawDataBoundaryViolationCount: z.literal(0),
    calibrationBoundaryViolationCount: z.literal(0),
    splitBoundaryViolationCount: z.literal(0),
    conformalBoundaryViolationCount: z.literal(0),
    runtimeBoundaryViolationCount: z.literal(0)
  }),
  metrics: z.object({
    completedPhase13BatchCount: z.literal(5),
    implementedReadinessArtifactCount: z.number().int().min(1),
    syntheticSchemaExampleCount: z.number().int().min(1),
    syntheticManifestCount: z.literal(1),
    syntheticLabelCompletenessReportCount: z.literal(1),
    syntheticSplitPlanningReportCount: z.literal(1),
    realCalibrationDatasetCount: z.literal(0),
    realCalibrationRecordCount: z.literal(0),
    realReviewedTraceCount: z.literal(0),
    realHumanAdjudicationCount: z.literal(0),
    realSplitManifestCount: z.literal(0),
    realTrainCalibrationTestSplitCount: z.literal(0),
    numericLossFunctionCount: z.literal(0),
    riskScoreCount: z.literal(0),
    nonconformityScoreCount: z.literal(0),
    thresholdCount: z.literal(0),
    conformalImplementationCount: z.literal(0),
    productionRoutingChangeCount: z.literal(0)
  }),
  safety: calibrationReadinessSafetySchema,
  privacy: calibrationReadinessPrivacySchema,
  claimBoundaries: calibrationReadinessClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type CalibrationReadinessSummary = z.infer<
  typeof calibrationReadinessSummarySchema
>;
export type CalibrationReadinessBlocker = z.infer<typeof blockerSchema>;

export const validateCalibrationReadinessSummary = (
  summary: unknown
): CalibrationReadinessSummary =>
  calibrationReadinessSummarySchema.parse(summary);

export const validateCalibrationReadinessSummaries = (
  summaries: unknown[]
): CalibrationReadinessSummary[] =>
  summaries
    .map(validateCalibrationReadinessSummary)
    .sort((left, right) =>
      left.readinessSummaryId.localeCompare(right.readinessSummaryId)
    );

const completedPhase13Batches =
  (): CalibrationReadinessSummary["completedPhase13Batches"] => [
    {
      batchId: "13.1",
      batchName: "calibration_dataset_schema_and_inclusion_criteria",
      artifactKindsProduced: [
        "record_schema",
        "synthetic_examples",
        "inclusion_criteria",
        "label_taxonomy"
      ],
      readinessContribution: "schema_readiness",
      boundarySummary: "no_real_calibration_data",
      createsRealCalibrationData: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      changesRuntimeBehavior: false
    },
    {
      batchId: "13.2",
      batchName: "calibration_dataset_manifest_builder",
      artifactKindsProduced: ["synthetic_manifest_schema", "manifest_helper"],
      readinessContribution: "manifest_readiness",
      boundarySummary: "no_real_manifest_or_dataset",
      createsRealCalibrationData: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      changesRuntimeBehavior: false
    },
    {
      batchId: "13.3",
      batchName: "label_completeness_and_adjudication_workflow",
      artifactKindsProduced: [
        "label_completeness_schema",
        "adjudication_readiness_categories"
      ],
      readinessContribution: "label_readiness",
      boundarySummary: "no_real_adjudication",
      createsRealCalibrationData: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      changesRuntimeBehavior: false
    },
    {
      batchId: "13.4",
      batchName: "split_planning_and_leakage_checks",
      artifactKindsProduced: [
        "split_planning_schema",
        "leakage_check_categories"
      ],
      readinessContribution: "split_readiness",
      boundarySummary: "no_real_splits",
      createsRealCalibrationData: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      changesRuntimeBehavior: false
    },
    {
      batchId: "13.5",
      batchName: "calibration_dataset_readiness_summary_and_handoff",
      artifactKindsProduced: ["readiness_summary", "phase_14_handoff"],
      readinessContribution: "phase_completion_readiness",
      boundarySummary: "no_phase_14_execution",
      createsRealCalibrationData: false,
      appliesCalibration: false,
      implementsConformalRiskControl: false,
      changesRuntimeBehavior: false
    }
  ];

const implementedArtifacts =
  (): CalibrationReadinessSummary["implementedReadinessArtifacts"] => ({
    artifacts: [
      {
        artifactKind: "calibration_record_schema",
        sourceBatch: "13.1",
        schemaVersion: "agent-calibration-record.v1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "synthetic_schema_examples",
        sourceBatch: "13.1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "inclusion_exclusion_criteria",
        sourceBatch: "13.1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "label_taxonomy",
        sourceBatch: "13.1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "calibration_boundary_docs",
        sourceBatch: "13.1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "synthetic_manifest_layer",
        sourceBatch: "13.2",
        schemaVersion: "agent-calibration-manifest.v1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "label_completeness_adjudication_readiness_layer",
        sourceBatch: "13.3",
        schemaVersion: "agent-calibration-label-completeness-report.v1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "split_planning_leakage_check_layer",
        sourceBatch: "13.4",
        schemaVersion: "agent-calibration-split-planning-report.v1",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "readiness_summary",
        sourceBatch: "13.5",
        schemaVersion: agentCalibrationReadinessSchemaVersion,
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "phase_14_handoff",
        sourceBatch: "13.5",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      },
      {
        artifactKind: "boundary_checklist",
        sourceBatch: "13.5",
        syntheticOnly: true,
        realCalibrationData: false,
        runtimeIntegrated: false,
        calibrationApplied: false,
        conformalImplemented: false
      }
    ]
  });

export const buildPhase14HandoffSummary =
  (): CalibrationReadinessSummary["phase14HandoffSummary"] => ({
    handoffReadyForOfflinePrototypeDesign: true,
    handoffReadyForRealCalibration: false,
    handoffReadyForProductionRouting: false,
    availableInputs: [...agentCalibrationReadinessAvailableInputValues],
    missingInputs: [...agentCalibrationReadinessMissingInputValues],
    phase14AllowedStartingScope: [
      ...agentCalibrationReadinessPhase14AllowedScopeValues
    ],
    phase14ForbiddenStartingClaims: [
      ...agentCalibrationReadinessPhase14ForbiddenClaimValues
    ]
  });

const blockerSummary = (): CalibrationReadinessSummary["blockerSummary"] => {
  const blockers: CalibrationReadinessBlocker[] =
    agentCalibrationReadinessBlockerValues.map((blockerCategory) => ({
      blockerCategory,
      blocksRealCalibrationDataset: [
        "no_real_reviewed_traces",
        "no_real_human_adjudication",
        "no_eligible_trace_pool",
        "no_real_calibration_dataset"
      ].includes(blockerCategory),
      blocksConformalClaims: [
        "no_real_calibration_dataset",
        "no_real_split_manifest",
        "no_numeric_loss_functions",
        "no_risk_scores",
        "no_nonconformity_scores",
        "no_thresholds",
        "no_offline_conformal_crc_results"
      ].includes(blockerCategory),
      blocksProductionRouting: [
        "no_offline_conformal_crc_results",
        "no_approval_for_production_routing",
        "no_thresholds"
      ].includes(blockerCategory),
      resolutionRequiresFutureBatch: true,
      resolved: false
    }));

  return {
    blockers,
    unresolvedBlockerCount: blockers.length
  };
};

export const buildSyntheticCalibrationReadinessSummary = (input: {
  readinessSummaryId: string;
  records: CalibrationRecord[];
  manifest: CalibrationManifest;
  labelCompletenessReport: LabelCompletenessReport;
  splitPlanningReport: SplitPlanningReport;
}): CalibrationReadinessSummary => {
  const records = validateCalibrationRecords(input.records);
  validateCalibrationManifest(input.manifest);
  validateLabelCompletenessReport(input.labelCompletenessReport);
  validateSplitPlanningReport(input.splitPlanningReport);
  const implementedReadinessArtifacts = implementedArtifacts();

  return validateCalibrationReadinessSummary({
    schemaVersion: agentCalibrationReadinessSchemaVersion,
    readinessSummaryId: input.readinessSummaryId,
    source: "synthetic_phase_13_readiness_summary",
    phase: {
      phaseId: "phase-13",
      phaseName: "Calibration Dataset Construction",
      completedBatches: [...agentCalibrationReadinessBatchValues],
      currentBatch: "13.5",
      phaseStatus:
        "complete_as_calibration_dataset_readiness_infrastructure_only",
      previousPhaseStatus: "phase-12-complete-synthetic-design-readiness-only",
      nextPhaseStatus: "phase-14-offline-conformal-crc-prototype-future"
    },
    completedPhase13Batches: completedPhase13Batches(),
    implementedReadinessArtifacts,
    missingEvidenceSummary: {
      missingEvidenceCategories: [
        ...agentCalibrationReadinessMissingEvidenceValues
      ],
      allRequiredEvidenceStillFuture: true,
      realEvidenceIncluded: false
    },
    datasetReadinessSummary: {
      schemaExists: true,
      inclusionCriteriaExist: true,
      manifestLayerExists: true,
      labelCompletenessLayerExists: true,
      splitPlanningLayerExists: true,
      realCalibrationDatasetExists: false,
      realCalibrationRecordsExist: false,
      eligibleReviewedTracePoolExists: false,
      datasetExportWorkflowExists: false,
      calibrationDatasetApproved: false
    },
    labelReadinessSummary: {
      labelSchemaExists: true,
      labelCompletenessWorkflowExists: true,
      adjudicationReadinessWorkflowExists: true,
      realHumanReviewPerformed: false,
      realHumanAdjudicationPerformed: false,
      realReviewerAssigned: false,
      labelCompletenessReportIsSyntheticOnly: true,
      realCalibrationLabelsExist: false
    },
    splitReadinessSummary: {
      splitPlanningSchemaExists: true,
      leakageCheckLayerExists: true,
      futureSplitCategoriesDefined: true,
      leakageRiskCategoriesDefined: true,
      realTrainCalibrationTestSplitAssigned: false,
      splitManifestExists: false,
      realDatasetSplitExists: false,
      conformalCalibrationSplitExists: false
    },
    phase14HandoffSummary: buildPhase14HandoffSummary(),
    blockerSummary: blockerSummary(),
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      splitBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    metrics: {
      completedPhase13BatchCount: 5,
      implementedReadinessArtifactCount:
        implementedReadinessArtifacts.artifacts.length,
      syntheticSchemaExampleCount: records.length,
      syntheticManifestCount: 1,
      syntheticLabelCompletenessReportCount: 1,
      syntheticSplitPlanningReportCount: 1,
      realCalibrationDatasetCount: 0,
      realCalibrationRecordCount: 0,
      realReviewedTraceCount: 0,
      realHumanAdjudicationCount: 0,
      realSplitManifestCount: 0,
      realTrainCalibrationTestSplitCount: 0,
      numericLossFunctionCount: 0,
      riskScoreCount: 0,
      nonconformityScoreCount: 0,
      thresholdCount: 0,
      conformalImplementationCount: 0,
      productionRoutingChangeCount: 0
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
      createsCalibrationManifest: false,
      createsSplitManifest: false,
      assignsDatasetSplits: false,
      appliesCalibration: false,
      computesNumericLosses: false,
      computesRiskScores: false,
      computesNonconformityScores: false,
      computesThresholds: false,
      implementsConformalRiskControl: false,
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
      realCalibrationReadinessReport: false,
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
      numericLossesComputed: false,
      riskScoresComputed: false,
      nonconformityScoresComputed: false,
      thresholdsComputed: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "phase_13_complete_as_readiness_infrastructure_only",
      "no_real_calibration_dataset",
      "no_phase_14_execution",
      "not_real_calibration_data"
    ]
  });
};

export const summarizeCalibrationReadiness = (
  summary: CalibrationReadinessSummary
): {
  readinessSummaryId: string;
  phaseStatus: string;
  completedPhase13BatchCount: 5;
  realCalibrationDatasetCount: 0;
  conformalImplementationCount: 0;
  productionRoutingChangeCount: 0;
} => ({
  readinessSummaryId: summary.readinessSummaryId,
  phaseStatus: summary.phase.phaseStatus,
  completedPhase13BatchCount: summary.metrics.completedPhase13BatchCount,
  realCalibrationDatasetCount: summary.metrics.realCalibrationDatasetCount,
  conformalImplementationCount: summary.metrics.conformalImplementationCount,
  productionRoutingChangeCount: summary.metrics.productionRoutingChangeCount
});

export const computeCalibrationReadinessMetrics = (
  summary: CalibrationReadinessSummary
): CalibrationReadinessSummary["metrics"] => summary.metrics;

export const validateCalibrationReadinessBoundaries = (
  summary: CalibrationReadinessSummary
): void => {
  if (
    summary.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    summary.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    summary.boundarySummary.claimBoundaryViolationCount !== 0 ||
    summary.boundarySummary.rawDataBoundaryViolationCount !== 0 ||
    summary.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    summary.boundarySummary.splitBoundaryViolationCount !== 0 ||
    summary.boundarySummary.conformalBoundaryViolationCount !== 0 ||
    summary.boundarySummary.runtimeBoundaryViolationCount !== 0
  ) {
    throw new Error(
      `Calibration readiness boundary violation: ${summary.readinessSummaryId}`
    );
  }
};

const forbiddenReadinessPatterns = [
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

export const calibrationReadinessContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenReadinessPatterns.some((pattern) => pattern.test(serialized));
};

export const validateCalibrationReadinessSafety = (
  summary: CalibrationReadinessSummary
): void => {
  if (calibrationReadinessContainsForbiddenRawString(summary)) {
    throw new Error(
      `Calibration readiness summary contains forbidden raw-looking value: ${summary.readinessSummaryId}`
    );
  }
};
