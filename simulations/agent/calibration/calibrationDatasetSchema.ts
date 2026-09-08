import { z } from "zod";
import { normalizedDecisionCategoryValues } from "../adapters/codexActionAdapterSchema.js";
import { knownAgentSimulationUncertaintyDriverIds } from "../personaScenarioSchema.js";
import {
  agentTraceReviewAppropriatenessValues,
  agentTraceReviewBooleanCategoryValues,
  agentTraceReviewFutureLossLabelValues,
  agentTraceReviewFrictionJustificationValues,
  agentTraceReviewFrictionValues,
  agentTraceReviewQualityValues,
  agentTraceReviewUsefulnessValues
} from "../review/traceReviewSchema.js";
import {
  agentTraceActionCategoryValues,
  agentTraceFrictionCategoryValues,
  agentTraceOutcomeCategoryValues,
  agentTraceSafetyOutcomeCategoryValues,
  agentTraceTaskCompletedCategoryValues
} from "../traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentCalibrationRecordSchemaVersion =
  "agent-calibration-record.v1" as const;

export const agentCalibrationRecordSourceValues = [
  "synthetic_schema_example",
  "future_controlled_agent_trace",
  "future_real_trial_trace"
] as const;

export const agentCalibrationSourceArtifactKindValues = [
  "synthetic_review_record",
  "synthetic_trace_example",
  "synthetic_run",
  "synthetic_baseline_comparison",
  "synthetic_artifact_package",
  "future_controlled_reviewed_trace",
  "future_real_trial_reviewed_trace"
] as const;

export const agentCalibrationDecisionCategoryValues = [
  ...normalizedDecisionCategoryValues,
  "not_applicable"
] as const;

export const agentCalibrationRiskCategoryValues = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentCalibrationEvidenceBasisCategoryValues = [
  "synthetic_review_label",
  "synthetic_trace_example",
  "synthetic_run_metadata",
  "synthetic_baseline_comparison",
  "synthetic_artifact_package",
  "future_reviewed_trace_label",
  "insufficient_context_to_judge"
] as const;

export const agentCalibrationLabelSourceCategoryValues = [
  "synthetic_review_label",
  "future_human_review_label",
  "future_adjudicated_review_label"
] as const;

export const agentCalibrationObservedCategoryValues = [
  "synthetic_expected",
  "future_observed",
  "not_observed",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentCalibrationHumanReviewNeedCategoryValues = [
  "human_review_needed",
  "human_review_not_needed",
  "human_review_unclear",
  "not_applicable"
] as const;

export const agentCalibrationTaskProgressCategoryValues = [
  "safe_progress_expected",
  "guardrail_stop_expected",
  "human_review_expected",
  "uncertainty_reduction_expected",
  "friction_expected",
  "coverage_gap_expected",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentCalibrationCoverageCategoryValues = [
  "covered",
  "partially_covered",
  "not_covered",
  "insufficient_context_to_judge",
  "not_applicable"
] as const;

export const agentCalibrationFutureLossCandidateValues = [
  "candidate_positive",
  "candidate_negative",
  "candidate_unclear",
  "not_applicable"
] as const;

export const agentCalibrationFutureSplitCategoryValues = [
  "future_train",
  "future_calibration",
  "future_test",
  "future_holdout",
  "not_eligible"
] as const;

export const agentCalibrationSplitEligibilityValues = [
  "eligible_after_future_review",
  "not_eligible",
  "requires_adjudication",
  "requires_real_reviewed_trace",
  "synthetic_schema_example_only"
] as const;

export const agentCalibrationExclusionReasonCategoryValues = [
  "none",
  "synthetic_schema_example_only",
  "missing_required_review_label",
  "missing_source_artifact_linkage",
  "unresolved_adjudication",
  "safety_boundary_violation",
  "privacy_boundary_violation",
  "claim_boundary_violation",
  "pilot_abort_ineligible",
  "raw_or_private_data_present"
] as const;

export const agentCalibrationLeakageRiskCategoryValues = [
  "none",
  "low",
  "medium",
  "high",
  "insufficient_context_to_judge"
] as const;

export const agentCalibrationEligibilityCategoryValues = [
  "synthetic_schema_example_not_calibration_data",
  "future_candidate_requires_review",
  "future_candidate_requires_adjudication",
  "future_candidate_requires_privacy_review",
  "not_eligible"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const calibrationRecordIdSchema = z
  .string()
  .min(1)
  .regex(/^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const reviewIdSchema = z
  .string()
  .min(1)
  .regex(/^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const comparisonIdSchema = z
  .string()
  .min(1)
  .regex(/^baseline[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const artifactPackageIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

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

export const agentCalibrationRecordSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
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
  appliesCalibration: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const agentCalibrationRecordPrivacySchema = z.object({
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
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const agentCalibrationRecordClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

export const calibrationRecordSchema = z.object({
  schemaVersion: z.literal(agentCalibrationRecordSchemaVersion),
  calibrationRecordId: calibrationRecordIdSchema,
  source: z.enum(agentCalibrationRecordSourceValues),
  sourceArtifact: z.object({
    artifactKind: z.enum(agentCalibrationSourceArtifactKindValues),
    runId: runIdSchema.optional(),
    traceId: traceIdSchema.optional(),
    reviewId: reviewIdSchema.optional(),
    baselineComparisonId: comparisonIdSchema.optional(),
    artifactPackageId: artifactPackageIdSchema.optional(),
    personaId: personaIdSchema,
    scenarioId: scenarioIdSchema,
    fixtureRefs: z.array(fixtureRefSchema).min(1),
    adapterInputId: actionInputIdSchema.optional(),
    normalizedActionId: normalizedActionIdSchema.optional(),
    rawArtifactIncluded: z.literal(false)
  }),
  decisionContext: z.object({
    productionDecisionCategory: z.enum(agentCalibrationDecisionCategoryValues),
    advisoryDecisionCategory: z.enum(agentCalibrationDecisionCategoryValues),
    actionCategory: z.enum(agentTraceActionCategoryValues),
    riskCategory: z.enum(agentCalibrationRiskCategoryValues),
    uncertaintyDimensions: z.array(z.enum(uncertaintyDimensions)),
    evidenceBasisCategory: z.enum(agentCalibrationEvidenceBasisCategoryValues),
    decisionWasRuntimeActual: z.literal(false)
  }),
  reviewedDecisionLabels: z.object({
    productionDecisionAppropriateness: z.enum(
      agentTraceReviewAppropriatenessValues
    ),
    advisoryDecisionUsefulness: z.enum(agentTraceReviewUsefulnessValues),
    deferQualityCategory: z.enum(agentTraceReviewQualityValues),
    escalationQualityCategory: z.enum(agentTraceReviewQualityValues),
    blockQualityCategory: z.enum(agentTraceReviewQualityValues),
    humanReviewNeedCategory: z.enum(
      agentCalibrationHumanReviewNeedCategoryValues
    ),
    labelSourceCategory: z.enum(agentCalibrationLabelSourceCategoryValues),
    reviewedByHuman: z.literal(false)
  }),
  uncertaintyLabels: z.object({
    uncertaintyDimensionsPresent: z.array(z.enum(uncertaintyDimensions)),
    driverIds: z.array(z.enum(knownAgentSimulationUncertaintyDriverIds)),
    reductionStepKinds: z.array(z.enum(uncertaintyReductionStepKinds)),
    uncertaintyReductionExpected: z.enum(agentTraceReviewBooleanCategoryValues),
    uncertaintyReductionObservedCategory: z.enum(
      agentCalibrationObservedCategoryValues
    ),
    rawUncertaintyProfileIncluded: z.literal(false),
    rawReductionPlanIncluded: z.literal(false)
  }),
  agentBehaviorLabels: z.object({
    agentFollowedDecision: z.enum(agentTraceReviewBooleanCategoryValues),
    agentRecoveredAfterDefer: z.enum(agentTraceReviewBooleanCategoryValues),
    agentRepeatedUnsafeBehavior: z.enum(agentTraceReviewBooleanCategoryValues),
    agentGatheredMissingEvidence: z.enum(agentTraceReviewBooleanCategoryValues),
    agentStoppedAfterBlock: z.enum(agentTraceReviewBooleanCategoryValues),
    agentChangedPlanAppropriately: z.enum(
      agentTraceReviewBooleanCategoryValues
    ),
    agentBehaviorObserved: z.literal(false),
    rawAgentOutputIncluded: z.literal(false)
  }),
  outcomeLabels: z.object({
    safetyOutcomeCategory: z.enum(agentTraceSafetyOutcomeCategoryValues),
    taskProgressCategory: z.enum(agentCalibrationTaskProgressCategoryValues),
    taskCompletionCategory: z.enum(agentTraceTaskCompletedCategoryValues),
    reviewConfidenceCategory: z.enum(agentTraceOutcomeCategoryValues),
    realOutcomeObserved: z.literal(false)
  }),
  frictionLabels: z.object({
    frictionCategory: z.enum(agentTraceReviewFrictionValues),
    frictionJustifiedCategory: z.enum(
      agentTraceReviewFrictionJustificationValues
    ),
    productivityImpactCategory: z.enum(agentTraceFrictionCategoryValues),
    developerFrictionObserved: z.literal(false)
  }),
  coverageLabels: z.object({
    coveredByPolicyOnly: z.enum(agentCalibrationCoverageCategoryValues),
    coveredByDeterministicCodingActionGate: z.enum(
      agentCalibrationCoverageCategoryValues
    ),
    coveredByAdvisoryUq: z.enum(agentCalibrationCoverageCategoryValues),
    missingCoverageCategories: z.array(categoryIdSchema),
    requiresFutureScenario: z.enum(agentTraceReviewBooleanCategoryValues),
    requiresFutureTrace: z.enum(agentTraceReviewBooleanCategoryValues),
    requiresFutureRuntimeChange: z.enum(agentTraceReviewBooleanCategoryValues),
    coverageGapObservedInRealUse: z.literal(false)
  }),
  futureLossLabels: z.object({
    unsafeProceedLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    unnecessaryDeferLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    unnecessaryEscalateLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    incorrectBlockLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    missedUncertaintyReductionLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    agentRecoveryFailureLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    excessiveFrictionLossCandidate: z.enum(
      agentCalibrationFutureLossCandidateValues
    ),
    coverageGapLossCandidate: z.enum(agentCalibrationFutureLossCandidateValues),
    futureLossLabelCategories: z.array(
      z.enum(agentTraceReviewFutureLossLabelValues)
    ),
    lossFieldsPresent: z.literal(false),
    lossValuesComputed: z.literal(false)
  }),
  splitEligibility: z.object({
    eligibleForFutureSplit: z.enum(agentCalibrationSplitEligibilityValues),
    allowedFutureSplitCategories: z.array(
      z.enum(agentCalibrationFutureSplitCategoryValues)
    ),
    exclusionReasonCategory: z.enum(
      agentCalibrationExclusionReasonCategoryValues
    ),
    leakageRiskCategory: z.enum(agentCalibrationLeakageRiskCategoryValues),
    splitAssigned: z.literal(false)
  }),
  calibrationEligibility: z.object({
    eligibleForFutureCalibration: z.enum(agentTraceReviewBooleanCategoryValues),
    eligibilityCategory: z.enum(agentCalibrationEligibilityCategoryValues),
    requiredAdditionalEvidence: z.array(categoryIdSchema),
    requiredAdditionalLabels: z.array(categoryIdSchema),
    adjudicationRequired: z.enum(agentTraceReviewBooleanCategoryValues),
    calibrationDatasetCreated: z.literal(false),
    calibrationApplied: z.literal(false),
    conformalUsed: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false),
    suitableForCalibrationAsIs: z.literal(false)
  }),
  safety: agentCalibrationRecordSafetySchema,
  privacy: agentCalibrationRecordPrivacySchema,
  claimBoundaries: agentCalibrationRecordClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;

export interface CalibrationSchemaReadinessSummary {
  totalRecords: number;
  syntheticSchemaExampleCount: number;
  futureCalibrationEligibleAsIsCount: 0;
  splitAssignedCount: 0;
  lossFieldsPresentCount: 0;
  lossValuesComputedCount: 0;
  calibrationDatasetCreatedCount: 0;
  calibrationAppliedCount: 0;
  conformalUsedCount: 0;
  statisticalGuaranteeClaimedCount: 0;
  safetyBoundaryViolationCount: 0;
  privacyBoundaryViolationCount: 0;
  claimBoundaryViolationCount: 0;
}

export const validateCalibrationRecord = (record: unknown): CalibrationRecord =>
  calibrationRecordSchema.parse(record);

export const validateCalibrationRecords = (
  records: unknown[]
): CalibrationRecord[] =>
  records
    .map(validateCalibrationRecord)
    .sort((left, right) =>
      left.calibrationRecordId.localeCompare(right.calibrationRecordId)
    );

export const summarizeCalibrationRecord = (
  record: CalibrationRecord
): {
  calibrationRecordId: string;
  source: CalibrationRecord["source"];
  reviewId?: string;
  traceId?: string;
  productionDecisionCategory: CalibrationRecord["decisionContext"]["productionDecisionCategory"];
  eligibilityCategory: CalibrationRecord["calibrationEligibility"]["eligibilityCategory"];
} => {
  const summary = {
    calibrationRecordId: record.calibrationRecordId,
    source: record.source,
    productionDecisionCategory:
      record.decisionContext.productionDecisionCategory,
    eligibilityCategory: record.calibrationEligibility.eligibilityCategory
  } as {
    calibrationRecordId: string;
    source: CalibrationRecord["source"];
    reviewId?: string;
    traceId?: string;
    productionDecisionCategory: CalibrationRecord["decisionContext"]["productionDecisionCategory"];
    eligibilityCategory: CalibrationRecord["calibrationEligibility"]["eligibilityCategory"];
  };

  if (record.sourceArtifact.reviewId !== undefined) {
    summary.reviewId = record.sourceArtifact.reviewId;
  }

  if (record.sourceArtifact.traceId !== undefined) {
    summary.traceId = record.sourceArtifact.traceId;
  }

  return summary;
};

export const summarizeCalibrationRecords = (
  records: CalibrationRecord[]
): ReturnType<typeof summarizeCalibrationRecord>[] =>
  records.map(summarizeCalibrationRecord);

export const computeCalibrationSchemaReadinessSummary = (
  records: CalibrationRecord[]
): CalibrationSchemaReadinessSummary => ({
  totalRecords: records.length,
  syntheticSchemaExampleCount: records.filter(
    (record) => record.source === "synthetic_schema_example"
  ).length,
  futureCalibrationEligibleAsIsCount: 0,
  splitAssignedCount: 0,
  lossFieldsPresentCount: 0,
  lossValuesComputedCount: 0,
  calibrationDatasetCreatedCount: 0,
  calibrationAppliedCount: 0,
  conformalUsedCount: 0,
  statisticalGuaranteeClaimedCount: 0,
  safetyBoundaryViolationCount: 0,
  privacyBoundaryViolationCount: 0,
  claimBoundaryViolationCount: 0
});

export interface CalibrationSourceArtifactLinkageContext {
  reviewIds: Set<string>;
  traceIds: Set<string>;
  runIds: Set<string>;
  baselineComparisonIds: Set<string>;
  artifactPackageIds: Set<string>;
  personaIds: Set<string>;
  scenarioIds: Set<string>;
  fixtureRefs: Set<string>;
  adapterInputIds: Set<string>;
}

export const validateCalibrationSourceArtifactLinkage = (
  record: CalibrationRecord,
  context: CalibrationSourceArtifactLinkageContext
): void => {
  const artifact = record.sourceArtifact;

  if (
    artifact.reviewId !== undefined &&
    !context.reviewIds.has(artifact.reviewId)
  ) {
    throw new Error(`Missing reviewId: ${artifact.reviewId}`);
  }

  if (
    artifact.traceId !== undefined &&
    !context.traceIds.has(artifact.traceId)
  ) {
    throw new Error(`Missing traceId: ${artifact.traceId}`);
  }

  if (artifact.runId !== undefined && !context.runIds.has(artifact.runId)) {
    throw new Error(`Missing runId: ${artifact.runId}`);
  }

  if (
    artifact.baselineComparisonId !== undefined &&
    !context.baselineComparisonIds.has(artifact.baselineComparisonId)
  ) {
    throw new Error(
      `Missing baselineComparisonId: ${artifact.baselineComparisonId}`
    );
  }

  if (
    artifact.artifactPackageId !== undefined &&
    !context.artifactPackageIds.has(artifact.artifactPackageId)
  ) {
    throw new Error(`Missing artifactPackageId: ${artifact.artifactPackageId}`);
  }

  if (!context.personaIds.has(artifact.personaId)) {
    throw new Error(`Missing personaId: ${artifact.personaId}`);
  }

  if (!context.scenarioIds.has(artifact.scenarioId)) {
    throw new Error(`Missing scenarioId: ${artifact.scenarioId}`);
  }

  for (const fixtureRef of artifact.fixtureRefs) {
    if (!context.fixtureRefs.has(fixtureRef)) {
      throw new Error(`Missing fixtureRef: ${fixtureRef}`);
    }
  }

  if (
    artifact.adapterInputId !== undefined &&
    !context.adapterInputIds.has(artifact.adapterInputId)
  ) {
    throw new Error(`Missing adapterInputId: ${artifact.adapterInputId}`);
  }

  if (artifact.rawArtifactIncluded !== false) {
    throw new Error(`Raw artifact included: ${record.calibrationRecordId}`);
  }
};

const forbiddenCalibrationPatterns = [
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

export const calibrationRecordContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenCalibrationPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};

export const validateCalibrationRecordSafety = (
  record: CalibrationRecord
): void => {
  if (calibrationRecordContainsForbiddenRawString(record)) {
    throw new Error(
      `Calibration record contains forbidden raw-looking value: ${record.calibrationRecordId}`
    );
  }
};
