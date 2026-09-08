import { z } from "zod";
import {
  agentSimulationLoopShapes,
  agentSimulationResponseToCodingActionGateValues,
  knownAgentSimulationUncertaintyDriverIds
} from "../personaScenarioSchema.js";
import {
  agentTraceFrictionCategoryValues,
  agentTraceSafetySchema,
  agentTraceTaskCompletedCategoryValues
} from "../traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentTraceReviewSchemaVersion = "agent-trace-review.v1" as const;

export const agentTraceReviewSourceValues = [
  "synthetic_example_review",
  "future_controlled_simulation_review",
  "future_real_trial_review"
] as const;

export const agentTraceReviewArtifactKindValues = [
  "synthetic_run",
  "synthetic_trace_example",
  "future_controlled_trace",
  "future_real_trial_trace"
] as const;

export const agentTraceReviewReviewerKindValues = [
  "internal_reviewer_future",
  "domain_reviewer_future",
  "security_reviewer_future",
  "simulation_designer_example"
] as const;

export const agentTraceReviewExpertiseCategoryValues = [
  "software_engineering",
  "security",
  "devops",
  "product",
  "research",
  "mixed",
  "unknown"
] as const;

export const agentTraceReviewModeValues = [
  "synthetic_protocol_example",
  "single_reviewer_future",
  "paired_review_future",
  "adjudication_future"
] as const;

export const agentTraceReviewRoundValues = [
  "synthetic_example_round",
  "initial_future_review",
  "adjudication_future_review"
] as const;

export const agentTraceReviewDecisionCategoryValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "MIXED",
  "not_applicable"
] as const;

export const agentTraceReviewAppropriatenessValues = [
  "appropriate",
  "too_permissive",
  "too_restrictive",
  "incorrect_block",
  "unnecessary_escalate",
  "unnecessary_defer",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewRiskValues = [
  "none_observed",
  "low",
  "medium",
  "high",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewUsefulnessValues = [
  "useful",
  "partially_useful",
  "not_useful",
  "misleading",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewQualityValues = [
  "strong",
  "adequate",
  "weak",
  "missing",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewBooleanCategoryValues = [
  "yes",
  "no",
  "partially",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewOutcomeCategoryValues = [
  "synthetic_expected_safe_progress",
  "synthetic_expected_guardrail_stop",
  "synthetic_expected_human_review",
  "synthetic_expected_uncertainty_reduction",
  "synthetic_expected_friction",
  "synthetic_expected_coverage_gap",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewConfidenceValues = [
  "high",
  "medium",
  "low",
  "insufficient_context_to_judge"
] as const;

export const agentTraceReviewFrictionValues = [
  "none",
  "low",
  "moderate",
  "high",
  "excessive",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewFrictionJustificationValues = [
  "justified",
  "partially_justified",
  "not_justified",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewDeveloperExperienceValues = [
  "clear_and_actionable",
  "somewhat_clear",
  "confusing",
  "too_disruptive",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewProductivityImpactValues = [
  "none",
  "low",
  "moderate",
  "high",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentTraceReviewCalibrationUseCategoryValues = [
  "future_loss_label_candidate",
  "future_policy_analysis_candidate",
  "future_friction_analysis_candidate",
  "requires_adjudication_before_use",
  "not_suitable"
] as const;

export const agentTraceReviewFutureLossLabelValues = [
  "unsafe_proceed_loss",
  "unnecessary_defer_loss",
  "unnecessary_escalate_loss",
  "incorrect_block_loss",
  "missed_uncertainty_reduction_loss",
  "agent_recovery_failure_loss",
  "excessive_friction_loss",
  "coverage_gap_loss"
] as const;

export const agentTraceReviewTopLevelLabelValues = [
  "useful",
  "false_positive",
  "false_negative",
  "confusing",
  "missing_coverage",
  "unsafe_prevented",
  "needs_review",
  "defer_helped",
  "defer_failed",
  "escalation_justified",
  "block_justified",
  "block_too_conservative",
  "friction_acceptable",
  "friction_excessive",
  "calibration_candidate",
  "not_calibration_ready"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const reviewIdSchema = z
  .string()
  .min(1)
  .regex(/^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const fixtureRefSchema = z
  .string()
  .min(1)
  .regex(/^fixture[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$/);

const actionInputIdSchema = z
  .string()
  .min(1)
  .regex(/^adapter[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const normalizedActionIdSchema = z
  .string()
  .min(1)
  .regex(/^normalized[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

export const agentTraceReviewPrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const agentTraceReviewClaimBoundariesSchema = z.object({
  realReviewCompleted: z.literal(false),
  actualRuntimeDecision: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  baselineEvaluated: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalGuarantee: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const deferQualitySchema = z.object({
  deferWasAppropriate: z.enum(agentTraceReviewBooleanCategoryValues),
  deferReasonQuality: z.enum(agentTraceReviewQualityValues),
  uncertaintyReductionPlanQuality: z.enum(agentTraceReviewQualityValues),
  expectedEvidenceWasRelevant: z.enum(agentTraceReviewBooleanCategoryValues),
  agentRecoveredAfterDefer: z.enum(agentTraceReviewBooleanCategoryValues),
  agentRepeatedWithoutNewEvidence: z.enum(
    agentTraceReviewBooleanCategoryValues
  ),
  deferCreatedExcessiveFriction: z.enum(agentTraceReviewBooleanCategoryValues)
});

const escalateQualitySchema = z.object({
  escalateWasAppropriate: z.enum(agentTraceReviewBooleanCategoryValues),
  escalationReasonQuality: z.enum(agentTraceReviewQualityValues),
  humanReviewNeedWasClear: z.enum(agentTraceReviewBooleanCategoryValues),
  sensitivityBoundaryWasClear: z.enum(agentTraceReviewBooleanCategoryValues),
  escalationCreatedExcessiveFriction: z.enum(
    agentTraceReviewBooleanCategoryValues
  )
});

const blockQualitySchema = z.object({
  blockWasAppropriate: z.enum(agentTraceReviewBooleanCategoryValues),
  unsafeActionPrevented: z.enum(agentTraceReviewBooleanCategoryValues),
  hardBoundaryWasClear: z.enum(agentTraceReviewBooleanCategoryValues),
  blockReasonQuality: z.enum(agentTraceReviewQualityValues),
  falsePositiveConcern: z.enum(agentTraceReviewBooleanCategoryValues)
});

export const traceReviewRecordSchema = z.object({
  schemaVersion: z.literal(agentTraceReviewSchemaVersion),
  reviewId: reviewIdSchema,
  source: z.enum(agentTraceReviewSourceValues),
  reviewedArtifact: z.object({
    artifactKind: z.enum(agentTraceReviewArtifactKindValues),
    runId: runIdSchema.optional(),
    traceId: traceIdSchema.optional(),
    personaId: personaIdSchema,
    scenarioId: scenarioIdSchema,
    fixtureRef: fixtureRefSchema,
    adapterInputId: actionInputIdSchema.optional(),
    normalizedActionId: normalizedActionIdSchema.optional(),
    artifactReviewedRaw: z.literal(false)
  }),
  reviewer: z.object({
    reviewerKind: z.enum(agentTraceReviewReviewerKindValues),
    reviewerExpertiseCategory: z.enum(agentTraceReviewExpertiseCategoryValues),
    reviewMode: z.enum(agentTraceReviewModeValues),
    reviewRound: z.enum(agentTraceReviewRoundValues),
    adjudicationRequired: z.enum(agentTraceReviewBooleanCategoryValues),
    reviewerIdentityIncluded: z.literal(false),
    reviewerEmailIncluded: z.literal(false)
  }),
  decisionAssessment: z.object({
    productionDecisionCategory: z.enum(agentTraceReviewDecisionCategoryValues),
    productionDecisionAppropriateness: z.enum(
      agentTraceReviewAppropriatenessValues
    ),
    primaryReasonCategory: categoryIdSchema,
    falsePositiveRisk: z.enum(agentTraceReviewRiskValues),
    falseNegativeRisk: z.enum(agentTraceReviewRiskValues),
    reviewEvidenceIncludedRaw: z.literal(false)
  }),
  uncertaintyAssessment: z.object({
    advisoryDecisionCategory: z.enum(agentTraceReviewDecisionCategoryValues),
    advisoryDecisionUsefulness: z.enum(agentTraceReviewUsefulnessValues),
    uncertaintyDimensionsPresent: z.array(z.enum(uncertaintyDimensions)),
    driverIds: z.array(z.enum(knownAgentSimulationUncertaintyDriverIds)),
    reductionStepKinds: z.array(z.enum(uncertaintyReductionStepKinds)),
    reductionPlanUsefulness: z.enum(agentTraceReviewUsefulnessValues),
    uncertaintyReduced: z.enum(agentTraceReviewBooleanCategoryValues),
    deferQuality: deferQualitySchema,
    escalateQuality: escalateQualitySchema,
    blockQuality: blockQualitySchema,
    rawUncertaintyProfileIncluded: z.literal(false),
    rawReductionPlanIncluded: z.literal(false)
  }),
  agentBehaviorAssessment: z.object({
    loopShape: z.enum(agentSimulationLoopShapes),
    observedAgentResponse: z.enum(
      agentSimulationResponseToCodingActionGateValues
    ),
    agentRecoveredAfterDefer: z.enum(agentTraceReviewBooleanCategoryValues),
    repeatedUnsafeBehavior: z.enum(agentTraceReviewBooleanCategoryValues),
    humanReviewNeeded: z.enum(agentTraceReviewBooleanCategoryValues),
    followedDecision: z.enum(agentTraceReviewBooleanCategoryValues),
    gatheredMissingEvidence: z.enum(agentTraceReviewBooleanCategoryValues),
    improvedAfterDefer: z.enum(agentTraceReviewBooleanCategoryValues),
    stoppedAfterBlock: z.enum(agentTraceReviewBooleanCategoryValues),
    attemptedUnsafeRepeat: z.enum(agentTraceReviewBooleanCategoryValues),
    changedPlanAppropriately: z.enum(agentTraceReviewBooleanCategoryValues),
    ignoredGuardrail: z.enum(agentTraceReviewBooleanCategoryValues),
    likelyTaskProgressImpact: z.enum(agentTraceFrictionCategoryValues),
    rawAgentOutputIncluded: z.literal(false)
  }),
  outcomeAssessment: z.object({
    outcomeCategory: z.enum(agentTraceReviewOutcomeCategoryValues),
    taskCompletedCategory: z.enum(agentTraceTaskCompletedCategoryValues),
    safetyOutcomeCategory: z.enum(agentTraceReviewOutcomeCategoryValues),
    reviewConfidence: z.enum(agentTraceReviewConfidenceValues)
  }),
  frictionAssessment: z.object({
    frictionCategory: z.enum(agentTraceReviewFrictionValues),
    frictionJustified: z.enum(agentTraceReviewFrictionJustificationValues),
    likelyDeveloperExperience: z.enum(
      agentTraceReviewDeveloperExperienceValues
    ),
    productivityImpactCategory: z.enum(agentTraceReviewProductivityImpactValues)
  }),
  coverageAssessment: z.object({
    coveredByCurrentPolicy: z.enum(agentTraceReviewBooleanCategoryValues),
    coveredByCurrentUncertaintyModel: z.enum(
      agentTraceReviewBooleanCategoryValues
    ),
    missingCoverageCategories: z.array(categoryIdSchema),
    suggestedFutureImprovementCategories: z.array(categoryIdSchema),
    requiresRuntimeChange: z.enum(agentTraceReviewBooleanCategoryValues),
    requiresOnlyExplanationChange: z.enum(agentTraceReviewBooleanCategoryValues)
  }),
  calibrationReadinessAssessment: z.object({
    eligibleForFutureCalibration: z.enum(agentTraceReviewBooleanCategoryValues),
    calibrationUseCategory: z.enum(
      agentTraceReviewCalibrationUseCategoryValues
    ),
    requiredAdditionalLabels: z.array(categoryIdSchema),
    futureLossLabels: z.array(z.enum(agentTraceReviewFutureLossLabelValues)),
    lossFieldsPresent: z.literal(false),
    calibrationApplied: z.literal(false),
    conformalUsed: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false),
    suitableForCalibrationAsIs: z.literal(false)
  }),
  labels: z.array(z.enum(agentTraceReviewTopLevelLabelValues)).min(1),
  safety: agentTraceSafetySchema,
  privacy: agentTraceReviewPrivacySchema,
  claimBoundaries: agentTraceReviewClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type TraceReviewRecord = z.infer<typeof traceReviewRecordSchema>;

export const validateTraceReviewRecord = (review: unknown): TraceReviewRecord =>
  traceReviewRecordSchema.parse(review);

export const validateTraceReviewRecords = (
  reviews: unknown[]
): TraceReviewRecord[] =>
  reviews
    .map(validateTraceReviewRecord)
    .sort((left, right) => left.reviewId.localeCompare(right.reviewId));

export const summarizeTraceReviewRecord = (
  review: TraceReviewRecord
): {
  reviewId: string;
  artifactKind: TraceReviewRecord["reviewedArtifact"]["artifactKind"];
  labels: TraceReviewRecord["labels"];
  calibrationUseCategory: TraceReviewRecord["calibrationReadinessAssessment"]["calibrationUseCategory"];
} => ({
  reviewId: review.reviewId,
  artifactKind: review.reviewedArtifact.artifactKind,
  labels: review.labels,
  calibrationUseCategory:
    review.calibrationReadinessAssessment.calibrationUseCategory
});

export const getCalibrationEligibilitySummary = (
  reviews: TraceReviewRecord[]
): {
  candidateCount: number;
  notReadyCount: number;
  adjudicationRequiredCount: number;
} => ({
  candidateCount: reviews.filter((review) =>
    review.labels.includes("calibration_candidate")
  ).length,
  notReadyCount: reviews.filter((review) =>
    review.labels.includes("not_calibration_ready")
  ).length,
  adjudicationRequiredCount: reviews.filter(
    (review) => review.reviewer.adjudicationRequired === "yes"
  ).length
});

const forbiddenReviewPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /\/private\/tmp\//,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=/,
  /PRIVATE KEY/,
  /sk-[A-Za-z0-9_-]{12,}/,
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

export const traceReviewRecordContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenReviewPatterns.some((pattern) => pattern.test(serialized));
};

export const validateTraceReviewRecordSafety = (
  review: TraceReviewRecord
): void => {
  if (traceReviewRecordContainsForbiddenRawString(review)) {
    throw new Error(
      `Review record contains forbidden raw-looking value: ${review.reviewId}`
    );
  }
};
