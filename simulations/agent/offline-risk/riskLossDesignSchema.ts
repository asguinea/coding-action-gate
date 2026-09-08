import { z } from "zod";

export const agentOfflineRiskLossDesignSchemaVersion =
  "agent-offline-risk-loss-design.v1" as const;

export const agentOfflineRiskLossDesignSourceValues = [
  "synthetic_design_only",
  "future_offline_experiment_design",
  "future_real_calibration_dataset_design"
] as const;

export const agentOfflineRiskLossFamilyValues = [
  "unsafe_proceed_loss",
  "missed_block_loss",
  "missed_escalation_loss",
  "unnecessary_defer_loss",
  "unnecessary_escalate_loss",
  "incorrect_block_loss",
  "missed_uncertainty_reduction_loss",
  "agent_recovery_failure_loss",
  "excessive_friction_loss",
  "coverage_gap_loss"
] as const;

export const agentOfflineRiskLossSeverityValues = [
  "safety_critical",
  "high",
  "medium",
  "low",
  "friction_only",
  "research_only"
] as const;

export const agentOfflineRiskDimensionValues = [
  "unsafe_action_risk",
  "premature_action_risk",
  "missing_context_risk",
  "stale_context_risk",
  "validation_failure_risk",
  "sensitive_area_risk",
  "workspace_boundary_risk",
  "git_workflow_risk",
  "environment_ambiguity_risk",
  "recovery_uncertainty_risk",
  "autonomy_retry_risk",
  "friction_risk",
  "coverage_gap_risk"
] as const;

export const agentOfflineRiskLabelInputValues = [
  "decision_appropriateness_labels",
  "advisory_uncertainty_usefulness_labels",
  "defer_quality_labels",
  "escalate_quality_labels",
  "block_quality_labels",
  "agent_behavior_labels",
  "safety_outcome_labels",
  "task_progress_labels",
  "friction_labels",
  "coverage_labels",
  "future_loss_label_candidates",
  "source_linkage_status",
  "adjudication_status",
  "split_eligibility_status"
] as const;

export const agentOfflineRiskLabelInputStatusValues = [
  "synthetic_design_available",
  "synthetic_schema_example_only",
  "future_real_label_required",
  "missing",
  "not_applicable"
] as const;

export const agentOfflineRiskFutureEvidenceValues = [
  "real_reviewed_traces",
  "eligible_calibration_dataset",
  "approved_train_calibration_test_split",
  "adjudicated_labels",
  "numeric_loss_definitions",
  "risk_score_definitions",
  "nonconformity_score_definitions",
  "threshold_selection_protocol",
  "offline_evaluation_results",
  "distribution_shift_assessment",
  "claim_boundary_review"
] as const;

export const agentOfflineRiskNonconformityInputFamilyValues = [
  "decision_mismatch_inputs",
  "uncertainty_driver_inputs",
  "reduction_plan_inputs",
  "agent_recovery_inputs",
  "safety_outcome_inputs",
  "friction_inputs",
  "coverage_gap_inputs"
] as const;

export const agentOfflineRiskCrcIntendedUseValues = [
  "offline_threshold_exploration",
  "future_advisory_routing_comparison",
  "future_risk_control_experiment",
  "future_production_gate_only_after_evidence"
] as const;

export const agentOfflineRiskForbiddenCurrentUseValues = [
  "production_routing",
  "guarantee_claims",
  "real_world_validation_claims",
  "calibrated_risk_claims",
  "alpha_control_claims",
  "enterprise_readiness_claims"
] as const;

export const agentOfflineRiskUnsuitableCurrentUseValues = [
  "real_calibration_dataset_training",
  "real_threshold_selection",
  "real_conformal_calibration",
  "production_routing",
  "statistical_guarantee_claims",
  "risk_control_at_alpha_claims",
  "real_world_validation_claims",
  "real_agent_benchmark_claims",
  "enterprise_readiness_claims"
] as const;

export const agentOfflineRiskUncertaintyDimensionValues = [
  "missing_context",
  "stale_context",
  "validation_uncertainty",
  "sensitive_area",
  "workspace_boundary",
  "git_workflow",
  "environment_ambiguity",
  "recovery_uncertainty",
  "autonomy_retry",
  "friction",
  "coverage_gap"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const designIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

const candidateLossFamilySchema = z.object({
  lossFamilyId: z.enum(agentOfflineRiskLossFamilyValues),
  descriptionCategory: categoryIdSchema,
  severityCategory: z.enum(agentOfflineRiskLossSeverityValues),
  requiredLabels: z.array(z.enum(agentOfflineRiskLabelInputValues)).min(1),
  requiredEvidence: z
    .array(z.enum(agentOfflineRiskFutureEvidenceValues))
    .min(1),
  futureNumericDefinitionNeeded: z.literal(true),
  computableWithCurrentSyntheticExamples: z.literal(false),
  realReviewedTracesRequired: z.literal(true),
  numericLossComputed: z.literal(false)
});

const candidateRiskDimensionSchema = z.object({
  riskDimensionId: z.enum(agentOfflineRiskDimensionValues),
  relatedUncertaintyDimensions: z.array(
    z.enum(agentOfflineRiskUncertaintyDimensionValues)
  ),
  relatedLossFamilies: z.array(z.enum(agentOfflineRiskLossFamilyValues)).min(1),
  requiredEvidence: z
    .array(z.enum(agentOfflineRiskFutureEvidenceValues))
    .min(1),
  futureScoreNeeded: z.literal(true),
  scoreComputed: z.literal(false),
  realDataRequired: z.literal(true)
});

const requiredLabelInputSchema = z.object({
  labelInputId: z.enum(agentOfflineRiskLabelInputValues),
  sourcePhase: z.enum(["phase-13", "future_phase"]),
  requiredForLossFamilies: z.array(z.enum(agentOfflineRiskLossFamilyValues)),
  requiredForRiskDimensions: z.array(z.enum(agentOfflineRiskDimensionValues)),
  currentStatus: z.enum(agentOfflineRiskLabelInputStatusValues),
  realReviewedTraceRequired: z.boolean(),
  adjudicationRequiredBeforeUse: z.boolean()
});

export const riskLossDesignSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
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
  createsCalibrationDataset: z.literal(false),
  createsCalibrationManifest: z.literal(false),
  createsSplitManifest: z.literal(false),
  assignsDatasetSplits: z.literal(false),
  appliesCalibration: z.literal(false),
  computesNumericLosses: z.literal(false),
  computesRiskScores: z.literal(false),
  computesNonconformityScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const riskLossDesignPrivacySchema = z.object({
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
  rawManifestDataIncluded: z.literal(false),
  rawAdjudicationDataIncluded: z.literal(false),
  rawSplitDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const riskLossDesignClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  designOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  datasetSplitsAssigned: z.literal(false),
  splitManifestCreated: z.literal(false),
  numericLossesComputed: z.literal(false),
  riskScoresComputed: z.literal(false),
  nonconformityScoresComputed: z.literal(false),
  thresholdsComputed: z.literal(false),
  alphaIntroduced: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

export const riskLossDesignSchema = z.object({
  schemaVersion: z.literal(agentOfflineRiskLossDesignSchemaVersion),
  designId: designIdSchema,
  source: z.enum(agentOfflineRiskLossDesignSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-14"),
    phaseName: z.literal("Offline Conformal / CRC Prototype"),
    completedPreviousPhase: z.literal(
      "phase-13-complete-readiness-infrastructure-only"
    ),
    completedBatches: z.array(z.never()).length(0),
    currentBatch: z.literal("14.1"),
    futureBatches: z.array(z.enum(["14.2", "14.3", "14.4", "14.5", "14.6"])),
    phaseStatus: z.literal(
      "offline_prototype_design_started_without_calibration_or_guarantees"
    )
  }),
  candidateLossFamilies: z
    .array(candidateLossFamilySchema)
    .length(agentOfflineRiskLossFamilyValues.length),
  candidateRiskDimensions: z
    .array(candidateRiskDimensionSchema)
    .length(agentOfflineRiskDimensionValues.length),
  requiredLabelInputs: z.array(requiredLabelInputSchema).min(1),
  requiredFutureEvidence: z.object({
    evidenceCategories: z.array(z.enum(agentOfflineRiskFutureEvidenceValues)),
    allEvidenceFutureOrMissing: z.literal(true),
    realEvidenceIncluded: z.literal(false)
  }),
  nonconformityInputDesign: z.object({
    possibleInputFamilies: z.array(
      z.enum(agentOfflineRiskNonconformityInputFamilyValues)
    ),
    requiredLabels: z.array(z.enum(agentOfflineRiskLabelInputValues)),
    requiredFeatures: z.array(categoryIdSchema),
    requiredSplits: z.array(
      z.enum(["future_calibration_split", "future_test_split"])
    ),
    currentStatus: z.literal("design_only_no_scores"),
    nonconformityScoresComputed: z.literal(false),
    riskScoresComputed: z.literal(false),
    thresholdsComputed: z.literal(false)
  }),
  crcUseDesign: z.object({
    intendedFutureUse: z.array(z.enum(agentOfflineRiskCrcIntendedUseValues)),
    requiredBeforeUse: z.array(z.enum(agentOfflineRiskFutureEvidenceValues)),
    forbiddenCurrentUse: z.array(
      z.enum(agentOfflineRiskForbiddenCurrentUseValues)
    ),
    currentStatus: z.literal("design_only_no_crc_or_conformal_method"),
    crcImplemented: z.literal(false),
    conformalImplemented: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false),
    alphaIntroduced: z.literal(false)
  }),
  unsuitableCurrentUses: z.array(
    z.enum(agentOfflineRiskUnsuitableCurrentUseValues)
  ),
  boundarySummary: z.object({
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    rawDataBoundaryViolationCount: z.literal(0),
    calibrationBoundaryViolationCount: z.literal(0),
    conformalBoundaryViolationCount: z.literal(0),
    runtimeBoundaryViolationCount: z.literal(0),
    numericComputationBoundaryViolationCount: z.literal(0)
  }),
  safety: riskLossDesignSafetySchema,
  privacy: riskLossDesignPrivacySchema,
  claimBoundaries: riskLossDesignClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type RiskLossDesign = z.infer<typeof riskLossDesignSchema>;
export type RiskLossDesignBoundarySummary = RiskLossDesign["boundarySummary"];

export const validateRiskLossDesign = (design: unknown): RiskLossDesign =>
  riskLossDesignSchema.parse(design);

export const validateRiskLossDesigns = (designs: unknown[]): RiskLossDesign[] =>
  designs
    .map(validateRiskLossDesign)
    .sort((left, right) => left.designId.localeCompare(right.designId));

export const summarizeRiskLossDesign = (
  design: RiskLossDesign
): {
  designId: string;
  candidateLossFamilyCount: number;
  candidateRiskDimensionCount: number;
  numericLossesComputed: false;
  riskScoresComputed: false;
  thresholdsComputed: false;
  alphaIntroduced: false;
} => ({
  designId: design.designId,
  candidateLossFamilyCount: design.candidateLossFamilies.length,
  candidateRiskDimensionCount: design.candidateRiskDimensions.length,
  numericLossesComputed: design.safety.computesNumericLosses,
  riskScoresComputed: design.safety.computesRiskScores,
  thresholdsComputed: design.safety.computesThresholds,
  alphaIntroduced: design.safety.introducesAlpha
});

export const computeRiskLossDesignBoundarySummary = (
  design: RiskLossDesign
): RiskLossDesignBoundarySummary => design.boundarySummary;

const forbiddenRiskLossPatterns = [
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
  /bun\s+run/i
] as const;

export const riskLossDesignContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenRiskLossPatterns.some((pattern) => pattern.test(serialized));
};

export const validateRiskLossDesignSafety = (design: RiskLossDesign): void => {
  if (riskLossDesignContainsForbiddenRawString(design)) {
    throw new Error(
      `Risk/loss design contains forbidden raw-looking value: ${design.designId}`
    );
  }
};
