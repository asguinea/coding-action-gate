import { z } from "zod";
import {
  agentOfflineEvaluationReportSchemaVersion,
  type OfflineEvaluationReport
} from "./evaluationReportSchema.js";
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

export const agentOfflineReadinessSummarySchemaVersion =
  "agent-offline-readiness-summary.v1" as const;

export const agentOfflineReadinessSourceValues = [
  "synthetic_phase_14_readiness_summary",
  "future_offline_experiment_readiness_summary",
  "future_advisory_routing_readiness_summary"
] as const;

export const agentOfflineArtifactKindValues = [
  "risk_loss_design",
  "offline_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_simulation",
  "mock_threshold_selection_mechanics",
  "offline_evaluation_report_schema",
  "phase_14_readiness_summary",
  "phase_15_handoff_boundary"
] as const;

export const agentOfflineArtifactRelationshipValues = [
  "defines_inputs_for",
  "feeds_mock_mechanics",
  "feeds_mock_threshold_mechanics",
  "feeds_report_schema",
  "feeds_readiness_summary"
] as const;

export const agentOfflineArtifactLinkageStatusValues = [
  "synthetic_mock_linked",
  "readiness_summary_linked"
] as const;

export const agentOfflineMissingEvidenceValues = [
  "real_calibration_dataset",
  "eligible_reviewed_traces",
  "approved_train_calibration_test_split",
  "real_scores",
  "real_nonconformity_scores",
  "real_thresholds",
  "alpha_definition",
  "conformal_or_crc_procedure",
  "empirical_evaluation_results",
  "distribution_shift_assessment",
  "advisory_routing_evaluation",
  "production_routing_approval"
] as const;

export const agentOfflineBlockerCategoryValues = [
  "no_real_calibration_dataset",
  "no_eligible_reviewed_traces",
  "no_real_scores",
  "no_nonconformity_scores",
  "no_thresholds",
  "no_alpha",
  "no_empirical_evaluation_results",
  "no_distribution_shift_assessment",
  "no_advisory_routing_evaluation",
  "no_approval_for_routing_changes"
] as const;

export const agentOfflinePhase15AvailableInputValues = [
  "risk_loss_design",
  "mock_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_mechanics",
  "mock_threshold_mechanics",
  "evaluation_report_schema",
  "boundary_checklists",
  "claim_boundary_docs"
] as const;

export const agentOfflinePhase15MissingInputValues = [
  "real_calibration_dataset",
  "eligible_reviewed_traces",
  "real_scores",
  "nonconformity_scores",
  "thresholds",
  "alpha",
  "empirical_evaluation_results",
  "conformal_crc_results"
] as const;

export const agentOfflinePhase15ForbiddenClaimValues = [
  "advisory_routing_is_calibrated",
  "conformal_guarantee_exists",
  "risk_is_controlled_at_alpha",
  "production_routing_is_calibrated",
  "real_world_validation_exists"
] as const;

const safeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const boundaryTextSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_ -]*$/);

export const offlineReadinessSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
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
  implementsAdvisoryRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  performsRealEvaluation: z.literal(false),
  computesPerformanceMetrics: z.literal(false)
});

export const offlineReadinessPrivacySchema = z.object({
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
  rawRoutingDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const offlineReadinessClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
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
  advisoryRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const batchSchema = z.object({
  batchId: z.enum(["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"]),
  batchName: boundaryTextSchema,
  artifactKindsProduced: z.array(z.enum(agentOfflineArtifactKindValues)).min(1),
  capabilityAdded: boundaryTextSchema,
  whyItMatters: boundaryTextSchema,
  boundarySummary: boundaryTextSchema,
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  appliesCalibration: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  changesRuntimeBehavior: z.literal(false)
});

const artifactSchema = z.object({
  artifactKind: z.enum(agentOfflineArtifactKindValues),
  artifactId: safeIdSchema.optional(),
  sourceBatch: z.enum(["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"]),
  schemaVersion: z.string().min(1).optional(),
  positiveCapability: boundaryTextSchema,
  downstreamUse: boundaryTextSchema,
  syntheticOnly: z.literal(true),
  mockOnly: z.boolean(),
  realDataUsed: z.literal(false),
  runtimeIntegrated: z.literal(false),
  scoresComputed: z.literal(false),
  thresholdsComputed: z.literal(false),
  alphaIntroduced: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalImplemented: z.literal(false)
});

const artifactChainEdgeSchema = z.object({
  fromArtifact: z.enum(agentOfflineArtifactKindValues),
  fromArtifactId: safeIdSchema.optional(),
  toArtifact: z.enum(agentOfflineArtifactKindValues),
  toArtifactId: safeIdSchema.optional(),
  relationshipCategory: z.enum(agentOfflineArtifactRelationshipValues),
  linkageStatus: z.enum(agentOfflineArtifactLinkageStatusValues),
  rawArtifactEmbedded: z.literal(false)
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
  routingBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0)
});

const metricsSchema = z.object({
  completedPhase14BatchCount: z.literal(6),
  implementedOfflineArtifactCount: z.number().int().positive(),
  artifactChainEdgeCount: z.number().int().positive(),
  realCalibrationDatasetCount: z.literal(0),
  realReviewedTraceCount: z.literal(0),
  realScoreCount: z.literal(0),
  realNonconformityScoreCount: z.literal(0),
  realThresholdCount: z.literal(0),
  alphaValueCount: z.literal(0),
  empiricalEvaluationResultCount: z.literal(0),
  conformalImplementationCount: z.literal(0),
  advisoryRoutingImplementationCount: z.literal(0),
  productionRoutingChangeCount: z.literal(0)
});

export const offlineReadinessSummarySchema = z.object({
  schemaVersion: z.literal(agentOfflineReadinessSummarySchemaVersion),
  readinessSummaryId: safeIdSchema,
  source: z.enum(agentOfflineReadinessSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-14"),
    phaseName: z.literal("Offline Conformal / CRC Prototype"),
    completedPreviousPhase: z.literal(
      "phase-13-complete-readiness-infrastructure-only"
    ),
    completedBatches: z.array(
      z.enum(["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"])
    ),
    currentBatch: z.literal("14.6"),
    phaseStatus: z.literal(
      "complete_as_offline_synthetic_mock_prototype_groundwork_only"
    ),
    nextPhaseStatus: z.literal("phase-15-advisory-routing-future")
  }),
  completedPhase14Batches: z.array(batchSchema).length(6),
  implementedOfflineArtifacts: z.object({
    artifacts: z.array(artifactSchema).min(8)
  }),
  artifactChain: z.object({
    edges: z.array(artifactChainEdgeSchema).length(5)
  }),
  phase14CapabilitySummary: z.object({
    riskLossDesignAvailable: z.literal(true),
    mockScoreInputsAvailable: z.literal(true),
    mockNonconformityInputsAvailable: z.literal(true),
    mockSplitMechanicsAvailable: z.literal(true),
    mockThresholdMechanicsAvailable: z.literal(true),
    evaluationReportSchemaAvailable: z.literal(true),
    readinessHandoffAvailable: z.literal(true),
    offlinePrototypeGroundworkComplete: z.literal(true),
    realExperimentCapabilityAvailable: z.literal(false),
    advisoryRoutingCapabilityAvailable: z.literal(false),
    productionRoutingCapabilityAvailable: z.literal(false)
  }),
  missingEvidenceSummary: z.object({
    missingEvidence: z.array(
      z.object({
        evidenceCategory: z.enum(agentOfflineMissingEvidenceValues),
        status: z.literal("future_missing"),
        requiredBeforeRealClaims: z.literal(true)
      })
    ),
    allEvidenceFutureOrMissing: z.literal(true)
  }),
  phase15HandoffSummary: z.object({
    handoffReadyForAdvisoryRoutingDesign: z.literal(true),
    handoffReadyForAdvisoryRoutingImplementation: z.literal(false),
    handoffReadyForProductionRouting: z.literal(false),
    availableInputs: z.array(z.enum(agentOfflinePhase15AvailableInputValues)),
    missingInputs: z.array(z.enum(agentOfflinePhase15MissingInputValues)),
    allowedPhase15StartingScope: z.literal(
      "advisory_routing_design_and_schema_work_only"
    ),
    forbiddenPhase15StartingClaims: z.array(
      z.enum(agentOfflinePhase15ForbiddenClaimValues)
    )
  }),
  advisoryRoutingReadiness: z.object({
    designInputsAvailable: z.literal(true),
    mockInputsAvailable: z.literal(true),
    advisorySchemaCanBeDesigned: z.literal(true),
    advisoryImplementationAllowedNow: z.literal(false),
    productionAuthorityAllowedNow: z.literal(false),
    calibrationRequiredBeforeRealUse: z.literal(true),
    evaluationRequiredBeforeClaims: z.literal(true),
    humanApprovalRequiredBeforeRoutingChanges: z.literal(true)
  }),
  blockerSummary: z.object({
    blockers: z.array(
      z.object({
        blockerCategory: z.enum(agentOfflineBlockerCategoryValues),
        status: z.literal("unresolved_future"),
        blocksRealCalibration: z.boolean(),
        blocksConformalClaims: z.boolean(),
        blocksAdvisoryRoutingClaims: z.boolean(),
        blocksProductionRouting: z.boolean(),
        resolutionRequiresFutureBatch: z.literal(true)
      })
    )
  }),
  boundarySummary: boundarySummarySchema,
  metrics: metricsSchema,
  safety: offlineReadinessSafetySchema,
  privacy: offlineReadinessPrivacySchema,
  claimBoundaries: offlineReadinessClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type OfflineReadinessSummary = z.infer<
  typeof offlineReadinessSummarySchema
>;

export const validateOfflineReadinessSummary = (
  summary: unknown
): OfflineReadinessSummary => offlineReadinessSummarySchema.parse(summary);

export const validateOfflineReadinessSummaries = (
  summaries: unknown[]
): OfflineReadinessSummary[] =>
  summaries
    .map(validateOfflineReadinessSummary)
    .sort((left, right) =>
      left.readinessSummaryId.localeCompare(right.readinessSummaryId)
    );

export const computeOfflineReadinessMetrics = (
  summary: Pick<
    OfflineReadinessSummary,
    "completedPhase14Batches" | "implementedOfflineArtifacts" | "artifactChain"
  >
): OfflineReadinessSummary["metrics"] => ({
  completedPhase14BatchCount: 6,
  implementedOfflineArtifactCount:
    summary.implementedOfflineArtifacts.artifacts.length,
  artifactChainEdgeCount: summary.artifactChain.edges.length,
  realCalibrationDatasetCount: 0,
  realReviewedTraceCount: 0,
  realScoreCount: 0,
  realNonconformityScoreCount: 0,
  realThresholdCount: 0,
  alphaValueCount: 0,
  empiricalEvaluationResultCount: 0,
  conformalImplementationCount: 0,
  advisoryRoutingImplementationCount: 0,
  productionRoutingChangeCount: 0
});

export const summarizeOfflineReadiness = (
  summary: OfflineReadinessSummary
): {
  readinessSummaryId: string;
  completedPhase14BatchCount: 6;
  implementedOfflineArtifactCount: number;
  artifactChainEdgeCount: number;
  handoffReadyForAdvisoryRoutingDesign: true;
  advisoryRoutingImplementationAllowedNow: false;
  productionRoutingChangeCount: 0;
} => ({
  readinessSummaryId: summary.readinessSummaryId,
  completedPhase14BatchCount: summary.metrics.completedPhase14BatchCount,
  implementedOfflineArtifactCount:
    summary.metrics.implementedOfflineArtifactCount,
  artifactChainEdgeCount: summary.metrics.artifactChainEdgeCount,
  handoffReadyForAdvisoryRoutingDesign:
    summary.phase15HandoffSummary.handoffReadyForAdvisoryRoutingDesign,
  advisoryRoutingImplementationAllowedNow:
    summary.advisoryRoutingReadiness.advisoryImplementationAllowedNow,
  productionRoutingChangeCount: summary.metrics.productionRoutingChangeCount
});

export const buildPhase15HandoffSummary =
  (): OfflineReadinessSummary["phase15HandoffSummary"] => ({
    handoffReadyForAdvisoryRoutingDesign: true,
    handoffReadyForAdvisoryRoutingImplementation: false,
    handoffReadyForProductionRouting: false,
    availableInputs: [...agentOfflinePhase15AvailableInputValues],
    missingInputs: [...agentOfflinePhase15MissingInputValues],
    allowedPhase15StartingScope: "advisory_routing_design_and_schema_work_only",
    forbiddenPhase15StartingClaims: [...agentOfflinePhase15ForbiddenClaimValues]
  });

export const validateOfflineReadinessBoundaries = (
  summary: OfflineReadinessSummary
): void => {
  if (
    Object.values(summary.boundarySummary).some((count) => count !== 0) ||
    summary.safety.implementsAdvisoryRouting ||
    summary.safety.implementsProductionRouting ||
    summary.claimBoundaries.advisoryRoutingImplemented ||
    summary.claimBoundaries.productionRoutingChanged
  ) {
    throw new Error("Offline readiness summary crosses a declared boundary");
  }
};

export const validateOfflineReadinessLinkage = (
  summary: OfflineReadinessSummary,
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection,
  evaluationReport: OfflineEvaluationReport
): void => {
  const expectedIds = new Set([
    riskLossDesign.designId,
    inputSet.inputSetId,
    splitSimulation.simulationId,
    thresholdSelection.thresholdSelectionId,
    evaluationReport.evaluationReportId,
    summary.readinessSummaryId
  ]);

  for (const edge of summary.artifactChain.edges) {
    if (edge.fromArtifactId && !expectedIds.has(edge.fromArtifactId)) {
      throw new Error(
        `Unknown readiness chain artifact: ${edge.fromArtifactId}`
      );
    }
    if (edge.toArtifactId && !expectedIds.has(edge.toArtifactId)) {
      throw new Error(`Unknown readiness chain artifact: ${edge.toArtifactId}`);
    }
    if (edge.rawArtifactEmbedded) {
      throw new Error("Readiness chain embeds raw artifacts");
    }
  }
};

const batchEntries = (): OfflineReadinessSummary["completedPhase14Batches"] => [
  {
    batchId: "14.1",
    batchName: "offline risk loss function design",
    artifactKindsProduced: ["risk_loss_design"],
    capabilityAdded: "candidate loss and risk categories",
    whyItMatters: "defines future scoring and evaluation vocabulary",
    boundarySummary: "design only with no numeric computation",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  },
  {
    batchId: "14.2",
    batchName: "offline score schema and mock inputs",
    artifactKindsProduced: [
      "offline_score_input_schema",
      "mock_nonconformity_input_structure"
    ],
    capabilityAdded: "mock score input records",
    whyItMatters: "connects risk design to synthetic input structure",
    boundarySummary: "mock only with no real scores",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  },
  {
    batchId: "14.3",
    batchName: "calibration test split simulation",
    artifactKindsProduced: ["mock_split_simulation"],
    capabilityAdded: "mock split mechanics",
    whyItMatters: "exercises future split structure without real splits",
    boundarySummary: "synthetic mechanics only with no split manifest",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  },
  {
    batchId: "14.4",
    batchName: "offline threshold selection prototype",
    artifactKindsProduced: ["mock_threshold_selection_mechanics"],
    capabilityAdded: "mock threshold candidate mechanics",
    whyItMatters: "shows future threshold workflow shape",
    boundarySummary: "mock only with no threshold values",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  },
  {
    batchId: "14.5",
    batchName: "offline evaluation report schema",
    artifactKindsProduced: ["offline_evaluation_report_schema"],
    capabilityAdded: "future report scaffold",
    whyItMatters: "separates placeholder sections from real results",
    boundarySummary: "schema only with no evaluation results",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  },
  {
    batchId: "14.6",
    batchName: "phase readiness summary and handoff",
    artifactKindsProduced: [
      "phase_14_readiness_summary",
      "phase_15_handoff_boundary"
    ],
    capabilityAdded: "readiness summary and phase handoff",
    whyItMatters: "closes offline groundwork before future advisory design",
    boundarySummary: "handoff only with no routing implementation",
    computesScores: false,
    computesThresholds: false,
    introducesAlpha: false,
    appliesCalibration: false,
    implementsConformalRiskControl: false,
    changesRuntimeBehavior: false
  }
];

const artifactEntries = (
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection,
  evaluationReport: OfflineEvaluationReport
): OfflineReadinessSummary["implementedOfflineArtifacts"]["artifacts"] => [
  {
    artifactKind: "risk_loss_design",
    artifactId: riskLossDesign.designId,
    sourceBatch: "14.1",
    schemaVersion: agentOfflineRiskLossDesignSchemaVersion,
    positiveCapability: "loss and risk design vocabulary",
    downstreamUse: "future score and advisory design",
    syntheticOnly: true,
    mockOnly: false,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "offline_score_input_schema",
    artifactId: inputSet.inputSetId,
    sourceBatch: "14.2",
    schemaVersion: agentOfflineScoreInputSetSchemaVersion,
    positiveCapability: "mock score input schema",
    downstreamUse: "future advisory input mapping",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "mock_nonconformity_input_structure",
    artifactId: inputSet.inputSetId,
    sourceBatch: "14.2",
    schemaVersion: agentOfflineScoreInputSetSchemaVersion,
    positiveCapability: "mock nonconformity input categories",
    downstreamUse: "future score schema design",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "mock_split_simulation",
    artifactId: splitSimulation.simulationId,
    sourceBatch: "14.3",
    schemaVersion: agentOfflineSplitSimulationSchemaVersion,
    positiveCapability: "mock split mechanics",
    downstreamUse: "future split policy design",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "mock_threshold_selection_mechanics",
    artifactId: thresholdSelection.thresholdSelectionId,
    sourceBatch: "14.4",
    schemaVersion: agentOfflineThresholdSelectionSchemaVersion,
    positiveCapability: "mock threshold workflow categories",
    downstreamUse: "future threshold procedure design",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "offline_evaluation_report_schema",
    artifactId: evaluationReport.evaluationReportId,
    sourceBatch: "14.5",
    schemaVersion: agentOfflineEvaluationReportSchemaVersion,
    positiveCapability: "future evaluation report scaffold",
    downstreamUse: "future report boundary testing",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "phase_14_readiness_summary",
    artifactId: "phase-14-offline-readiness-summary-001",
    sourceBatch: "14.6",
    schemaVersion: agentOfflineReadinessSummarySchemaVersion,
    positiveCapability: "phase completion summary",
    downstreamUse: "future phase handoff review",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  },
  {
    artifactKind: "phase_15_handoff_boundary",
    artifactId: "phase-15-advisory-routing-handoff-boundary-001",
    sourceBatch: "14.6",
    positiveCapability: "advisory design boundary",
    downstreamUse: "future phase scope control",
    syntheticOnly: true,
    mockOnly: true,
    realDataUsed: false,
    runtimeIntegrated: false,
    scoresComputed: false,
    thresholdsComputed: false,
    alphaIntroduced: false,
    calibrationApplied: false,
    conformalImplemented: false
  }
];

const artifactChain = (
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection,
  evaluationReport: OfflineEvaluationReport
): OfflineReadinessSummary["artifactChain"] => ({
  edges: [
    {
      fromArtifact: "risk_loss_design",
      fromArtifactId: riskLossDesign.designId,
      toArtifact: "offline_score_input_schema",
      toArtifactId: inputSet.inputSetId,
      relationshipCategory: "defines_inputs_for",
      linkageStatus: "synthetic_mock_linked",
      rawArtifactEmbedded: false
    },
    {
      fromArtifact: "offline_score_input_schema",
      fromArtifactId: inputSet.inputSetId,
      toArtifact: "mock_split_simulation",
      toArtifactId: splitSimulation.simulationId,
      relationshipCategory: "feeds_mock_mechanics",
      linkageStatus: "synthetic_mock_linked",
      rawArtifactEmbedded: false
    },
    {
      fromArtifact: "mock_split_simulation",
      fromArtifactId: splitSimulation.simulationId,
      toArtifact: "mock_threshold_selection_mechanics",
      toArtifactId: thresholdSelection.thresholdSelectionId,
      relationshipCategory: "feeds_mock_threshold_mechanics",
      linkageStatus: "synthetic_mock_linked",
      rawArtifactEmbedded: false
    },
    {
      fromArtifact: "mock_threshold_selection_mechanics",
      fromArtifactId: thresholdSelection.thresholdSelectionId,
      toArtifact: "offline_evaluation_report_schema",
      toArtifactId: evaluationReport.evaluationReportId,
      relationshipCategory: "feeds_report_schema",
      linkageStatus: "synthetic_mock_linked",
      rawArtifactEmbedded: false
    },
    {
      fromArtifact: "offline_evaluation_report_schema",
      fromArtifactId: evaluationReport.evaluationReportId,
      toArtifact: "phase_14_readiness_summary",
      toArtifactId: "phase-14-offline-readiness-summary-001",
      relationshipCategory: "feeds_readiness_summary",
      linkageStatus: "readiness_summary_linked",
      rawArtifactEmbedded: false
    }
  ]
});

const boundarySummary = (): OfflineReadinessSummary["boundarySummary"] => ({
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
  routingBoundaryViolationCount: 0,
  runtimeBoundaryViolationCount: 0
});

export const buildSyntheticOfflineReadinessSummary = (
  riskLossDesign: RiskLossDesign,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation,
  thresholdSelection: OfflineThresholdSelection,
  evaluationReport: OfflineEvaluationReport
): OfflineReadinessSummary => {
  const implementedOfflineArtifacts = {
    artifacts: artifactEntries(
      riskLossDesign,
      inputSet,
      splitSimulation,
      thresholdSelection,
      evaluationReport
    )
  };
  const chain = artifactChain(
    riskLossDesign,
    inputSet,
    splitSimulation,
    thresholdSelection,
    evaluationReport
  );
  const completedPhase14Batches = batchEntries();

  const summary = {
    schemaVersion: agentOfflineReadinessSummarySchemaVersion,
    readinessSummaryId: "phase-14-offline-readiness-summary-001",
    source: "synthetic_phase_14_readiness_summary",
    phase: {
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"],
      currentBatch: "14.6",
      phaseStatus:
        "complete_as_offline_synthetic_mock_prototype_groundwork_only",
      nextPhaseStatus: "phase-15-advisory-routing-future"
    },
    completedPhase14Batches,
    implementedOfflineArtifacts,
    artifactChain: chain,
    phase14CapabilitySummary: {
      riskLossDesignAvailable: true,
      mockScoreInputsAvailable: true,
      mockNonconformityInputsAvailable: true,
      mockSplitMechanicsAvailable: true,
      mockThresholdMechanicsAvailable: true,
      evaluationReportSchemaAvailable: true,
      readinessHandoffAvailable: true,
      offlinePrototypeGroundworkComplete: true,
      realExperimentCapabilityAvailable: false,
      advisoryRoutingCapabilityAvailable: false,
      productionRoutingCapabilityAvailable: false
    },
    missingEvidenceSummary: {
      missingEvidence: agentOfflineMissingEvidenceValues.map(
        (evidenceCategory) => ({
          evidenceCategory,
          status: "future_missing" as const,
          requiredBeforeRealClaims: true as const
        })
      ),
      allEvidenceFutureOrMissing: true
    },
    phase15HandoffSummary: buildPhase15HandoffSummary(),
    advisoryRoutingReadiness: {
      designInputsAvailable: true,
      mockInputsAvailable: true,
      advisorySchemaCanBeDesigned: true,
      advisoryImplementationAllowedNow: false,
      productionAuthorityAllowedNow: false,
      calibrationRequiredBeforeRealUse: true,
      evaluationRequiredBeforeClaims: true,
      humanApprovalRequiredBeforeRoutingChanges: true
    },
    blockerSummary: {
      blockers: agentOfflineBlockerCategoryValues.map((blockerCategory) => ({
        blockerCategory,
        status: "unresolved_future" as const,
        blocksRealCalibration: [
          "no_real_calibration_dataset",
          "no_eligible_reviewed_traces",
          "no_real_scores",
          "no_nonconformity_scores",
          "no_thresholds",
          "no_alpha"
        ].includes(blockerCategory),
        blocksConformalClaims: true,
        blocksAdvisoryRoutingClaims: [
          "no_real_scores",
          "no_nonconformity_scores",
          "no_thresholds",
          "no_alpha",
          "no_empirical_evaluation_results",
          "no_advisory_routing_evaluation"
        ].includes(blockerCategory),
        blocksProductionRouting: true,
        resolutionRequiresFutureBatch: true
      }))
    },
    boundarySummary: boundarySummary(),
    metrics: computeOfflineReadinessMetrics({
      completedPhase14Batches,
      implementedOfflineArtifacts,
      artifactChain: chain
    }),
    safety: {
      inert: true,
      syntheticOnly: true,
      mockOnly: true,
      designOnly: true,
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
      implementsAdvisoryRouting: false,
      implementsProductionRouting: false,
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
      rawRoutingDataIncluded: false,
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
      designOnly: true,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realAgentExecution: false,
      realCodingActionGateExecution: false,
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
      advisoryRoutingImplemented: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "phase_14_complete_as_groundwork_only",
      "phase_15_future",
      "no_advisory_routing_implementation",
      "no_production_routing_change"
    ]
  };

  return validateOfflineReadinessSummary(summary);
};

const forbiddenOfflineReadinessPatterns = [
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
  /metric value/i,
  /routing output/i
] as const;

export const offlineReadinessContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenOfflineReadinessPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
