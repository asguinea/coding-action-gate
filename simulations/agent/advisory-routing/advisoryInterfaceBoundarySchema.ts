import { z } from "zod";
import { agentAdvisoryRoutingSidecarSchemaVersion } from "./advisoryRoutingSchema.js";
import { agentMockAdvisoryRoutingOutputSchemaVersion } from "./mockAdvisoryRoutingSchema.js";
import { agentAdvisorySideBySideComparisonReportSchemaVersion } from "./sideBySideComparisonSchema.js";

export const agentAdvisoryInterfaceBoundarySchemaVersion =
  "agent-advisory-interface-boundary.v1" as const;

export const advisoryInterfaceBoundarySourceValues = [
  "synthetic_advisory_interface_boundary",
  "future_advisory_interface_design",
  "future_advisory_interface_implementation"
] as const;

export const advisoryInterfaceScopeKindValues = [
  "boundary_design_only",
  "future_interface_design",
  "future_limited_interface_implementation"
] as const;

export const advisoryFuturePanelCategoryValues = [
  "advisory_sidecar_panel",
  "advisory_comparison_panel",
  "advisory_evidence_requirements_panel",
  "advisory_authority_boundary_panel",
  "advisory_readiness_panel"
] as const;

export const advisoryFutureDisplayModeValues = [
  "read_only_advisory_metadata",
  "side_by_side_decision_comparison",
  "boundary_warning_display",
  "future_requirements_display"
] as const;

export const advisoryFutureEndpointCategoryValues = [
  "advisory_sidecar_read_endpoint",
  "advisory_comparison_read_endpoint",
  "advisory_readiness_read_endpoint",
  "advisory_boundary_read_endpoint"
] as const;

export const advisoryFutureResponseShapeValues = [
  "read_only_advisory_sidecar_response",
  "read_only_comparison_summary_response",
  "read_only_boundary_summary_response",
  "read_only_future_requirements_response"
] as const;

export const advisoryFutureCommandCategoryValues = [
  "advisory_show",
  "advisory_compare",
  "advisory_readiness",
  "advisory_boundary"
] as const;

export const advisoryFutureOutputShapeValues = [
  "read_only_advisory_summary",
  "read_only_side_by_side_summary",
  "read_only_boundary_summary",
  "read_only_future_requirements_summary"
] as const;

export const advisoryFutureInterfaceArtifactValues = [
  "advisory_sidecar_summary",
  "mock_advisory_summary",
  "side_by_side_comparison_summary",
  "authority_boundary_summary",
  "future_evidence_requirements_summary",
  "phase_14_readiness_reference"
] as const;

export const advisoryProhibitedFutureContentValues = [
  "raw_prompt",
  "raw_agent_output",
  "raw_command",
  "raw_diff",
  "raw_source_code",
  "raw_trace",
  "raw_review_text",
  "raw_score_data",
  "raw_threshold_data",
  "raw_private_data"
] as const;

export const advisoryInterfaceFutureImplementationRequirementValues = [
  "explicit_scope_required",
  "product_design_review_required",
  "privacy_review_required",
  "security_review_required",
  "claim_boundary_review_required",
  "read_only_surface_required",
  "no_runtime_authority_required",
  "redaction_tests_required",
  "operator_documentation_required",
  "human_approval_required"
] as const;

const safeInterfaceBoundaryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "interfaceBoundaryId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const advisoryInterfaceSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  advisoryOnly: z.literal(true),
  interfaceDesignOnly: z.literal(true),
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
  implementsUiSurface: z.literal(false),
  implementsApiSurface: z.literal(false),
  implementsCliSurface: z.literal(false),
  implementsAdvisoryRouting: z.literal(false),
  implementsCalibratedRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const advisoryInterfacePrivacySchema = z.object({
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

export const advisoryInterfaceClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  advisoryOnly: z.literal(true),
  interfaceImplemented: z.literal(false),
  uiSurfaceImplemented: z.literal(false),
  apiSurfaceImplemented: z.literal(false),
  cliSurfaceImplemented: z.literal(false),
  advisoryRoutingImplemented: z.literal(false),
  calibratedRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
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

export const advisoryDisplayAuthorityBoundarySchema = z.object({
  deterministicDecisionAuthoritative: z.literal(true),
  advisoryDisplayNonAuthoritative: z.literal(true),
  displayCanOverrideDecision: z.literal(false),
  displayCanTriggerRuntimeAction: z.literal(false),
  displayCanChangeRouting: z.literal(false),
  requiresFutureExplicitIntegration: z.literal(true),
  requiresHumanApprovalBeforeImplementation: z.literal(true)
});

export const advisoryPrivacyRedactionBoundarySchema = z.object({
  categoryOnlyByDefault: z.literal(true),
  rawPromptsProhibited: z.literal(true),
  rawAgentOutputsProhibited: z.literal(true),
  rawCommandsProhibited: z.literal(true),
  rawDiffsProhibited: z.literal(true),
  rawSourceCodeProhibited: z.literal(true),
  rawTracesProhibited: z.literal(true),
  rawReviewsProhibited: z.literal(true),
  rawScoresProhibited: z.literal(true),
  rawThresholdsProhibited: z.literal(true),
  privateDataProhibited: z.literal(true),
  futureRedactionRequiredBeforeAnySurface: z.literal(true)
});

export const advisoryInterfaceBoundarySchema = z.object({
  schemaVersion: z.literal(agentAdvisoryInterfaceBoundarySchemaVersion),
  interfaceBoundaryId: safeInterfaceBoundaryIdSchema,
  source: z.enum(advisoryInterfaceBoundarySourceValues),
  phase: z.object({
    phaseId: z.literal("phase-15"),
    phaseName: z.literal("Advisory Calibrated Routing Design"),
    completedPreviousPhase: z.literal(
      "phase-14-complete-offline-synthetic-mock-groundwork-only"
    ),
    completedBatches: z.array(z.enum(["15.1", "15.2", "15.3"])).length(3),
    currentBatch: z.literal("15.4"),
    futureBatches: z.array(z.literal("15.5")).length(1),
    phaseStatus: z.literal(
      "advisory_interface_boundary_design_without_ui_api_cli_implementation"
    )
  }),
  linkedAdvisoryArtifacts: z.object({
    sidecarIds: z.array(z.string().min(1)).min(1),
    sidecarSchemaVersion: z.literal(agentAdvisoryRoutingSidecarSchemaVersion),
    mockRoutingOutputIds: z.array(z.string().min(1)).min(1),
    mockRoutingSchemaVersion: z.literal(
      agentMockAdvisoryRoutingOutputSchemaVersion
    ),
    sideBySideComparisonReportId: z.string().min(1),
    sideBySideComparisonSchemaVersion: z.literal(
      agentAdvisorySideBySideComparisonReportSchemaVersion
    ),
    phase14ReadinessSummaryId: z.literal(
      "phase-14-offline-readiness-summary-001"
    ),
    rawArtifactsIncluded: z.literal(false)
  }),
  interfaceScope: z.object({
    scopeKind: z.literal("boundary_design_only"),
    currentSurfaceStatus: z.literal("no_ui_api_cli_surface_implemented"),
    uiImplemented: z.literal(false),
    apiImplemented: z.literal(false),
    cliImplemented: z.literal(false),
    runtimeIntegrated: z.literal(false),
    productionEnabled: z.literal(false)
  }),
  futureUiBoundary: z.object({
    futurePanelCategories: z
      .array(z.enum(advisoryFuturePanelCategoryValues))
      .min(1),
    futureDisplayModes: z.array(z.enum(advisoryFutureDisplayModeValues)).min(1),
    allowedFutureDisplayedArtifacts: z
      .array(z.enum(advisoryFutureInterfaceArtifactValues))
      .min(1),
    prohibitedFutureDisplayedContent: z
      .array(z.enum(advisoryProhibitedFutureContentValues))
      .length(advisoryProhibitedFutureContentValues.length),
    uiImplemented: z.literal(false),
    dashboardPanelAdded: z.literal(false),
    mayChangeDecisionFromUi: z.literal(false)
  }),
  futureApiBoundary: z.object({
    futureEndpointCategories: z
      .array(z.enum(advisoryFutureEndpointCategoryValues))
      .min(1),
    futureResponseShapes: z
      .array(z.enum(advisoryFutureResponseShapeValues))
      .min(1),
    allowedFutureResponseArtifacts: z
      .array(z.enum(advisoryFutureInterfaceArtifactValues))
      .min(1),
    prohibitedFutureResponseContent: z
      .array(z.enum(advisoryProhibitedFutureContentValues))
      .length(advisoryProhibitedFutureContentValues.length),
    apiImplemented: z.literal(false),
    endpointAdded: z.literal(false),
    mayChangeDecisionFromApi: z.literal(false)
  }),
  futureCliBoundary: z.object({
    futureCommandCategories: z
      .array(z.enum(advisoryFutureCommandCategoryValues))
      .min(1),
    futureOutputShapes: z.array(z.enum(advisoryFutureOutputShapeValues)).min(1),
    allowedFutureOutputArtifacts: z
      .array(z.enum(advisoryFutureInterfaceArtifactValues))
      .min(1),
    prohibitedFutureOutputContent: z
      .array(z.enum(advisoryProhibitedFutureContentValues))
      .length(advisoryProhibitedFutureContentValues.length),
    cliImplemented: z.literal(false),
    commandAdded: z.literal(false),
    mayChangeDecisionFromCli: z.literal(false)
  }),
  displayAuthorityBoundary: advisoryDisplayAuthorityBoundarySchema,
  privacyRedactionBoundary: advisoryPrivacyRedactionBoundarySchema,
  futureImplementationRequirements: z.object({
    requiredCategories: z
      .array(z.enum(advisoryInterfaceFutureImplementationRequirementValues))
      .length(advisoryInterfaceFutureImplementationRequirementValues.length),
    requirementStatus: z.literal("future_unmet"),
    allRequirementsFuture: z.literal(true)
  }),
  safety: advisoryInterfaceSafetySchema,
  privacy: advisoryInterfacePrivacySchema,
  claimBoundaries: advisoryInterfaceClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type AdvisoryInterfaceBoundary = z.infer<
  typeof advisoryInterfaceBoundarySchema
>;

export const buildAdvisoryInterfaceBoundary = (input: {
  sidecarIds: string[];
  mockRoutingOutputIds: string[];
  sideBySideComparisonReportId: string;
}): AdvisoryInterfaceBoundary =>
  validateAdvisoryInterfaceBoundary({
    schemaVersion: agentAdvisoryInterfaceBoundarySchemaVersion,
    interfaceBoundaryId: "phase-15-advisory-interface-boundary-001",
    source: "synthetic_advisory_interface_boundary",
    phase: {
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2", "15.3"],
      currentBatch: "15.4",
      futureBatches: ["15.5"],
      phaseStatus:
        "advisory_interface_boundary_design_without_ui_api_cli_implementation"
    },
    linkedAdvisoryArtifacts: {
      sidecarIds: [...input.sidecarIds].sort((left, right) =>
        left.localeCompare(right)
      ),
      sidecarSchemaVersion: agentAdvisoryRoutingSidecarSchemaVersion,
      mockRoutingOutputIds: [...input.mockRoutingOutputIds].sort(
        (left, right) => left.localeCompare(right)
      ),
      mockRoutingSchemaVersion: agentMockAdvisoryRoutingOutputSchemaVersion,
      sideBySideComparisonReportId: input.sideBySideComparisonReportId,
      sideBySideComparisonSchemaVersion:
        agentAdvisorySideBySideComparisonReportSchemaVersion,
      phase14ReadinessSummaryId: "phase-14-offline-readiness-summary-001",
      rawArtifactsIncluded: false
    },
    interfaceScope: {
      scopeKind: "boundary_design_only",
      currentSurfaceStatus: "no_ui_api_cli_surface_implemented",
      uiImplemented: false,
      apiImplemented: false,
      cliImplemented: false,
      runtimeIntegrated: false,
      productionEnabled: false
    },
    futureUiBoundary: {
      futurePanelCategories: [...advisoryFuturePanelCategoryValues],
      futureDisplayModes: [...advisoryFutureDisplayModeValues],
      allowedFutureDisplayedArtifacts: [
        "advisory_sidecar_summary",
        "side_by_side_comparison_summary",
        "authority_boundary_summary",
        "future_evidence_requirements_summary",
        "phase_14_readiness_reference"
      ],
      prohibitedFutureDisplayedContent: [
        ...advisoryProhibitedFutureContentValues
      ],
      uiImplemented: false,
      dashboardPanelAdded: false,
      mayChangeDecisionFromUi: false
    },
    futureApiBoundary: {
      futureEndpointCategories: [...advisoryFutureEndpointCategoryValues],
      futureResponseShapes: [...advisoryFutureResponseShapeValues],
      allowedFutureResponseArtifacts: [
        "advisory_sidecar_summary",
        "mock_advisory_summary",
        "side_by_side_comparison_summary",
        "authority_boundary_summary",
        "future_evidence_requirements_summary"
      ],
      prohibitedFutureResponseContent: [
        ...advisoryProhibitedFutureContentValues
      ],
      apiImplemented: false,
      endpointAdded: false,
      mayChangeDecisionFromApi: false
    },
    futureCliBoundary: {
      futureCommandCategories: [...advisoryFutureCommandCategoryValues],
      futureOutputShapes: [...advisoryFutureOutputShapeValues],
      allowedFutureOutputArtifacts: [
        "advisory_sidecar_summary",
        "mock_advisory_summary",
        "side_by_side_comparison_summary",
        "authority_boundary_summary",
        "future_evidence_requirements_summary"
      ],
      prohibitedFutureOutputContent: [...advisoryProhibitedFutureContentValues],
      cliImplemented: false,
      commandAdded: false,
      mayChangeDecisionFromCli: false
    },
    displayAuthorityBoundary: {
      deterministicDecisionAuthoritative: true,
      advisoryDisplayNonAuthoritative: true,
      displayCanOverrideDecision: false,
      displayCanTriggerRuntimeAction: false,
      displayCanChangeRouting: false,
      requiresFutureExplicitIntegration: true,
      requiresHumanApprovalBeforeImplementation: true
    },
    privacyRedactionBoundary: {
      categoryOnlyByDefault: true,
      rawPromptsProhibited: true,
      rawAgentOutputsProhibited: true,
      rawCommandsProhibited: true,
      rawDiffsProhibited: true,
      rawSourceCodeProhibited: true,
      rawTracesProhibited: true,
      rawReviewsProhibited: true,
      rawScoresProhibited: true,
      rawThresholdsProhibited: true,
      privateDataProhibited: true,
      futureRedactionRequiredBeforeAnySurface: true
    },
    futureImplementationRequirements: {
      requiredCategories: [
        ...advisoryInterfaceFutureImplementationRequirementValues
      ],
      requirementStatus: "future_unmet",
      allRequirementsFuture: true
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      advisoryOnly: true,
      interfaceDesignOnly: true,
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
      implementsUiSurface: false,
      implementsApiSurface: false,
      implementsCliSurface: false,
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      implementsProductionRouting: false,
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
      designOnly: true,
      advisoryOnly: true,
      interfaceImplemented: false,
      uiSurfaceImplemented: false,
      apiSurfaceImplemented: false,
      cliSurfaceImplemented: false,
      advisoryRoutingImplemented: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false,
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
      "interface_boundary_design_only",
      "no_ui_api_cli_surface",
      "deterministic_decisions_authoritative",
      "category_only_future_display_contract"
    ]
  });

export const validateAdvisoryInterfaceBoundary = (
  boundary: unknown
): AdvisoryInterfaceBoundary => advisoryInterfaceBoundarySchema.parse(boundary);

export const validateAdvisoryInterfaceBoundaries = (
  boundaries: unknown[]
): AdvisoryInterfaceBoundary[] =>
  boundaries
    .map(validateAdvisoryInterfaceBoundary)
    .sort((left, right) =>
      left.interfaceBoundaryId.localeCompare(right.interfaceBoundaryId)
    );

export const validateAdvisoryInterfaceAuthorityBoundary = (
  boundary: AdvisoryInterfaceBoundary
): void => {
  advisoryDisplayAuthorityBoundarySchema.parse(
    boundary.displayAuthorityBoundary
  );
};

export const validateAdvisoryInterfacePrivacyBoundary = (
  boundary: AdvisoryInterfaceBoundary
): void => {
  advisoryPrivacyRedactionBoundarySchema.parse(
    boundary.privacyRedactionBoundary
  );
};

export const validateAdvisoryInterfaceClaimBoundaries = (
  boundary: AdvisoryInterfaceBoundary
): void => {
  advisoryInterfaceClaimBoundariesSchema.parse(boundary.claimBoundaries);
};

export const summarizeAdvisoryInterfaceBoundary = (
  boundary: AdvisoryInterfaceBoundary
): {
  interfaceBoundaryId: string;
  linkedSidecarCount: number;
  linkedMockRoutingOutputCount: number;
  sideBySideComparisonReportId: string;
  uiImplemented: false;
  apiImplemented: false;
  cliImplemented: false;
  deterministicDecisionAuthoritative: true;
  advisoryDisplayNonAuthoritative: true;
  displayCanOverrideDecision: false;
  categoryOnlyByDefault: true;
  productionRoutingChanged: false;
} => ({
  interfaceBoundaryId: boundary.interfaceBoundaryId,
  linkedSidecarCount: boundary.linkedAdvisoryArtifacts.sidecarIds.length,
  linkedMockRoutingOutputCount:
    boundary.linkedAdvisoryArtifacts.mockRoutingOutputIds.length,
  sideBySideComparisonReportId:
    boundary.linkedAdvisoryArtifacts.sideBySideComparisonReportId,
  uiImplemented: boundary.interfaceScope.uiImplemented,
  apiImplemented: boundary.interfaceScope.apiImplemented,
  cliImplemented: boundary.interfaceScope.cliImplemented,
  deterministicDecisionAuthoritative:
    boundary.displayAuthorityBoundary.deterministicDecisionAuthoritative,
  advisoryDisplayNonAuthoritative:
    boundary.displayAuthorityBoundary.advisoryDisplayNonAuthoritative,
  displayCanOverrideDecision:
    boundary.displayAuthorityBoundary.displayCanOverrideDecision,
  categoryOnlyByDefault:
    boundary.privacyRedactionBoundary.categoryOnlyByDefault,
  productionRoutingChanged: boundary.claimBoundaries.productionRoutingChanged
});

export const validateAdvisoryInterfaceBoundaryBoundaries = (
  boundary: AdvisoryInterfaceBoundary
): void => {
  if (
    boundary.source !== "synthetic_advisory_interface_boundary" ||
    boundary.interfaceScope.scopeKind !== "boundary_design_only" ||
    boundary.interfaceScope.uiImplemented ||
    boundary.interfaceScope.apiImplemented ||
    boundary.interfaceScope.cliImplemented ||
    boundary.interfaceScope.runtimeIntegrated ||
    boundary.interfaceScope.productionEnabled ||
    boundary.futureUiBoundary.uiImplemented ||
    boundary.futureUiBoundary.dashboardPanelAdded ||
    boundary.futureUiBoundary.mayChangeDecisionFromUi ||
    boundary.futureApiBoundary.apiImplemented ||
    boundary.futureApiBoundary.endpointAdded ||
    boundary.futureApiBoundary.mayChangeDecisionFromApi ||
    boundary.futureCliBoundary.cliImplemented ||
    boundary.futureCliBoundary.commandAdded ||
    boundary.futureCliBoundary.mayChangeDecisionFromCli ||
    boundary.displayAuthorityBoundary.displayCanOverrideDecision ||
    boundary.displayAuthorityBoundary.displayCanTriggerRuntimeAction ||
    boundary.displayAuthorityBoundary.displayCanChangeRouting ||
    !boundary.privacyRedactionBoundary.categoryOnlyByDefault ||
    !boundary.privacyRedactionBoundary
      .futureRedactionRequiredBeforeAnySurface ||
    boundary.safety.implementsUiSurface ||
    boundary.safety.implementsApiSurface ||
    boundary.safety.implementsCliSurface ||
    boundary.safety.implementsAdvisoryRouting ||
    boundary.safety.implementsCalibratedRouting ||
    boundary.safety.implementsProductionRouting ||
    boundary.safety.computesScores ||
    boundary.safety.computesThresholds ||
    boundary.safety.introducesAlpha ||
    boundary.claimBoundaries.interfaceImplemented ||
    boundary.claimBoundaries.uiSurfaceImplemented ||
    boundary.claimBoundaries.apiSurfaceImplemented ||
    boundary.claimBoundaries.cliSurfaceImplemented ||
    boundary.claimBoundaries.advisoryRoutingImplemented ||
    boundary.claimBoundaries.calibratedRoutingImplemented ||
    boundary.claimBoundaries.productionRoutingChanged
  ) {
    throw new Error(
      "Advisory interface boundary crosses a declared UI/API/CLI boundary"
    );
  }
};

const forbiddenAdvisoryInterfacePatterns = [
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

export const advisoryInterfaceBoundaryContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenAdvisoryInterfacePatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
