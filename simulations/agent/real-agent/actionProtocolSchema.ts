import { z } from "zod";
import { agentPhase16GateSummarySchemaVersion } from "../production-routing/phase16GateSummarySchema.js";
import type { Phase16GateSummary } from "../production-routing/phase16GateSummarySchema.js";

export const agentActionProtocolSchemaVersion =
  "agent-action-protocol.v1" as const;

export const supportedAgentActionCategoryValues = [
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "install_dependency",
  "run_tests",
  "git_commit",
  "git_push",
  "git_reset",
  "git_clean",
  "deploy",
  "publish_or_release",
  "unknown_or_unsupported_action"
] as const;

export const requiredAgentActionNormalizedFieldValues = [
  "actionCategory",
  "targetCategory",
  "intentCategory",
  "riskCategory",
  "evidenceStateCategory",
  "workspaceBoundaryCategory",
  "sensitivityCategory",
  "validationStateCategory",
  "gitStateCategory",
  "environmentCategory",
  "proposedExecutionCategory",
  "rawPayloadPolicyCategory",
  "timestampCategory"
] as const;

export const actionProtocolInclusionCategoryValues = [
  "category_only_action_metadata",
  "normalized_action_type",
  "normalized_risk_category",
  "normalized_evidence_state",
  "normalized_safety_signal_categories",
  "normalized_decision_category",
  "sanitized_outcome_category"
] as const;

export const actionProtocolExclusionCategoryValues = [
  "raw_source_code",
  "raw_diff",
  "raw_command",
  "raw_secret",
  "raw_env_var",
  "raw_private_path",
  "raw_repo_name",
  "raw_branch_name",
  "raw_prompt",
  "raw_model_output",
  "raw_validation_log",
  "human_name",
  "human_email",
  "customer_data"
] as const;

export const authorizationDecisionCategoryValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK"
] as const;

export const controlledEnvironmentRequirementCategoryValues = [
  "disposable_workspace_required",
  "no_real_secrets",
  "no_customer_data",
  "no_private_repositories_without_explicit_approval",
  "no_network_unless_explicitly_approved",
  "dangerous_commands_must_not_execute",
  "production_deploys_must_not_execute",
  "publish_release_actions_must_not_execute",
  "logs_must_be_privacy_sanitized",
  "trace_review_required_before_dataset_inclusion"
] as const;

export const actionProtocolBlockerCategoryValues = [
  "protocol_only_no_capture",
  "no_real_agent_integration",
  "no_controlled_sessions_run",
  "no_real_proposed_actions_captured",
  "no_reviewed_trace_labels",
  "no_baseline_comparison",
  "no_real_calibration_dataset",
  "no_scores_or_thresholds",
  "no_phase16_gate_reconsideration"
] as const;

export const actionProtocolBoundaryStatementValues = [
  "phase_17_protocol_only",
  "no_real_agent_integration",
  "no_real_agent_evidence_collected",
  "no_real_proposed_actions_captured",
  "no_runtime_behavior_changed",
  "no_production_advisory_calibrated_routing_enabled",
  "no_scores_thresholds_alpha_calibration_conformal_crc_added",
  "no_statistical_guarantee",
  "deterministic_stepharbor_decisions_remain_authoritative",
  "phase_16_gate_still_does_not_pass"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const safeProtocolRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "protocolRecordId must not include unsafe or private identifiers"
  );

export const agentActionProtocolSafetySchema = z.object({
  inert: z.literal(true),
  protocolOnly: z.literal(true),
  designOnly: z.literal(true),
  executesAgent: z.literal(false),
  executesActions: z.literal(false),
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
  implementsAgentIntegration: z.literal(false),
  capturesRealProposedActions: z.literal(false),
  createsRealTrace: z.literal(false),
  createsCalibrationData: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  appliesCalibration: z.literal(false),
  implementsAdvisoryRouting: z.literal(false),
  implementsCalibratedRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const agentActionProtocolPrivacySchema = z.object({
  categoryOnly: z.literal(true),
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawCalibrationDataIncluded: z.literal(false),
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  rawRoutingDataIncluded: z.literal(false),
  rawConfigDataIncluded: z.literal(false),
  rawGateDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realBranchNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  customerDataIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false)
});

export const agentActionProtocolClaimBoundariesSchema = z.object({
  protocolOnly: z.literal(true),
  designOnly: z.literal(true),
  productionRoutingEnabled: z.literal(false),
  advisoryRoutingEnabled: z.literal(false),
  calibratedRoutingEnabled: z.literal(false),
  productionRoutingEligible: z.literal(false),
  realAgentIntegrationImplemented: z.literal(false),
  realAgentEvidenceStarted: z.literal(false),
  realAgentTraceCaptured: z.literal(false),
  realReviewedTrace: z.literal(false),
  realCalibrationStarted: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realScores: z.literal(false),
  nonconformityScores: z.literal(false),
  thresholds: z.literal(false),
  alphaIntroduced: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  realEvaluationResults: z.literal(false),
  productionAuthorityGranted: z.literal(false)
});

export const agentActionProtocolSchema = z.object({
  schemaVersion: z.literal(agentActionProtocolSchemaVersion),
  protocolRecordId: safeProtocolRecordIdSchema,
  source: z.literal("synthetic_phase_17_action_protocol_design"),
  protocolStatus: z.object({
    phase: z.literal("phase_17"),
    protocolOnly: z.literal(true),
    designOnly: z.literal(true),
    captureEnabledNow: z.literal(false),
    realAgentIntegrationEnabledNow: z.literal(false),
    executesAgent: z.literal(false),
    executesActions: z.literal(false),
    executesCommands: z.literal(false),
    mutatesRepository: z.literal(false),
    requiresNetwork: z.literal(false),
    createsRealTrace: z.literal(false),
    createsCalibrationData: z.literal(false),
    productionRoutingEnabledNow: z.literal(false),
    calibratedRoutingEnabledNow: z.literal(false),
    advisoryRoutingAuthoritativeNow: z.literal(false),
    phase16GateStillRequired: z.literal(true)
  }),
  linkedPhase16GateSummary: z.object({
    phase16GateSummaryRecordId: z.literal("phase-16-gate-summary-001"),
    schemaVersion: z.literal(agentPhase16GateSummarySchemaVersion),
    phase16GatePassesNow: z.literal(false),
    productionRoutingEligibleNow: z.literal(false),
    productionRoutingEnabledNow: z.literal(false),
    rawGateSummaryIncluded: z.literal(false)
  }),
  proposedActionEnvelope: z.object({
    actionProtocolVersion: z.literal(agentActionProtocolSchemaVersion),
    proposedActionIdCategory: z.literal("category_only_proposed_action_id"),
    sessionIdCategory: z.literal("category_only_controlled_session_id"),
    agentSystemCategory: z.literal("generic_coding_agent"),
    agentAdapterCategory: z.literal("future_adapter_category"),
    actionCategory: z.enum(supportedAgentActionCategoryValues),
    actionIntentCategory: z.literal("normalized_intent_category"),
    actionRiskCategory: z.literal("normalized_risk_category"),
    targetCategory: z.literal("normalized_target_category"),
    evidenceStateCategory: z.literal("normalized_evidence_state_category"),
    requiresAuthorizationBeforeExecution: z.literal(true),
    proposedOnlyNotExecuted: z.literal(true),
    rawActionPayloadIncludedByDefault: z.literal(false),
    privacyRedactionRequired: z.literal(true),
    categoryOnlyByDefault: z.literal(true)
  }),
  supportedActionCategories: z
    .array(
      z.object({
        actionCategory: z.enum(supportedAgentActionCategoryValues),
        requiresPreExecutionAuthorization: z.literal(true),
        canBeCapturedAsProposal: z.literal(true),
        executesDuringCapture: z.literal(false)
      })
    )
    .length(supportedAgentActionCategoryValues.length),
  requiredNormalizedFields: z
    .array(z.enum(requiredAgentActionNormalizedFieldValues))
    .length(requiredAgentActionNormalizedFieldValues.length),
  rawPayloadPolicy: z.object({
    rawCommandsAllowedByDefault: z.literal(false),
    rawDiffsAllowedByDefault: z.literal(false),
    rawSourceCodeAllowedByDefault: z.literal(false),
    rawPathsAllowedByDefault: z.literal(false),
    rawRepoNamesAllowedByDefault: z.literal(false),
    rawPromptsAllowedByDefault: z.literal(false),
    rawModelOutputsAllowedByDefault: z.literal(false),
    rawValidationLogsAllowedByDefault: z.literal(false),
    rawSecretsAllowed: z.literal(false),
    sanitizedCategoryOnlyDefault: z.literal(true),
    futureSanitizedExcerptRequiresApproval: z.literal(true)
  }),
  privacyInclusionRules: z.object({
    inclusionCategories: z
      .array(z.enum(actionProtocolInclusionCategoryValues))
      .length(actionProtocolInclusionCategoryValues.length),
    exclusionCategories: z
      .array(z.enum(actionProtocolExclusionCategoryValues))
      .length(actionProtocolExclusionCategoryValues.length)
  }),
  authorizationContract: z.object({
    proposedActionsMustBeAuthorizedBeforeExecution: z.literal(true),
    decisionCategories: z
      .array(z.enum(authorizationDecisionCategoryValues))
      .length(authorizationDecisionCategoryValues.length),
    proposedActionCaptureDoesNotImplyExecution: z.literal(true),
    blockStopsExecution: z.literal(true),
    deferRequiresEvidenceGatheringBeforeRetry: z.literal(true),
    escalateRequiresHumanReviewBeforeExecution: z.literal(true),
    proceedOnlyAllowsExecutionInsideCurrentDeterministicPolicy: z.literal(true),
    futureCalibratedAdvisorySignalsAuthoritativeNow: z.literal(false)
  }),
  controlledEnvironmentRequirements: z
    .array(z.enum(controlledEnvironmentRequirementCategoryValues))
    .length(controlledEnvironmentRequirementCategoryValues.length),
  phase17EvidencePlanLink: z.object({
    realAgentEvidenceRequired: z.literal(true),
    thisBatchCreatesRealEvidence: z.literal(false),
    futureControlledTraceCollectionRequired: z.literal(true),
    futureTraceReviewRequired: z.literal(true),
    futureBaselineComparisonRequired: z.literal(true),
    futureCalibrationDatasetHandoffRequired: z.literal(true),
    phase16GateReconsiderationRequiresFutureEvidence: z.literal(true)
  }),
  blockers: z
    .array(z.enum(actionProtocolBlockerCategoryValues))
    .length(actionProtocolBlockerCategoryValues.length),
  safety: agentActionProtocolSafetySchema,
  privacy: agentActionProtocolPrivacySchema,
  claimBoundaries: agentActionProtocolClaimBoundariesSchema,
  boundaryStatements: z
    .array(z.enum(actionProtocolBoundaryStatementValues))
    .length(actionProtocolBoundaryStatementValues.length),
  notes: z.array(categoryIdSchema).min(1)
});

export type AgentActionProtocol = z.infer<typeof agentActionProtocolSchema>;

export const buildAgentActionProtocol = (input?: {
  phase16GateSummaryRecordId?: string;
  phase16GateSchemaVersion?: string;
  phase16GatePassesNow?: false;
  productionRoutingEligibleNow?: false;
  productionRoutingEnabledNow?: false;
}): AgentActionProtocol =>
  validateAgentActionProtocol({
    schemaVersion: agentActionProtocolSchemaVersion,
    protocolRecordId: "phase-17-agent-action-protocol-001",
    source: "synthetic_phase_17_action_protocol_design",
    protocolStatus: {
      phase: "phase_17",
      protocolOnly: true,
      designOnly: true,
      captureEnabledNow: false,
      realAgentIntegrationEnabledNow: false,
      executesAgent: false,
      executesActions: false,
      executesCommands: false,
      mutatesRepository: false,
      requiresNetwork: false,
      createsRealTrace: false,
      createsCalibrationData: false,
      productionRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      advisoryRoutingAuthoritativeNow: false,
      phase16GateStillRequired: true
    },
    linkedPhase16GateSummary: {
      phase16GateSummaryRecordId:
        input?.phase16GateSummaryRecordId ?? "phase-16-gate-summary-001",
      schemaVersion:
        input?.phase16GateSchemaVersion ?? agentPhase16GateSummarySchemaVersion,
      phase16GatePassesNow: input?.phase16GatePassesNow ?? false,
      productionRoutingEligibleNow:
        input?.productionRoutingEligibleNow ?? false,
      productionRoutingEnabledNow: input?.productionRoutingEnabledNow ?? false,
      rawGateSummaryIncluded: false
    },
    proposedActionEnvelope: {
      actionProtocolVersion: agentActionProtocolSchemaVersion,
      proposedActionIdCategory: "category_only_proposed_action_id",
      sessionIdCategory: "category_only_controlled_session_id",
      agentSystemCategory: "generic_coding_agent",
      agentAdapterCategory: "future_adapter_category",
      actionCategory: "unknown_or_unsupported_action",
      actionIntentCategory: "normalized_intent_category",
      actionRiskCategory: "normalized_risk_category",
      targetCategory: "normalized_target_category",
      evidenceStateCategory: "normalized_evidence_state_category",
      requiresAuthorizationBeforeExecution: true,
      proposedOnlyNotExecuted: true,
      rawActionPayloadIncludedByDefault: false,
      privacyRedactionRequired: true,
      categoryOnlyByDefault: true
    },
    supportedActionCategories: supportedAgentActionCategoryValues.map(
      (actionCategory) => ({
        actionCategory,
        requiresPreExecutionAuthorization: true,
        canBeCapturedAsProposal: true,
        executesDuringCapture: false
      })
    ),
    requiredNormalizedFields: [...requiredAgentActionNormalizedFieldValues],
    rawPayloadPolicy: {
      rawCommandsAllowedByDefault: false,
      rawDiffsAllowedByDefault: false,
      rawSourceCodeAllowedByDefault: false,
      rawPathsAllowedByDefault: false,
      rawRepoNamesAllowedByDefault: false,
      rawPromptsAllowedByDefault: false,
      rawModelOutputsAllowedByDefault: false,
      rawValidationLogsAllowedByDefault: false,
      rawSecretsAllowed: false,
      sanitizedCategoryOnlyDefault: true,
      futureSanitizedExcerptRequiresApproval: true
    },
    privacyInclusionRules: {
      inclusionCategories: [...actionProtocolInclusionCategoryValues],
      exclusionCategories: [...actionProtocolExclusionCategoryValues]
    },
    authorizationContract: {
      proposedActionsMustBeAuthorizedBeforeExecution: true,
      decisionCategories: [...authorizationDecisionCategoryValues],
      proposedActionCaptureDoesNotImplyExecution: true,
      blockStopsExecution: true,
      deferRequiresEvidenceGatheringBeforeRetry: true,
      escalateRequiresHumanReviewBeforeExecution: true,
      proceedOnlyAllowsExecutionInsideCurrentDeterministicPolicy: true,
      futureCalibratedAdvisorySignalsAuthoritativeNow: false
    },
    controlledEnvironmentRequirements: [
      ...controlledEnvironmentRequirementCategoryValues
    ],
    phase17EvidencePlanLink: {
      realAgentEvidenceRequired: true,
      thisBatchCreatesRealEvidence: false,
      futureControlledTraceCollectionRequired: true,
      futureTraceReviewRequired: true,
      futureBaselineComparisonRequired: true,
      futureCalibrationDatasetHandoffRequired: true,
      phase16GateReconsiderationRequiresFutureEvidence: true
    },
    blockers: [...actionProtocolBlockerCategoryValues],
    safety: {
      inert: true,
      protocolOnly: true,
      designOnly: true,
      executesAgent: false,
      executesActions: false,
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
      implementsAgentIntegration: false,
      capturesRealProposedActions: false,
      createsRealTrace: false,
      createsCalibrationData: false,
      computesScores: false,
      computesThresholds: false,
      appliesCalibration: false,
      implementsAdvisoryRouting: false,
      implementsCalibratedRouting: false,
      implementsProductionRouting: false,
      implementsConformalRiskControl: false
    },
    privacy: {
      categoryOnly: true,
      rawPromptIncluded: false,
      rawActionIncluded: false,
      rawCommandIncluded: false,
      rawDiffIncluded: false,
      rawSourceCodeIncluded: false,
      rawValidationLogIncluded: false,
      rawTraceIncluded: false,
      rawCalibrationDataIncluded: false,
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
      rawRoutingDataIncluded: false,
      rawConfigDataIncluded: false,
      rawGateDataIncluded: false,
      realRepoNameIncluded: false,
      realBranchNameIncluded: false,
      realPathIncluded: false,
      realUserIncluded: false,
      realEmailIncluded: false,
      secretIncluded: false,
      rawAgentOutputIncluded: false,
      customerDataIncluded: false,
      reviewerIdentityIncluded: false
    },
    claimBoundaries: {
      protocolOnly: true,
      designOnly: true,
      productionRoutingEnabled: false,
      advisoryRoutingEnabled: false,
      calibratedRoutingEnabled: false,
      productionRoutingEligible: false,
      realAgentIntegrationImplemented: false,
      realAgentEvidenceStarted: false,
      realAgentTraceCaptured: false,
      realReviewedTrace: false,
      realCalibrationStarted: false,
      realCalibrationDataset: false,
      realScores: false,
      nonconformityScores: false,
      thresholds: false,
      alphaIntroduced: false,
      calibrationApplied: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      realEvaluationResults: false,
      productionAuthorityGranted: false
    },
    boundaryStatements: [...actionProtocolBoundaryStatementValues],
    notes: [
      "phase_17_protocol_defined_only",
      "no_real_capture_yet",
      "phase_16_gate_still_does_not_pass"
    ]
  });

export const validateAgentActionProtocol = (
  record: unknown
): AgentActionProtocol => {
  const parsed = agentActionProtocolSchema.parse(record);
  validateAgentActionProtocolBoundaries(parsed);
  return parsed;
};

export const validateAgentActionProtocols = (
  records: unknown[]
): AgentActionProtocol[] =>
  records
    .map(validateAgentActionProtocol)
    .sort((left, right) =>
      left.protocolRecordId.localeCompare(right.protocolRecordId)
    );

export const summarizeAgentActionProtocol = (
  record: AgentActionProtocol
): {
  schemaVersion: string;
  protocolRecordId: string;
  protocolOnly: true;
  linkedPhase16GateSummaryRecordId: string;
  phase16GatePassesNow: false;
  supportedActionCategoryCount: number;
  supportedActionCategories: string[];
  rawPayloadPolicy: "raw_payloads_forbidden_by_default_category_only";
  controlledEnvironmentRequirements: string[];
  blockerCount: number;
  blockers: string[];
  conclusion: "protocol_defined_no_real_capture_phase_16_gate_still_does_not_pass";
} => ({
  schemaVersion: record.schemaVersion,
  protocolRecordId: record.protocolRecordId,
  protocolOnly: record.protocolStatus.protocolOnly,
  linkedPhase16GateSummaryRecordId:
    record.linkedPhase16GateSummary.phase16GateSummaryRecordId,
  phase16GatePassesNow: record.linkedPhase16GateSummary.phase16GatePassesNow,
  supportedActionCategoryCount: record.supportedActionCategories.length,
  supportedActionCategories: record.supportedActionCategories.map(
    (category) => category.actionCategory
  ),
  rawPayloadPolicy: "raw_payloads_forbidden_by_default_category_only",
  controlledEnvironmentRequirements: [
    ...record.controlledEnvironmentRequirements
  ],
  blockerCount: record.blockers.length,
  blockers: [...record.blockers],
  conclusion:
    "protocol_defined_no_real_capture_phase_16_gate_still_does_not_pass"
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

export const validateAgentActionProtocolBoundaries = (
  record: AgentActionProtocol
): void => {
  agentActionProtocolSafetySchema.parse(record.safety);
  agentActionProtocolPrivacySchema.parse(record.privacy);
  agentActionProtocolClaimBoundariesSchema.parse(record.claimBoundaries);

  assertAllCategoriesPresent(
    record.supportedActionCategories.map((category) => category.actionCategory),
    supportedAgentActionCategoryValues,
    "supportedActionCategories"
  );
  assertAllCategoriesPresent(
    record.requiredNormalizedFields,
    requiredAgentActionNormalizedFieldValues,
    "requiredNormalizedFields"
  );
  assertAllCategoriesPresent(
    record.privacyInclusionRules.inclusionCategories,
    actionProtocolInclusionCategoryValues,
    "privacyInclusionRules.inclusionCategories"
  );
  assertAllCategoriesPresent(
    record.privacyInclusionRules.exclusionCategories,
    actionProtocolExclusionCategoryValues,
    "privacyInclusionRules.exclusionCategories"
  );
  assertAllCategoriesPresent(
    record.authorizationContract.decisionCategories,
    authorizationDecisionCategoryValues,
    "authorizationContract.decisionCategories"
  );
  assertAllCategoriesPresent(
    record.controlledEnvironmentRequirements,
    controlledEnvironmentRequirementCategoryValues,
    "controlledEnvironmentRequirements"
  );
  assertAllCategoriesPresent(
    record.blockers,
    actionProtocolBlockerCategoryValues,
    "blockers"
  );

  if (
    record.source !== "synthetic_phase_17_action_protocol_design" ||
    record.protocolStatus.phase !== "phase_17" ||
    !record.protocolStatus.protocolOnly ||
    !record.protocolStatus.designOnly ||
    record.protocolStatus.captureEnabledNow ||
    record.protocolStatus.realAgentIntegrationEnabledNow ||
    record.protocolStatus.executesAgent ||
    record.protocolStatus.executesActions ||
    record.protocolStatus.executesCommands ||
    record.protocolStatus.mutatesRepository ||
    record.protocolStatus.requiresNetwork ||
    record.protocolStatus.createsRealTrace ||
    record.protocolStatus.createsCalibrationData ||
    record.protocolStatus.productionRoutingEnabledNow ||
    record.protocolStatus.calibratedRoutingEnabledNow ||
    record.protocolStatus.advisoryRoutingAuthoritativeNow ||
    !record.protocolStatus.phase16GateStillRequired ||
    record.linkedPhase16GateSummary.phase16GateSummaryRecordId !==
      "phase-16-gate-summary-001" ||
    record.linkedPhase16GateSummary.schemaVersion !==
      agentPhase16GateSummarySchemaVersion ||
    record.linkedPhase16GateSummary.phase16GatePassesNow ||
    record.linkedPhase16GateSummary.productionRoutingEligibleNow ||
    record.linkedPhase16GateSummary.productionRoutingEnabledNow ||
    record.linkedPhase16GateSummary.rawGateSummaryIncluded ||
    record.proposedActionEnvelope.actionProtocolVersion !==
      agentActionProtocolSchemaVersion ||
    !record.proposedActionEnvelope.requiresAuthorizationBeforeExecution ||
    !record.proposedActionEnvelope.proposedOnlyNotExecuted ||
    record.proposedActionEnvelope.rawActionPayloadIncludedByDefault ||
    !record.proposedActionEnvelope.privacyRedactionRequired ||
    !record.proposedActionEnvelope.categoryOnlyByDefault ||
    record.supportedActionCategories.some(
      (category) =>
        !category.requiresPreExecutionAuthorization ||
        !category.canBeCapturedAsProposal ||
        category.executesDuringCapture
    ) ||
    record.rawPayloadPolicy.rawCommandsAllowedByDefault ||
    record.rawPayloadPolicy.rawDiffsAllowedByDefault ||
    record.rawPayloadPolicy.rawSourceCodeAllowedByDefault ||
    record.rawPayloadPolicy.rawPathsAllowedByDefault ||
    record.rawPayloadPolicy.rawRepoNamesAllowedByDefault ||
    record.rawPayloadPolicy.rawPromptsAllowedByDefault ||
    record.rawPayloadPolicy.rawModelOutputsAllowedByDefault ||
    record.rawPayloadPolicy.rawValidationLogsAllowedByDefault ||
    record.rawPayloadPolicy.rawSecretsAllowed ||
    !record.rawPayloadPolicy.sanitizedCategoryOnlyDefault ||
    !record.rawPayloadPolicy.futureSanitizedExcerptRequiresApproval ||
    !record.authorizationContract
      .proposedActionsMustBeAuthorizedBeforeExecution ||
    !record.authorizationContract.proposedActionCaptureDoesNotImplyExecution ||
    !record.authorizationContract.blockStopsExecution ||
    !record.authorizationContract.deferRequiresEvidenceGatheringBeforeRetry ||
    !record.authorizationContract.escalateRequiresHumanReviewBeforeExecution ||
    !record.authorizationContract
      .proceedOnlyAllowsExecutionInsideCurrentDeterministicPolicy ||
    record.authorizationContract
      .futureCalibratedAdvisorySignalsAuthoritativeNow ||
    !record.phase17EvidencePlanLink.realAgentEvidenceRequired ||
    record.phase17EvidencePlanLink.thisBatchCreatesRealEvidence ||
    !record.phase17EvidencePlanLink.futureControlledTraceCollectionRequired ||
    !record.phase17EvidencePlanLink.futureTraceReviewRequired ||
    !record.phase17EvidencePlanLink.futureBaselineComparisonRequired ||
    !record.phase17EvidencePlanLink.futureCalibrationDatasetHandoffRequired ||
    !record.phase17EvidencePlanLink
      .phase16GateReconsiderationRequiresFutureEvidence ||
    record.blockers.length === 0 ||
    record.safety.executesAgent ||
    record.safety.executesActions ||
    record.safety.executesCommands ||
    record.safety.requiresNetwork ||
    record.safety.mutatesRepository ||
    record.safety.implementsAgentIntegration ||
    record.safety.capturesRealProposedActions ||
    record.safety.createsRealTrace ||
    record.safety.createsCalibrationData ||
    record.safety.changesRuntimeBehavior ||
    record.safety.addsRuntimeConfigFlag ||
    record.safety.implementsAdvisoryRouting ||
    record.safety.implementsCalibratedRouting ||
    record.safety.implementsProductionRouting ||
    record.privacy.rawPromptIncluded ||
    record.privacy.rawActionIncluded ||
    record.privacy.rawCommandIncluded ||
    record.privacy.rawTraceIncluded ||
    record.privacy.realRepoNameIncluded ||
    record.privacy.realBranchNameIncluded ||
    record.privacy.realPathIncluded ||
    record.privacy.secretIncluded ||
    record.privacy.rawAgentOutputIncluded ||
    record.privacy.customerDataIncluded ||
    record.privacy.reviewerIdentityIncluded ||
    record.claimBoundaries.productionRoutingEnabled ||
    record.claimBoundaries.advisoryRoutingEnabled ||
    record.claimBoundaries.calibratedRoutingEnabled ||
    record.claimBoundaries.productionRoutingEligible ||
    record.claimBoundaries.realAgentIntegrationImplemented ||
    record.claimBoundaries.realAgentEvidenceStarted ||
    record.claimBoundaries.realAgentTraceCaptured ||
    record.claimBoundaries.realReviewedTrace ||
    record.claimBoundaries.realCalibrationStarted ||
    record.claimBoundaries.realCalibrationDataset ||
    record.claimBoundaries.realScores ||
    record.claimBoundaries.thresholds ||
    record.claimBoundaries.conformalRiskControlImplemented ||
    record.claimBoundaries.statisticalGuarantee ||
    !record.boundaryStatements.includes("phase_17_protocol_only") ||
    !record.boundaryStatements.includes("no_real_agent_integration") ||
    !record.boundaryStatements.includes("no_real_agent_evidence_collected") ||
    !record.boundaryStatements.includes("no_real_proposed_actions_captured") ||
    !record.boundaryStatements.includes("no_runtime_behavior_changed") ||
    !record.boundaryStatements.includes("phase_16_gate_still_does_not_pass")
  ) {
    throw new Error(
      "Agent action protocol boundary violated: protocol must remain Phase-17 protocol-only, no-capture, no-agent-integration, and no-runtime-behavior."
    );
  }
};

export const buildAgentActionProtocolFromPhase16GateSummary = (
  phase16GateSummary: Phase16GateSummary
): AgentActionProtocol =>
  buildAgentActionProtocol({
    phase16GateSummaryRecordId: phase16GateSummary.gateSummaryRecordId,
    phase16GateSchemaVersion: phase16GateSummary.schemaVersion,
    phase16GatePassesNow:
      phase16GateSummary.phaseStatus.productionRoutingGatePassesNow,
    productionRoutingEligibleNow:
      phase16GateSummary.phaseStatus.productionRoutingEligibleNow,
    productionRoutingEnabledNow:
      phase16GateSummary.phaseStatus.productionRoutingEnabledNow
  });

export const agentActionProtocolContainsForbiddenRawString = (
  record: AgentActionProtocol
): boolean =>
  JSON.stringify(record).match(
    /diff --git|\/Users\/|\/private\/tmp\/|C:\\|@[A-Za-z0-9.-]+|PRIVATE KEY|sk-[A-Za-z0-9_-]{24,}|rawPromptValue|rawCommandValue|rawDiffValue|rawSourceCodeValue|rawAgentOutputValue|rawTraceValue|reviewerIdentityValue|customerDataValue/i
  ) !== null;
