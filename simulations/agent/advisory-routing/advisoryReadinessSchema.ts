import { z } from "zod";
import { agentAdvisoryRoutingSidecarSchemaVersion } from "./advisoryRoutingSchema.js";
import { agentMockAdvisoryRoutingOutputSchemaVersion } from "./mockAdvisoryRoutingSchema.js";
import { agentAdvisorySideBySideComparisonReportSchemaVersion } from "./sideBySideComparisonSchema.js";
import { agentAdvisoryInterfaceBoundarySchemaVersion } from "./advisoryInterfaceBoundarySchema.js";

export const agentAdvisoryReadinessSummarySchemaVersion =
  "agent-advisory-readiness-summary.v1" as const;

export const advisoryReadinessSourceValues = [
  "synthetic_phase_15_readiness_summary",
  "future_advisory_routing_readiness_summary",
  "future_production_routing_readiness_summary"
] as const;

export const phase15BatchArtifactKindValues = [
  "advisory_sidecar_schema",
  "synthetic_advisory_sidecar_examples",
  "mock_advisory_routing_outputs",
  "side_by_side_comparison_report",
  "advisory_interface_boundary",
  "advisory_readiness_summary",
  "phase_16_gate_boundary",
  "docs",
  "tests",
  "package_metadata"
] as const;

export const phase15ImplementedArtifactKindValues = [
  "advisory_sidecar_schema",
  "mock_advisory_routing_outputs",
  "side_by_side_comparison_report",
  "advisory_interface_boundary",
  "advisory_readiness_summary",
  "phase_16_gate_boundary"
] as const;

export const advisoryReadinessArtifactKindValues = [
  "phase14_readiness_summary",
  ...phase15ImplementedArtifactKindValues
] as const;

export const artifactRelationshipCategoryValues = [
  "readiness_input_to_sidecar_design",
  "sidecar_to_mock_mapping",
  "mock_to_comparison_summary",
  "comparison_to_interface_boundary",
  "interface_boundary_to_readiness_gate"
] as const;

export const advisoryReadinessLinkageStatusValues = [
  "linked_by_stable_synthetic_id",
  "linked_by_schema_version",
  "future_linkage_required"
] as const;

export const missingEvidenceCategoryValues = [
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
  "production_routing_approval",
  "ui_api_cli_product_review",
  "security_privacy_review_for_surfaces"
] as const;

export const phase16AvailableInputValues = [
  "advisory_sidecar_schema",
  "mock_advisory_outputs",
  "side_by_side_comparison_report",
  "advisory_interface_boundary",
  "advisory_readiness_summary",
  "phase14_offline_mock_artifacts",
  "boundary_checklists",
  "claim_boundary_docs"
] as const;

export const phase16MissingInputValues = [
  "real_calibration_dataset",
  "eligible_reviewed_traces",
  "real_scores",
  "nonconformity_scores",
  "thresholds",
  "alpha",
  "empirical_evaluation_results",
  "conformal_crc_results",
  "advisory_routing_evaluation",
  "product_security_review"
] as const;

export const allowedPhase16StartingScopeValues = [
  "production_routing_gate_design",
  "eligibility_criteria_design",
  "default_off_planning",
  "evidence_requirement_planning",
  "claim_boundary_planning"
] as const;

export const forbiddenPhase16StartingClaimValues = [
  "production_routing_is_calibrated",
  "advisory_routing_is_calibrated",
  "conformal_guarantee_exists",
  "risk_is_controlled_at_alpha",
  "real_world_validation_exists",
  "stepharbor_is_production_grade_calibrated_routing"
] as const;

export const advisoryReadinessBlockerCategoryValues = [
  "no_real_calibration_dataset",
  "no_eligible_reviewed_traces",
  "no_real_scores",
  "no_nonconformity_scores",
  "no_thresholds",
  "no_alpha",
  "no_empirical_evaluation_results",
  "no_distribution_shift_assessment",
  "no_advisory_routing_evaluation",
  "no_ui_api_cli_product_review",
  "no_security_privacy_review_for_surfaces",
  "no_approval_for_routing_changes"
] as const;

const safeReadinessSummaryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "readinessSummaryId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const advisoryReadinessSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  advisoryOnly: z.literal(true),
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
  implementsAdvisoryRouting: z.literal(false),
  implementsCalibratedRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  implementsUiSurface: z.literal(false),
  implementsApiSurface: z.literal(false),
  implementsCliSurface: z.literal(false),
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const advisoryReadinessPrivacySchema = z.object({
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
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  rawEvaluationDataIncluded: z.literal(false),
  rawRoutingDataIncluded: z.literal(false),
  rawComparisonDataIncluded: z.literal(false),
  rawInterfaceDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const advisoryReadinessClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  advisoryOnly: z.literal(true),
  advisoryRoutingImplemented: z.literal(false),
  calibratedRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
  uiSurfaceImplemented: z.literal(false),
  apiSurfaceImplemented: z.literal(false),
  cliSurfaceImplemented: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realReviewedTrace: z.literal(false),
  realScores: z.literal(false),
  nonconformityScores: z.literal(false),
  thresholds: z.literal(false),
  alphaIntroduced: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  realEvaluationResults: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const zeroBoundarySummarySchema = z.object({
  safetyBoundaryViolationCount: z.literal(0),
  privacyBoundaryViolationCount: z.literal(0),
  claimBoundaryViolationCount: z.literal(0),
  rawDataBoundaryViolationCount: z.literal(0),
  advisoryRoutingBoundaryViolationCount: z.literal(0),
  interfaceBoundaryViolationCount: z.literal(0),
  calibrationBoundaryViolationCount: z.literal(0),
  conformalBoundaryViolationCount: z.literal(0),
  productionRoutingBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0)
});

export const advisoryReadinessSummarySchema = z.object({
  schemaVersion: z.literal(agentAdvisoryReadinessSummarySchemaVersion),
  readinessSummaryId: safeReadinessSummaryIdSchema,
  source: z.enum(advisoryReadinessSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-15"),
    phaseName: z.literal("Advisory Calibrated Routing Design"),
    completedPreviousPhase: z.literal(
      "phase-14-complete-offline-synthetic-mock-groundwork-only"
    ),
    completedBatches: z
      .array(z.enum(["15.1", "15.2", "15.3", "15.4", "15.5"]))
      .length(5),
    currentBatch: z.literal("15.5"),
    phaseStatus: z.literal(
      "complete_as_advisory_routing_design_and_readiness_groundwork_only"
    ),
    nextPhaseStatus: z.literal(
      "phase-16-production_authoritative_calibrated_routing_gate_future"
    )
  }),
  completedPhase15Batches: z
    .array(
      z.object({
        batchId: z.enum(["15.1", "15.2", "15.3", "15.4", "15.5"]),
        batchName: z.string().min(1),
        artifactKindsProduced: z
          .array(z.enum(phase15BatchArtifactKindValues))
          .min(1),
        capabilityAdded: z.string().min(1),
        whyItMatters: z.string().min(1),
        boundarySummary: z.string().min(1),
        implementsAdvisoryRouting: z.literal(false),
        implementsCalibratedRouting: z.literal(false),
        changesRuntimeBehavior: z.literal(false),
        changesProductionRouting: z.literal(false),
        addsUiApiCliSurface: z.literal(false)
      })
    )
    .length(5),
  implementedAdvisoryArtifacts: z.object({
    artifacts: z
      .array(
        z.object({
          artifactKind: z.enum(phase15ImplementedArtifactKindValues),
          sourceBatch: z.enum(["15.1", "15.2", "15.3", "15.4", "15.5"]),
          schemaVersion: z.string().min(1).optional(),
          positiveCapability: z.string().min(1),
          downstreamUse: z.string().min(1),
          syntheticOnly: z.literal(true),
          mockOnly: z.boolean(),
          advisoryOnly: z.literal(true),
          runtimeIntegrated: z.literal(false),
          advisoryRoutingImplemented: z.literal(false),
          calibratedRoutingImplemented: z.literal(false),
          productionRoutingChanged: z.literal(false)
        })
      )
      .length(6)
  }),
  artifactChain: z.object({
    orderedArtifacts: z
      .array(z.enum(advisoryReadinessArtifactKindValues))
      .length(6),
    edges: z
      .array(
        z.object({
          fromArtifact: z.enum(advisoryReadinessArtifactKindValues),
          toArtifact: z.enum(advisoryReadinessArtifactKindValues),
          relationshipCategory: z.enum(artifactRelationshipCategoryValues),
          linkageStatus: z.enum(advisoryReadinessLinkageStatusValues),
          rawArtifactEmbedded: z.literal(false)
        })
      )
      .length(5),
    linkedIds: z.object({
      phase14ReadinessSummaryId: z.literal(
        "phase-14-offline-readiness-summary-001"
      ),
      sidecarIds: z.array(z.string().min(1)).min(1),
      mockRoutingOutputIds: z.array(z.string().min(1)).min(1),
      sideBySideComparisonReportId: z.string().min(1),
      advisoryInterfaceBoundaryId: z.string().min(1),
      advisoryReadinessSummaryId: z.string().min(1)
    })
  }),
  phase15CapabilitySummary: z.object({
    advisorySidecarSchemaAvailable: z.literal(true),
    mockAdvisoryOutputsAvailable: z.literal(true),
    sideBySideComparisonAvailable: z.literal(true),
    interfaceBoundaryAvailable: z.literal(true),
    readinessGateAvailable: z.literal(true),
    advisoryDesignGroundworkComplete: z.literal(true),
    realAdvisoryRoutingAvailable: z.literal(false),
    calibratedAdvisoryRoutingAvailable: z.literal(false),
    productionRoutingAuthorityAvailable: z.literal(false),
    uiApiCliSurfaceAvailable: z.literal(false)
  }),
  missingEvidenceSummary: z.object({
    missingCategories: z
      .array(z.enum(missingEvidenceCategoryValues))
      .length(missingEvidenceCategoryValues.length),
    evidenceStatus: z.literal("missing_future"),
    allEvidenceFuture: z.literal(true)
  }),
  phase16GateSummary: z.object({
    handoffReadyForProductionRoutingGateDesign: z.literal(true),
    handoffReadyForProductionRoutingImplementation: z.literal(false),
    handoffReadyForCalibratedRoutingAuthority: z.literal(false),
    availableInputs: z.array(z.enum(phase16AvailableInputValues)).min(1),
    missingInputs: z
      .array(z.enum(phase16MissingInputValues))
      .length(phase16MissingInputValues.length),
    allowedPhase16StartingScope: z
      .array(z.enum(allowedPhase16StartingScopeValues))
      .min(1),
    forbiddenPhase16StartingClaims: z
      .array(z.enum(forbiddenPhase16StartingClaimValues))
      .length(forbiddenPhase16StartingClaimValues.length)
  }),
  productionRoutingReadiness: z.object({
    designInputsAvailable: z.literal(true),
    advisoryArtifactsAvailable: z.literal(true),
    mockComparisonAvailable: z.literal(true),
    interfaceBoundaryAvailable: z.literal(true),
    productionRoutingGateCanBeDesigned: z.literal(true),
    productionRoutingImplementationAllowedNow: z.literal(false),
    calibratedRoutingAuthorityAllowedNow: z.literal(false),
    calibrationRequiredBeforeRealUse: z.literal(true),
    evaluationRequiredBeforeClaims: z.literal(true),
    humanApprovalRequiredBeforeRoutingChanges: z.literal(true),
    defaultOffRequiredForAnyFutureImplementation: z.literal(true)
  }),
  blockerSummary: z.object({
    blockers: z
      .array(
        z.object({
          blockerCategory: z.enum(advisoryReadinessBlockerCategoryValues),
          blocksCalibratedAdvisoryRouting: z.boolean(),
          blocksProductionRouting: z.boolean(),
          blocksConformalClaims: z.boolean(),
          blocksProductClaims: z.boolean(),
          resolutionRequiresFutureBatch: z.literal(true),
          resolved: z.literal(false)
        })
      )
      .length(advisoryReadinessBlockerCategoryValues.length)
  }),
  boundarySummary: zeroBoundarySummarySchema,
  metrics: z.object({
    completedPhase15BatchCount: z.literal(5),
    implementedAdvisoryArtifactCount: z.number().int().nonnegative(),
    artifactChainEdgeCount: z.number().int().nonnegative(),
    realCalibrationDatasetCount: z.literal(0),
    realReviewedTraceCount: z.literal(0),
    realScoreCount: z.literal(0),
    realNonconformityScoreCount: z.literal(0),
    realThresholdCount: z.literal(0),
    alphaValueCount: z.literal(0),
    empiricalEvaluationResultCount: z.literal(0),
    advisoryRoutingImplementationCount: z.literal(0),
    calibratedRoutingImplementationCount: z.literal(0),
    productionRoutingChangeCount: z.literal(0),
    uiSurfaceImplementationCount: z.literal(0),
    apiSurfaceImplementationCount: z.literal(0),
    cliSurfaceImplementationCount: z.literal(0)
  }),
  safety: advisoryReadinessSafetySchema,
  privacy: advisoryReadinessPrivacySchema,
  claimBoundaries: advisoryReadinessClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type AdvisoryReadinessSummary = z.infer<
  typeof advisoryReadinessSummarySchema
>;

export const computeAdvisoryReadinessMetrics = (input: {
  completedPhase15BatchCount: number;
  implementedAdvisoryArtifactCount: number;
  artifactChainEdgeCount: number;
}): AdvisoryReadinessSummary["metrics"] => ({
  completedPhase15BatchCount: 5,
  implementedAdvisoryArtifactCount: input.implementedAdvisoryArtifactCount,
  artifactChainEdgeCount: input.artifactChainEdgeCount,
  realCalibrationDatasetCount: 0,
  realReviewedTraceCount: 0,
  realScoreCount: 0,
  realNonconformityScoreCount: 0,
  realThresholdCount: 0,
  alphaValueCount: 0,
  empiricalEvaluationResultCount: 0,
  advisoryRoutingImplementationCount: 0,
  calibratedRoutingImplementationCount: 0,
  productionRoutingChangeCount: 0,
  uiSurfaceImplementationCount: 0,
  apiSurfaceImplementationCount: 0,
  cliSurfaceImplementationCount: 0
});

export const buildPhase16GateSummary =
  (): AdvisoryReadinessSummary["phase16GateSummary"] => ({
    handoffReadyForProductionRoutingGateDesign: true,
    handoffReadyForProductionRoutingImplementation: false,
    handoffReadyForCalibratedRoutingAuthority: false,
    availableInputs: [...phase16AvailableInputValues],
    missingInputs: [...phase16MissingInputValues],
    allowedPhase16StartingScope: [...allowedPhase16StartingScopeValues],
    forbiddenPhase16StartingClaims: [...forbiddenPhase16StartingClaimValues]
  });

const completedPhase15Batches: AdvisoryReadinessSummary["completedPhase15Batches"] =
  [
    {
      batchId: "15.1",
      batchName: "Advisory Routing Schema and Decision-Sidecar Design",
      artifactKindsProduced: [
        "advisory_sidecar_schema",
        "synthetic_advisory_sidecar_examples",
        "docs",
        "tests",
        "package_metadata"
      ],
      capabilityAdded: "typed_advisory_sidecar_design",
      whyItMatters: "defines future metadata beside deterministic decisions",
      boundarySummary: "sidecars_are_non_authoritative_design_artifacts",
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      changesRuntimeBehavior: false,
      changesProductionRouting: false,
      addsUiApiCliSurface: false
    },
    {
      batchId: "15.2",
      batchName: "Mock Advisory Routing Prototype over Synthetic Inputs",
      artifactKindsProduced: [
        "mock_advisory_routing_outputs",
        "docs",
        "tests",
        "package_metadata"
      ],
      capabilityAdded: "mock_advisory_output_categories",
      whyItMatters: "shows category-only advisory output structure",
      boundarySummary: "mock_outputs_do_not_route",
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      changesRuntimeBehavior: false,
      changesProductionRouting: false,
      addsUiApiCliSurface: false
    },
    {
      batchId: "15.3",
      batchName: "Side-by-Side Comparison Report",
      artifactKindsProduced: [
        "side_by_side_comparison_report",
        "docs",
        "tests",
        "package_metadata"
      ],
      capabilityAdded: "deterministic_vs_mock_advisory_comparison",
      whyItMatters: "makes deterministic authority inspectable",
      boundarySummary: "comparison_counts_are_not_empirical_metrics",
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      changesRuntimeBehavior: false,
      changesProductionRouting: false,
      addsUiApiCliSurface: false
    },
    {
      batchId: "15.4",
      batchName: "Advisory Routing UI/API Boundary Design",
      artifactKindsProduced: [
        "advisory_interface_boundary",
        "docs",
        "tests",
        "package_metadata"
      ],
      capabilityAdded: "future_interface_boundary_categories",
      whyItMatters: "defines read-only exposure boundaries before surfaces",
      boundarySummary: "no_ui_api_cli_surface_added",
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      changesRuntimeBehavior: false,
      changesProductionRouting: false,
      addsUiApiCliSurface: false
    },
    {
      batchId: "15.5",
      batchName: "Advisory Routing Readiness Summary and Phase 16 Gate",
      artifactKindsProduced: [
        "advisory_readiness_summary",
        "phase_16_gate_boundary",
        "docs",
        "tests",
        "package_metadata"
      ],
      capabilityAdded: "phase_15_completion_and_phase_16_gate",
      whyItMatters: "closes advisory design groundwork with explicit blockers",
      boundarySummary: "phase_16_not_started",
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      changesRuntimeBehavior: false,
      changesProductionRouting: false,
      addsUiApiCliSurface: false
    }
  ];

const implementedArtifacts = [
  {
    artifactKind: "advisory_sidecar_schema",
    sourceBatch: "15.1",
    schemaVersion: agentAdvisoryRoutingSidecarSchemaVersion,
    positiveCapability: "sidecar_schema_available",
    downstreamUse: "input_to_mock_advisory_outputs",
    syntheticOnly: true,
    mockOnly: false,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  },
  {
    artifactKind: "mock_advisory_routing_outputs",
    sourceBatch: "15.2",
    schemaVersion: agentMockAdvisoryRoutingOutputSchemaVersion,
    positiveCapability: "mock_output_schema_available",
    downstreamUse: "input_to_side_by_side_comparison",
    syntheticOnly: true,
    mockOnly: true,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  },
  {
    artifactKind: "side_by_side_comparison_report",
    sourceBatch: "15.3",
    schemaVersion: agentAdvisorySideBySideComparisonReportSchemaVersion,
    positiveCapability: "comparison_report_available",
    downstreamUse: "input_to_interface_boundary",
    syntheticOnly: true,
    mockOnly: true,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  },
  {
    artifactKind: "advisory_interface_boundary",
    sourceBatch: "15.4",
    schemaVersion: agentAdvisoryInterfaceBoundarySchemaVersion,
    positiveCapability: "interface_boundary_available",
    downstreamUse: "input_to_readiness_gate",
    syntheticOnly: true,
    mockOnly: true,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  },
  {
    artifactKind: "advisory_readiness_summary",
    sourceBatch: "15.5",
    schemaVersion: agentAdvisoryReadinessSummarySchemaVersion,
    positiveCapability: "readiness_summary_available",
    downstreamUse: "phase_15_completion_record",
    syntheticOnly: true,
    mockOnly: true,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  },
  {
    artifactKind: "phase_16_gate_boundary",
    sourceBatch: "15.5",
    positiveCapability: "phase_16_gate_available",
    downstreamUse: "future_production_routing_gate_design",
    syntheticOnly: true,
    mockOnly: true,
    advisoryOnly: true,
    runtimeIntegrated: false,
    advisoryRoutingImplemented: false,
    calibratedRoutingImplemented: false,
    productionRoutingChanged: false
  }
] satisfies AdvisoryReadinessSummary["implementedAdvisoryArtifacts"]["artifacts"];

export const buildSyntheticAdvisoryReadinessSummary = (input: {
  sidecarIds: string[];
  mockRoutingOutputIds: string[];
  sideBySideComparisonReportId: string;
  advisoryInterfaceBoundaryId: string;
}): AdvisoryReadinessSummary =>
  validateAdvisoryReadinessSummary({
    schemaVersion: agentAdvisoryReadinessSummarySchemaVersion,
    readinessSummaryId: "phase-15-advisory-readiness-summary-001",
    source: "synthetic_phase_15_readiness_summary",
    phase: {
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2", "15.3", "15.4", "15.5"],
      currentBatch: "15.5",
      phaseStatus:
        "complete_as_advisory_routing_design_and_readiness_groundwork_only",
      nextPhaseStatus:
        "phase-16-production_authoritative_calibrated_routing_gate_future"
    },
    completedPhase15Batches,
    implementedAdvisoryArtifacts: {
      artifacts: implementedArtifacts
    },
    artifactChain: {
      orderedArtifacts: [
        "phase14_readiness_summary",
        "advisory_sidecar_schema",
        "mock_advisory_routing_outputs",
        "side_by_side_comparison_report",
        "advisory_interface_boundary",
        "advisory_readiness_summary"
      ],
      edges: [
        {
          fromArtifact: "phase14_readiness_summary",
          toArtifact: "advisory_sidecar_schema",
          relationshipCategory: "readiness_input_to_sidecar_design",
          linkageStatus: "linked_by_stable_synthetic_id",
          rawArtifactEmbedded: false
        },
        {
          fromArtifact: "advisory_sidecar_schema",
          toArtifact: "mock_advisory_routing_outputs",
          relationshipCategory: "sidecar_to_mock_mapping",
          linkageStatus: "linked_by_stable_synthetic_id",
          rawArtifactEmbedded: false
        },
        {
          fromArtifact: "mock_advisory_routing_outputs",
          toArtifact: "side_by_side_comparison_report",
          relationshipCategory: "mock_to_comparison_summary",
          linkageStatus: "linked_by_stable_synthetic_id",
          rawArtifactEmbedded: false
        },
        {
          fromArtifact: "side_by_side_comparison_report",
          toArtifact: "advisory_interface_boundary",
          relationshipCategory: "comparison_to_interface_boundary",
          linkageStatus: "linked_by_stable_synthetic_id",
          rawArtifactEmbedded: false
        },
        {
          fromArtifact: "advisory_interface_boundary",
          toArtifact: "advisory_readiness_summary",
          relationshipCategory: "interface_boundary_to_readiness_gate",
          linkageStatus: "linked_by_stable_synthetic_id",
          rawArtifactEmbedded: false
        }
      ],
      linkedIds: {
        phase14ReadinessSummaryId: "phase-14-offline-readiness-summary-001",
        sidecarIds: [...input.sidecarIds].sort((left, right) =>
          left.localeCompare(right)
        ),
        mockRoutingOutputIds: [...input.mockRoutingOutputIds].sort(
          (left, right) => left.localeCompare(right)
        ),
        sideBySideComparisonReportId: input.sideBySideComparisonReportId,
        advisoryInterfaceBoundaryId: input.advisoryInterfaceBoundaryId,
        advisoryReadinessSummaryId: "phase-15-advisory-readiness-summary-001"
      }
    },
    phase15CapabilitySummary: {
      advisorySidecarSchemaAvailable: true,
      mockAdvisoryOutputsAvailable: true,
      sideBySideComparisonAvailable: true,
      interfaceBoundaryAvailable: true,
      readinessGateAvailable: true,
      advisoryDesignGroundworkComplete: true,
      realAdvisoryRoutingAvailable: false,
      calibratedAdvisoryRoutingAvailable: false,
      productionRoutingAuthorityAvailable: false,
      uiApiCliSurfaceAvailable: false
    },
    missingEvidenceSummary: {
      missingCategories: [...missingEvidenceCategoryValues],
      evidenceStatus: "missing_future",
      allEvidenceFuture: true
    },
    phase16GateSummary: buildPhase16GateSummary(),
    productionRoutingReadiness: {
      designInputsAvailable: true,
      advisoryArtifactsAvailable: true,
      mockComparisonAvailable: true,
      interfaceBoundaryAvailable: true,
      productionRoutingGateCanBeDesigned: true,
      productionRoutingImplementationAllowedNow: false,
      calibratedRoutingAuthorityAllowedNow: false,
      calibrationRequiredBeforeRealUse: true,
      evaluationRequiredBeforeClaims: true,
      humanApprovalRequiredBeforeRoutingChanges: true,
      defaultOffRequiredForAnyFutureImplementation: true
    },
    blockerSummary: {
      blockers: advisoryReadinessBlockerCategoryValues.map((category) => ({
        blockerCategory: category,
        blocksCalibratedAdvisoryRouting: true,
        blocksProductionRouting: true,
        blocksConformalClaims: true,
        blocksProductClaims:
          category.includes("ui_api_cli") || category.includes("approval"),
        resolutionRequiresFutureBatch: true,
        resolved: false
      }))
    },
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      advisoryRoutingBoundaryViolationCount: 0,
      interfaceBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      productionRoutingBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    metrics: computeAdvisoryReadinessMetrics({
      completedPhase15BatchCount: 5,
      implementedAdvisoryArtifactCount: implementedArtifacts.length,
      artifactChainEdgeCount: 5
    }),
    safety: {
      inert: true,
      syntheticOnly: true,
      mockOnly: true,
      designOnly: true,
      advisoryOnly: true,
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
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      implementsProductionRouting: false,
      implementsUiSurface: false,
      implementsApiSurface: false,
      implementsCliSurface: false,
      appliesCalibration: false,
      computesScores: false,
      computesThresholds: false,
      introducesAlpha: false,
      implementsConformalRiskControl: false
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
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
      rawEvaluationDataIncluded: false,
      rawRoutingDataIncluded: false,
      rawComparisonDataIncluded: false,
      rawInterfaceDataIncluded: false,
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
      advisoryOnly: true,
      advisoryRoutingImplemented: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false,
      uiSurfaceImplemented: false,
      apiSurfaceImplemented: false,
      cliSurfaceImplemented: false,
      realCalibrationDataset: false,
      realReviewedTrace: false,
      realScores: false,
      nonconformityScores: false,
      thresholds: false,
      alphaIntroduced: false,
      calibrationApplied: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      realEvaluationResults: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "phase_15_complete_as_design_groundwork",
      "phase_16_not_started",
      "deterministic_decisions_authoritative",
      "production_routing_gate_future"
    ]
  });

export const validateAdvisoryReadinessSummary = (
  summary: unknown
): AdvisoryReadinessSummary => advisoryReadinessSummarySchema.parse(summary);

export const validateAdvisoryReadinessSummaries = (
  summaries: unknown[]
): AdvisoryReadinessSummary[] =>
  summaries
    .map(validateAdvisoryReadinessSummary)
    .sort((left, right) =>
      left.readinessSummaryId.localeCompare(right.readinessSummaryId)
    );

export const summarizeAdvisoryReadiness = (
  summary: AdvisoryReadinessSummary
): {
  readinessSummaryId: string;
  completedPhase15BatchCount: 5;
  implementedAdvisoryArtifactCount: number;
  artifactChainEdgeCount: number;
  handoffReadyForProductionRoutingGateDesign: true;
  handoffReadyForProductionRoutingImplementation: false;
  advisoryDesignGroundworkComplete: true;
  productionRoutingImplementationAllowedNow: false;
  calibratedRoutingAuthorityAllowedNow: false;
  advisoryRoutingImplemented: false;
  productionRoutingChanged: false;
} => ({
  readinessSummaryId: summary.readinessSummaryId,
  completedPhase15BatchCount: summary.metrics.completedPhase15BatchCount,
  implementedAdvisoryArtifactCount:
    summary.metrics.implementedAdvisoryArtifactCount,
  artifactChainEdgeCount: summary.metrics.artifactChainEdgeCount,
  handoffReadyForProductionRoutingGateDesign:
    summary.phase16GateSummary.handoffReadyForProductionRoutingGateDesign,
  handoffReadyForProductionRoutingImplementation:
    summary.phase16GateSummary.handoffReadyForProductionRoutingImplementation,
  advisoryDesignGroundworkComplete:
    summary.phase15CapabilitySummary.advisoryDesignGroundworkComplete,
  productionRoutingImplementationAllowedNow:
    summary.productionRoutingReadiness
      .productionRoutingImplementationAllowedNow,
  calibratedRoutingAuthorityAllowedNow:
    summary.productionRoutingReadiness.calibratedRoutingAuthorityAllowedNow,
  advisoryRoutingImplemented:
    summary.claimBoundaries.advisoryRoutingImplemented,
  productionRoutingChanged: summary.claimBoundaries.productionRoutingChanged
});

export const validateAdvisoryReadinessBoundaries = (
  summary: AdvisoryReadinessSummary
): void => {
  advisoryReadinessSafetySchema.parse(summary.safety);
  advisoryReadinessPrivacySchema.parse(summary.privacy);
  advisoryReadinessClaimBoundariesSchema.parse(summary.claimBoundaries);

  if (
    summary.source !== "synthetic_phase_15_readiness_summary" ||
    summary.phase.nextPhaseStatus !==
      "phase-16-production_authoritative_calibrated_routing_gate_future" ||
    summary.phase16GateSummary.handoffReadyForProductionRoutingImplementation ||
    summary.phase16GateSummary.handoffReadyForCalibratedRoutingAuthority ||
    summary.productionRoutingReadiness
      .productionRoutingImplementationAllowedNow ||
    summary.productionRoutingReadiness.calibratedRoutingAuthorityAllowedNow ||
    summary.phase15CapabilitySummary.realAdvisoryRoutingAvailable ||
    summary.phase15CapabilitySummary.calibratedAdvisoryRoutingAvailable ||
    summary.phase15CapabilitySummary.productionRoutingAuthorityAvailable ||
    summary.phase15CapabilitySummary.uiApiCliSurfaceAvailable ||
    summary.completedPhase15Batches.some(
      (batch) =>
        batch.implementsAdvisoryRouting ||
        batch.implementsCalibratedRouting ||
        batch.changesRuntimeBehavior ||
        batch.changesProductionRouting ||
        batch.addsUiApiCliSurface
    ) ||
    summary.implementedAdvisoryArtifacts.artifacts.some(
      (artifact) =>
        !artifact.syntheticOnly ||
        !artifact.advisoryOnly ||
        artifact.runtimeIntegrated ||
        artifact.advisoryRoutingImplemented ||
        artifact.calibratedRoutingImplemented ||
        artifact.productionRoutingChanged
    ) ||
    summary.artifactChain.edges.some((edge) => edge.rawArtifactEmbedded) ||
    Object.values(summary.boundarySummary).some((count) => count !== 0) ||
    summary.blockerSummary.blockers.some((blocker) => blocker.resolved) ||
    summary.metrics.realCalibrationDatasetCount !== 0 ||
    summary.metrics.realReviewedTraceCount !== 0 ||
    summary.metrics.realScoreCount !== 0 ||
    summary.metrics.realNonconformityScoreCount !== 0 ||
    summary.metrics.realThresholdCount !== 0 ||
    summary.metrics.alphaValueCount !== 0 ||
    summary.metrics.empiricalEvaluationResultCount !== 0 ||
    summary.metrics.advisoryRoutingImplementationCount !== 0 ||
    summary.metrics.calibratedRoutingImplementationCount !== 0 ||
    summary.metrics.productionRoutingChangeCount !== 0 ||
    summary.metrics.uiSurfaceImplementationCount !== 0 ||
    summary.metrics.apiSurfaceImplementationCount !== 0 ||
    summary.metrics.cliSurfaceImplementationCount !== 0
  ) {
    throw new Error("Advisory readiness summary crosses a declared boundary");
  }
};

const forbiddenAdvisoryReadinessPatterns = [
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
  /score value/i,
  /threshold value/i,
  /interface payload/i,
  /routing output/i
] as const;

export const advisoryReadinessContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenAdvisoryReadinessPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
