import { z } from "zod";
import { agentDefaultOffRoutingConfigSchemaVersion } from "./defaultOffRoutingConfigSchema.js";
import { agentProductionRoutingEligibilitySchemaVersion } from "./productionEligibilitySchema.js";
import { agentSafetyOverrideFallbackRulesSchemaVersion } from "./safetyOverrideFallbackRulesSchema.js";
import type { DefaultOffRoutingConfig } from "./defaultOffRoutingConfigSchema.js";
import type { ProductionRoutingEligibility } from "./productionEligibilitySchema.js";
import type { SafetyOverrideFallbackRules } from "./safetyOverrideFallbackRulesSchema.js";

export const agentProductionRoutingReviewChecklistSchemaVersion =
  "agent-production-routing-review-checklist.v1" as const;

export const productionRoutingReviewChecklistSourceValues = [
  "synthetic_production_routing_review_checklist_design",
  "future_production_routing_review_checklist",
  "future_calibrated_advisory_review_gate"
] as const;

export const productionRoutingReviewCategoryValues = [
  "product_owner_review",
  "security_review",
  "privacy_review",
  "claim_boundary_review",
  "routing_behavior_review",
  "rollback_plan_review",
  "beta_scope_approval",
  "monitoring_audit_readiness_review",
  "default_off_confirmation",
  "deterministic_safety_override_confirmation",
  "fallback_confirmation",
  "phase17_real_agent_evidence_review",
  "calibration_dataset_review",
  "offline_evaluation_review",
  "distribution_shift_review",
  "human_approval_record_review",
  "legal_or_policy_review_if_required",
  "release_readiness_review"
] as const;

export const productionRoutingReviewEvidenceCategoryValues = [
  "product_owner_review_record",
  "security_review_record",
  "privacy_review_record",
  "claim_boundary_review_record",
  "routing_behavior_review_record",
  "rollback_plan_review_record",
  "beta_scope_approval_record",
  "monitoring_audit_readiness_record",
  "default_off_confirmation_record",
  "deterministic_safety_override_confirmation_record",
  "fallback_confirmation_record",
  "phase17_real_agent_evidence_record",
  "calibration_dataset_review_record",
  "offline_evaluation_review_record",
  "distribution_shift_review_record",
  "human_approval_record",
  "legal_or_policy_review_record_if_required",
  "release_readiness_review_record"
] as const;

export const productionRoutingReviewRationaleCategoryValues = [
  "product_accountability_required",
  "security_risk_review_required",
  "privacy_boundary_review_required",
  "claim_boundary_review_required",
  "routing_behavior_review_required",
  "rollback_plan_required",
  "scope_approval_required",
  "monitoring_audit_readiness_required",
  "default_off_confirmation_required",
  "deterministic_safety_confirmation_required",
  "fallback_confirmation_required",
  "phase17_evidence_required",
  "calibration_review_required",
  "offline_evaluation_required",
  "distribution_shift_review_required",
  "human_approval_record_required",
  "legal_or_policy_review_required_if_applicable",
  "release_readiness_required"
] as const;

export const productionRoutingApprovalRequirementCategoryValues = [
  "explicit_human_approval_record_required",
  "approval_scope_must_be_narrow",
  "approval_must_reference_eligibility_record",
  "approval_must_reference_default_off_config",
  "approval_must_reference_safety_fallback_rules",
  "approval_must_reference_real_agent_evidence",
  "approval_must_reference_calibration_dataset_if_used",
  "approval_must_reference_thresholds_if_used",
  "approval_must_reference_rollback_plan",
  "approval_must_define_expiry_or_revalidation_condition",
  "approval_must_not_override_deterministic_safety",
  "approval_must_preserve_default_off_outside_approved_scope"
] as const;

export const productionRoutingReviewBlockerCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_reviewed_real_trace_labels",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_real_thresholds",
  "no_offline_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_record",
  "no_product_owner_review",
  "no_security_review",
  "no_privacy_review",
  "no_claim_boundary_review",
  "no_routing_behavior_review",
  "no_rollback_plan_review",
  "no_beta_scope_approval",
  "no_monitoring_audit_readiness_review",
  "no_approved_runtime_integration_scope",
  "production_routing_default_off",
  "review_checklist_design_only"
] as const;

export const productionRoutingReviewBoundaryStatementValues = [
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
  "deterministic_stepharbor_decisions_remain_authoritative",
  "deterministic_safety_overrides_cannot_be_overridden_by_calibrated_advisory_signals",
  "phase_17_real_agent_evidence_required"
] as const;

const safeChecklistRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "checklistRecordId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const productionRoutingReviewChecklistSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
  checklistDesignOnly: z.literal(true),
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
  approvesRelease: z.literal(false)
});

export const productionRoutingReviewChecklistPrivacySchema = z.object({
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

export const productionRoutingReviewChecklistClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  checklistDesignOnly: z.literal(true),
  productionRoutingEnabled: z.literal(false),
  advisoryRoutingEnabled: z.literal(false),
  calibratedRoutingEnabled: z.literal(false),
  productionRoutingEligible: z.literal(false),
  approvalGranted: z.literal(false),
  releaseApproved: z.literal(false),
  runtimeIntegrationApproved: z.literal(false),
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

export const productionRoutingReviewChecklistNonApprovalStatementSchema =
  z.object({
    thisChecklistGrantsApproval: z.literal(false),
    thisChecklistEnablesProductionRouting: z.literal(false),
    thisChecklistEnablesAdvisoryRouting: z.literal(false),
    thisChecklistEnablesCalibratedRouting: z.literal(false),
    approvalRecordCreatedNow: z.literal(false),
    releaseApprovedNow: z.literal(false),
    runtimeIntegrationApprovedNow: z.literal(false),
    productionUseApprovedNow: z.literal(false)
  });

export const productionRoutingReviewChecklistSchema = z.object({
  schemaVersion: z.literal(agentProductionRoutingReviewChecklistSchemaVersion),
  checklistRecordId: safeChecklistRecordIdSchema,
  source: z.enum(productionRoutingReviewChecklistSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-16"),
    phaseName: z.literal("Production-Authoritative Calibrated Routing Gate"),
    completedPreviousPhase: z.literal(
      "phase-15-complete-advisory-design-readiness-groundwork-only"
    ),
    completedBatches: z.array(z.enum(["16.1", "16.2", "16.3"])).length(3),
    currentBatch: z.literal("16.4"),
    futureBatches: z.array(z.literal("16.5")).length(1),
    phaseStatus: z.literal(
      "production_routing_review_checklist_design_without_approval_or_runtime_routing_implementation"
    )
  }),
  checklistStatus: z.object({
    designOnly: z.literal(true),
    checklistOnly: z.literal(true),
    approvalGrantedNow: z.literal(false),
    productionRoutingApprovedNow: z.literal(false),
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    productionRoutingEligibleNow: z.literal(false),
    defaultOffRequired: z.literal(true),
    deterministicOverridesAuthoritative: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    phase17EvidenceRequired: z.literal(true),
    humanApprovalRequiredBeforeEnablement: z.literal(true)
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
  linkedSafetyOverrideFallbackRules: z.object({
    rulesRecordId: z.literal("phase-16-safety-override-fallback-rules-001"),
    schemaVersion: z.literal(agentSafetyOverrideFallbackRulesSchemaVersion),
    source: z.literal("synthetic_safety_override_fallback_rules_design"),
    deterministicOverridesAuthoritative: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    rawRulesRecordIncluded: z.literal(false)
  }),
  reviewChecklist: z
    .array(
      z.object({
        reviewCategory: z.enum(productionRoutingReviewCategoryValues),
        requiredBeforeEnablement: z.literal(true),
        completedNow: z.literal(false),
        approvalGrantedNow: z.literal(false),
        reviewerIdentityIncluded: z.literal(false),
        evidenceCategoryRequired: z.enum(
          productionRoutingReviewEvidenceCategoryValues
        ),
        failureBlocksEnablement: z.literal(true),
        rationaleCategory: z.enum(
          productionRoutingReviewRationaleCategoryValues
        )
      })
    )
    .length(productionRoutingReviewCategoryValues.length),
  approvalRequirements: z.object({
    requirements: z
      .array(
        z.object({
          requirementCategory: z.enum(
            productionRoutingApprovalRequirementCategoryValues
          ),
          requiredBeforeEnablement: z.literal(true),
          metNow: z.literal(false),
          approvalGrantedNow: z.literal(false)
        })
      )
      .length(productionRoutingApprovalRequirementCategoryValues.length)
  }),
  enablementBlockers: z.object({
    blockerCategories: z
      .array(z.enum(productionRoutingReviewBlockerCategoryValues))
      .length(productionRoutingReviewBlockerCategoryValues.length)
  }),
  nonApprovalStatement:
    productionRoutingReviewChecklistNonApprovalStatementSchema,
  phase17EvidenceDependency: z.object({
    realAgentEvidenceRequired: z.literal(true),
    controlledTraceCollectionRequired: z.literal(true),
    reviewedTraceLabelsRequired: z.literal(true),
    baselineComparisonOnRealControlledTracesRequired: z.literal(true),
    calibrationDatasetConstructionAfterTraceReviewRequired: z.literal(true),
    productionRoutingCannotBeEnabledWithoutPhase17Evidence: z.literal(true)
  }),
  safety: productionRoutingReviewChecklistSafetySchema,
  privacy: productionRoutingReviewChecklistPrivacySchema,
  claimBoundaries: productionRoutingReviewChecklistClaimBoundariesSchema,
  boundaryStatements: z
    .array(z.enum(productionRoutingReviewBoundaryStatementValues))
    .length(productionRoutingReviewBoundaryStatementValues.length),
  notes: z.array(categoryIdSchema).min(1)
});

export type ProductionRoutingReviewChecklist = z.infer<
  typeof productionRoutingReviewChecklistSchema
>;

const evidenceByReviewCategory = (
  category: (typeof productionRoutingReviewCategoryValues)[number]
): (typeof productionRoutingReviewEvidenceCategoryValues)[number] => {
  const index = productionRoutingReviewCategoryValues.indexOf(category);
  return productionRoutingReviewEvidenceCategoryValues[index]!;
};

const rationaleByReviewCategory = (
  category: (typeof productionRoutingReviewCategoryValues)[number]
): (typeof productionRoutingReviewRationaleCategoryValues)[number] => {
  const index = productionRoutingReviewCategoryValues.indexOf(category);
  return productionRoutingReviewRationaleCategoryValues[index]!;
};

export const buildProductionRoutingReviewChecklist = (input?: {
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
  rulesRecordId?: string;
  rulesSchemaVersion?: string;
  rulesSource?: string;
  deterministicOverridesAuthoritative?: true;
  fallbackToDeterministicRequired?: true;
}): ProductionRoutingReviewChecklist =>
  validateProductionRoutingReviewChecklist({
    schemaVersion: agentProductionRoutingReviewChecklistSchemaVersion,
    checklistRecordId: "phase-16-production-routing-review-checklist-001",
    source: "synthetic_production_routing_review_checklist_design",
    phase: {
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1", "16.2", "16.3"],
      currentBatch: "16.4",
      futureBatches: ["16.5"],
      phaseStatus:
        "production_routing_review_checklist_design_without_approval_or_runtime_routing_implementation"
    },
    checklistStatus: {
      designOnly: true,
      checklistOnly: true,
      approvalGrantedNow: false,
      productionRoutingApprovedNow: false,
      productionRoutingEnabledNow: false,
      advisoryRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      productionRoutingEligibleNow: false,
      defaultOffRequired: true,
      deterministicOverridesAuthoritative: true,
      fallbackToDeterministicRequired: true,
      phase17EvidenceRequired: true,
      humanApprovalRequiredBeforeEnablement: true
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
    linkedSafetyOverrideFallbackRules: {
      rulesRecordId:
        input?.rulesRecordId ?? "phase-16-safety-override-fallback-rules-001",
      schemaVersion:
        input?.rulesSchemaVersion ??
        agentSafetyOverrideFallbackRulesSchemaVersion,
      source:
        input?.rulesSource ?? "synthetic_safety_override_fallback_rules_design",
      deterministicOverridesAuthoritative:
        input?.deterministicOverridesAuthoritative ?? true,
      fallbackToDeterministicRequired:
        input?.fallbackToDeterministicRequired ?? true,
      rawRulesRecordIncluded: false
    },
    reviewChecklist: productionRoutingReviewCategoryValues.map((category) => ({
      reviewCategory: category,
      requiredBeforeEnablement: true,
      completedNow: false,
      approvalGrantedNow: false,
      reviewerIdentityIncluded: false,
      evidenceCategoryRequired: evidenceByReviewCategory(category),
      failureBlocksEnablement: true,
      rationaleCategory: rationaleByReviewCategory(category)
    })),
    approvalRequirements: {
      requirements: productionRoutingApprovalRequirementCategoryValues.map(
        (category) => ({
          requirementCategory: category,
          requiredBeforeEnablement: true,
          metNow: false,
          approvalGrantedNow: false
        })
      )
    },
    enablementBlockers: {
      blockerCategories: [...productionRoutingReviewBlockerCategoryValues]
    },
    nonApprovalStatement: {
      thisChecklistGrantsApproval: false,
      thisChecklistEnablesProductionRouting: false,
      thisChecklistEnablesAdvisoryRouting: false,
      thisChecklistEnablesCalibratedRouting: false,
      approvalRecordCreatedNow: false,
      releaseApprovedNow: false,
      runtimeIntegrationApprovedNow: false,
      productionUseApprovedNow: false
    },
    phase17EvidenceDependency: {
      realAgentEvidenceRequired: true,
      controlledTraceCollectionRequired: true,
      reviewedTraceLabelsRequired: true,
      baselineComparisonOnRealControlledTracesRequired: true,
      calibrationDatasetConstructionAfterTraceReviewRequired: true,
      productionRoutingCannotBeEnabledWithoutPhase17Evidence: true
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      gateDesignOnly: true,
      checklistDesignOnly: true,
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
      approvesRelease: false
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
      checklistDesignOnly: true,
      productionRoutingEnabled: false,
      advisoryRoutingEnabled: false,
      calibratedRoutingEnabled: false,
      productionRoutingEligible: false,
      approvalGranted: false,
      releaseApproved: false,
      runtimeIntegrationApproved: false,
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
    boundaryStatements: [...productionRoutingReviewBoundaryStatementValues],
    notes: [
      "review_checklist_design_only",
      "no_approval_granted",
      "routing_not_enabled",
      "phase_17_evidence_required"
    ]
  });

export const validateProductionRoutingReviewChecklist = (
  record: unknown
): ProductionRoutingReviewChecklist => {
  const parsed = productionRoutingReviewChecklistSchema.parse(record);
  validateProductionRoutingReviewChecklistBoundaries(parsed);
  return parsed;
};

export const validateProductionRoutingReviewChecklists = (
  records: unknown[]
): ProductionRoutingReviewChecklist[] =>
  records
    .map(validateProductionRoutingReviewChecklist)
    .sort((left, right) =>
      left.checklistRecordId.localeCompare(right.checklistRecordId)
    );

export const summarizeProductionRoutingReviewChecklist = (
  record: ProductionRoutingReviewChecklist
): {
  schemaVersion: string;
  checklistRecordId: string;
  linkedEligibilityRecordId: string;
  linkedProductionRoutingEligibleNow: false;
  linkedDefaultOffConfigRecordId: string;
  linkedProductionRoutingEnabledNow: false;
  linkedAdvisoryRoutingEnabledNow: false;
  linkedCalibratedRoutingEnabledNow: false;
  linkedSafetyFallbackRulesRecordId: string;
  linkedDeterministicOverridesAuthoritative: true;
  linkedFallbackToDeterministicRequired: true;
  reviewChecklistItemCount: number;
  reviewChecklistItems: string[];
  approvalRequirementCount: number;
  approvalRequirements: string[];
  blockerCount: number;
  blockers: string[];
  nonApprovalSummary: "no_approval_no_release_no_runtime_integration";
  phase17EvidenceRequired: true;
  productionRoutingCannotBeEnabledWithoutPhase17Evidence: true;
  conclusion: "checklist_only_no_approval_not_enabled";
} => ({
  schemaVersion: record.schemaVersion,
  checklistRecordId: record.checklistRecordId,
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
  linkedSafetyFallbackRulesRecordId:
    record.linkedSafetyOverrideFallbackRules.rulesRecordId,
  linkedDeterministicOverridesAuthoritative:
    record.linkedSafetyOverrideFallbackRules
      .deterministicOverridesAuthoritative,
  linkedFallbackToDeterministicRequired:
    record.linkedSafetyOverrideFallbackRules.fallbackToDeterministicRequired,
  reviewChecklistItemCount: record.reviewChecklist.length,
  reviewChecklistItems: record.reviewChecklist.map(
    (item) => item.reviewCategory
  ),
  approvalRequirementCount: record.approvalRequirements.requirements.length,
  approvalRequirements: record.approvalRequirements.requirements.map(
    (requirement) => requirement.requirementCategory
  ),
  blockerCount: record.enablementBlockers.blockerCategories.length,
  blockers: [...record.enablementBlockers.blockerCategories],
  nonApprovalSummary: "no_approval_no_release_no_runtime_integration",
  phase17EvidenceRequired:
    record.phase17EvidenceDependency.realAgentEvidenceRequired,
  productionRoutingCannotBeEnabledWithoutPhase17Evidence:
    record.phase17EvidenceDependency
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence,
  conclusion: "checklist_only_no_approval_not_enabled"
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

export const validateProductionRoutingReviewChecklistBoundaries = (
  record: ProductionRoutingReviewChecklist
): void => {
  productionRoutingReviewChecklistSafetySchema.parse(record.safety);
  productionRoutingReviewChecklistPrivacySchema.parse(record.privacy);
  productionRoutingReviewChecklistClaimBoundariesSchema.parse(
    record.claimBoundaries
  );
  productionRoutingReviewChecklistNonApprovalStatementSchema.parse(
    record.nonApprovalStatement
  );

  assertAllCategoriesPresent(
    record.reviewChecklist.map((item) => item.reviewCategory),
    productionRoutingReviewCategoryValues,
    "reviewChecklist"
  );
  assertAllCategoriesPresent(
    record.approvalRequirements.requirements.map(
      (requirement) => requirement.requirementCategory
    ),
    productionRoutingApprovalRequirementCategoryValues,
    "approvalRequirements"
  );

  if (
    record.source !== "synthetic_production_routing_review_checklist_design" ||
    !record.checklistStatus.designOnly ||
    !record.checklistStatus.checklistOnly ||
    record.checklistStatus.approvalGrantedNow ||
    record.checklistStatus.productionRoutingApprovedNow ||
    record.checklistStatus.productionRoutingEnabledNow ||
    record.checklistStatus.advisoryRoutingEnabledNow ||
    record.checklistStatus.calibratedRoutingEnabledNow ||
    record.checklistStatus.productionRoutingEligibleNow ||
    !record.checklistStatus.defaultOffRequired ||
    !record.checklistStatus.deterministicOverridesAuthoritative ||
    !record.checklistStatus.fallbackToDeterministicRequired ||
    !record.checklistStatus.phase17EvidenceRequired ||
    !record.checklistStatus.humanApprovalRequiredBeforeEnablement ||
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
    record.reviewChecklist.length === 0 ||
    record.reviewChecklist.some(
      (item) =>
        !item.requiredBeforeEnablement ||
        item.completedNow ||
        item.approvalGrantedNow ||
        item.reviewerIdentityIncluded ||
        !item.failureBlocksEnablement
    ) ||
    record.approvalRequirements.requirements.length === 0 ||
    record.approvalRequirements.requirements.some(
      (requirement) =>
        !requirement.requiredBeforeEnablement ||
        requirement.metNow ||
        requirement.approvalGrantedNow
    ) ||
    record.enablementBlockers.blockerCategories.length === 0 ||
    !record.phase17EvidenceDependency.realAgentEvidenceRequired ||
    !record.phase17EvidenceDependency
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence ||
    record.safety.changesRuntimeBehavior ||
    record.safety.addsRuntimeConfigFlag ||
    record.safety.implementsAdvisoryRouting ||
    record.safety.implementsCalibratedRouting ||
    record.safety.implementsProductionRouting ||
    record.safety.grantsApproval ||
    record.safety.approvesRelease ||
    record.privacy.rawApprovalDataIncluded ||
    record.privacy.reviewerIdentityIncluded ||
    record.claimBoundaries.productionRoutingEnabled ||
    record.claimBoundaries.advisoryRoutingEnabled ||
    record.claimBoundaries.calibratedRoutingEnabled ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.approvalGranted ||
    record.claimBoundaries.releaseApproved ||
    record.claimBoundaries.runtimeIntegrationApproved ||
    !record.boundaryStatements.includes("no_runtime_behavior_changed") ||
    !record.boundaryStatements.includes("no_cli_api_ui_surface_added") ||
    !record.boundaryStatements.includes("no_approval_granted")
  ) {
    throw new Error(
      "Production routing review checklist boundary violated: checklist must remain design-only, no-approval, default-off, and non-runtime-integrated."
    );
  }
};

export const buildProductionRoutingReviewChecklistFromLinkedRecords = (
  eligibility: ProductionRoutingEligibility,
  config: DefaultOffRoutingConfig,
  rules: SafetyOverrideFallbackRules
): ProductionRoutingReviewChecklist =>
  buildProductionRoutingReviewChecklist({
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
    defaultOffRequired: config.configStatus.defaultOffRequired,
    rulesRecordId: rules.rulesRecordId,
    rulesSchemaVersion: rules.schemaVersion,
    rulesSource: rules.source,
    deterministicOverridesAuthoritative:
      rules.ruleStatus.deterministicOverridesAuthoritative,
    fallbackToDeterministicRequired:
      rules.ruleStatus.fallbackToDeterministicRequired
  });

export const productionRoutingReviewChecklistContainsForbiddenRawString = (
  record: ProductionRoutingReviewChecklist
): boolean =>
  JSON.stringify(record).match(
    /diff --git|\/Users\/|\/private\/tmp\/|C:\\|@[A-Za-z0-9.-]+|PRIVATE KEY|sk-[A-Za-z0-9_-]{24,}|raw_prompt|raw_command|raw_diff|raw_source_code|raw_agent_output|raw_trace|raw_approval|reviewer_identity/i
  ) !== null;
