import { z } from "zod";
import { agentAdvisoryReadinessSummarySchemaVersion } from "../advisory-routing/advisoryReadinessSchema.js";

export const agentProductionRoutingEligibilitySchemaVersion =
  "agent-production-routing-eligibility.v1" as const;

export const productionEligibilitySourceValues = [
  "synthetic_production_eligibility_design",
  "future_production_routing_gate_review",
  "future_calibrated_routing_eligibility_review"
] as const;

export const phase15ArtifactValues = [
  "advisory_sidecars",
  "mock_advisory_outputs",
  "side_by_side_comparison",
  "interface_boundary",
  "advisory_readiness_summary"
] as const;

export const productionEligibilityCategoryValues = [
  "not_eligible",
  "blocked_missing_evidence",
  "design_ready_only",
  "future_review_required",
  "eligible_after_explicit_future_approval"
] as const;

export const currentProductionEligibilityCategoryValues = [
  "not_eligible",
  "blocked_missing_evidence",
  "design_ready_only"
] as const;

export const productionEligibilityReasonCategoryValues = [
  "no_real_calibration_dataset",
  "no_eligible_reviewed_traces",
  "no_real_scores",
  "no_nonconformity_scores",
  "no_thresholds",
  "no_alpha_definition",
  "no_empirical_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_for_routing_changes"
] as const;

export const productionRequiredEvidenceCategoryValues = [
  "real_controlled_agent_traces",
  "real_reviewed_traces",
  "adjudicated_labels",
  "eligible_calibration_dataset",
  "approved_train_calibration_test_split",
  "real_scores",
  "real_nonconformity_scores",
  "threshold_selection_procedure",
  "alpha_definition_if_used",
  "offline_evaluation_results",
  "distribution_shift_assessment",
  "side_by_side_advisory_evaluation",
  "product_security_privacy_review",
  "human_approval_for_routing_changes"
] as const;

export const productionEvidenceStatusValues = [
  "missing",
  "design_only",
  "mock_only",
  "future_required",
  "available_after_future_review"
] as const;

export const deterministicSafetyOverrideCategoryValues = [
  "secret_access_block_override",
  "workspace_escape_block_override",
  "dangerous_command_block_override",
  "production_deploy_block_override",
  "protected_branch_policy_override",
  "validation_failure_block_override",
  "no_verify_bypass_block_override"
] as const;

export const productionFallbackCategoryValues = [
  "insufficient_evidence_fallback_to_deterministic",
  "distribution_shift_fallback_to_deterministic",
  "missing_score_fallback_to_deterministic",
  "stale_calibration_fallback_to_deterministic",
  "threshold_unavailable_fallback_to_deterministic",
  "policy_conflict_fallback_to_deterministic",
  "uncertainty_too_high_fallback_to_defer_or_escalate"
] as const;

export const productionFallbackTargetCategoryValues = [
  "deterministic_codingactiongate",
  "defer",
  "escalate",
  "block",
  "human_review"
] as const;

export const productionHumanApprovalCategoryValues = [
  "product_owner_approval_required",
  "security_review_required",
  "privacy_review_required",
  "claim_boundary_review_required",
  "routing_behavior_review_required",
  "rollback_plan_review_required",
  "beta_scope_approval_required"
] as const;

export const productionEligibilityBlockerCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_real_reviewed_traces",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_nonconformity_scores",
  "no_thresholds",
  "no_alpha_definition",
  "no_offline_evaluation_results",
  "no_distribution_shift_review",
  "no_routing_approval"
] as const;

const safeEligibilityRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "eligibilityRecordId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const productionEligibilitySafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
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
  addsPolicyFlag: z.literal(false),
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const productionEligibilityPrivacySchema = z.object({
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
  rawGateDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const productionEligibilityClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
  productionRoutingEligible: z.literal(false),
  advisoryRoutingImplemented: z.literal(false),
  calibratedRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
  policyFlagAdded: z.literal(false),
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

export const productionRoutingEligibilitySchema = z.object({
  schemaVersion: z.literal(agentProductionRoutingEligibilitySchemaVersion),
  eligibilityRecordId: safeEligibilityRecordIdSchema,
  source: z.enum(productionEligibilitySourceValues),
  phase: z.object({
    phaseId: z.literal("phase-16"),
    phaseName: z.literal("Production-Authoritative Calibrated Routing Gate"),
    completedPreviousPhase: z.literal(
      "phase-15-complete-advisory-design-readiness-groundwork-only"
    ),
    completedBatches: z.array(z.never()).length(0),
    currentBatch: z.literal("16.1"),
    futureBatches: z.array(z.enum(["16.2", "16.3", "16.4", "16.5"])).length(4),
    phaseStatus: z.literal(
      "production_routing_eligibility_design_started_without_routing_implementation"
    )
  }),
  linkedAdvisoryReadiness: z.object({
    readinessSummaryId: z.literal("phase-15-advisory-readiness-summary-001"),
    schemaVersion: z.literal(agentAdvisoryReadinessSummarySchemaVersion),
    source: z.literal("synthetic_phase_15_readiness_summary"),
    availablePhase15Artifacts: z
      .array(z.enum(phase15ArtifactValues))
      .length(phase15ArtifactValues.length),
    rawReadinessArtifactIncluded: z.literal(false)
  }),
  eligibilityStatus: z.object({
    currentEligibilityCategory: z.enum(
      currentProductionEligibilityCategoryValues
    ),
    productionRoutingEligibleNow: z.literal(false),
    advisoryRoutingEligibleNow: z.literal(false),
    calibratedRoutingEligibleNow: z.literal(false),
    eligibilityCanBeReconsideredAfterFutureEvidence: z.literal(true),
    reasonCategories: z
      .array(z.enum(productionEligibilityReasonCategoryValues))
      .min(1)
  }),
  requiredEvidence: z.object({
    evidence: z
      .array(
        z.object({
          evidenceCategory: z.enum(productionRequiredEvidenceCategoryValues),
          currentStatus: z.enum(productionEvidenceStatusValues),
          requiredBeforeProductionAuthority: z.literal(true),
          requiredBeforeCalibratedClaims: z.literal(true),
          requiredBeforeAdvisoryImplementation: z.literal(true)
        })
      )
      .length(productionRequiredEvidenceCategoryValues.length)
  }),
  calibrationRequirements: z.object({
    realCalibrationDatasetRequired: z.literal(true),
    eligibleReviewedTracePoolRequired: z.literal(true),
    adjudicatedLabelsRequired: z.literal(true),
    approvedSplitRequired: z.literal(true),
    lossDefinitionsRequired: z.literal(true),
    scoreDefinitionsRequired: z.literal(true),
    nonconformityDefinitionsRequired: z.literal(true),
    thresholdProcedureRequired: z.literal(true),
    calibrationAvailableNow: z.literal(false)
  }),
  evaluationRequirements: z.object({
    offlineEvaluationRequired: z.literal(true),
    heldOutTestEvaluationRequired: z.literal(true),
    baselineComparisonRequired: z.literal(true),
    distributionShiftReviewRequired: z.literal(true),
    failureCaseReviewRequired: z.literal(true),
    frictionReviewRequired: z.literal(true),
    realEvaluationResultsAvailable: z.literal(false),
    empiricalMetricsAvailable: z.literal(false)
  }),
  routingAuthorityRequirements: z.object({
    explicitPolicyFlagRequired: z.literal(true),
    defaultOffRequired: z.literal(true),
    scopeLimitedRoutingRequired: z.literal(true),
    humanApprovalRequired: z.literal(true),
    rollbackPlanRequired: z.literal(true),
    monitoringPlanRequired: z.literal(true),
    deterministicSafetyOverridesRequired: z.literal(true),
    productionAuthorityAllowedNow: z.literal(false)
  }),
  safetyOverrideRequirements: z.object({
    overrides: z
      .array(
        z.object({
          overrideCategory: z.enum(deterministicSafetyOverrideCategoryValues),
          deterministicOverrideRequired: z.literal(true),
          calibratedLayerMayOverride: z.literal(false)
        })
      )
      .length(deterministicSafetyOverrideCategoryValues.length)
  }),
  fallbackRequirements: z.object({
    fallbacks: z
      .array(
        z.object({
          fallbackCategory: z.enum(productionFallbackCategoryValues),
          fallbackRequired: z.literal(true),
          fallbackTargetCategory: z.enum(productionFallbackTargetCategoryValues)
        })
      )
      .length(productionFallbackCategoryValues.length)
  }),
  humanApprovalRequirements: z.object({
    approvals: z
      .array(
        z.object({
          approvalCategory: z.enum(productionHumanApprovalCategoryValues),
          approvalGranted: z.literal(false)
        })
      )
      .length(productionHumanApprovalCategoryValues.length)
  }),
  phase17EvidenceHandoff: z.object({
    realAgentEvidenceRequired: z.literal(true),
    controlledTraceCollectionRequired: z.literal(true),
    reviewedTraceLabelsRequired: z.literal(true),
    baselineComparisonOnRealControlledTracesRequired: z.literal(true),
    calibrationDatasetConstructionAfterTraceReviewRequired: z.literal(true),
    recommendedNextEvidencePhase: z.literal("phase-17-real-agent-integration"),
    productionRoutingGateCannotPassWithoutPhase17Evidence: z.literal(true)
  }),
  blockerSummary: z.object({
    blockers: z
      .array(
        z.object({
          blockerCategory: z.enum(productionEligibilityBlockerCategoryValues),
          blocksProductionAuthority: z.literal(true),
          blocksCalibratedClaims: z.literal(true),
          blocksRiskControlClaims: z.literal(true),
          resolutionRequiresFutureEvidence: z.literal(true),
          resolved: z.literal(false)
        })
      )
      .length(productionEligibilityBlockerCategoryValues.length)
  }),
  safety: productionEligibilitySafetySchema,
  privacy: productionEligibilityPrivacySchema,
  claimBoundaries: productionEligibilityClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type ProductionRoutingEligibility = z.infer<
  typeof productionRoutingEligibilitySchema
>;

export const buildSyntheticProductionRoutingEligibility = (input?: {
  readinessSummaryId?: string;
}): ProductionRoutingEligibility =>
  validateProductionRoutingEligibility({
    schemaVersion: agentProductionRoutingEligibilitySchemaVersion,
    eligibilityRecordId: "phase-16-production-eligibility-001",
    source: "synthetic_production_eligibility_design",
    phase: {
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: [],
      currentBatch: "16.1",
      futureBatches: ["16.2", "16.3", "16.4", "16.5"],
      phaseStatus:
        "production_routing_eligibility_design_started_without_routing_implementation"
    },
    linkedAdvisoryReadiness: {
      readinessSummaryId:
        input?.readinessSummaryId ?? "phase-15-advisory-readiness-summary-001",
      schemaVersion: agentAdvisoryReadinessSummarySchemaVersion,
      source: "synthetic_phase_15_readiness_summary",
      availablePhase15Artifacts: [...phase15ArtifactValues],
      rawReadinessArtifactIncluded: false
    },
    eligibilityStatus: {
      currentEligibilityCategory: "not_eligible",
      productionRoutingEligibleNow: false,
      advisoryRoutingEligibleNow: false,
      calibratedRoutingEligibleNow: false,
      eligibilityCanBeReconsideredAfterFutureEvidence: true,
      reasonCategories: [...productionEligibilityReasonCategoryValues]
    },
    requiredEvidence: {
      evidence: productionRequiredEvidenceCategoryValues.map((category) => ({
        evidenceCategory: category,
        currentStatus: category.includes("procedure")
          ? "future_required"
          : "missing",
        requiredBeforeProductionAuthority: true,
        requiredBeforeCalibratedClaims: true,
        requiredBeforeAdvisoryImplementation: true
      }))
    },
    calibrationRequirements: {
      realCalibrationDatasetRequired: true,
      eligibleReviewedTracePoolRequired: true,
      adjudicatedLabelsRequired: true,
      approvedSplitRequired: true,
      lossDefinitionsRequired: true,
      scoreDefinitionsRequired: true,
      nonconformityDefinitionsRequired: true,
      thresholdProcedureRequired: true,
      calibrationAvailableNow: false
    },
    evaluationRequirements: {
      offlineEvaluationRequired: true,
      heldOutTestEvaluationRequired: true,
      baselineComparisonRequired: true,
      distributionShiftReviewRequired: true,
      failureCaseReviewRequired: true,
      frictionReviewRequired: true,
      realEvaluationResultsAvailable: false,
      empiricalMetricsAvailable: false
    },
    routingAuthorityRequirements: {
      explicitPolicyFlagRequired: true,
      defaultOffRequired: true,
      scopeLimitedRoutingRequired: true,
      humanApprovalRequired: true,
      rollbackPlanRequired: true,
      monitoringPlanRequired: true,
      deterministicSafetyOverridesRequired: true,
      productionAuthorityAllowedNow: false
    },
    safetyOverrideRequirements: {
      overrides: deterministicSafetyOverrideCategoryValues.map((category) => ({
        overrideCategory: category,
        deterministicOverrideRequired: true,
        calibratedLayerMayOverride: false
      }))
    },
    fallbackRequirements: {
      fallbacks: productionFallbackCategoryValues.map((category) => ({
        fallbackCategory: category,
        fallbackRequired: true,
        fallbackTargetCategory:
          category === "uncertainty_too_high_fallback_to_defer_or_escalate"
            ? "defer"
            : "deterministic_codingactiongate"
      }))
    },
    humanApprovalRequirements: {
      approvals: productionHumanApprovalCategoryValues.map((category) => ({
        approvalCategory: category,
        approvalGranted: false
      }))
    },
    phase17EvidenceHandoff: {
      realAgentEvidenceRequired: true,
      controlledTraceCollectionRequired: true,
      reviewedTraceLabelsRequired: true,
      baselineComparisonOnRealControlledTracesRequired: true,
      calibrationDatasetConstructionAfterTraceReviewRequired: true,
      recommendedNextEvidencePhase: "phase-17-real-agent-integration",
      productionRoutingGateCannotPassWithoutPhase17Evidence: true
    },
    blockerSummary: {
      blockers: productionEligibilityBlockerCategoryValues.map((category) => ({
        blockerCategory: category,
        blocksProductionAuthority: true,
        blocksCalibratedClaims: true,
        blocksRiskControlClaims: true,
        resolutionRequiresFutureEvidence: true,
        resolved: false
      }))
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      gateDesignOnly: true,
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
      addsPolicyFlag: false,
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
      rawGateDataIncluded: false,
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
      gateDesignOnly: true,
      productionRoutingEligible: false,
      advisoryRoutingImplemented: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false,
      policyFlagAdded: false,
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
      "phase_16_gate_design_only",
      "production_routing_not_eligible",
      "phase_17_evidence_required",
      "deterministic_safety_overrides_authoritative"
    ]
  });

export const validateProductionRoutingEligibility = (
  record: unknown
): ProductionRoutingEligibility =>
  productionRoutingEligibilitySchema.parse(record);

export const validateProductionRoutingEligibilityRecords = (
  records: unknown[]
): ProductionRoutingEligibility[] =>
  records
    .map(validateProductionRoutingEligibility)
    .sort((left, right) =>
      left.eligibilityRecordId.localeCompare(right.eligibilityRecordId)
    );

export const summarizeProductionRoutingEligibility = (
  record: ProductionRoutingEligibility
): {
  eligibilityRecordId: string;
  currentEligibilityCategory: ProductionRoutingEligibility["eligibilityStatus"]["currentEligibilityCategory"];
  productionRoutingEligibleNow: false;
  calibratedRoutingEligibleNow: false;
  productionAuthorityAllowedNow: false;
  requiredEvidenceCount: number;
  blockerCount: number;
  phase17EvidenceRequired: true;
  deterministicSafetyOverridesRequired: true;
  policyFlagAdded: false;
} => ({
  eligibilityRecordId: record.eligibilityRecordId,
  currentEligibilityCategory:
    record.eligibilityStatus.currentEligibilityCategory,
  productionRoutingEligibleNow:
    record.eligibilityStatus.productionRoutingEligibleNow,
  calibratedRoutingEligibleNow:
    record.eligibilityStatus.calibratedRoutingEligibleNow,
  productionAuthorityAllowedNow:
    record.routingAuthorityRequirements.productionAuthorityAllowedNow,
  requiredEvidenceCount: record.requiredEvidence.evidence.length,
  blockerCount: record.blockerSummary.blockers.length,
  phase17EvidenceRequired:
    record.phase17EvidenceHandoff.realAgentEvidenceRequired,
  deterministicSafetyOverridesRequired:
    record.routingAuthorityRequirements.deterministicSafetyOverridesRequired,
  policyFlagAdded: record.claimBoundaries.policyFlagAdded
});

export const validateProductionRoutingEligibilityBoundaries = (
  record: ProductionRoutingEligibility
): void => {
  productionEligibilitySafetySchema.parse(record.safety);
  productionEligibilityPrivacySchema.parse(record.privacy);
  productionEligibilityClaimBoundariesSchema.parse(record.claimBoundaries);

  if (
    record.source !== "synthetic_production_eligibility_design" ||
    record.eligibilityStatus.productionRoutingEligibleNow ||
    record.eligibilityStatus.advisoryRoutingEligibleNow ||
    record.eligibilityStatus.calibratedRoutingEligibleNow ||
    !record.eligibilityStatus.eligibilityCanBeReconsideredAfterFutureEvidence ||
    record.calibrationRequirements.calibrationAvailableNow ||
    record.evaluationRequirements.realEvaluationResultsAvailable ||
    record.evaluationRequirements.empiricalMetricsAvailable ||
    record.routingAuthorityRequirements.productionAuthorityAllowedNow ||
    !record.routingAuthorityRequirements.deterministicSafetyOverridesRequired ||
    record.safetyOverrideRequirements.overrides.some(
      (override) =>
        !override.deterministicOverrideRequired ||
        override.calibratedLayerMayOverride
    ) ||
    record.humanApprovalRequirements.approvals.some(
      (approval) => approval.approvalGranted
    ) ||
    !record.phase17EvidenceHandoff
      .productionRoutingGateCannotPassWithoutPhase17Evidence ||
    record.blockerSummary.blockers.some((blocker) => blocker.resolved) ||
    record.safety.changesRuntimeBehavior ||
    record.safety.implementsProductionRouting ||
    record.safety.addsPolicyFlag ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.productionRoutingChanged ||
    record.claimBoundaries.policyFlagAdded
  ) {
    throw new Error("Production routing eligibility crossed a boundary");
  }
};

const forbiddenProductionEligibilityPatterns = [
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
  /raw routing output|routing output/i,
  /raw gate data/i
] as const;

export const productionEligibilityContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenProductionEligibilityPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
