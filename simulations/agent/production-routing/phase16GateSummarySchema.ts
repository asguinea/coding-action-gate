import { z } from "zod";
import { agentDefaultOffRoutingConfigSchemaVersion } from "./defaultOffRoutingConfigSchema.js";
import { agentProductionRoutingEligibilitySchemaVersion } from "./productionEligibilitySchema.js";
import { agentProductionRoutingReviewChecklistSchemaVersion } from "./productionRoutingReviewChecklistSchema.js";
import { agentSafetyOverrideFallbackRulesSchemaVersion } from "./safetyOverrideFallbackRulesSchema.js";
import type { DefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import type { ProductionRoutingEligibility } from "./productionEligibilitySchema.js";
import type { ProductionRoutingReviewChecklist } from "./productionRoutingReviewChecklistSchema.js";
import type { SafetyOverrideFallbackRules } from "./safetyOverrideFallbackRulesSchema.js";

export const agentPhase16GateSummarySchemaVersion =
  "agent-phase-16-gate-summary.v1" as const;

export const phase16GateSummarySourceValues = [
  "synthetic_phase_16_gate_summary_design",
  "future_phase_16_gate_review_summary",
  "phase_17_real_agent_evidence_handoff_design"
] as const;

export const acceptedPhase16ArtifactCategoryValues = [
  "production_routing_eligibility_criteria",
  "default_off_routing_configuration_design",
  "safety_override_and_fallback_rules",
  "production_routing_review_checklist"
] as const;

export const phase16GateReasonCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_reviewed_real_trace_labels",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_real_thresholds",
  "no_offline_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_record",
  "no_approved_runtime_integration_scope",
  "production_routing_default_off"
] as const;

export const phase17ExpectedOutputCategoryValues = [
  "generic_agent_action_protocol",
  "controlled_agent_integration_prototype",
  "real_proposed_action_capture",
  "controlled_real_agent_dry_run_sessions",
  "real_agent_trace_review",
  "real_agent_baseline_comparison",
  "real_agent_evidence_summary",
  "real_data_calibration_dataset_handoff"
] as const;

export const realCalibrationPathStepCategoryValues = [
  "phase_17_real_controlled_agent_traces",
  "phase_17_reviewed_trace_labels",
  "phase_17_baseline_comparison",
  "phase_13_real_data_pass_actual_calibration_dataset",
  "phase_14_real_data_pass_scores_thresholds_evaluation",
  "phase_15_real_data_pass_meaningful_advisory_calibrated_routing",
  "phase_16_gate_reconsideration_after_evidence"
] as const;

export const phase16RemainingBlockerCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_reviewed_real_trace_labels",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_real_thresholds",
  "no_offline_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_record",
  "no_product_owner_review_approval",
  "no_security_review_approval",
  "no_privacy_review_approval",
  "no_claim_boundary_review_approval",
  "no_routing_behavior_review_approval",
  "no_rollback_plan_approval",
  "no_beta_scope_approval",
  "no_monitoring_audit_readiness_approval",
  "no_approved_runtime_integration_scope",
  "production_routing_default_off",
  "phase_17_evidence_missing"
] as const;

export const phase16GateSummaryBoundaryStatementValues = [
  "phase_16_complete_as_gate_design_only",
  "no_runtime_behavior_changed",
  "no_production_routing_enabled",
  "no_advisory_calibrated_routing_implementation_added",
  "no_policy_flag_added",
  "no_cli_api_ui_surface_added",
  "no_scores_thresholds_alpha_calibration_conformal_crc_added",
  "no_statistical_guarantee",
  "no_approval_granted",
  "no_release_approved",
  "no_runtime_integration_approved",
  "no_real_agent_evidence_started",
  "no_real_calibration_started",
  "deterministic_stepharbor_decisions_remain_authoritative",
  "deterministic_safety_overrides_cannot_be_overridden_by_calibrated_advisory_signals",
  "phase_17_real_agent_evidence_required"
] as const;

const safeGateSummaryRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "gateSummaryRecordId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const phase16GateSummarySafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
  gateSummaryOnly: z.literal(true),
  handoffOnly: z.literal(true),
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
  addsRuntimeConfigFlag: z.literal(false),
  implementsAdvisoryRouting: z.literal(false),
  implementsCalibratedRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  grantsApproval: z.literal(false),
  approvesRelease: z.literal(false),
  startsRealAgentIntegration: z.literal(false),
  startsRealCalibration: z.literal(false)
});

export const phase16GateSummaryPrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawCalibrationDataIncluded: z.literal(false),
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  rawRoutingDataIncluded: z.literal(false),
  rawConfigDataIncluded: z.literal(false),
  rawGateDataIncluded: z.literal(false),
  rawApprovalDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const phase16GateSummaryClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateSummaryOnly: z.literal(true),
  handoffOnly: z.literal(true),
  productionRoutingEnabled: z.literal(false),
  advisoryRoutingEnabled: z.literal(false),
  calibratedRoutingEnabled: z.literal(false),
  productionRoutingEligible: z.literal(false),
  productionRoutingGatePasses: z.literal(false),
  approvalGranted: z.literal(false),
  releaseApproved: z.literal(false),
  runtimeIntegrationApproved: z.literal(false),
  runtimeConfigFlagAdded: z.literal(false),
  policyFlagAdded: z.literal(false),
  advisoryRoutingImplemented: z.literal(false),
  calibratedRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
  realAgentEvidenceStarted: z.literal(false),
  realCalibrationStarted: z.literal(false),
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

export const phase16GateSummarySchema = z.object({
  schemaVersion: z.literal(agentPhase16GateSummarySchemaVersion),
  gateSummaryRecordId: safeGateSummaryRecordIdSchema,
  source: z.enum(phase16GateSummarySourceValues),
  phaseStatus: z.object({
    phase: z.literal("phase_16"),
    phaseCompleteAsGateDesign: z.literal(true),
    designOnly: z.literal(true),
    gateSummaryOnly: z.literal(true),
    productionRoutingGatePassesNow: z.literal(false),
    productionRoutingEligibleNow: z.literal(false),
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    approvalGrantedNow: z.literal(false),
    releaseApprovedNow: z.literal(false),
    runtimeIntegrationApprovedNow: z.literal(false),
    deterministicDecisionsAuthoritative: z.literal(true),
    deterministicSafetyOverridesAuthoritative: z.literal(true),
    defaultOffRequired: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    phase17EvidenceRequired: z.literal(true),
    realCalibrationStarted: z.literal(false),
    realAgentEvidenceStarted: z.literal(false)
  }),
  acceptedPhase16Artifacts: z
    .array(
      z.object({
        batchId: z.enum(["16.1", "16.2", "16.3", "16.4"]),
        artifactCategory: z.enum(acceptedPhase16ArtifactCategoryValues),
        schemaVersion: z.string().min(1),
        recordId: z.string().min(1),
        accepted: z.literal(true),
        designOnly: z.literal(true),
        grantsProductionAuthority: z.literal(false),
        changesRuntimeBehavior: z.literal(false),
        rawRecordIncluded: z.literal(false)
      })
    )
    .length(acceptedPhase16ArtifactCategoryValues.length),
  linkedProductionEligibility: z.object({
    eligibilityRecordId: z.literal("phase-16-production-eligibility-001"),
    schemaVersion: z.literal(agentProductionRoutingEligibilitySchemaVersion),
    productionRoutingEligibleNow: z.literal(false),
    rawEligibilityRecordIncluded: z.literal(false)
  }),
  linkedDefaultOffRoutingConfig: z.object({
    configRecordId: z.literal("phase-16-default-off-routing-config-001"),
    schemaVersion: z.literal(agentDefaultOffRoutingConfigSchemaVersion),
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    defaultOffRequired: z.literal(true),
    rawDefaultOffConfigIncluded: z.literal(false)
  }),
  linkedSafetyOverrideFallbackRules: z.object({
    rulesRecordId: z.literal("phase-16-safety-override-fallback-rules-001"),
    schemaVersion: z.literal(agentSafetyOverrideFallbackRulesSchemaVersion),
    deterministicOverridesAuthoritative: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    rawRulesRecordIncluded: z.literal(false)
  }),
  linkedProductionRoutingReviewChecklist: z.object({
    checklistRecordId: z.literal(
      "phase-16-production-routing-review-checklist-001"
    ),
    schemaVersion: z.literal(
      agentProductionRoutingReviewChecklistSchemaVersion
    ),
    approvalGrantedNow: z.literal(false),
    productionRoutingApprovedNow: z.literal(false),
    productionRoutingEnabledNow: z.literal(false),
    rawChecklistRecordIncluded: z.literal(false)
  }),
  gateDecision: z.object({
    gatePassesNow: z.literal(false),
    gateDecisionCategory: z.literal("does_not_pass"),
    productionRoutingMayBeEnabledNow: z.literal(false),
    advisoryRoutingMayBeAuthoritativeNow: z.literal(false),
    calibratedRoutingMayBeAuthoritativeNow: z.literal(false),
    reasonCategories: z
      .array(z.enum(phase16GateReasonCategoryValues))
      .length(phase16GateReasonCategoryValues.length),
    requiredNextPhase: z.literal("phase_17_real_agent_evidence")
  }),
  phase17EvidenceHandoff: z.object({
    nextPhase: z.literal(
      "phase_17_real_agent_integration_and_real_controlled_traces"
    ),
    realAgentEvidenceRequired: z.literal(true),
    controlledTraceCollectionRequired: z.literal(true),
    realProposedActionCaptureRequired: z.literal(true),
    reviewedTraceLabelsRequired: z.literal(true),
    adjudicationRequiredWhereLabelsConflict: z.literal(true),
    baselineComparisonOnRealControlledTracesRequired: z.literal(true),
    evidenceQualityReviewRequired: z.literal(true),
    privacySafeInclusionExclusionRequired: z.literal(true),
    realCalibrationDatasetConstructionAfterTraceReviewRequired: z.literal(true),
    productionRoutingCannotBeEnabledWithoutPhase17Evidence: z.literal(true),
    stopExpandingMockRoutingInfrastructureAfterPhase16: z.literal(true),
    expectedPhase17Outputs: z
      .array(z.enum(phase17ExpectedOutputCategoryValues))
      .length(phase17ExpectedOutputCategoryValues.length)
  }),
  realCalibrationPath: z.object({
    pathSteps: z
      .array(z.enum(realCalibrationPathStepCategoryValues))
      .length(realCalibrationPathStepCategoryValues.length),
    realCalibrationStartedNow: z.literal(false),
    realCalibrationDatasetExistsNow: z.literal(false),
    realScoresExistNow: z.literal(false),
    realThresholdsExistNow: z.literal(false),
    conformalOrCRCImplementedNow: z.literal(false),
    productionAuthorityGrantedNow: z.literal(false)
  }),
  remainingBlockers: z.object({
    blockerCategories: z
      .array(z.enum(phase16RemainingBlockerCategoryValues))
      .length(phase16RemainingBlockerCategoryValues.length)
  }),
  stopCondition: z.object({
    phase16GateDesignComplete: z.literal(true),
    continueMockRoutingInfrastructureExpansion: z.literal(false),
    nextStrategicWorkCategory: z.literal(
      "phase_17_real_controlled_agent_evidence"
    ),
    reason: z.literal(
      "real_evidence_required_before_further_calibration_or_production_authority"
    ),
    productionRoutingCannotProgressWithoutRealEvidence: z.literal(true)
  }),
  safety: phase16GateSummarySafetySchema,
  privacy: phase16GateSummaryPrivacySchema,
  claimBoundaries: phase16GateSummaryClaimBoundariesSchema,
  boundaryStatements: z
    .array(z.enum(phase16GateSummaryBoundaryStatementValues))
    .length(phase16GateSummaryBoundaryStatementValues.length),
  notes: z.array(categoryIdSchema).min(1)
});

export type Phase16GateSummary = z.infer<typeof phase16GateSummarySchema>;

const artifactRecordIdByCategory = (
  category: (typeof acceptedPhase16ArtifactCategoryValues)[number]
): string => {
  switch (category) {
    case "production_routing_eligibility_criteria":
      return "phase-16-production-eligibility-001";
    case "default_off_routing_configuration_design":
      return "phase-16-default-off-routing-config-001";
    case "safety_override_and_fallback_rules":
      return "phase-16-safety-override-fallback-rules-001";
    case "production_routing_review_checklist":
      return "phase-16-production-routing-review-checklist-001";
  }
};

const artifactSchemaVersionByCategory = (
  category: (typeof acceptedPhase16ArtifactCategoryValues)[number]
): string => {
  switch (category) {
    case "production_routing_eligibility_criteria":
      return agentProductionRoutingEligibilitySchemaVersion;
    case "default_off_routing_configuration_design":
      return agentDefaultOffRoutingConfigSchemaVersion;
    case "safety_override_and_fallback_rules":
      return agentSafetyOverrideFallbackRulesSchemaVersion;
    case "production_routing_review_checklist":
      return agentProductionRoutingReviewChecklistSchemaVersion;
  }
};

const artifactBatchIdByCategory = (
  category: (typeof acceptedPhase16ArtifactCategoryValues)[number]
): "16.1" | "16.2" | "16.3" | "16.4" => {
  switch (category) {
    case "production_routing_eligibility_criteria":
      return "16.1";
    case "default_off_routing_configuration_design":
      return "16.2";
    case "safety_override_and_fallback_rules":
      return "16.3";
    case "production_routing_review_checklist":
      return "16.4";
  }
};

export const buildProductionPhase16GateSummary = (input?: {
  eligibilityRecordId?: string;
  eligibilitySchemaVersion?: string;
  productionRoutingEligibleNow?: false;
  configRecordId?: string;
  configSchemaVersion?: string;
  productionRoutingEnabledNow?: false;
  advisoryRoutingEnabledNow?: false;
  calibratedRoutingEnabledNow?: false;
  defaultOffRequired?: true;
  rulesRecordId?: string;
  rulesSchemaVersion?: string;
  deterministicOverridesAuthoritative?: true;
  fallbackToDeterministicRequired?: true;
  checklistRecordId?: string;
  checklistSchemaVersion?: string;
  approvalGrantedNow?: false;
  productionRoutingApprovedNow?: false;
  checklistProductionRoutingEnabledNow?: false;
}): Phase16GateSummary => {
  const eligibilityRecordId =
    input?.eligibilityRecordId ?? "phase-16-production-eligibility-001";
  const eligibilitySchemaVersion =
    input?.eligibilitySchemaVersion ??
    agentProductionRoutingEligibilitySchemaVersion;
  const configRecordId =
    input?.configRecordId ?? "phase-16-default-off-routing-config-001";
  const configSchemaVersion =
    input?.configSchemaVersion ?? agentDefaultOffRoutingConfigSchemaVersion;
  const rulesRecordId =
    input?.rulesRecordId ?? "phase-16-safety-override-fallback-rules-001";
  const rulesSchemaVersion =
    input?.rulesSchemaVersion ?? agentSafetyOverrideFallbackRulesSchemaVersion;
  const checklistRecordId =
    input?.checklistRecordId ??
    "phase-16-production-routing-review-checklist-001";
  const checklistSchemaVersion =
    input?.checklistSchemaVersion ??
    agentProductionRoutingReviewChecklistSchemaVersion;

  return validatePhase16GateSummary({
    schemaVersion: agentPhase16GateSummarySchemaVersion,
    gateSummaryRecordId: "phase-16-gate-summary-001",
    source: "synthetic_phase_16_gate_summary_design",
    phaseStatus: {
      phase: "phase_16",
      phaseCompleteAsGateDesign: true,
      designOnly: true,
      gateSummaryOnly: true,
      productionRoutingGatePassesNow: false,
      productionRoutingEligibleNow: false,
      productionRoutingEnabledNow: false,
      advisoryRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      approvalGrantedNow: false,
      releaseApprovedNow: false,
      runtimeIntegrationApprovedNow: false,
      deterministicDecisionsAuthoritative: true,
      deterministicSafetyOverridesAuthoritative: true,
      defaultOffRequired: true,
      fallbackToDeterministicRequired: true,
      phase17EvidenceRequired: true,
      realCalibrationStarted: false,
      realAgentEvidenceStarted: false
    },
    acceptedPhase16Artifacts: acceptedPhase16ArtifactCategoryValues.map(
      (category) => ({
        batchId: artifactBatchIdByCategory(category),
        artifactCategory: category,
        schemaVersion:
          category === "production_routing_eligibility_criteria"
            ? eligibilitySchemaVersion
            : category === "default_off_routing_configuration_design"
              ? configSchemaVersion
              : category === "safety_override_and_fallback_rules"
                ? rulesSchemaVersion
                : checklistSchemaVersion,
        recordId:
          category === "production_routing_eligibility_criteria"
            ? eligibilityRecordId
            : category === "default_off_routing_configuration_design"
              ? configRecordId
              : category === "safety_override_and_fallback_rules"
                ? rulesRecordId
                : checklistRecordId,
        accepted: true,
        designOnly: true,
        grantsProductionAuthority: false,
        changesRuntimeBehavior: false,
        rawRecordIncluded: false
      })
    ),
    linkedProductionEligibility: {
      eligibilityRecordId,
      schemaVersion: eligibilitySchemaVersion,
      productionRoutingEligibleNow:
        input?.productionRoutingEligibleNow ?? false,
      rawEligibilityRecordIncluded: false
    },
    linkedDefaultOffRoutingConfig: {
      configRecordId,
      schemaVersion: configSchemaVersion,
      productionRoutingEnabledNow: input?.productionRoutingEnabledNow ?? false,
      advisoryRoutingEnabledNow: input?.advisoryRoutingEnabledNow ?? false,
      calibratedRoutingEnabledNow: input?.calibratedRoutingEnabledNow ?? false,
      defaultOffRequired: input?.defaultOffRequired ?? true,
      rawDefaultOffConfigIncluded: false
    },
    linkedSafetyOverrideFallbackRules: {
      rulesRecordId,
      schemaVersion: rulesSchemaVersion,
      deterministicOverridesAuthoritative:
        input?.deterministicOverridesAuthoritative ?? true,
      fallbackToDeterministicRequired:
        input?.fallbackToDeterministicRequired ?? true,
      rawRulesRecordIncluded: false
    },
    linkedProductionRoutingReviewChecklist: {
      checklistRecordId,
      schemaVersion: checklistSchemaVersion,
      approvalGrantedNow: input?.approvalGrantedNow ?? false,
      productionRoutingApprovedNow:
        input?.productionRoutingApprovedNow ?? false,
      productionRoutingEnabledNow:
        input?.checklistProductionRoutingEnabledNow ?? false,
      rawChecklistRecordIncluded: false
    },
    gateDecision: {
      gatePassesNow: false,
      gateDecisionCategory: "does_not_pass",
      productionRoutingMayBeEnabledNow: false,
      advisoryRoutingMayBeAuthoritativeNow: false,
      calibratedRoutingMayBeAuthoritativeNow: false,
      reasonCategories: [...phase16GateReasonCategoryValues],
      requiredNextPhase: "phase_17_real_agent_evidence"
    },
    phase17EvidenceHandoff: {
      nextPhase: "phase_17_real_agent_integration_and_real_controlled_traces",
      realAgentEvidenceRequired: true,
      controlledTraceCollectionRequired: true,
      realProposedActionCaptureRequired: true,
      reviewedTraceLabelsRequired: true,
      adjudicationRequiredWhereLabelsConflict: true,
      baselineComparisonOnRealControlledTracesRequired: true,
      evidenceQualityReviewRequired: true,
      privacySafeInclusionExclusionRequired: true,
      realCalibrationDatasetConstructionAfterTraceReviewRequired: true,
      productionRoutingCannotBeEnabledWithoutPhase17Evidence: true,
      stopExpandingMockRoutingInfrastructureAfterPhase16: true,
      expectedPhase17Outputs: [...phase17ExpectedOutputCategoryValues]
    },
    realCalibrationPath: {
      pathSteps: [...realCalibrationPathStepCategoryValues],
      realCalibrationStartedNow: false,
      realCalibrationDatasetExistsNow: false,
      realScoresExistNow: false,
      realThresholdsExistNow: false,
      conformalOrCRCImplementedNow: false,
      productionAuthorityGrantedNow: false
    },
    remainingBlockers: {
      blockerCategories: [...phase16RemainingBlockerCategoryValues]
    },
    stopCondition: {
      phase16GateDesignComplete: true,
      continueMockRoutingInfrastructureExpansion: false,
      nextStrategicWorkCategory: "phase_17_real_controlled_agent_evidence",
      reason:
        "real_evidence_required_before_further_calibration_or_production_authority",
      productionRoutingCannotProgressWithoutRealEvidence: true
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      gateDesignOnly: true,
      gateSummaryOnly: true,
      handoffOnly: true,
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
      addsRuntimeConfigFlag: false,
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      implementsProductionRouting: false,
      appliesCalibration: false,
      computesScores: false,
      computesThresholds: false,
      introducesAlpha: false,
      implementsConformalRiskControl: false,
      grantsApproval: false,
      approvesRelease: false,
      startsRealAgentIntegration: false,
      startsRealCalibration: false
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
      rawCalibrationDataIncluded: false,
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
      rawRoutingDataIncluded: false,
      rawConfigDataIncluded: false,
      rawGateDataIncluded: false,
      rawApprovalDataIncluded: false,
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
      gateSummaryOnly: true,
      handoffOnly: true,
      productionRoutingEnabled: false,
      advisoryRoutingEnabled: false,
      calibratedRoutingEnabled: false,
      productionRoutingEligible: false,
      productionRoutingGatePasses: false,
      approvalGranted: false,
      releaseApproved: false,
      runtimeIntegrationApproved: false,
      runtimeConfigFlagAdded: false,
      policyFlagAdded: false,
      advisoryRoutingImplemented: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false,
      realAgentEvidenceStarted: false,
      realCalibrationStarted: false,
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
    boundaryStatements: [...phase16GateSummaryBoundaryStatementValues],
    notes: [
      "phase_16_gate_design_complete",
      "gate_does_not_pass",
      "routing_not_enabled",
      "phase_17_evidence_required_next"
    ]
  });
};

export const validatePhase16GateSummary = (
  record: unknown
): Phase16GateSummary => {
  const parsed = phase16GateSummarySchema.parse(record);
  validatePhase16GateSummaryBoundaries(parsed);
  return parsed;
};

export const validatePhase16GateSummaries = (
  records: unknown[]
): Phase16GateSummary[] =>
  records
    .map(validatePhase16GateSummary)
    .sort((left, right) =>
      left.gateSummaryRecordId.localeCompare(right.gateSummaryRecordId)
    );

export const summarizePhase16GateSummary = (
  record: Phase16GateSummary
): {
  schemaVersion: string;
  gateSummaryRecordId: string;
  phaseCompleteAsGateDesign: true;
  linkedEligibilityRecordId: string;
  linkedProductionRoutingEligibleNow: false;
  linkedDefaultOffConfigRecordId: string;
  linkedProductionRoutingEnabledNow: false;
  linkedSafetyFallbackRulesRecordId: string;
  linkedDeterministicOverridesAuthoritative: true;
  linkedReviewChecklistRecordId: string;
  linkedApprovalGrantedNow: false;
  acceptedArtifactCount: number;
  acceptedArtifacts: string[];
  gateDecision: "does_not_pass";
  productionRoutingMayBeEnabledNow: false;
  blockerCount: number;
  blockers: string[];
  phase17EvidenceRequired: true;
  expectedPhase17Outputs: string[];
  realCalibrationPath: string[];
  stopCondition: "phase_17_real_controlled_agent_evidence";
  conclusion: "phase_16_gate_design_complete_production_routing_not_eligible_phase_17_evidence_required_next";
} => ({
  schemaVersion: record.schemaVersion,
  gateSummaryRecordId: record.gateSummaryRecordId,
  phaseCompleteAsGateDesign: record.phaseStatus.phaseCompleteAsGateDesign,
  linkedEligibilityRecordId:
    record.linkedProductionEligibility.eligibilityRecordId,
  linkedProductionRoutingEligibleNow:
    record.linkedProductionEligibility.productionRoutingEligibleNow,
  linkedDefaultOffConfigRecordId:
    record.linkedDefaultOffRoutingConfig.configRecordId,
  linkedProductionRoutingEnabledNow:
    record.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow,
  linkedSafetyFallbackRulesRecordId:
    record.linkedSafetyOverrideFallbackRules.rulesRecordId,
  linkedDeterministicOverridesAuthoritative:
    record.linkedSafetyOverrideFallbackRules
      .deterministicOverridesAuthoritative,
  linkedReviewChecklistRecordId:
    record.linkedProductionRoutingReviewChecklist.checklistRecordId,
  linkedApprovalGrantedNow:
    record.linkedProductionRoutingReviewChecklist.approvalGrantedNow,
  acceptedArtifactCount: record.acceptedPhase16Artifacts.length,
  acceptedArtifacts: record.acceptedPhase16Artifacts.map(
    (artifact) => artifact.artifactCategory
  ),
  gateDecision: record.gateDecision.gateDecisionCategory,
  productionRoutingMayBeEnabledNow:
    record.gateDecision.productionRoutingMayBeEnabledNow,
  blockerCount: record.remainingBlockers.blockerCategories.length,
  blockers: [...record.remainingBlockers.blockerCategories],
  phase17EvidenceRequired:
    record.phase17EvidenceHandoff.realAgentEvidenceRequired,
  expectedPhase17Outputs: [
    ...record.phase17EvidenceHandoff.expectedPhase17Outputs
  ],
  realCalibrationPath: [...record.realCalibrationPath.pathSteps],
  stopCondition: record.stopCondition.nextStrategicWorkCategory,
  conclusion:
    "phase_16_gate_design_complete_production_routing_not_eligible_phase_17_evidence_required_next"
});

const assertAllCategoriesPresent = <Category extends string>(
  actual: Category[],
  required: readonly Category[],
  label: string
): void => {
  const actualSet = new Set(actual);
  if (required.some((category) => !actualSet.has(category))) {
    throw new Error(`${label} missing required category`);
  }
};

export const validatePhase16GateSummaryBoundaries = (
  record: Phase16GateSummary
): void => {
  phase16GateSummarySafetySchema.parse(record.safety);
  phase16GateSummaryPrivacySchema.parse(record.privacy);
  phase16GateSummaryClaimBoundariesSchema.parse(record.claimBoundaries);

  assertAllCategoriesPresent(
    record.acceptedPhase16Artifacts.map(
      (artifact) => artifact.artifactCategory
    ),
    acceptedPhase16ArtifactCategoryValues,
    "acceptedPhase16Artifacts"
  );
  assertAllCategoriesPresent(
    record.gateDecision.reasonCategories,
    phase16GateReasonCategoryValues,
    "gateDecision.reasonCategories"
  );
  assertAllCategoriesPresent(
    record.phase17EvidenceHandoff.expectedPhase17Outputs,
    phase17ExpectedOutputCategoryValues,
    "phase17EvidenceHandoff.expectedPhase17Outputs"
  );
  assertAllCategoriesPresent(
    record.realCalibrationPath.pathSteps,
    realCalibrationPathStepCategoryValues,
    "realCalibrationPath.pathSteps"
  );

  const artifactsMatchLinkedRecords = record.acceptedPhase16Artifacts.every(
    (artifact) =>
      artifact.schemaVersion ===
        artifactSchemaVersionByCategory(artifact.artifactCategory) &&
      artifact.recordId ===
        artifactRecordIdByCategory(artifact.artifactCategory)
  );

  if (
    record.source !== "synthetic_phase_16_gate_summary_design" ||
    record.phaseStatus.phase !== "phase_16" ||
    !record.phaseStatus.phaseCompleteAsGateDesign ||
    !record.phaseStatus.designOnly ||
    !record.phaseStatus.gateSummaryOnly ||
    record.phaseStatus.productionRoutingGatePassesNow ||
    record.phaseStatus.productionRoutingEligibleNow ||
    record.phaseStatus.productionRoutingEnabledNow ||
    record.phaseStatus.advisoryRoutingEnabledNow ||
    record.phaseStatus.calibratedRoutingEnabledNow ||
    record.phaseStatus.approvalGrantedNow ||
    record.phaseStatus.releaseApprovedNow ||
    record.phaseStatus.runtimeIntegrationApprovedNow ||
    !record.phaseStatus.deterministicDecisionsAuthoritative ||
    !record.phaseStatus.deterministicSafetyOverridesAuthoritative ||
    !record.phaseStatus.defaultOffRequired ||
    !record.phaseStatus.fallbackToDeterministicRequired ||
    !record.phaseStatus.phase17EvidenceRequired ||
    record.phaseStatus.realCalibrationStarted ||
    record.phaseStatus.realAgentEvidenceStarted ||
    !artifactsMatchLinkedRecords ||
    record.acceptedPhase16Artifacts.some(
      (artifact) =>
        !artifact.accepted ||
        !artifact.designOnly ||
        artifact.grantsProductionAuthority ||
        artifact.changesRuntimeBehavior ||
        artifact.rawRecordIncluded
    ) ||
    record.linkedProductionEligibility.productionRoutingEligibleNow ||
    record.linkedProductionEligibility.rawEligibilityRecordIncluded ||
    record.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow ||
    record.linkedDefaultOffRoutingConfig.advisoryRoutingEnabledNow ||
    record.linkedDefaultOffRoutingConfig.calibratedRoutingEnabledNow ||
    !record.linkedDefaultOffRoutingConfig.defaultOffRequired ||
    record.linkedDefaultOffRoutingConfig.rawDefaultOffConfigIncluded ||
    !record.linkedSafetyOverrideFallbackRules
      .deterministicOverridesAuthoritative ||
    !record.linkedSafetyOverrideFallbackRules.fallbackToDeterministicRequired ||
    record.linkedSafetyOverrideFallbackRules.rawRulesRecordIncluded ||
    record.linkedProductionRoutingReviewChecklist.approvalGrantedNow ||
    record.linkedProductionRoutingReviewChecklist
      .productionRoutingApprovedNow ||
    record.linkedProductionRoutingReviewChecklist.productionRoutingEnabledNow ||
    record.linkedProductionRoutingReviewChecklist.rawChecklistRecordIncluded ||
    record.gateDecision.gatePassesNow ||
    record.gateDecision.gateDecisionCategory !== "does_not_pass" ||
    record.gateDecision.productionRoutingMayBeEnabledNow ||
    record.gateDecision.advisoryRoutingMayBeAuthoritativeNow ||
    record.gateDecision.calibratedRoutingMayBeAuthoritativeNow ||
    record.gateDecision.requiredNextPhase !== "phase_17_real_agent_evidence" ||
    !record.phase17EvidenceHandoff.realAgentEvidenceRequired ||
    !record.phase17EvidenceHandoff.controlledTraceCollectionRequired ||
    !record.phase17EvidenceHandoff.realProposedActionCaptureRequired ||
    !record.phase17EvidenceHandoff.reviewedTraceLabelsRequired ||
    !record.phase17EvidenceHandoff.adjudicationRequiredWhereLabelsConflict ||
    !record.phase17EvidenceHandoff
      .baselineComparisonOnRealControlledTracesRequired ||
    !record.phase17EvidenceHandoff.evidenceQualityReviewRequired ||
    !record.phase17EvidenceHandoff.privacySafeInclusionExclusionRequired ||
    !record.phase17EvidenceHandoff
      .realCalibrationDatasetConstructionAfterTraceReviewRequired ||
    !record.phase17EvidenceHandoff
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence ||
    !record.phase17EvidenceHandoff
      .stopExpandingMockRoutingInfrastructureAfterPhase16 ||
    record.realCalibrationPath.realCalibrationStartedNow ||
    record.realCalibrationPath.realCalibrationDatasetExistsNow ||
    record.realCalibrationPath.realScoresExistNow ||
    record.realCalibrationPath.realThresholdsExistNow ||
    record.realCalibrationPath.conformalOrCRCImplementedNow ||
    record.realCalibrationPath.productionAuthorityGrantedNow ||
    record.remainingBlockers.blockerCategories.length === 0 ||
    !record.remainingBlockers.blockerCategories.includes(
      "phase_17_evidence_missing"
    ) ||
    !record.stopCondition.phase16GateDesignComplete ||
    record.stopCondition.continueMockRoutingInfrastructureExpansion ||
    record.stopCondition.nextStrategicWorkCategory !==
      "phase_17_real_controlled_agent_evidence" ||
    !record.stopCondition.productionRoutingCannotProgressWithoutRealEvidence ||
    record.safety.changesRuntimeBehavior ||
    record.safety.addsRuntimeConfigFlag ||
    record.safety.implementsAdvisoryRouting ||
    record.safety.implementsCalibratedRouting ||
    record.safety.implementsProductionRouting ||
    record.safety.grantsApproval ||
    record.safety.approvesRelease ||
    record.safety.startsRealAgentIntegration ||
    record.safety.startsRealCalibration ||
    record.privacy.rawTraceIncluded ||
    record.privacy.rawApprovalDataIncluded ||
    record.privacy.reviewerIdentityIncluded ||
    record.claimBoundaries.productionRoutingEnabled ||
    record.claimBoundaries.advisoryRoutingEnabled ||
    record.claimBoundaries.calibratedRoutingEnabled ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.productionRoutingGatePasses ||
    record.claimBoundaries.approvalGranted ||
    record.claimBoundaries.releaseApproved ||
    record.claimBoundaries.runtimeIntegrationApproved ||
    record.claimBoundaries.realAgentEvidenceStarted ||
    record.claimBoundaries.realCalibrationStarted ||
    !record.boundaryStatements.includes(
      "phase_16_complete_as_gate_design_only"
    ) ||
    !record.boundaryStatements.includes("no_runtime_behavior_changed") ||
    !record.boundaryStatements.includes("no_cli_api_ui_surface_added") ||
    !record.boundaryStatements.includes("no_approval_granted") ||
    !record.boundaryStatements.includes("no_real_agent_evidence_started") ||
    !record.boundaryStatements.includes("no_real_calibration_started")
  ) {
    throw new Error(
      "Phase 16 gate summary boundary violated: summary must remain design-only, gate-does-not-pass, no-approval, no-real-evidence, and Phase-17-handoff-only."
    );
  }
};

export const buildPhase16GateSummaryFromLinkedRecords = (
  eligibility: ProductionRoutingEligibility,
  config: DefaultOffRoutingConfig,
  rules: SafetyOverrideFallbackRules,
  checklist: ProductionRoutingReviewChecklist
): Phase16GateSummary =>
  buildProductionPhase16GateSummary({
    eligibilityRecordId: eligibility.eligibilityRecordId,
    eligibilitySchemaVersion: eligibility.schemaVersion,
    productionRoutingEligibleNow:
      eligibility.eligibilityStatus.productionRoutingEligibleNow,
    configRecordId: config.configRecordId,
    configSchemaVersion: config.schemaVersion,
    productionRoutingEnabledNow:
      config.configStatus.productionRoutingEnabledNow,
    advisoryRoutingEnabledNow: config.configStatus.advisoryRoutingEnabledNow,
    calibratedRoutingEnabledNow:
      config.configStatus.calibratedRoutingEnabledNow,
    defaultOffRequired: config.configStatus.defaultOffRequired,
    rulesRecordId: rules.rulesRecordId,
    rulesSchemaVersion: rules.schemaVersion,
    deterministicOverridesAuthoritative:
      rules.ruleStatus.deterministicOverridesAuthoritative,
    fallbackToDeterministicRequired:
      rules.ruleStatus.fallbackToDeterministicRequired,
    checklistRecordId: checklist.checklistRecordId,
    checklistSchemaVersion: checklist.schemaVersion,
    approvalGrantedNow: checklist.checklistStatus.approvalGrantedNow,
    productionRoutingApprovedNow:
      checklist.checklistStatus.productionRoutingApprovedNow,
    checklistProductionRoutingEnabledNow:
      checklist.checklistStatus.productionRoutingEnabledNow
  });

export const phase16GateSummaryContainsForbiddenRawString = (
  record: Phase16GateSummary
): boolean =>
  JSON.stringify(record).match(
    /diff --git|\/Users\/|\/private\/tmp\/|C:\\|@[A-Za-z0-9.-]+|PRIVATE KEY|sk-[A-Za-z0-9_-]{24,}|raw_prompt|raw_command|raw_diff|raw_source_code|raw_agent_output|raw_trace|raw_approval|reviewer_identity/i
  ) !== null;
