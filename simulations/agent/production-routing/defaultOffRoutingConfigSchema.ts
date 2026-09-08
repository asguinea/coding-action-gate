import { z } from "zod";
import {
  agentProductionRoutingEligibilitySchemaVersion,
  type ProductionRoutingEligibility
} from "./productionEligibilitySchema.js";

export const agentDefaultOffRoutingConfigSchemaVersion =
  "agent-default-off-routing-config.v1" as const;

export const defaultOffRoutingConfigSourceValues = [
  "synthetic_default_off_routing_config_design",
  "future_default_off_routing_config_review",
  "future_production_routing_config_review"
] as const;

export const candidateFutureScopeCategoryValues = [
  "low_risk_read_only_actions",
  "narrow_non_destructive_file_actions",
  "advisory_only_comparison_mode",
  "controlled_beta_workspace_scope"
] as const;

export const disallowedCurrentScopeCategoryValues = [
  "destructive_file_actions",
  "secret_or_credential_paths",
  "workspace_escape_actions",
  "dangerous_commands",
  "production_deploys",
  "protected_branch_operations",
  "validation_bypass_actions",
  "publish_or_release_actions",
  "raw_private_data_dependent_routing",
  "unreviewed_agent_trace_based_routing"
] as const;

export const defaultOffRequiredFutureEvidenceCategoryValues = [
  "real_controlled_agent_traces",
  "reviewed_trace_labels",
  "adjudicated_labels",
  "eligible_calibration_dataset",
  "approved_split_manifest",
  "real_scores",
  "nonconformity_or_risk_scores",
  "threshold_selection_procedure",
  "offline_evaluation_report",
  "distribution_shift_review",
  "product_security_privacy_review",
  "human_approval_record"
] as const;

export const defaultOffFallbackCategoryValues = [
  "missing_eligibility_record",
  "failed_eligibility",
  "missing_score",
  "stale_score",
  "missing_threshold",
  "stale_threshold",
  "missing_calibration_dataset",
  "stale_calibration_dataset",
  "distribution_shift",
  "policy_conflict",
  "unsupported_action_category",
  "incomplete_evidence",
  "uncertainty_above_approved_scope"
] as const;

export const defaultOffFallbackTargetCategoryValues = [
  "deterministic_codingactiongate",
  "defer",
  "escalate",
  "block",
  "human_review"
] as const;

export const defaultOffApprovalCategoryValues = [
  "product_owner_approval",
  "security_review",
  "privacy_review",
  "claim_boundary_review",
  "routing_behavior_review",
  "rollback_plan_review",
  "beta_scope_approval",
  "monitoring_or_audit_readiness_review"
] as const;

export const defaultOffBlockerCategoryValues = [
  "no_real_controlled_agent_traces",
  "no_reviewed_real_trace_labels",
  "no_real_calibration_dataset",
  "no_real_scores",
  "no_real_thresholds",
  "no_offline_evaluation",
  "no_distribution_shift_review",
  "no_human_approval_record",
  "no_approved_runtime_integration_scope"
] as const;

export const defaultOffBoundaryStatementValues = [
  "no_runtime_behavior_changed",
  "no_production_routing_enabled",
  "no_advisory_calibrated_routing_implementation_added",
  "no_policy_flag_added",
  "no_cli_api_ui_surface_added",
  "no_scores_thresholds_alpha_calibration_conformal_crc_added",
  "no_statistical_guarantee",
  "deterministic_codingactiongate_decisions_remain_authoritative",
  "phase_17_real_agent_evidence_required"
] as const;

const safeConfigRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "configRecordId must not include unsafe or private identifiers"
  );

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const defaultOffRoutingConfigSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  gateDesignOnly: z.literal(true),
  defaultOffDesignOnly: z.literal(true),
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

export const defaultOffRoutingConfigPrivacySchema = z.object({
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

export const defaultOffRoutingConfigClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  defaultOffDesignOnly: z.literal(true),
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

export const defaultOffRoutingConfigSchema = z.object({
  schemaVersion: z.literal(agentDefaultOffRoutingConfigSchemaVersion),
  configRecordId: safeConfigRecordIdSchema,
  source: z.enum(defaultOffRoutingConfigSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-16"),
    phaseName: z.literal("Production-Authoritative Calibrated Routing Gate"),
    completedPreviousPhase: z.literal(
      "phase-15-complete-advisory-design-readiness-groundwork-only"
    ),
    completedBatches: z.array(z.literal("16.1")).length(1),
    currentBatch: z.literal("16.2"),
    futureBatches: z.array(z.enum(["16.3", "16.4", "16.5"])).length(3),
    phaseStatus: z.literal(
      "default_off_routing_configuration_design_without_runtime_configuration_or_routing_implementation"
    )
  }),
  configStatus: z.object({
    productionRoutingEnabledNow: z.literal(false),
    advisoryRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    productionRoutingEligibleNow: z.literal(false),
    defaultOffRequired: z.literal(true),
    explicitFutureScopeRequired: z.literal(true),
    humanApprovalRequired: z.literal(true),
    policyConfigRequired: z.literal(true),
    fallbackToDeterministicRequired: z.literal(true),
    deterministicSafetyOverridesRequired: z.literal(true)
  }),
  linkedProductionEligibility: z.object({
    eligibilityRecordId: z.literal("phase-16-production-eligibility-001"),
    schemaVersion: z.literal(agentProductionRoutingEligibilitySchemaVersion),
    source: z.literal("synthetic_production_eligibility_design"),
    productionRoutingEligibleNow: z.literal(false),
    rawEligibilityRecordIncluded: z.literal(false)
  }),
  candidateFutureScopes: z
    .array(
      z.object({
        scopeCategory: z.enum(candidateFutureScopeCategoryValues),
        currentlyEnabled: z.literal(false),
        requiresFutureEligibilityPass: z.literal(true),
        requiresHumanApproval: z.literal(true),
        requiresPolicyConfig: z.literal(true),
        requiresFallbackToDeterministic: z.literal(true),
        requiresDeterministicSafetyOverrides: z.literal(true)
      })
    )
    .length(candidateFutureScopeCategoryValues.length),
  disallowedCurrentScopes: z.object({
    scopeCategories: z
      .array(z.enum(disallowedCurrentScopeCategoryValues))
      .length(disallowedCurrentScopeCategoryValues.length)
  }),
  requiredFutureEvidence: z.object({
    evidenceCategories: z
      .array(z.enum(defaultOffRequiredFutureEvidenceCategoryValues))
      .length(defaultOffRequiredFutureEvidenceCategoryValues.length)
  }),
  routingAuthorityConstraints: z.object({
    deterministicDecisionsAuthoritativeNow: z.literal(true),
    calibratedAdvisoryRoutingHasProductionAuthorityNow: z.literal(false),
    futureAuthorityMustBeNarrowerThanDeterministicSafetyPolicy: z.literal(true),
    calibratedAdvisoryMayOverrideDeterministicBlock: z.literal(false),
    calibratedAdvisoryMayBypassDeferEvidenceWithoutFutureApproval:
      z.literal(false),
    calibratedAdvisoryMayDowngradeEscalateWhenHumanReviewRequired:
      z.literal(false),
    deterministicSafetyOverridesRemainMandatory: z.literal(true)
  }),
  fallbackConstraints: z.object({
    fallbacks: z
      .array(
        z.object({
          fallbackCategory: z.enum(defaultOffFallbackCategoryValues),
          fallbackRequired: z.literal(true),
          fallbackTargetCategory: z.enum(defaultOffFallbackTargetCategoryValues)
        })
      )
      .length(defaultOffFallbackCategoryValues.length)
  }),
  approvalConstraints: z.object({
    approvals: z
      .array(
        z.object({
          approvalCategory: z.enum(defaultOffApprovalCategoryValues),
          currentStatus: z.literal("future_unmet"),
          approvalGranted: z.literal(false)
        })
      )
      .length(defaultOffApprovalCategoryValues.length)
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
      .array(z.enum(defaultOffBlockerCategoryValues))
      .length(defaultOffBlockerCategoryValues.length)
  }),
  safety: defaultOffRoutingConfigSafetySchema,
  privacy: defaultOffRoutingConfigPrivacySchema,
  claimBoundaries: defaultOffRoutingConfigClaimBoundariesSchema,
  boundaryStatements: z
    .array(z.enum(defaultOffBoundaryStatementValues))
    .length(defaultOffBoundaryStatementValues.length),
  notes: z.array(categoryIdSchema).min(1)
});

export type DefaultOffRoutingConfig = z.infer<
  typeof defaultOffRoutingConfigSchema
>;

export const buildDefaultOffRoutingConfig = (input?: {
  eligibilityRecordId?: string;
  eligibilitySchemaVersion?: string;
  eligibilitySource?: string;
  productionRoutingEligibleNow?: false;
}): DefaultOffRoutingConfig =>
  validateDefaultOffRoutingConfig({
    schemaVersion: agentDefaultOffRoutingConfigSchemaVersion,
    configRecordId: "phase-16-default-off-routing-config-001",
    source: "synthetic_default_off_routing_config_design",
    phase: {
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1"],
      currentBatch: "16.2",
      futureBatches: ["16.3", "16.4", "16.5"],
      phaseStatus:
        "default_off_routing_configuration_design_without_runtime_configuration_or_routing_implementation"
    },
    configStatus: {
      productionRoutingEnabledNow: false,
      advisoryRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      productionRoutingEligibleNow: false,
      defaultOffRequired: true,
      explicitFutureScopeRequired: true,
      humanApprovalRequired: true,
      policyConfigRequired: true,
      fallbackToDeterministicRequired: true,
      deterministicSafetyOverridesRequired: true
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
    candidateFutureScopes: candidateFutureScopeCategoryValues.map(
      (category) => ({
        scopeCategory: category,
        currentlyEnabled: false,
        requiresFutureEligibilityPass: true,
        requiresHumanApproval: true,
        requiresPolicyConfig: true,
        requiresFallbackToDeterministic: true,
        requiresDeterministicSafetyOverrides: true
      })
    ),
    disallowedCurrentScopes: {
      scopeCategories: [...disallowedCurrentScopeCategoryValues]
    },
    requiredFutureEvidence: {
      evidenceCategories: [...defaultOffRequiredFutureEvidenceCategoryValues]
    },
    routingAuthorityConstraints: {
      deterministicDecisionsAuthoritativeNow: true,
      calibratedAdvisoryRoutingHasProductionAuthorityNow: false,
      futureAuthorityMustBeNarrowerThanDeterministicSafetyPolicy: true,
      calibratedAdvisoryMayOverrideDeterministicBlock: false,
      calibratedAdvisoryMayBypassDeferEvidenceWithoutFutureApproval: false,
      calibratedAdvisoryMayDowngradeEscalateWhenHumanReviewRequired: false,
      deterministicSafetyOverridesRemainMandatory: true
    },
    fallbackConstraints: {
      fallbacks: defaultOffFallbackCategoryValues.map((category) => ({
        fallbackCategory: category,
        fallbackRequired: true,
        fallbackTargetCategory:
          category === "uncertainty_above_approved_scope"
            ? "defer"
            : "deterministic_codingactiongate"
      }))
    },
    approvalConstraints: {
      approvals: defaultOffApprovalCategoryValues.map((category) => ({
        approvalCategory: category,
        currentStatus: "future_unmet",
        approvalGranted: false
      }))
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
      blockerCategories: [...defaultOffBlockerCategoryValues]
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      designOnly: true,
      gateDesignOnly: true,
      defaultOffDesignOnly: true,
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
      defaultOffDesignOnly: true,
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
    boundaryStatements: [...defaultOffBoundaryStatementValues],
    notes: [
      "default_off_design_only",
      "routing_not_enabled",
      "production_routing_not_eligible",
      "phase_17_evidence_required"
    ]
  });

export const validateDefaultOffRoutingConfig = (
  record: unknown
): DefaultOffRoutingConfig => {
  const parsed = defaultOffRoutingConfigSchema.parse(record);
  validateDefaultOffRoutingConfigBoundaries(parsed);
  return parsed;
};

export const validateDefaultOffRoutingConfigs = (
  records: unknown[]
): DefaultOffRoutingConfig[] =>
  records
    .map(validateDefaultOffRoutingConfig)
    .sort((left, right) =>
      left.configRecordId.localeCompare(right.configRecordId)
    );

export const summarizeDefaultOffRoutingConfig = (
  record: DefaultOffRoutingConfig
): {
  schemaVersion: string;
  configRecordId: string;
  linkedEligibilityRecordId: string;
  linkedProductionRoutingEligibleNow: false;
  productionRoutingEnabledNow: false;
  advisoryRoutingEnabledNow: false;
  calibratedRoutingEnabledNow: false;
  defaultOffRequired: true;
  candidateFutureScopeCount: number;
  candidateFutureScopes: string[];
  futureEvidenceCount: number;
  futureEvidenceCategories: string[];
  blockerCount: number;
  blockers: string[];
  fallbackConstraintCount: number;
  approvalConstraintCount: number;
  deterministicSafetyOverridesRequired: true;
  phase17EvidenceRequired: true;
  conclusion: "not_enabled_not_eligible";
} => ({
  schemaVersion: record.schemaVersion,
  configRecordId: record.configRecordId,
  linkedEligibilityRecordId:
    record.linkedProductionEligibility.eligibilityRecordId,
  linkedProductionRoutingEligibleNow:
    record.linkedProductionEligibility.productionRoutingEligibleNow,
  productionRoutingEnabledNow: record.configStatus.productionRoutingEnabledNow,
  advisoryRoutingEnabledNow: record.configStatus.advisoryRoutingEnabledNow,
  calibratedRoutingEnabledNow: record.configStatus.calibratedRoutingEnabledNow,
  defaultOffRequired: record.configStatus.defaultOffRequired,
  candidateFutureScopeCount: record.candidateFutureScopes.length,
  candidateFutureScopes: record.candidateFutureScopes.map(
    (scope) => scope.scopeCategory
  ),
  futureEvidenceCount: record.requiredFutureEvidence.evidenceCategories.length,
  futureEvidenceCategories: [
    ...record.requiredFutureEvidence.evidenceCategories
  ],
  blockerCount: record.blockers.blockerCategories.length,
  blockers: [...record.blockers.blockerCategories],
  fallbackConstraintCount: record.fallbackConstraints.fallbacks.length,
  approvalConstraintCount: record.approvalConstraints.approvals.length,
  deterministicSafetyOverridesRequired:
    record.configStatus.deterministicSafetyOverridesRequired,
  phase17EvidenceRequired:
    record.phase17EvidenceDependency.realAgentEvidenceRequired,
  conclusion: "not_enabled_not_eligible"
});

export const validateDefaultOffRoutingConfigBoundaries = (
  record: DefaultOffRoutingConfig
): void => {
  defaultOffRoutingConfigSafetySchema.parse(record.safety);
  defaultOffRoutingConfigPrivacySchema.parse(record.privacy);
  defaultOffRoutingConfigClaimBoundariesSchema.parse(record.claimBoundaries);

  if (
    record.source !== "synthetic_default_off_routing_config_design" ||
    record.configStatus.productionRoutingEnabledNow ||
    record.configStatus.advisoryRoutingEnabledNow ||
    record.configStatus.calibratedRoutingEnabledNow ||
    record.configStatus.productionRoutingEligibleNow ||
    !record.configStatus.defaultOffRequired ||
    !record.configStatus.explicitFutureScopeRequired ||
    !record.configStatus.humanApprovalRequired ||
    !record.configStatus.policyConfigRequired ||
    !record.configStatus.fallbackToDeterministicRequired ||
    !record.configStatus.deterministicSafetyOverridesRequired ||
    record.linkedProductionEligibility.productionRoutingEligibleNow ||
    record.linkedProductionEligibility.rawEligibilityRecordIncluded ||
    record.candidateFutureScopes.some((scope) => scope.currentlyEnabled) ||
    record.blockers.blockerCategories.length === 0 ||
    record.fallbackConstraints.fallbacks.length === 0 ||
    !record.phase17EvidenceDependency.realAgentEvidenceRequired ||
    !record.phase17EvidenceDependency
      .productionRoutingCannotBeEnabledWithoutPhase17Evidence ||
    record.safety.changesRuntimeBehavior ||
    record.safety.addsRuntimeConfigFlag ||
    record.safety.implementsProductionRouting ||
    record.claimBoundaries.productionRoutingEnabled ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.runtimeConfigFlagAdded ||
    record.claimBoundaries.policyFlagAdded
  ) {
    throw new Error(
      "Default-off routing configuration boundary violated: routing must remain disabled, ineligible, design-only, and non-runtime-integrated."
    );
  }
};

export const buildDefaultOffRoutingConfigFromEligibility = (
  eligibility: ProductionRoutingEligibility
): DefaultOffRoutingConfig =>
  buildDefaultOffRoutingConfig({
    eligibilityRecordId: eligibility.eligibilityRecordId,
    eligibilitySchemaVersion: eligibility.schemaVersion,
    eligibilitySource: eligibility.source,
    productionRoutingEligibleNow:
      eligibility.eligibilityStatus.productionRoutingEligibleNow
  });

export const defaultOffRoutingConfigContainsForbiddenRawString = (
  record: DefaultOffRoutingConfig
): boolean =>
  JSON.stringify(record).match(
    /diff --git|\/Users\/|\/private\/tmp\/|C:\\|@[A-Za-z0-9.-]+|PRIVATE KEY|sk-[A-Za-z0-9_-]{24,}|raw_prompt|raw_command|raw_diff|raw_source_code|raw_agent_output/i
  ) !== null;
