import { z } from "zod";

export const agentAdvisoryRoutingSidecarSchemaVersion =
  "agent-advisory-routing-sidecar.v1" as const;

export const advisoryRoutingSourceValues = [
  "synthetic_advisory_sidecar_design",
  "future_mock_advisory_routing",
  "future_calibrated_advisory_routing"
] as const;

export const advisoryDecisionCategoryValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK"
] as const;

export const advisoryDecisionSourceCategoryValues = [
  "synthetic_phase_12_run",
  "synthetic_phase_13_record",
  "synthetic_phase_14_mock_artifact",
  "future_runtime_decision_reference"
] as const;

export const advisoryPhase14ArtifactKindValues = [
  "risk_loss_design",
  "offline_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_simulation",
  "mock_threshold_selection_mechanics",
  "offline_evaluation_report_schema",
  "phase_14_readiness_summary",
  "phase_15_handoff_boundary"
] as const;

export const advisoryPhase14DesignInputValues = [
  "risk_loss_design",
  "mock_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_mechanics",
  "mock_threshold_mechanics",
  "evaluation_report_schema",
  "boundary_checklists",
  "claim_boundary_docs"
] as const;

export const advisoryMissingEvidenceCategoryValues = [
  "real_reviewed_traces",
  "real_calibration_dataset",
  "approved_split",
  "real_scores",
  "nonconformity_scores",
  "threshold_or_policy_procedure",
  "evaluation_results",
  "claim_boundary_review",
  "human_approval"
] as const;

export const advisoryRecommendationCategoryValues = [
  "advisory_aligns_with_deterministic_decision",
  "advisory_suggests_more_context",
  "advisory_suggests_human_review",
  "advisory_suggests_hard_stop",
  "advisory_suggests_lower_friction",
  "advisory_insufficient_evidence",
  "advisory_not_applicable"
] as const;

export const advisoryRecommendationStrengthCategoryValues = [
  "weak",
  "moderate",
  "strong",
  "insufficient_evidence",
  "not_applicable"
] as const;

export const advisoryRecommendationScopeValues = [
  "synthetic_sidecar_only",
  "future_side_by_side_review",
  "future_mock_comparison",
  "not_runtime_authority"
] as const;

export const advisoryExplanationCategoryValues = [
  "missing_context_explanation",
  "stale_context_explanation",
  "validation_gap_explanation",
  "sensitivity_explanation",
  "unsafe_action_explanation",
  "recovery_uncertainty_explanation",
  "autonomy_retry_explanation",
  "friction_tradeoff_explanation",
  "coverage_gap_explanation",
  "insufficient_evidence_explanation"
] as const;

export const advisoryUncertaintyDimensionValues = [
  "missing_context",
  "stale_context",
  "validation_gap",
  "sensitivity",
  "unsafe_action_uncertainty",
  "recovery_uncertainty",
  "autonomy_retry_uncertainty",
  "friction_uncertainty",
  "coverage_gap",
  "insufficient_evidence"
] as const;

export const advisoryRiskDimensionValues = [
  "unsafe_action_risk",
  "secret_exposure_risk",
  "irreversible_change_risk",
  "policy_miss_risk",
  "validation_gap_risk",
  "operational_friction_risk",
  "coverage_gap_risk"
] as const;

export const advisoryLossFamilyValues = [
  "unsafe_action_loss",
  "privacy_loss",
  "recovery_loss",
  "validation_loss",
  "friction_loss",
  "coverage_loss",
  "not_applicable"
] as const;

export const advisoryEvidenceRequirementValues = [
  "real_reviewed_traces_required",
  "real_calibration_dataset_required",
  "approved_split_required",
  "real_scores_required",
  "nonconformity_scores_required",
  "threshold_or_policy_procedure_required",
  "evaluation_results_required",
  "claim_boundary_review_required",
  "human_approval_required"
] as const;

const sidecarIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "sidecarId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const advisoryRoutingSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
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
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const advisoryRoutingPrivacySchema = z.object({
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

export const advisoryRoutingClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
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

export const advisoryRoutingAuthorityBoundarySchema = z.object({
  deterministicDecisionAuthoritative: z.literal(true),
  advisorySidecarNonAuthoritative: z.literal(true),
  advisoryCanBlock: z.literal(false),
  advisoryCanProceed: z.literal(false),
  advisoryCanEscalate: z.literal(false),
  advisoryCanDefer: z.literal(false),
  advisoryCanChangeRuntimeDecision: z.literal(false),
  requiresExplicitFutureIntegration: z.literal(true),
  routingBehaviorChanged: z.literal(false)
});

export const advisoryRoutingSidecarSchema = z.object({
  schemaVersion: z.literal(agentAdvisoryRoutingSidecarSchemaVersion),
  sidecarId: sidecarIdSchema,
  source: z.enum(advisoryRoutingSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-15"),
    phaseName: z.literal("Advisory Calibrated Routing Design"),
    completedPreviousPhase: z.literal(
      "phase-14-complete-offline-synthetic-mock-groundwork-only"
    ),
    completedBatches: z.array(z.never()).length(0),
    currentBatch: z.literal("15.1"),
    futureBatches: z.array(z.enum(["15.2", "15.3", "15.4", "15.5"])),
    phaseStatus: z.literal(
      "advisory_routing_schema_design_started_without_routing_implementation"
    )
  }),
  linkedDeterministicDecision: z.object({
    decisionCategory: z.enum(advisoryDecisionCategoryValues),
    decisionSourceCategory: z.enum(advisoryDecisionSourceCategoryValues),
    deterministicDecisionRemainsAuthoritative: z.literal(true),
    advisoryMayOverrideDecision: z.literal(false),
    productionRoutingChanged: z.literal(false),
    rawDecisionPayloadIncluded: z.literal(false)
  }),
  linkedPhase14Readiness: z.object({
    readinessSummaryId: z.literal("phase-14-offline-readiness-summary-001"),
    linkedArtifactKinds: z
      .array(z.enum(advisoryPhase14ArtifactKindValues))
      .min(5),
    availableDesignInputs: z
      .array(z.enum(advisoryPhase14DesignInputValues))
      .min(1),
    missingEvidenceCategories: z
      .array(z.enum(advisoryMissingEvidenceCategoryValues))
      .min(1),
    rawReadinessArtifactIncluded: z.literal(false)
  }),
  advisoryRecommendation: z.object({
    recommendationCategory: z.enum(advisoryRecommendationCategoryValues),
    recommendationStrengthCategory: z.enum(
      advisoryRecommendationStrengthCategoryValues
    ),
    recommendationScope: z.enum(advisoryRecommendationScopeValues),
    advisoryOnly: z.literal(true),
    calibrated: z.literal(false),
    conformal: z.literal(false),
    thresholdBased: z.literal(false),
    alphaBased: z.literal(false),
    productionAuthoritative: z.literal(false)
  }),
  advisoryExplanation: z.object({
    explanationCategories: z
      .array(z.enum(advisoryExplanationCategoryValues))
      .min(1),
    relatedUncertaintyDimensions: z
      .array(z.enum(advisoryUncertaintyDimensionValues))
      .min(1),
    relatedRiskDimensions: z.array(z.enum(advisoryRiskDimensionValues)).min(1),
    relatedLossFamilies: z.array(z.enum(advisoryLossFamilyValues)).min(1),
    relatedPhase14Artifacts: z
      .array(z.enum(advisoryPhase14ArtifactKindValues))
      .min(1),
    rawExplanationTextIncluded: z.literal(false)
  }),
  advisoryEvidenceRequirements: z.object({
    requiredCategories: z
      .array(z.enum(advisoryEvidenceRequirementValues))
      .length(advisoryEvidenceRequirementValues.length),
    evidenceStatus: z.literal("future_unmet"),
    allRequirementsFuture: z.literal(true)
  }),
  authorityBoundary: advisoryRoutingAuthorityBoundarySchema,
  futureRoutingRequirements: z.object({
    advisorySchemaReadyForDesignUse: z.literal(true),
    mockRoutingPrototypeRequired: z.literal(true),
    sideBySideComparisonRequired: z.literal(true),
    evaluationReportRequired: z.literal(true),
    calibrationEvidenceRequiredBeforeCalibratedClaims: z.literal(true),
    humanApprovalRequiredBeforeImplementation: z.literal(true),
    productionRoutingRequiresSeparatePhase: z.literal(true)
  }),
  safety: advisoryRoutingSafetySchema,
  privacy: advisoryRoutingPrivacySchema,
  claimBoundaries: advisoryRoutingClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type AdvisoryRoutingSidecar = z.infer<
  typeof advisoryRoutingSidecarSchema
>;

export const validateAdvisoryRoutingSidecar = (
  sidecar: unknown
): AdvisoryRoutingSidecar => advisoryRoutingSidecarSchema.parse(sidecar);

export const validateAdvisoryRoutingSidecars = (
  sidecars: unknown[]
): AdvisoryRoutingSidecar[] =>
  sidecars
    .map(validateAdvisoryRoutingSidecar)
    .sort((left, right) => left.sidecarId.localeCompare(right.sidecarId));

export const validateAdvisoryRoutingAuthorityBoundary = (
  sidecar: AdvisoryRoutingSidecar
): void => {
  advisoryRoutingAuthorityBoundarySchema.parse(sidecar.authorityBoundary);
};

export const validateAdvisoryRoutingClaimBoundaries = (
  sidecar: AdvisoryRoutingSidecar
): void => {
  advisoryRoutingClaimBoundariesSchema.parse(sidecar.claimBoundaries);
};

export const summarizeAdvisoryRoutingSidecar = (
  sidecar: AdvisoryRoutingSidecar
): {
  sidecarId: string;
  deterministicDecisionCategory: AdvisoryRoutingSidecar["linkedDeterministicDecision"]["decisionCategory"];
  recommendationCategory: AdvisoryRoutingSidecar["advisoryRecommendation"]["recommendationCategory"];
  deterministicDecisionAuthoritative: true;
  advisoryCanChangeRuntimeDecision: false;
  calibratedRoutingImplemented: false;
  productionRoutingChanged: false;
} => ({
  sidecarId: sidecar.sidecarId,
  deterministicDecisionCategory:
    sidecar.linkedDeterministicDecision.decisionCategory,
  recommendationCategory: sidecar.advisoryRecommendation.recommendationCategory,
  deterministicDecisionAuthoritative:
    sidecar.authorityBoundary.deterministicDecisionAuthoritative,
  advisoryCanChangeRuntimeDecision:
    sidecar.authorityBoundary.advisoryCanChangeRuntimeDecision,
  calibratedRoutingImplemented:
    sidecar.claimBoundaries.calibratedRoutingImplemented,
  productionRoutingChanged: sidecar.claimBoundaries.productionRoutingChanged
});

export const validateAdvisoryRoutingSidecarBoundaries = (
  sidecar: AdvisoryRoutingSidecar
): void => {
  if (
    sidecar.source !== "synthetic_advisory_sidecar_design" ||
    sidecar.linkedDeterministicDecision.advisoryMayOverrideDecision ||
    sidecar.linkedDeterministicDecision.productionRoutingChanged ||
    sidecar.advisoryRecommendation.calibrated ||
    sidecar.advisoryRecommendation.conformal ||
    sidecar.advisoryRecommendation.thresholdBased ||
    sidecar.advisoryRecommendation.alphaBased ||
    sidecar.advisoryRecommendation.productionAuthoritative ||
    sidecar.authorityBoundary.advisoryCanChangeRuntimeDecision ||
    sidecar.safety.implementsAdvisoryRouting ||
    sidecar.safety.implementsCalibratedRouting ||
    sidecar.safety.implementsProductionRouting ||
    sidecar.safety.computesScores ||
    sidecar.safety.computesThresholds ||
    sidecar.safety.introducesAlpha ||
    sidecar.claimBoundaries.advisoryRoutingImplemented ||
    sidecar.claimBoundaries.calibratedRoutingImplemented ||
    sidecar.claimBoundaries.productionRoutingChanged
  ) {
    throw new Error("Advisory routing sidecar crosses a declared boundary");
  }
};

const forbiddenAdvisoryRoutingPatterns = [
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

export const advisoryRoutingContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenAdvisoryRoutingPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
