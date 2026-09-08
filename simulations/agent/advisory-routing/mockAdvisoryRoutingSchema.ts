import { z } from "zod";
import {
  advisoryDecisionCategoryValues,
  advisoryDecisionSourceCategoryValues,
  advisoryLossFamilyValues,
  advisoryRecommendationCategoryValues,
  advisoryRiskDimensionValues,
  advisoryRoutingSourceValues,
  advisoryUncertaintyDimensionValues,
  agentAdvisoryRoutingSidecarSchemaVersion,
  type AdvisoryRoutingSidecar
} from "./advisoryRoutingSchema.js";

export const agentMockAdvisoryRoutingOutputSchemaVersion =
  "agent-mock-advisory-routing-output.v1" as const;

export const mockAdvisoryRoutingSourceValues = [
  "synthetic_mock_advisory_routing",
  "future_calibrated_advisory_routing",
  "future_runtime_advisory_routing"
] as const;

export const mockAdvisoryOutputCategoryValues = [
  "mock_align",
  "mock_suggest_defer",
  "mock_suggest_escalate",
  "mock_suggest_block",
  "mock_suggest_reduce_friction",
  "mock_insufficient_evidence",
  "mock_no_advisory_output"
] as const;

export const mockAdvisoryConfidenceCategoryValues = [
  "mock_low",
  "mock_medium",
  "mock_high",
  "mock_insufficient_evidence",
  "mock_not_applicable"
] as const;

export const mockAdvisoryRouteCategoryValues = [
  "advisory_metadata_only",
  "sidecar_only",
  "explanation_only",
  "not_applicable"
] as const;

export const mockAdvisoryAgreementCategoryValues = [
  "agrees",
  "partially_agrees",
  "differs",
  "insufficient_evidence",
  "not_applicable"
] as const;

export const mockAdvisoryDifferenceCategoryValues = [
  "no_difference",
  "advisory_more_conservative",
  "advisory_less_restrictive",
  "advisory_requests_more_context",
  "advisory_requests_human_review",
  "advisory_requests_hard_stop",
  "advisory_reduces_friction",
  "insufficient_evidence"
] as const;

export const mockAdvisoryRationaleCategoryValues = [
  "missing_context_rationale",
  "stale_context_rationale",
  "validation_gap_rationale",
  "sensitivity_rationale",
  "unsafe_action_rationale",
  "recovery_uncertainty_rationale",
  "autonomy_retry_rationale",
  "friction_tradeoff_rationale",
  "coverage_gap_rationale",
  "insufficient_evidence_rationale"
] as const;

export const mockAdvisoryEvidenceGapValues = [
  "real_reviewed_traces_required",
  "real_calibration_dataset_required",
  "approved_split_required",
  "real_scores_required",
  "nonconformity_scores_required",
  "threshold_or_policy_procedure_required",
  "evaluation_results_required",
  "side_by_side_evaluation_required",
  "claim_boundary_review_required",
  "human_approval_required"
] as const;

const safeMockRoutingOutputIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "mockRoutingOutputId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const mockAdvisoryRoutingSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
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
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const mockAdvisoryRoutingPrivacySchema = z.object({
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
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const mockAdvisoryRoutingClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  advisoryOnly: z.literal(true),
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

export const mockAdvisoryAuthorityBoundarySchema = z.object({
  deterministicDecisionAuthoritative: z.literal(true),
  advisoryOutputNonAuthoritative: z.literal(true),
  advisoryCanBlock: z.literal(false),
  advisoryCanProceed: z.literal(false),
  advisoryCanEscalate: z.literal(false),
  advisoryCanDefer: z.literal(false),
  advisoryCanChangeRuntimeDecision: z.literal(false),
  advisoryCanTriggerRuntimeAction: z.literal(false),
  requiresExplicitFutureIntegration: z.literal(true),
  routingBehaviorChanged: z.literal(false)
});

export const mockAdvisoryRoutingOutputSchema = z.object({
  schemaVersion: z.literal(agentMockAdvisoryRoutingOutputSchemaVersion),
  mockRoutingOutputId: safeMockRoutingOutputIdSchema,
  source: z.enum(mockAdvisoryRoutingSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-15"),
    phaseName: z.literal("Advisory Calibrated Routing Design"),
    completedPreviousPhase: z.literal(
      "phase-14-complete-offline-synthetic-mock-groundwork-only"
    ),
    completedBatches: z.array(z.literal("15.1")).length(1),
    currentBatch: z.literal("15.2"),
    futureBatches: z.array(z.enum(["15.3", "15.4", "15.5"])),
    phaseStatus: z.literal(
      "mock_advisory_routing_prototype_without_runtime_integration"
    )
  }),
  linkedAdvisorySidecar: z.object({
    sidecarId: z.string().min(1),
    schemaVersion: z.literal(agentAdvisoryRoutingSidecarSchemaVersion),
    source: z.enum(advisoryRoutingSourceValues),
    recommendationCategory: z.enum(advisoryRecommendationCategoryValues),
    rawSidecarIncluded: z.literal(false)
  }),
  linkedDeterministicDecision: z.object({
    decisionCategory: z.enum(advisoryDecisionCategoryValues),
    decisionSourceCategory: z.enum(advisoryDecisionSourceCategoryValues),
    deterministicDecisionRemainsAuthoritative: z.literal(true),
    productionRoutingChanged: z.literal(false),
    rawDecisionPayloadIncluded: z.literal(false)
  }),
  mockAdvisoryOutput: z.object({
    mockOutputCategory: z.enum(mockAdvisoryOutputCategoryValues),
    mockRecommendationCategory: z.enum(advisoryRecommendationCategoryValues),
    mockConfidenceCategory: z.enum(mockAdvisoryConfidenceCategoryValues),
    mockRouteCategory: z.enum(mockAdvisoryRouteCategoryValues),
    advisoryOnly: z.literal(true),
    calibrated: z.literal(false),
    conformal: z.literal(false),
    thresholdBased: z.literal(false),
    alphaBased: z.literal(false),
    runtimeIntegrated: z.literal(false),
    productionAuthoritative: z.literal(false)
  }),
  sideBySideComparison: z.object({
    deterministicDecisionCategory: z.enum(advisoryDecisionCategoryValues),
    mockAdvisorySuggestionCategory: z.enum(mockAdvisoryOutputCategoryValues),
    agreementCategory: z.enum(mockAdvisoryAgreementCategoryValues),
    differenceCategory: z.enum(mockAdvisoryDifferenceCategoryValues),
    deterministicDecisionChanged: z.literal(false),
    advisoryOverrideAttempted: z.literal(false),
    productionRoutingChanged: z.literal(false)
  }),
  advisoryRationale: z.object({
    rationaleCategories: z
      .array(z.enum(mockAdvisoryRationaleCategoryValues))
      .min(1),
    relatedUncertaintyDimensions: z
      .array(z.enum(advisoryUncertaintyDimensionValues))
      .min(1),
    relatedRiskDimensions: z.array(z.enum(advisoryRiskDimensionValues)).min(1),
    relatedLossFamilies: z.array(z.enum(advisoryLossFamilyValues)).min(1),
    relatedEvidenceGaps: z.array(z.enum(mockAdvisoryEvidenceGapValues)).min(1),
    rawRationaleTextIncluded: z.literal(false)
  }),
  authorityBoundary: mockAdvisoryAuthorityBoundarySchema,
  futureEvidenceRequirements: z.object({
    requiredCategories: z
      .array(z.enum(mockAdvisoryEvidenceGapValues))
      .length(mockAdvisoryEvidenceGapValues.length),
    evidenceStatus: z.literal("future_unmet"),
    allRequirementsFuture: z.literal(true)
  }),
  safety: mockAdvisoryRoutingSafetySchema,
  privacy: mockAdvisoryRoutingPrivacySchema,
  claimBoundaries: mockAdvisoryRoutingClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type MockAdvisoryRoutingOutput = z.infer<
  typeof mockAdvisoryRoutingOutputSchema
>;

type MockMapping = Pick<
  MockAdvisoryRoutingOutput["mockAdvisoryOutput"],
  "mockOutputCategory" | "mockConfidenceCategory" | "mockRouteCategory"
> &
  Pick<
    MockAdvisoryRoutingOutput["sideBySideComparison"],
    "agreementCategory" | "differenceCategory"
  >;

export const mapSidecarRecommendationToMockAdvisoryOutput = (
  recommendationCategory: AdvisoryRoutingSidecar["advisoryRecommendation"]["recommendationCategory"]
): MockMapping => {
  switch (recommendationCategory) {
    case "advisory_aligns_with_deterministic_decision":
      return {
        mockOutputCategory: "mock_align",
        mockConfidenceCategory: "mock_medium",
        mockRouteCategory: "sidecar_only",
        agreementCategory: "agrees",
        differenceCategory: "no_difference"
      };
    case "advisory_suggests_more_context":
      return {
        mockOutputCategory: "mock_suggest_defer",
        mockConfidenceCategory: "mock_low",
        mockRouteCategory: "sidecar_only",
        agreementCategory: "partially_agrees",
        differenceCategory: "advisory_requests_more_context"
      };
    case "advisory_suggests_human_review":
      return {
        mockOutputCategory: "mock_suggest_escalate",
        mockConfidenceCategory: "mock_medium",
        mockRouteCategory: "sidecar_only",
        agreementCategory: "partially_agrees",
        differenceCategory: "advisory_requests_human_review"
      };
    case "advisory_suggests_hard_stop":
      return {
        mockOutputCategory: "mock_suggest_block",
        mockConfidenceCategory: "mock_high",
        mockRouteCategory: "sidecar_only",
        agreementCategory: "partially_agrees",
        differenceCategory: "advisory_requests_hard_stop"
      };
    case "advisory_suggests_lower_friction":
      return {
        mockOutputCategory: "mock_suggest_reduce_friction",
        mockConfidenceCategory: "mock_insufficient_evidence",
        mockRouteCategory: "explanation_only",
        agreementCategory: "differs",
        differenceCategory: "advisory_reduces_friction"
      };
    case "advisory_insufficient_evidence":
      return {
        mockOutputCategory: "mock_insufficient_evidence",
        mockConfidenceCategory: "mock_insufficient_evidence",
        mockRouteCategory: "explanation_only",
        agreementCategory: "insufficient_evidence",
        differenceCategory: "insufficient_evidence"
      };
    case "advisory_not_applicable":
      return {
        mockOutputCategory: "mock_no_advisory_output",
        mockConfidenceCategory: "mock_not_applicable",
        mockRouteCategory: "not_applicable",
        agreementCategory: "not_applicable",
        differenceCategory: "insufficient_evidence"
      };
  }
};

const rationaleByExplanationCategory: Record<
  AdvisoryRoutingSidecar["advisoryExplanation"]["explanationCategories"][number],
  (typeof mockAdvisoryRationaleCategoryValues)[number]
> = {
  missing_context_explanation: "missing_context_rationale",
  stale_context_explanation: "stale_context_rationale",
  validation_gap_explanation: "validation_gap_rationale",
  sensitivity_explanation: "sensitivity_rationale",
  unsafe_action_explanation: "unsafe_action_rationale",
  recovery_uncertainty_explanation: "recovery_uncertainty_rationale",
  autonomy_retry_explanation: "autonomy_retry_rationale",
  friction_tradeoff_explanation: "friction_tradeoff_rationale",
  coverage_gap_explanation: "coverage_gap_rationale",
  insufficient_evidence_explanation: "insufficient_evidence_rationale"
};

const mockRoutingIdBySidecarId: Record<string, string> = {
  "advisory-sidecar-synthetic-defer-001": "mock-advisory-routing-defer-001",
  "advisory-sidecar-more-context-001": "mock-advisory-routing-context-001",
  "advisory-sidecar-human-review-001": "mock-advisory-routing-human-review-001",
  "advisory-sidecar-hard-stop-001": "mock-advisory-routing-hard-stop-001",
  "advisory-sidecar-lower-friction-001":
    "mock-advisory-routing-lower-friction-001"
};

export const buildMockAdvisoryRoutingOutput = (
  sidecar: AdvisoryRoutingSidecar
): MockAdvisoryRoutingOutput => {
  const mapping = mapSidecarRecommendationToMockAdvisoryOutput(
    sidecar.advisoryRecommendation.recommendationCategory
  );
  const mockRoutingOutputId =
    mockRoutingIdBySidecarId[sidecar.sidecarId] ??
    `mock-advisory-routing-${sidecar.sidecarId.replace(
      /^advisory-sidecar-/,
      ""
    )}`;

  return validateMockAdvisoryRoutingOutput({
    schemaVersion: agentMockAdvisoryRoutingOutputSchemaVersion,
    mockRoutingOutputId,
    source: "synthetic_mock_advisory_routing",
    phase: {
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1"],
      currentBatch: "15.2",
      futureBatches: ["15.3", "15.4", "15.5"],
      phaseStatus: "mock_advisory_routing_prototype_without_runtime_integration"
    },
    linkedAdvisorySidecar: {
      sidecarId: sidecar.sidecarId,
      schemaVersion: sidecar.schemaVersion,
      source: sidecar.source,
      recommendationCategory:
        sidecar.advisoryRecommendation.recommendationCategory,
      rawSidecarIncluded: false
    },
    linkedDeterministicDecision: {
      decisionCategory: sidecar.linkedDeterministicDecision.decisionCategory,
      decisionSourceCategory:
        sidecar.linkedDeterministicDecision.decisionSourceCategory,
      deterministicDecisionRemainsAuthoritative: true,
      productionRoutingChanged: false,
      rawDecisionPayloadIncluded: false
    },
    mockAdvisoryOutput: {
      mockOutputCategory: mapping.mockOutputCategory,
      mockRecommendationCategory:
        sidecar.advisoryRecommendation.recommendationCategory,
      mockConfidenceCategory: mapping.mockConfidenceCategory,
      mockRouteCategory: mapping.mockRouteCategory,
      advisoryOnly: true,
      calibrated: false,
      conformal: false,
      thresholdBased: false,
      alphaBased: false,
      runtimeIntegrated: false,
      productionAuthoritative: false
    },
    sideBySideComparison: {
      deterministicDecisionCategory:
        sidecar.linkedDeterministicDecision.decisionCategory,
      mockAdvisorySuggestionCategory: mapping.mockOutputCategory,
      agreementCategory: mapping.agreementCategory,
      differenceCategory: mapping.differenceCategory,
      deterministicDecisionChanged: false,
      advisoryOverrideAttempted: false,
      productionRoutingChanged: false
    },
    advisoryRationale: {
      rationaleCategories:
        sidecar.advisoryExplanation.explanationCategories.map(
          (category) => rationaleByExplanationCategory[category]
        ),
      relatedUncertaintyDimensions:
        sidecar.advisoryExplanation.relatedUncertaintyDimensions,
      relatedRiskDimensions: sidecar.advisoryExplanation.relatedRiskDimensions,
      relatedLossFamilies: sidecar.advisoryExplanation.relatedLossFamilies,
      relatedEvidenceGaps: [...mockAdvisoryEvidenceGapValues],
      rawRationaleTextIncluded: false
    },
    authorityBoundary: {
      deterministicDecisionAuthoritative: true,
      advisoryOutputNonAuthoritative: true,
      advisoryCanBlock: false,
      advisoryCanProceed: false,
      advisoryCanEscalate: false,
      advisoryCanDefer: false,
      advisoryCanChangeRuntimeDecision: false,
      advisoryCanTriggerRuntimeAction: false,
      requiresExplicitFutureIntegration: true,
      routingBehaviorChanged: false
    },
    futureEvidenceRequirements: {
      requiredCategories: [...mockAdvisoryEvidenceGapValues],
      evidenceStatus: "future_unmet",
      allRequirementsFuture: true
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      mockOnly: true,
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
      advisoryOnly: true,
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
      "mock_advisory_output_only",
      "deterministic_decision_authoritative",
      "no_runtime_integration"
    ]
  });
};

export const buildMockAdvisoryRoutingOutputs = (
  sidecars: AdvisoryRoutingSidecar[]
): MockAdvisoryRoutingOutput[] =>
  sidecars
    .map(buildMockAdvisoryRoutingOutput)
    .sort((left, right) =>
      left.mockRoutingOutputId.localeCompare(right.mockRoutingOutputId)
    );

export const validateMockAdvisoryRoutingOutput = (
  output: unknown
): MockAdvisoryRoutingOutput => mockAdvisoryRoutingOutputSchema.parse(output);

export const validateMockAdvisoryRoutingOutputs = (
  outputs: unknown[]
): MockAdvisoryRoutingOutput[] =>
  outputs
    .map(validateMockAdvisoryRoutingOutput)
    .sort((left, right) =>
      left.mockRoutingOutputId.localeCompare(right.mockRoutingOutputId)
    );

export const validateMockAdvisoryAuthorityBoundary = (
  output: MockAdvisoryRoutingOutput
): void => {
  mockAdvisoryAuthorityBoundarySchema.parse(output.authorityBoundary);
};

export const validateMockAdvisoryClaimBoundaries = (
  output: MockAdvisoryRoutingOutput
): void => {
  mockAdvisoryRoutingClaimBoundariesSchema.parse(output.claimBoundaries);
};

export const summarizeMockAdvisoryRoutingOutput = (
  output: MockAdvisoryRoutingOutput
): {
  mockRoutingOutputId: string;
  linkedSidecarId: string;
  deterministicDecisionCategory: MockAdvisoryRoutingOutput["linkedDeterministicDecision"]["decisionCategory"];
  mockOutputCategory: MockAdvisoryRoutingOutput["mockAdvisoryOutput"]["mockOutputCategory"];
  agreementCategory: MockAdvisoryRoutingOutput["sideBySideComparison"]["agreementCategory"];
  deterministicDecisionAuthoritative: true;
  advisoryCanChangeRuntimeDecision: false;
  calibratedRoutingImplemented: false;
  productionRoutingChanged: false;
} => ({
  mockRoutingOutputId: output.mockRoutingOutputId,
  linkedSidecarId: output.linkedAdvisorySidecar.sidecarId,
  deterministicDecisionCategory:
    output.linkedDeterministicDecision.decisionCategory,
  mockOutputCategory: output.mockAdvisoryOutput.mockOutputCategory,
  agreementCategory: output.sideBySideComparison.agreementCategory,
  deterministicDecisionAuthoritative:
    output.authorityBoundary.deterministicDecisionAuthoritative,
  advisoryCanChangeRuntimeDecision:
    output.authorityBoundary.advisoryCanChangeRuntimeDecision,
  calibratedRoutingImplemented:
    output.claimBoundaries.calibratedRoutingImplemented,
  productionRoutingChanged: output.claimBoundaries.productionRoutingChanged
});

export const summarizeMockAdvisoryRoutingOutputs = (
  outputs: MockAdvisoryRoutingOutput[]
): ReturnType<typeof summarizeMockAdvisoryRoutingOutput>[] =>
  outputs.map(summarizeMockAdvisoryRoutingOutput);

export const validateMockAdvisoryRoutingOutputBoundaries = (
  output: MockAdvisoryRoutingOutput
): void => {
  if (
    output.source !== "synthetic_mock_advisory_routing" ||
    output.linkedDeterministicDecision.productionRoutingChanged ||
    output.mockAdvisoryOutput.calibrated ||
    output.mockAdvisoryOutput.conformal ||
    output.mockAdvisoryOutput.thresholdBased ||
    output.mockAdvisoryOutput.alphaBased ||
    output.mockAdvisoryOutput.runtimeIntegrated ||
    output.mockAdvisoryOutput.productionAuthoritative ||
    output.sideBySideComparison.deterministicDecisionChanged ||
    output.sideBySideComparison.advisoryOverrideAttempted ||
    output.sideBySideComparison.productionRoutingChanged ||
    output.authorityBoundary.advisoryCanChangeRuntimeDecision ||
    output.authorityBoundary.advisoryCanTriggerRuntimeAction ||
    output.safety.implementsAdvisoryRouting ||
    output.safety.implementsCalibratedRouting ||
    output.safety.implementsProductionRouting ||
    output.safety.computesScores ||
    output.safety.computesThresholds ||
    output.safety.introducesAlpha ||
    output.claimBoundaries.advisoryRoutingImplemented ||
    output.claimBoundaries.calibratedRoutingImplemented ||
    output.claimBoundaries.productionRoutingChanged
  ) {
    throw new Error("Mock advisory routing output crosses a declared boundary");
  }
};

const forbiddenMockAdvisoryPatterns = [
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

export const mockAdvisoryRoutingContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenMockAdvisoryPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
