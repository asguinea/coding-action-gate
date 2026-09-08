import { z } from "zod";
import {
  agentOfflineRiskDimensionValues,
  agentOfflineRiskLossDesignSchemaVersion,
  agentOfflineRiskLossFamilyValues,
  type RiskLossDesign
} from "./riskLossDesignSchema.js";

export const agentOfflineScoreInputSchemaVersion =
  "agent-offline-score-input.v1" as const;

export const agentOfflineScoreInputSetSchemaVersion =
  "agent-offline-score-input-set.v1" as const;

export const agentOfflineScoreInputSourceValues = [
  "synthetic_mock_score_input",
  "future_calibration_dataset_score_input",
  "future_offline_experiment_score_input"
] as const;

export const agentOfflineScoreFamilyValues = [
  "unsafe_action_score_input",
  "premature_action_score_input",
  "missing_context_score_input",
  "stale_context_score_input",
  "validation_failure_score_input",
  "sensitivity_score_input",
  "workspace_boundary_score_input",
  "git_workflow_score_input",
  "environment_ambiguity_score_input",
  "recovery_uncertainty_score_input",
  "autonomy_retry_score_input",
  "friction_score_input",
  "coverage_gap_score_input"
] as const;

export const agentOfflineScoreFeatureInputValues = [
  "action_category_signal",
  "decision_category_signal",
  "uncertainty_dimension_signal",
  "driver_category_signal",
  "reduction_step_signal",
  "label_readiness_signal",
  "split_readiness_signal",
  "leakage_risk_signal",
  "safety_boundary_signal",
  "friction_category_signal",
  "coverage_gap_signal"
] as const;

export const agentOfflineScoreLabelInputValues = [
  "decision_appropriateness_label",
  "advisory_usefulness_label",
  "defer_quality_label",
  "escalation_quality_label",
  "block_quality_label",
  "agent_recovery_label",
  "safety_outcome_label",
  "task_progress_label",
  "friction_label",
  "coverage_gap_label",
  "future_loss_candidate_label"
] as const;

export const agentOfflineScoreNonconformityInputFamilyValues = [
  "decision_mismatch_input",
  "uncertainty_mismatch_input",
  "unsafe_proceed_input",
  "missed_escalation_input",
  "missed_block_input",
  "excessive_friction_input",
  "agent_recovery_failure_input",
  "coverage_gap_input"
] as const;

export const agentOfflineScoreFutureRequirementValues = [
  "real_reviewed_traces_required",
  "adjudicated_labels_required",
  "eligible_calibration_dataset_required",
  "approved_split_required",
  "numeric_score_definition_required",
  "nonconformity_definition_required",
  "threshold_protocol_required",
  "calibration_procedure_required",
  "claim_boundary_review_required"
] as const;

export const agentOfflineScoreSourceArtifactKindValues = [
  "synthetic_calibration_record",
  "synthetic_manifest_record",
  "synthetic_label_completeness_record",
  "synthetic_split_planning_record",
  "synthetic_readiness_summary",
  "synthetic_mock_composite"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const safeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

export const offlineScoreSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
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

export const offlineScorePrivacySchema = z.object({
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
  rawScoreDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const offlineScoreClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
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

const boundarySummarySchema = z.object({
  safetyBoundaryViolationCount: z.literal(0),
  privacyBoundaryViolationCount: z.literal(0),
  claimBoundaryViolationCount: z.literal(0),
  rawDataBoundaryViolationCount: z.literal(0),
  calibrationBoundaryViolationCount: z.literal(0),
  scoringBoundaryViolationCount: z.literal(0),
  conformalBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0),
  numericComputationBoundaryViolationCount: z.literal(0)
});

const phaseSchema = z.object({
  phaseId: z.literal("phase-14"),
  phaseName: z.literal("Offline Conformal / CRC Prototype"),
  completedPreviousPhase: z.literal(
    "phase-13-complete-readiness-infrastructure-only"
  ),
  completedBatches: z.array(z.literal("14.1")),
  currentBatch: z.literal("14.2"),
  futureBatches: z.array(z.enum(["14.3", "14.4", "14.5", "14.6"])),
  phaseStatus: z.literal(
    "offline_score_schema_and_mock_inputs_without_calibration_or_guarantees"
  )
});

const linkedRiskLossDesignSchema = z.object({
  designId: z.literal("phase-14-offline-risk-loss-design-v1"),
  schemaVersion: z.literal(agentOfflineRiskLossDesignSchemaVersion),
  source: z.literal("synthetic_design_only"),
  linkedLossFamilies: z.array(z.enum(agentOfflineRiskLossFamilyValues)).min(1),
  linkedRiskDimensions: z.array(z.enum(agentOfflineRiskDimensionValues)).min(1),
  rawDesignIncluded: z.literal(false)
});

const sourceArtifactSchema = z.object({
  artifactKind: z.enum(agentOfflineScoreSourceArtifactKindValues),
  calibrationRecordId: z.string().min(1).optional(),
  manifestId: z.string().min(1).optional(),
  labelCompletenessReportId: z.string().min(1).optional(),
  splitPlanningReportId: z.string().min(1).optional(),
  readinessSummaryId: z.string().min(1).optional(),
  rawArtifactIncluded: z.literal(false)
});

const candidateScoreFamilySchema = z.object({
  scoreFamilyId: z.enum(agentOfflineScoreFamilyValues),
  relatedRiskDimension: z.enum(agentOfflineRiskDimensionValues),
  relatedLossFamilies: z.array(z.enum(agentOfflineRiskLossFamilyValues)).min(1),
  requiredFeatureInputs: z
    .array(z.enum(agentOfflineScoreFeatureInputValues))
    .min(1),
  requiredLabelInputs: z
    .array(z.enum(agentOfflineScoreLabelInputValues))
    .min(1),
  futureScoreDefinitionNeeded: z.literal(true),
  mockInputsProvided: z.literal(true),
  realScoreComputed: z.literal(false),
  nonconformityScoreComputed: z.literal(false)
});

const mockFeatureInputSchema = z.object({
  featureInputId: categoryIdSchema,
  featureFamily: z.enum(agentOfflineScoreFeatureInputValues),
  valueCategory: categoryIdSchema,
  sourceCategory: categoryIdSchema,
  mockOnly: z.literal(true),
  computedFromRealData: z.literal(false)
});

const mockLabelInputSchema = z.object({
  labelInputId: categoryIdSchema,
  labelFamily: z.enum(agentOfflineScoreLabelInputValues),
  valueCategory: categoryIdSchema,
  sourceCategory: categoryIdSchema,
  mockOnly: z.literal(true),
  realHumanReviewed: z.literal(false),
  adjudicated: z.literal(false)
});

const mockNonconformityInputSchema = z.object({
  inputFamilies: z
    .array(z.enum(agentOfflineScoreNonconformityInputFamilyValues))
    .min(1),
  requiredScoreFamilies: z.array(z.enum(agentOfflineScoreFamilyValues)).min(1),
  requiredLabelFamilies: z
    .array(z.enum(agentOfflineScoreLabelInputValues))
    .min(1),
  requiredFutureEvidence: z
    .array(z.enum(agentOfflineScoreFutureRequirementValues))
    .min(1),
  mockInputReadyForSchemaTesting: z.literal(true),
  readyForRealNonconformityScoring: z.literal(false),
  nonconformityScoreComputed: z.literal(false),
  riskScoreComputed: z.literal(false),
  thresholdComputed: z.literal(false),
  alphaIntroduced: z.literal(false)
});

const futureScoringRequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.enum(agentOfflineScoreFutureRequirementValues),
      status: z.literal("future_unmet"),
      requiredBeforeRealScoring: z.literal(true)
    })
  ),
  allRequirementsFutureOrUnmet: z.literal(true)
});

const scoreFamilyCoverageSchema = z.object({
  requiredScoreFamilyCount: z.number().int().nonnegative(),
  coveredScoreFamilyCount: z.number().int().nonnegative(),
  missingScoreFamilyCount: z.number().int().nonnegative(),
  scoreComputedCount: z.literal(0),
  nonconformityScoreComputedCount: z.literal(0),
  thresholdComputedCount: z.literal(0)
});

export const offlineScoreInputSchema = z.object({
  schemaVersion: z.literal(agentOfflineScoreInputSchemaVersion),
  scoreInputId: safeIdSchema,
  source: z.enum(agentOfflineScoreInputSourceValues),
  phase: phaseSchema,
  linkedRiskLossDesign: linkedRiskLossDesignSchema,
  sourceArtifact: sourceArtifactSchema,
  candidateScoreFamilies: z.array(candidateScoreFamilySchema).min(1),
  mockFeatureInputs: z.array(mockFeatureInputSchema).min(1),
  mockLabelInputs: z.array(mockLabelInputSchema).min(1),
  mockNonconformityInput: mockNonconformityInputSchema,
  futureScoringRequirements: futureScoringRequirementsSchema,
  boundarySummary: boundarySummarySchema,
  safety: offlineScoreSafetySchema,
  privacy: offlineScorePrivacySchema,
  claimBoundaries: offlineScoreClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export const offlineScoreInputSetSchema = z.object({
  schemaVersion: z.literal(agentOfflineScoreInputSetSchemaVersion),
  inputSetId: safeIdSchema,
  source: z.literal("synthetic_mock_score_input"),
  phase: phaseSchema,
  scoreInputs: z.array(offlineScoreInputSchema).min(3).max(6),
  scoreFamilyCoverage: scoreFamilyCoverageSchema,
  mockInputSummary: z.object({
    totalScoreInputs: z.number().int().nonnegative(),
    mockFeatureInputCount: z.number().int().nonnegative(),
    mockLabelInputCount: z.number().int().nonnegative(),
    realScoreComputedCount: z.literal(0),
    realNonconformityScoreComputedCount: z.literal(0),
    realThresholdComputedCount: z.literal(0),
    alphaIntroducedCount: z.literal(0)
  }),
  boundarySummary: boundarySummarySchema,
  safety: offlineScoreSafetySchema,
  privacy: offlineScorePrivacySchema,
  claimBoundaries: offlineScoreClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type OfflineScoreInput = z.infer<typeof offlineScoreInputSchema>;
export type OfflineScoreInputSet = z.infer<typeof offlineScoreInputSetSchema>;
export type OfflineScoreBoundarySummary = OfflineScoreInput["boundarySummary"];

export const validateOfflineScoreInput = (input: unknown): OfflineScoreInput =>
  offlineScoreInputSchema.parse(input);

export const validateOfflineScoreInputs = (
  inputs: unknown[]
): OfflineScoreInput[] =>
  inputs
    .map(validateOfflineScoreInput)
    .sort((left, right) => left.scoreInputId.localeCompare(right.scoreInputId));

export const validateOfflineScoreInputSet = (
  inputSet: unknown
): OfflineScoreInputSet => offlineScoreInputSetSchema.parse(inputSet);

export const computeScoreFamilyCoverage = (
  inputs: OfflineScoreInput[]
): OfflineScoreInputSet["scoreFamilyCoverage"] => {
  const covered = new Set(
    inputs.flatMap((input) =>
      input.candidateScoreFamilies.map((family) => family.scoreFamilyId)
    )
  );

  return {
    requiredScoreFamilyCount: agentOfflineScoreFamilyValues.length,
    coveredScoreFamilyCount: covered.size,
    missingScoreFamilyCount:
      agentOfflineScoreFamilyValues.length - covered.size,
    scoreComputedCount: 0,
    nonconformityScoreComputedCount: 0,
    thresholdComputedCount: 0
  };
};

export const summarizeOfflineScoreInput = (
  input: OfflineScoreInput
): {
  scoreInputId: string;
  candidateScoreFamilyCount: number;
  mockFeatureInputCount: number;
  mockLabelInputCount: number;
  realScoreComputed: false;
  nonconformityScoreComputed: false;
  thresholdComputed: false;
  alphaIntroduced: false;
} => ({
  scoreInputId: input.scoreInputId,
  candidateScoreFamilyCount: input.candidateScoreFamilies.length,
  mockFeatureInputCount: input.mockFeatureInputs.length,
  mockLabelInputCount: input.mockLabelInputs.length,
  realScoreComputed: input.safety.computesRiskScores,
  nonconformityScoreComputed: input.safety.computesNonconformityScores,
  thresholdComputed: input.safety.computesThresholds,
  alphaIntroduced: input.safety.introducesAlpha
});

export const summarizeOfflineScoreInputSet = (
  inputSet: OfflineScoreInputSet
): {
  inputSetId: string;
  scoreInputCount: number;
  coveredScoreFamilyCount: number;
  missingScoreFamilyCount: number;
  realScoreComputedCount: 0;
  nonconformityScoreComputedCount: 0;
  thresholdComputedCount: 0;
} => ({
  inputSetId: inputSet.inputSetId,
  scoreInputCount: inputSet.scoreInputs.length,
  coveredScoreFamilyCount: inputSet.scoreFamilyCoverage.coveredScoreFamilyCount,
  missingScoreFamilyCount: inputSet.scoreFamilyCoverage.missingScoreFamilyCount,
  realScoreComputedCount: inputSet.scoreFamilyCoverage.scoreComputedCount,
  nonconformityScoreComputedCount:
    inputSet.scoreFamilyCoverage.nonconformityScoreComputedCount,
  thresholdComputedCount: inputSet.scoreFamilyCoverage.thresholdComputedCount
});

export const validateOfflineScoreRiskLossLinkage = (
  input: OfflineScoreInput,
  design: RiskLossDesign
): void => {
  if (input.linkedRiskLossDesign.designId !== design.designId) {
    throw new Error(
      "Offline score input references an unknown risk/loss design"
    );
  }

  const lossFamilies = new Set(
    design.candidateLossFamilies.map((loss) => loss.lossFamilyId)
  );
  const riskDimensions = new Set(
    design.candidateRiskDimensions.map((risk) => risk.riskDimensionId)
  );

  for (const family of input.linkedRiskLossDesign.linkedLossFamilies) {
    if (!lossFamilies.has(family)) {
      throw new Error(`Unknown linked loss family: ${family}`);
    }
  }

  for (const dimension of input.linkedRiskLossDesign.linkedRiskDimensions) {
    if (!riskDimensions.has(dimension)) {
      throw new Error(`Unknown linked risk dimension: ${dimension}`);
    }
  }
};

export const validateOfflineScoreBoundaries = (
  input: OfflineScoreInput | OfflineScoreInputSet
): void => {
  if (
    input.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    input.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    input.boundarySummary.claimBoundaryViolationCount !== 0 ||
    input.boundarySummary.scoringBoundaryViolationCount !== 0 ||
    input.boundarySummary.conformalBoundaryViolationCount !== 0 ||
    input.boundarySummary.numericComputationBoundaryViolationCount !== 0
  ) {
    throw new Error("Offline score input crosses a declared boundary");
  }
};

const forbiddenOfflineScorePatterns = [
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

export const offlineScoreInputContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenOfflineScorePatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
