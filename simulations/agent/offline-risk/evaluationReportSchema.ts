import { z } from "zod";
import {
  agentOfflineRiskLossDesignSchemaVersion,
  type RiskLossDesign
} from "./riskLossDesignSchema.js";
import {
  agentOfflineScoreInputSetSchemaVersion,
  type OfflineScoreInputSet
} from "./offlineScoreSchema.js";
import {
  agentOfflineSplitSimulationSchemaVersion,
  type OfflineSplitSimulation
} from "./splitSimulationSchema.js";
import {
  agentOfflineThresholdSelectionSchemaVersion,
  type OfflineThresholdSelection
} from "./thresholdSelectionSchema.js";

export const agentOfflineEvaluationReportSchemaVersion =
  "agent-offline-evaluation-report.v1" as const;

export const agentOfflineEvaluationReportSourceValues = [
  "synthetic_mock_evaluation_report_schema",
  "future_offline_experiment_evaluation_report",
  "future_real_calibration_dataset_evaluation_report"
] as const;

export const agentOfflineEvaluationScopeKindValues = [
  "schema_only",
  "synthetic_mock_report_template",
  "future_offline_experiment_report",
  "future_real_calibration_report"
] as const;

export const agentOfflineEvaluationPlaceholderSectionValues = [
  "future_dataset_summary",
  "future_split_summary",
  "future_score_distribution_summary",
  "future_threshold_selection_summary",
  "future_risk_loss_summary",
  "future_empirical_risk_summary",
  "future_coverage_summary",
  "future_failure_case_summary",
  "future_friction_summary",
  "future_baseline_comparison_summary",
  "future_distribution_shift_summary",
  "future_limitations_summary"
] as const;

export const agentOfflineEvaluationPlaceholderStatusValues = [
  "placeholder_only",
  "future_required",
  "unavailable_without_real_data",
  "not_applicable"
] as const;

export const agentOfflineEvaluationFutureMetricFamilyValues = [
  "decision_error_rate_future",
  "unsafe_proceed_rate_future",
  "unnecessary_defer_rate_future",
  "unnecessary_escalate_rate_future",
  "incorrect_block_rate_future",
  "agent_recovery_rate_future",
  "friction_rate_future",
  "coverage_gap_rate_future",
  "empirical_risk_future",
  "conformal_coverage_future",
  "crc_risk_future",
  "distribution_shift_indicator_future"
] as const;

export const agentOfflineEvaluationFutureEvidenceValues = [
  "real_calibration_dataset_required",
  "real_reviewed_traces_required",
  "approved_train_calibration_test_split_required",
  "real_scores_required",
  "real_nonconformity_scores_required",
  "real_thresholds_required",
  "alpha_definition_required",
  "conformal_or_crc_procedure_required",
  "empirical_evaluation_required",
  "distribution_shift_review_required",
  "claim_boundary_review_required",
  "production_routing_review_required"
] as const;

const safeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const offlineEvaluationReportSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  schemaOnly: z.literal(true),
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
  assignsRealDatasetSplits: z.literal(false),
  appliesCalibration: z.literal(false),
  computesNumericLosses: z.literal(false),
  computesRiskScores: z.literal(false),
  computesNonconformityScores: z.literal(false),
  computesRealThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  performsRealEvaluation: z.literal(false),
  computesPerformanceMetrics: z.literal(false)
});

export const offlineEvaluationReportPrivacySchema = z.object({
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
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  rawEvaluationDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const offlineEvaluationReportClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  schemaOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  realEvaluationResults: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  realDatasetSplitsAssigned: z.literal(false),
  splitManifestCreated: z.literal(false),
  numericLossesComputed: z.literal(false),
  riskScoresComputed: z.literal(false),
  nonconformityScoresComputed: z.literal(false),
  realThresholdsComputed: z.literal(false),
  thresholdValuesIncluded: z.literal(false),
  alphaIntroduced: z.literal(false),
  performanceMetricsComputed: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const phaseSchema = z.object({
  phaseId: z.literal("phase-14"),
  phaseName: z.literal("Offline Conformal / CRC Prototype"),
  completedPreviousPhase: z.literal(
    "phase-13-complete-readiness-infrastructure-only"
  ),
  completedBatches: z.array(z.enum(["14.1", "14.2", "14.3", "14.4"])),
  currentBatch: z.literal("14.5"),
  futureBatches: z.array(z.literal("14.6")),
  phaseStatus: z.literal(
    "offline_evaluation_report_schema_without_real_results_or_guarantees"
  )
});

const placeholderSectionSchema = z.object({
  sectionId: safeIdSchema,
  sectionCategory: z.enum(agentOfflineEvaluationPlaceholderSectionValues),
  currentStatus: z.enum(agentOfflineEvaluationPlaceholderStatusValues),
  containsRealResults: z.literal(false),
  containsMockValuesOnly: z.literal(false),
  futureEvidenceRequired: z
    .array(z.enum(agentOfflineEvaluationFutureEvidenceValues))
    .min(1),
  claimBoundary: categoryIdSchema
});

const futureMetricDefinitionSchema = z.object({
  metricFamilyId: z.enum(agentOfflineEvaluationFutureMetricFamilyValues),
  requiredInputs: z.array(categoryIdSchema).min(1),
  requiredSplits: z.array(categoryIdSchema).min(1),
  requiredReviewLabels: z.array(categoryIdSchema).min(1),
  currentStatus: z.literal("future_unavailable"),
  valueComputed: z.literal(false),
  realDataRequired: z.literal(true),
  statisticalGuaranteeClaimed: z.literal(false)
});

const requiredFutureEvidenceSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.enum(agentOfflineEvaluationFutureEvidenceValues),
      status: z.literal("future_unmet"),
      requiredBeforeRealEvaluation: z.literal(true)
    })
  ),
  allRequirementsFutureOrUnmet: z.literal(true)
});

const boundarySummarySchema = z.object({
  safetyBoundaryViolationCount: z.literal(0),
  privacyBoundaryViolationCount: z.literal(0),
  claimBoundaryViolationCount: z.literal(0),
  rawDataBoundaryViolationCount: z.literal(0),
  evaluationBoundaryViolationCount: z.literal(0),
  metricBoundaryViolationCount: z.literal(0),
  scoringBoundaryViolationCount: z.literal(0),
  thresholdBoundaryViolationCount: z.literal(0),
  alphaBoundaryViolationCount: z.literal(0),
  calibrationBoundaryViolationCount: z.literal(0),
  conformalBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0)
});

export const offlineEvaluationReportSchema = z.object({
  schemaVersion: z.literal(agentOfflineEvaluationReportSchemaVersion),
  evaluationReportId: safeIdSchema,
  source: z.enum(agentOfflineEvaluationReportSourceValues),
  phase: phaseSchema,
  linkedRiskLossDesign: z.object({
    designId: z.literal("phase-14-offline-risk-loss-design-v1"),
    schemaVersion: z.literal(agentOfflineRiskLossDesignSchemaVersion),
    source: z.literal("synthetic_design_only"),
    rawDesignIncluded: z.literal(false)
  }),
  linkedScoreInputSet: z.object({
    inputSetId: z.literal("offline-score-input-set-synthetic-v1"),
    schemaVersion: z.literal(agentOfflineScoreInputSetSchemaVersion),
    source: z.literal("synthetic_mock_score_input"),
    rawScoreInputsIncluded: z.literal(false)
  }),
  linkedSplitSimulation: z.object({
    simulationId: z.literal("offline-split-simulation-synthetic-v1"),
    schemaVersion: z.literal(agentOfflineSplitSimulationSchemaVersion),
    source: z.literal("synthetic_mock_split_simulation"),
    rawSplitSimulationIncluded: z.literal(false)
  }),
  linkedThresholdSelection: z.object({
    thresholdSelectionId: z.literal("offline-threshold-selection-synthetic-v1"),
    schemaVersion: z.literal(agentOfflineThresholdSelectionSchemaVersion),
    source: z.literal("synthetic_mock_threshold_selection"),
    rawThresholdSelectionIncluded: z.literal(false)
  }),
  reportScope: z.object({
    scopeKind: z.enum(["schema_only", "synthetic_mock_report_template"]),
    intendedFutureUse: categoryIdSchema,
    currentUse: z.literal("schema_template_only"),
    includesRealResults: z.literal(false),
    includesMockResultsOnly: z.literal(true),
    empiricalEvaluationPerformed: z.literal(false),
    conformalEvaluationPerformed: z.literal(false),
    productionRoutingEvaluationPerformed: z.literal(false)
  }),
  resultAvailability: z.object({
    realEvaluationResultsAvailable: z.literal(false),
    realCalibrationResultsAvailable: z.literal(false),
    realConformalResultsAvailable: z.literal(false),
    realCrcResultsAvailable: z.literal(false),
    realBaselineResultsAvailable: z.literal(false),
    realAgentResultsAvailable: z.literal(false),
    realProductionRoutingResultsAvailable: z.literal(false),
    mockPlaceholderSectionsAvailable: z.literal(true)
  }),
  placeholderResultSections: z.array(placeholderSectionSchema).min(1),
  futureMetricDefinitions: z.object({
    metricFamilies: z.array(futureMetricDefinitionSchema).min(1)
  }),
  requiredFutureEvidence: requiredFutureEvidenceSchema,
  boundarySummary: boundarySummarySchema,
  safety: offlineEvaluationReportSafetySchema,
  privacy: offlineEvaluationReportPrivacySchema,
  claimBoundaries: offlineEvaluationReportClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type OfflineEvaluationReport = z.infer<
  typeof offlineEvaluationReportSchema
>;

export const validateOfflineEvaluationReport = (
  report: unknown
): OfflineEvaluationReport => offlineEvaluationReportSchema.parse(report);

export const validateOfflineEvaluationReports = (
  reports: unknown[]
): OfflineEvaluationReport[] =>
  reports
    .map(validateOfflineEvaluationReport)
    .sort((left, right) =>
      left.evaluationReportId.localeCompare(right.evaluationReportId)
    );

export const computeEvaluationReportBoundarySummary =
  (): OfflineEvaluationReport["boundarySummary"] => ({
    safetyBoundaryViolationCount: 0,
    privacyBoundaryViolationCount: 0,
    claimBoundaryViolationCount: 0,
    rawDataBoundaryViolationCount: 0,
    evaluationBoundaryViolationCount: 0,
    metricBoundaryViolationCount: 0,
    scoringBoundaryViolationCount: 0,
    thresholdBoundaryViolationCount: 0,
    alphaBoundaryViolationCount: 0,
    calibrationBoundaryViolationCount: 0,
    conformalBoundaryViolationCount: 0,
    runtimeBoundaryViolationCount: 0
  });

export const summarizeOfflineEvaluationReport = (
  report: OfflineEvaluationReport
): {
  evaluationReportId: string;
  placeholderSectionCount: number;
  futureMetricFamilyCount: number;
  realEvaluationResultsAvailable: false;
  performanceMetricsComputed: false;
} => ({
  evaluationReportId: report.evaluationReportId,
  placeholderSectionCount: report.placeholderResultSections.length,
  futureMetricFamilyCount: report.futureMetricDefinitions.metricFamilies.length,
  realEvaluationResultsAvailable:
    report.resultAvailability.realEvaluationResultsAvailable,
  performanceMetricsComputed: report.claimBoundaries.performanceMetricsComputed
});

export const validateOfflineEvaluationReportBoundaries = (
  report: OfflineEvaluationReport
): void => {
  if (
    report.boundarySummary.evaluationBoundaryViolationCount !== 0 ||
    report.boundarySummary.metricBoundaryViolationCount !== 0 ||
    report.boundarySummary.scoringBoundaryViolationCount !== 0 ||
    report.boundarySummary.thresholdBoundaryViolationCount !== 0 ||
    report.boundarySummary.alphaBoundaryViolationCount !== 0 ||
    report.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    report.boundarySummary.conformalBoundaryViolationCount !== 0 ||
    report.boundarySummary.runtimeBoundaryViolationCount !== 0
  ) {
    throw new Error("Offline evaluation report crosses a declared boundary");
  }
};

export const validateOfflineEvaluationReportLinkage = (
  report: OfflineEvaluationReport,
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection
): void => {
  if (report.linkedRiskLossDesign.designId !== riskLossDesign.designId) {
    throw new Error("Offline evaluation report references an unknown design");
  }
  if (report.linkedScoreInputSet.inputSetId !== inputSet.inputSetId) {
    throw new Error(
      "Offline evaluation report references an unknown input set"
    );
  }
  if (
    report.linkedSplitSimulation.simulationId !== splitSimulation.simulationId
  ) {
    throw new Error(
      "Offline evaluation report references an unknown split simulation"
    );
  }
  if (
    report.linkedThresholdSelection.thresholdSelectionId !==
    thresholdSelection.thresholdSelectionId
  ) {
    throw new Error(
      "Offline evaluation report references an unknown threshold selection"
    );
  }
};

const placeholderSections =
  (): OfflineEvaluationReport["placeholderResultSections"] =>
    agentOfflineEvaluationPlaceholderSectionValues.map((sectionCategory) => ({
      sectionId: `offline-evaluation-section-${sectionCategory.replace(
        "future_",
        ""
      )}-001`,
      sectionCategory,
      currentStatus: "placeholder_only" as const,
      containsRealResults: false as const,
      containsMockValuesOnly: false as const,
      futureEvidenceRequired: [
        "real_calibration_dataset_required",
        "empirical_evaluation_required",
        "claim_boundary_review_required"
      ],
      claimBoundary: "future_results_only"
    }));

const futureMetricDefinitions =
  (): OfflineEvaluationReport["futureMetricDefinitions"] => ({
    metricFamilies: agentOfflineEvaluationFutureMetricFamilyValues.map(
      (metricFamilyId) => ({
        metricFamilyId,
        requiredInputs: ["real_scores", "reviewed_labels"],
        requiredSplits: ["approved_calibration_split", "approved_test_split"],
        requiredReviewLabels: ["adjudicated_review_labels"],
        currentStatus: "future_unavailable" as const,
        valueComputed: false as const,
        realDataRequired: true as const,
        statisticalGuaranteeClaimed: false as const
      })
    )
  });

export const buildSyntheticOfflineEvaluationReport = (
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection
): OfflineEvaluationReport => {
  const report = {
    schemaVersion: agentOfflineEvaluationReportSchemaVersion,
    evaluationReportId: "offline-evaluation-report-schema-synthetic-v1",
    source: "synthetic_mock_evaluation_report_schema",
    phase: {
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3", "14.4"],
      currentBatch: "14.5",
      futureBatches: ["14.6"],
      phaseStatus:
        "offline_evaluation_report_schema_without_real_results_or_guarantees"
    },
    linkedRiskLossDesign: {
      designId: riskLossDesign.designId,
      schemaVersion: riskLossDesign.schemaVersion,
      source: riskLossDesign.source,
      rawDesignIncluded: false
    },
    linkedScoreInputSet: {
      inputSetId: inputSet.inputSetId,
      schemaVersion: inputSet.schemaVersion,
      source: inputSet.source,
      rawScoreInputsIncluded: false
    },
    linkedSplitSimulation: {
      simulationId: splitSimulation.simulationId,
      schemaVersion: splitSimulation.schemaVersion,
      source: splitSimulation.source,
      rawSplitSimulationIncluded: false
    },
    linkedThresholdSelection: {
      thresholdSelectionId: thresholdSelection.thresholdSelectionId,
      schemaVersion: thresholdSelection.schemaVersion,
      source: thresholdSelection.source,
      rawThresholdSelectionIncluded: false
    },
    reportScope: {
      scopeKind: "schema_only",
      intendedFutureUse: "future_offline_evaluation_reporting",
      currentUse: "schema_template_only",
      includesRealResults: false,
      includesMockResultsOnly: true,
      empiricalEvaluationPerformed: false,
      conformalEvaluationPerformed: false,
      productionRoutingEvaluationPerformed: false
    },
    resultAvailability: {
      realEvaluationResultsAvailable: false,
      realCalibrationResultsAvailable: false,
      realConformalResultsAvailable: false,
      realCrcResultsAvailable: false,
      realBaselineResultsAvailable: false,
      realAgentResultsAvailable: false,
      realProductionRoutingResultsAvailable: false,
      mockPlaceholderSectionsAvailable: true
    },
    placeholderResultSections: placeholderSections(),
    futureMetricDefinitions: futureMetricDefinitions(),
    requiredFutureEvidence: {
      requirements: agentOfflineEvaluationFutureEvidenceValues.map(
        (requirementId) => ({
          requirementId,
          status: "future_unmet" as const,
          requiredBeforeRealEvaluation: true as const
        })
      ),
      allRequirementsFutureOrUnmet: true
    },
    boundarySummary: computeEvaluationReportBoundarySummary(),
    safety: {
      inert: true,
      syntheticOnly: true,
      mockOnly: true,
      schemaOnly: true,
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
      assignsRealDatasetSplits: false,
      appliesCalibration: false,
      computesNumericLosses: false,
      computesRiskScores: false,
      computesNonconformityScores: false,
      computesRealThresholds: false,
      introducesAlpha: false,
      implementsConformalRiskControl: false,
      performsRealEvaluation: false,
      computesPerformanceMetrics: false
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
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
      rawEvaluationDataIncluded: false,
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
      mockOnly: true,
      schemaOnly: true,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      realEvaluationResults: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      realDatasetSplitsAssigned: false,
      splitManifestCreated: false,
      numericLossesComputed: false,
      riskScoresComputed: false,
      nonconformityScoresComputed: false,
      realThresholdsComputed: false,
      thresholdValuesIncluded: false,
      alphaIntroduced: false,
      performanceMetricsComputed: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "schema_template_only",
      "no_real_evaluation",
      "no_metric_values",
      "no_real_thresholds",
      "no_alpha"
    ]
  };

  return validateOfflineEvaluationReport(report);
};

const forbiddenOfflineEvaluationPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /\/private\/tmp\//,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=/,
  /PRIVATE KEY/,
  /(?:^|["'\s=])sk-[A-Za-z0-9_-]{24,}/,
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
  /bun\s+run/i,
  /\b0\.(?:0?1|05|1)\b/,
  /\b(?:1|5|10)%\b/,
  /result table/i,
  /metric value/i
] as const;

export const offlineEvaluationReportContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenOfflineEvaluationPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
