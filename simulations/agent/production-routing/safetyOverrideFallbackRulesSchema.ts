import { z } from "zod";
import { agentDefaultOffRoutingConfigSchemaVersion } from "./defaultOffRoutingConfigSchema.js";
import { agentProductionRoutingEligibilitySchemaVersion } from "./productionEligibilitySchema.js";
import type { DefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import type { ProductionRoutingEligibility } from "./productionEligibilitySchema.js";

export const agentSafetyOverrideFallbackRulesSchemaVersion =
  "agent-safety-override-fallback-rules.v1" as const;

export const safetyOverrideFallbackRulesSourceValues = [
  "synthetic_safety_override_fallback_rules_design",
  "future_safety_override_fallback_review",
  "future_calibrated_advisory_safety_gate_review"
] as const;

export const safetyOverrideCategoryValues = [
  "secret_or_credential_access",
  "workspace_escape",
  "dangerous_command",
  "destructive_file_action",
  "production_deploy",
  "protected_branch_operation",
  "validation_failure",
  "validation_bypass_or_no_verify",
  "publish_or_release_action",
  "policy_block",
  "explicit_user_or_policy_forbidden_action",
  "private_data_exposure_risk"
] as const;

export const safetyOverrideFallbackDecisionCategoryValues = [
  "deterministic_decision_engine",
  "defer_for_evidence",
  "escalate_for_human_review",
  "block_by_policy"
] as const;

export const safetyOverrideRationaleCategoryValues = [
  "protects_secrets_and_private_data",
  "preserves_workspace_boundary",
  "prevents_dangerous_or_destructive_action",
  "preserves_release_and_branch_controls",
  "preserves_validation_and_evidence_requirements",
  "preserves_policy_or_user_prohibition"
] as const;

export const safetyFallbackCategoryValues = [
  "missing_eligibility_record",
  "failed_eligibility",
  "missing_default_off_config",
  "default_off_config_not_satisfied",
  "production_routing_disabled",
  "unsupported_action_category",
  "missing_score",
  "stale_score",
  "missing_threshold",
  "stale_threshold",
  "missing_calibration_dataset",
  "stale_calibration_dataset",
  "distribution_shift_detected_or_unassessed",
  "policy_conflict",
  "incomplete_evidence",
  "stale_context",
  "missing_required_validation",
  "failed_required_validation",
  "high_uncertainty_outside_approved_scope",
  "missing_human_approval",
  "privacy_boundary_unclear",
  "claim_boundary_unclear",
  "phase17_evidence_missing"
] as const;

export const safetyFallbackTargetCategoryValues = [
  "deterministic_decision_engine",
  "defer_for_evidence",
  "escalate_for_human_review",
  "block_by_policy",
  "deny_production_authority",
  "advisory_only_no_authority"
] as const;

export const safetyFallbackRationaleCategoryValues = [
  "missing_gate_artifact",
  "gate_not_satisfied",
  "default_off_not_satisfied",
  "production_authority_denied",
  "unsupported_or_unapproved_scope",
  "missing_or_stale_calibrated_signal_input",
  "distribution_or_context_uncertain",
  "policy_or_validation_conflict",
  "human_or_privacy_review_required",
  "phase17_evidence_required"
] as const;

export const safetyRulePrecedenceCategoryValues = [
  "deterministic_hard_block_or_policy_prohibition",
  "deterministic_safety_override",
  "eligibility_gate",
  "default_off_config_gate",
  "fallback_conditions",
  "human_approval_requirements",
  "deterministic_defer_escalate_evidence_requirements",
  "future_calibrated_advisory_signal_if_ever_approved",
  "audit_monitoring_reporting_obligations"
] as const;

export const safetyOverrideFallbackBlockerCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_reviewed_real_trace_labels",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_real_thresholds",
  "no_offline_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_record",
  "no_approved_runtime_integration_scope",
  "production_routing_default_off",
  "safety_override_rules_design_only",
  "fallback_rules_design_only"
] as const;

export const safetyOverrideFallbackBoundaryStatementValues = [
  "no_runtime_behavior_changed",
  "no_production_routing_enabled",
  "no_advisory_calibrated_routing_implementation_added",
  "no_policy_flag_added",
  "no_cli_api_ui_surface_added",
  "no_scores_thresholds_alpha_calibration_conformal_crc_added",
  "no_statistical_guarantee",
  "deterministic_codingactiongate_decisions_remain_authoritative",
  "deterministic_safety_overrides_cannot_be_overridden_by_calibrated_advisory_signals",
  "phase_17_real_agent_evidence_required"
] as const;

const safeRulesRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "rulesRecordId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const safetyOverrideFallbackRulesSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
  safetyOverrideDesignOnly: z.literal(true),
  fallbackDesignOnly: z.literal(true),
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
  implementsConformalRiskControl: z.literal(false)
});

export const safetyOverrideFallbackRulesPrivacySchema = z.object({
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
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const safetyOverrideFallbackRulesClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  safetyOverrideDesignOnly: z.literal(true),
  fallbackDesignOnly: z.literal(true),
  productionRoutingEnabled: z.literal(false),
  advisoryRoutingEnabled: z.literal(false),
  calibratedRoutingEnabled: z.literal(false),
  productionRoutingEligible: z.literal(false),
  runtimeConfigFlagAdded: z.literal(false),
  policyFlagAdded: z.literal(false),
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

export const safetyOverrideFallbackRulesSchema = z.object({
  schemaVersion: z.literal(agentSafetyOverrideFallbackRulesSchemaVersion),
  rulesRecordId: safeRulesRecordIdSchema,
  source: z.enum(safetyOverrideFallbackRulesSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-16"),
    phaseName: z.literal("Production-Authoritative Calibrated Routing Gate"),
    completedPreviousPhase: z.literal(
      "phase-15-complete-advisory-design-readiness-groundwork-only"
    ),
    completedBatches: z.array(z.enum(["16.1", "16.2"])).length(2),
    currentBatch: z.literal("16.3"),
    futureBatches: z.array(z.enum(["16.4", "16.5"])).length(2),
    phaseStatus: z.literal(
      "safety_override_fallback_rules_design_without_runtime_routing_implementation"
    )
  }),
  ruleStatus: z.object({
    designOnly: z.literal(true),
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    productionRoutingEligibleNow: z.literal(false),
    defaultOffRequired: z.literal(true),
    deterministicOverridesAuthoritative: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    humanReviewRequiredForSensitiveCases: z.literal(true),
    phase17EvidenceRequired: z.literal(true)
  }),
  linkedProductionEligibility: z.object({
    eligibilityRecordId: z.literal("phase-16-production-eligibility-001"),
    schemaVersion: z.literal(agentProductionRoutingEligibilitySchemaVersion),
    source: z.literal("synthetic_production_eligibility_design"),
    productionRoutingEligibleNow: z.literal(false),
    rawEligibilityRecordIncluded: z.literal(false)
  }),
  linkedDefaultOffRoutingConfig: z.object({
    configRecordId: z.literal("phase-16-default-off-routing-config-001"),
    schemaVersion: z.literal(agentDefaultOffRoutingConfigSchemaVersion),
    source: z.literal("synthetic_default_off_routing_config_design"),
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    defaultOffRequired: z.literal(true),
    rawDefaultOffConfigIncluded: z.literal(false)
  }),
  deterministicSafetyOverrides: z
    .array(
      z.object({
        overrideCategory: z.enum(safetyOverrideCategoryValues),
        currentAuthority: z.literal("deterministic_codingactiongate"),
        calibratedLayerMayOverride: z.literal(false),
        advisoryLayerMayOverride: z.literal(false),
        requiresHumanApprovalToProceedIfProceedingIsEverAllowed: z.boolean(),
        fallbackDecisionCategory: z.enum(
          safetyOverrideFallbackDecisionCategoryValues
        ),
        rationaleCategory: z.enum(safetyOverrideRationaleCategoryValues)
      })
    )
    .length(safetyOverrideCategoryValues.length),
  fallbackRules: z
    .array(
      z.object({
        fallbackCategory: z.enum(safetyFallbackCategoryValues),
        triggerCategory: z.enum(safetyFallbackCategoryValues),
        fallbackTargetCategory: z.enum(safetyFallbackTargetCategoryValues),
        calibratedLayerMayProceed: z.literal(false),
        humanReviewRequired: z.boolean(),
        rationaleCategory: z.enum(safetyFallbackRationaleCategoryValues)
      })
    )
    .length(safetyFallbackCategoryValues.length),
  rulePrecedence: z.object({
    precedence: z
      .array(
        z.object({
          precedenceRank: z.number().int().min(1).max(9),
          ruleCategory: z.enum(safetyRulePrecedenceCategoryValues),
          futureCalibratedAdvisoryMayOverride: z.literal(false)
        })
      )
      .length(safetyRulePrecedenceCategoryValues.length),
    calibratedAdvisorySignalsLowerAuthorityThanDeterministicSafetyOverrides:
      z.literal(true),
    calibratedAdvisorySignalsCannotOverrideHigherPriorityRules: z.literal(true)
  }),
  phase17EvidenceDependency: z.object({
    realAgentEvidenceRequired: z.literal(true),
    controlledTraceCollectionRequired: z.literal(true),
    reviewedTraceLabelsRequired: z.literal(true),
    baselineComparisonOnRealControlledTracesRequired: z.literal(true),
    calibrationDatasetConstructionAfterTraceReviewRequired: z.literal(true),
    productionRoutingCannotBeEnabledWithoutPhase17Evidence: z.literal(true)
  }),
  blockers: z.object({
    blockerCategories: z
      .array(z.enum(safetyOverrideFallbackBlockerCategoryValues))
      .length(safetyOverrideFallbackBlockerCategoryValues.length)
  }),
  safety: safetyOverrideFallbackRulesSafetySchema,
  privacy: safetyOverrideFallbackRulesPrivacySchema,
  claimBoundaries: safetyOverrideFallbackRulesClaimBoundariesSchema,
  boundaryStatements: z
    .array(z.enum(safetyOverrideFallbackBoundaryStatementValues))
    .length(safetyOverrideFallbackBoundaryStatementValues.length),
  notes: z.array(categoryIdSchema).min(1)
});

export type SafetyOverrideFallbackRules = z.infer<
  typeof safetyOverrideFallbackRulesSchema
>;

const overrideRationaleByCategory = (
  category: (typeof safetyOverrideCategoryValues)[number]
): (typeof safetyOverrideRationaleCategoryValues)[number] => {
  if (
    category === "secret_or_credential_access" ||
    category === "private_data_exposure_risk"
  ) {
    return "protects_secrets_and_private_data";
  }
  if (category === "workspace_escape") {
    return "preserves_workspace_boundary";
  }
  if (
    category === "production_deploy" ||
    category === "protected_branch_operation" ||
    category === "publish_or_release_action"
  ) {
    return "preserves_release_and_branch_controls";
  }
  if (
    category === "validation_failure" ||
    category === "validation_bypass_or_no_verify"
  ) {
    return "preserves_validation_and_evidence_requirements";
  }
  if (
    category === "policy_block" ||
    category === "explicit_user_or_policy_forbidden_action"
  ) {
    return "preserves_policy_or_user_prohibition";
  }
  return "prevents_dangerous_or_destructive_action";
};

const fallbackTargetByCategory = (
  category: (typeof safetyFallbackCategoryValues)[number]
): (typeof safetyFallbackTargetCategoryValues)[number] => {
  if (
    category === "missing_eligibility_record" ||
    category === "failed_eligibility" ||
    category === "missing_default_off_config" ||
    category === "default_off_config_not_satisfied" ||
    category === "production_routing_disabled" ||
    category === "phase17_evidence_missing"
  ) {
    return "deny_production_authority";
  }
  if (
    category === "missing_human_approval" ||
    category === "privacy_boundary_unclear" ||
    category === "claim_boundary_unclear"
  ) {
    return "escalate_for_human_review";
  }
  if (
    category === "missing_required_validation" ||
    category === "failed_required_validation" ||
    category === "policy_conflict"
  ) {
    return "block_by_policy";
  }
  if (
    category === "incomplete_evidence" ||
    category === "stale_context" ||
    category === "distribution_shift_detected_or_unassessed" ||
    category === "high_uncertainty_outside_approved_scope"
  ) {
    return "defer_for_evidence";
  }
  return "deterministic_decision_engine";
};

const fallbackRationaleByCategory = (
  category: (typeof safetyFallbackCategoryValues)[number]
): (typeof safetyFallbackRationaleCategoryValues)[number] => {
  if (
    category === "missing_eligibility_record" ||
    category === "missing_default_off_config"
  ) {
    return "missing_gate_artifact";
  }
  if (category === "failed_eligibility") {
    return "gate_not_satisfied";
  }
  if (category === "default_off_config_not_satisfied") {
    return "default_off_not_satisfied";
  }
  if (
    category === "production_routing_disabled" ||
    category === "phase17_evidence_missing"
  ) {
    return "production_authority_denied";
  }
  if (category === "unsupported_action_category") {
    return "unsupported_or_unapproved_scope";
  }
  if (
    category === "missing_score" ||
    category === "stale_score" ||
    category === "missing_threshold" ||
    category === "stale_threshold" ||
    category === "missing_calibration_dataset" ||
    category === "stale_calibration_dataset"
  ) {
    return "missing_or_stale_calibrated_signal_input";
  }
  if (
    category === "distribution_shift_detected_or_unassessed" ||
    category === "stale_context" ||
    category === "high_uncertainty_outside_approved_scope"
  ) {
    return "distribution_or_context_uncertain";
  }
  if (
    category === "policy_conflict" ||
    category === "missing_required_validation" ||
    category === "failed_required_validation" ||
    category === "incomplete_evidence"
  ) {
    return "policy_or_validation_conflict";
  }
  return "human_or_privacy_review_required";
};

export const buildSafetyOverrideFallbackRules = (input?: {
  eligibilityRecordId?: string;
  eligibilitySchemaVersion?: string;
  eligibilitySource?: string;
  productionRoutingEligibleNow?: false;
  configRecordId?: string;
  configSchemaVersion?: string;
  configSource?: string;
  productionRoutingEnabledNow?: false;
  advisoryRoutingEnabledNow?: false;
  calibratedRoutingEnabledNow?: false;
  defaultOffRequired?: true;
}): SafetyOverrideFallbackRules =>
  validateSafetyOverrideFallbackRules({
    schemaVersion: agentSafetyOverrideFallbackRulesSchemaVersion,
    rulesRecordId: "phase-16-safety-override-fallback-rules-001",
    source: "synthetic_safety_override_fallback_rules_design",
    phase: {
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1", "16.2"],
      currentBatch: "16.3",
      futureBatches: ["16.4", "16.5"],
      phaseStatus:
        "safety_override_fallback_rules_design_without_runtime_routing_implementation"
    },
    ruleStatus: {
      designOnly: true,
      productionRoutingEnabledNow: false,
      advisoryRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      productionRoutingEligibleNow: false,
      defaultOffRequired: true,
      deterministicOverridesAuthoritative: true,
      fallbackToDeterministicRequired: true,
      humanReviewRequiredForSensitiveCases: true,
      phase17EvidenceRequired: true
    },
    linkedProductionEligibility: {
      eligibilityRecordId:
        input?.eligibilityRecordId ?? "phase-16-production-eligibility-001",
      schemaVersion:
        input?.eligibilitySchemaVersion ??
        agentProductionRoutingEligibilitySchemaVersion,
      source:
        input?.eligibilitySource ?? "synthetic_production_eligibility_design",
      productionRoutingEligibleNow:
        input?.productionRoutingEligibleNow ?? false,
      rawEligibilityRecordIncluded: false
    },
    linkedDefaultOffRoutingConfig: {
      configRecordId:
        input?.configRecordId ?? "phase-16-default-off-routing-config-001",
      schemaVersion:
        input?.configSchemaVersion ?? agentDefaultOffRoutingConfigSchemaVersion,
      source:
        input?.configSource ?? "synthetic_default_off_routing_config_design",
      productionRoutingEnabledNow: input?.productionRoutingEnabledNow ?? false,
      advisoryRoutingEnabledNow: input?.advisoryRoutingEnabledNow ?? false,
      calibratedRoutingEnabledNow: input?.calibratedRoutingEnabledNow ?? false,
      defaultOffRequired: input?.defaultOffRequired ?? true,
      rawDefaultOffConfigIncluded: false
    },
    deterministicSafetyOverrides: safetyOverrideCategoryValues.map(
      (category) => ({
        overrideCategory: category,
        currentAuthority: "deterministic_codingactiongate",
        calibratedLayerMayOverride: false,
        advisoryLayerMayOverride: false,
        requiresHumanApprovalToProceedIfProceedingIsEverAllowed:
          category === "validation_failure" ||
          category === "private_data_exposure_risk",
        fallbackDecisionCategory:
          category === "validation_failure"
            ? "defer_for_evidence"
            : category === "private_data_exposure_risk"
              ? "escalate_for_human_review"
              : "block_by_policy",
        rationaleCategory: overrideRationaleByCategory(category)
      })
    ),
    fallbackRules: safetyFallbackCategoryValues.map((category) => ({
      fallbackCategory: category,
      triggerCategory: category,
      fallbackTargetCategory: fallbackTargetByCategory(category),
      calibratedLayerMayProceed: false,
      humanReviewRequired:
        category === "missing_human_approval" ||
        category === "privacy_boundary_unclear" ||
        category === "claim_boundary_unclear",
      rationaleCategory: fallbackRationaleByCategory(category)
    })),
    rulePrecedence: {
      precedence: safetyRulePrecedenceCategoryValues.map((category, index) => ({
        precedenceRank: index + 1,
        ruleCategory: category,
        futureCalibratedAdvisoryMayOverride: false
      })),
      calibratedAdvisorySignalsLowerAuthorityThanDeterministicSafetyOverrides: true,
      calibratedAdvisorySignalsCannotOverrideHigherPriorityRules: true
    },
    phase17EvidenceDependency: {
      realAgentEvidenceRequired: true,
      controlledTraceCollectionRequired: true,
      reviewedTraceLabelsRequired: true,
      baselineComparisonOnRealControlledTracesRequired: true,
      calibrationDatasetConstructionAfterTraceReviewRequired: true,
      productionRoutingCannotBeEnabledWithoutPhase17Evidence: true
    },
    blockers: {
      blockerCategories: [...safetyOverrideFallbackBlockerCategoryValues]
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      gateDesignOnly: true,
      safetyOverrideDesignOnly: true,
      fallbackDesignOnly: true,
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
      rawCalibrationDataIncluded: false,
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
      rawRoutingDataIncluded: false,
      rawConfigDataIncluded: false,
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
      safetyOverrideDesignOnly: true,
      fallbackDesignOnly: true,
      productionRoutingEnabled: false,
      advisoryRoutingEnabled: false,
      calibratedRoutingEnabled: false,
      productionRoutingEligible: false,
      runtimeConfigFlagAdded: false,
      policyFlagAdded: false,
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
    boundaryStatements: [...safetyOverrideFallbackBoundaryStatementValues],
    notes: [
      "safety_override_fallback_design_only",
      "routing_not_enabled",
      "deterministic_authority_preserved",
      "phase_17_evidence_required"
    ]
  });

export const validateSafetyOverrideFallbackRules = (
  record: unknown
): SafetyOverrideFallbackRules => {
  const parsed = safetyOverrideFallbackRulesSchema.parse(record);
  validateSafetyOverrideFallbackRulesBoundaries(parsed);
  return parsed;
};

export const validateSafetyOverrideFallbackRulesRecords = (
  records: unknown[]
): SafetyOverrideFallbackRules[] =>
  records
    .map(validateSafetyOverrideFallbackRules)
    .sort((left, right) =>
      left.rulesRecordId.localeCompare(right.rulesRecordId)
    );

export const summarizeSafetyOverrideFallbackRules = (
  record: SafetyOverrideFallbackRules
): {
  schemaVersion: string;
  rulesRecordId: string;
  linkedEligibilityRecordId: string;
  linkedProductionRoutingEligibleNow: false;
  linkedDefaultOffConfigRecordId: string;
  linkedProductionRoutingEnabledNow: false;
  linkedAdvisoryRoutingEnabledNow: false;
  linkedCalibratedRoutingEnabledNow: false;
  defaultOffRequired: true;
  deterministicSafetyOverrideCount: number;
  deterministicSafetyOverrides: string[];
  fallbackRuleCount: number;
  fallbackRules: string[];
  rulePrecedence: string[];
  phase17EvidenceRequired: true;
  productionRoutingCannotBeEnabledWithoutPhase17Evidence: true;
  conclusion: "design_only_not_enabled_deterministic_authority_preserved";
} => ({
  schemaVersion: record.schemaVersion,
  rulesRecordId: record.rulesRecordId,
  linkedEligibilityRecordId:
    record.linkedProductionEligibility.eligibilityRecordId,
  linkedProductionRoutingEligibleNow:
    record.linkedProductionEligibility.productionRoutingEligibleNow,
  linkedDefaultOffConfigRecordId:
    record.linkedDefaultOffRoutingConfig.configRecordId,
  linkedProductionRoutingEnabledNow:
    record.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow,
  linkedAdvisoryRoutingEnabledNow:
    record.linkedDefaultOffRoutingConfig.advisoryRoutingEnabledNow,
  linkedCalibratedRoutingEnabledNow:
    record.linkedDefaultOffRoutingConfig.calibratedRoutingEnabledNow,
  defaultOffRequired: record.linkedDefaultOffRoutingConfig.defaultOffRequired,
  deterministicSafetyOverrideCount: record.deterministicSafetyOverrides.length,
  deterministicSafetyOverrides: record.deterministicSafetyOverrides.map(
    (override) => override.overrideCategory
  ),
  fallbackRuleCount: record.fallbackRules.length,
  fallbackRules: record.fallbackRules.map((rule) => rule.fallbackCategory),
  rulePrecedence: record.rulePrecedence.precedence.map(
    (rule) => rule.ruleCategory
  ),
  phase17EvidenceRequired:
    record.phase17EvidenceDependency.realAgentEvidenceRequired,
  productionRoutingCannotBeEnabledWithoutPhase17Evidence:
    record.phase17EvidenceDependency
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence,
  conclusion: "design_only_not_enabled_deterministic_authority_preserved"
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

export const validateSafetyOverrideFallbackRulesBoundaries = (
  record: SafetyOverrideFallbackRules
): void => {
  safetyOverrideFallbackRulesSafetySchema.parse(record.safety);
  safetyOverrideFallbackRulesPrivacySchema.parse(record.privacy);
  safetyOverrideFallbackRulesClaimBoundariesSchema.parse(
    record.claimBoundaries
  );

  assertAllCategoriesPresent(
    record.deterministicSafetyOverrides.map(
      (override) => override.overrideCategory
    ),
    safetyOverrideCategoryValues,
    "deterministicSafetyOverrides"
  );
  assertAllCategoriesPresent(
    record.fallbackRules.map((rule) => rule.fallbackCategory),
    safetyFallbackCategoryValues,
    "fallbackRules"
  );
  assertAllCategoriesPresent(
    record.rulePrecedence.precedence.map((rule) => rule.ruleCategory),
    safetyRulePrecedenceCategoryValues,
    "rulePrecedence"
  );

  const precedence = new Map(
    record.rulePrecedence.precedence.map((rule) => [
      rule.ruleCategory,
      rule.precedenceRank
    ])
  );
  const calibratedAdvisoryRank = precedence.get(
    "future_calibrated_advisory_signal_if_ever_approved"
  );
  const deterministicSafetyRank = precedence.get(
    "deterministic_safety_override"
  );
  const fallbackRank = precedence.get("fallback_conditions");

  if (
    record.source !== "synthetic_safety_override_fallback_rules_design" ||
    !record.ruleStatus.designOnly ||
    record.ruleStatus.productionRoutingEnabledNow ||
    record.ruleStatus.advisoryRoutingEnabledNow ||
    record.ruleStatus.calibratedRoutingEnabledNow ||
    record.ruleStatus.productionRoutingEligibleNow ||
    !record.ruleStatus.defaultOffRequired ||
    !record.ruleStatus.deterministicOverridesAuthoritative ||
    !record.ruleStatus.fallbackToDeterministicRequired ||
    !record.ruleStatus.phase17EvidenceRequired ||
    record.linkedProductionEligibility.productionRoutingEligibleNow ||
    record.linkedProductionEligibility.rawEligibilityRecordIncluded ||
    record.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow ||
    record.linkedDefaultOffRoutingConfig.advisoryRoutingEnabledNow ||
    record.linkedDefaultOffRoutingConfig.calibratedRoutingEnabledNow ||
    !record.linkedDefaultOffRoutingConfig.defaultOffRequired ||
    record.linkedDefaultOffRoutingConfig.rawDefaultOffConfigIncluded ||
    record.deterministicSafetyOverrides.length === 0 ||
    record.deterministicSafetyOverrides.some(
      (override) =>
        override.currentAuthority !== "deterministic_codingactiongate" ||
        override.calibratedLayerMayOverride ||
        override.advisoryLayerMayOverride
    ) ||
    record.fallbackRules.length === 0 ||
    record.fallbackRules.some((rule) => rule.calibratedLayerMayProceed) ||
    calibratedAdvisoryRank === undefined ||
    deterministicSafetyRank === undefined ||
    fallbackRank === undefined ||
    calibratedAdvisoryRank <= deterministicSafetyRank ||
    calibratedAdvisoryRank <= fallbackRank ||
    !record.rulePrecedence
      .calibratedAdvisorySignalsLowerAuthorityThanDeterministicSafetyOverrides ||
    !record.rulePrecedence
      .calibratedAdvisorySignalsCannotOverrideHigherPriorityRules ||
    !record.phase17EvidenceDependency.realAgentEvidenceRequired ||
    !record.phase17EvidenceDependency
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence ||
    record.blockers.blockerCategories.length === 0 ||
    record.safety.changesRuntimeBehavior ||
    record.safety.addsRuntimeConfigFlag ||
    record.safety.implementsAdvisoryRouting ||
    record.safety.implementsCalibratedRouting ||
    record.safety.implementsProductionRouting ||
    record.safety.computesScores ||
    record.safety.computesThresholds ||
    record.claimBoundaries.productionRoutingEnabled ||
    record.claimBoundaries.advisoryRoutingEnabled ||
    record.claimBoundaries.calibratedRoutingEnabled ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.runtimeConfigFlagAdded ||
    record.claimBoundaries.policyFlagAdded ||
    !record.boundaryStatements.includes("no_runtime_behavior_changed") ||
    !record.boundaryStatements.includes("no_cli_api_ui_surface_added")
  ) {
    throw new Error(
      "Safety override and fallback rules boundary violated: rules must remain design-only, default-off, deterministic-authority preserving, and non-runtime-integrated."
    );
  }
};

export const buildSafetyOverrideFallbackRulesFromLinkedRecords = (
  eligibility: ProductionRoutingEligibility,
  config: DefaultOffRoutingConfig
): SafetyOverrideFallbackRules =>
  buildSafetyOverrideFallbackRules({
    eligibilityRecordId: eligibility.eligibilityRecordId,
    eligibilitySchemaVersion: eligibility.schemaVersion,
    eligibilitySource: eligibility.source,
    productionRoutingEligibleNow:
      eligibility.eligibilityStatus.productionRoutingEligibleNow,
    configRecordId: config.configRecordId,
    configSchemaVersion: config.schemaVersion,
    configSource: config.source,
    productionRoutingEnabledNow:
      config.configStatus.productionRoutingEnabledNow,
    advisoryRoutingEnabledNow: config.configStatus.advisoryRoutingEnabledNow,
    calibratedRoutingEnabledNow:
      config.configStatus.calibratedRoutingEnabledNow,
    defaultOffRequired: config.configStatus.defaultOffRequired
  });

export const safetyOverrideFallbackRulesContainsForbiddenRawString = (
  record: SafetyOverrideFallbackRules
): boolean =>
  JSON.stringify(record).match(
    /diff --git|\/Users\/|\/private\/tmp\/|C:\\|@[A-Za-z0-9.-]+|PRIVATE KEY|sk-[A-Za-z0-9_-]{24,}|raw_prompt|raw_command|raw_diff|raw_source_code|raw_agent_output|raw_trace|raw_routing_output/i
  ) !== null;
