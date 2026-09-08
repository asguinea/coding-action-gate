import { z } from "zod";
import { knownAgentSimulationUncertaintyDriverIds } from "../personaScenarioSchema.js";
import { agentTraceReviewTopLevelLabelValues } from "../review/traceReviewSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentBaselineComparisonSchemaVersion =
  "agent-baseline-comparison.v1" as const;

export const agentBaselineComparisonStrategyValues = [
  "no_guard",
  "policy_only_guard",
  "deterministic_codingactiongate",
  "codingactiongate_with_advisory_uq"
] as const;

export const agentBaselineComparisonSourceValues = [
  "synthetic_example_comparison",
  "future_controlled_simulation_comparison",
  "future_real_trial_comparison"
] as const;

export const agentBaselineComparisonArtifactKindValues = [
  "synthetic_run",
  "synthetic_reviewed_run",
  "synthetic_trace_example",
  "future_controlled_trace",
  "future_real_trial_trace"
] as const;

export const baselineSyntheticDecisionCategoryValues = [
  "proceed",
  "defer",
  "escalate",
  "block",
  "not_applicable",
  "insufficient_context_to_judge"
] as const;

export const baselineSyntheticOutcomeCategoryValues = [
  "unsafe_action_possible",
  "task_may_continue",
  "defer_guides_recovery",
  "escalation_required",
  "hard_block_expected",
  "unnecessary_interruption_possible",
  "needs_empirical_trace",
  "uncertainty_reduction_expected",
  "review_required",
  "coverage_gap_expected"
] as const;

export const baselineRiskCategoryValues = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
  "unknown"
] as const;

export const baselineFrictionCategoryValues = [
  "none",
  "low",
  "moderate",
  "high",
  "excessive",
  "not_applicable",
  "unknown"
] as const;

export const baselineEvidenceBasisCategoryValues = [
  "synthetic_run_metadata",
  "synthetic_review_label",
  "scenario_expectation",
  "fixture_metadata",
  "adapter_mapping_metadata",
  "category_only_counterfactual"
] as const;

export const baselineUsefulnessCategoryValues = [
  "useful",
  "partially_useful",
  "not_useful",
  "not_primary_differentiator",
  "not_applicable",
  "insufficient_context_to_judge"
] as const;

export const baselineBooleanCategoryValues = [
  "yes",
  "no",
  "partially",
  "not_applicable",
  "insufficient_context_to_judge"
] as const;

export const baselineDecisionDifferenceCategoryValues = [
  "no_difference",
  "policy_misses_uncertainty",
  "policy_misses_context_gap",
  "policy_misses_freshness_gap",
  "codingactiongate_defers_for_missing_evidence",
  "codingactiongate_escalates_sensitive_action",
  "codingactiongate_blocks_hard_boundary",
  "advisory_uq_adds_explanation",
  "advisory_uq_adds_reduction_guidance",
  "insufficient_context_to_judge"
] as const;

export const baselineUncertaintyComparisonCategoryValues = [
  "not_relevant",
  "policy_misses_uncertainty",
  "deterministic_captures_routing",
  "advisory_adds_metadata",
  "advisory_adds_reduction_guidance",
  "insufficient_context_to_judge"
] as const;

export const baselineSafetyDeltaCategoryValues = [
  "no_delta_expected",
  "unsafe_proceed_possible_without_guard",
  "hard_boundary_prevented",
  "premature_action_prevented",
  "sensitive_review_routing_expected",
  "insufficient_context_to_judge"
] as const;

export const baselineFrictionTradeoffCategoryValues = [
  "no_guard_low_friction_higher_risk",
  "policy_low_friction_misses_uncertainty",
  "defer_friction_justified",
  "escalation_friction_justified",
  "block_friction_justified",
  "possible_excessive_friction",
  "insufficient_context_to_judge"
] as const;

export const baselineCoverageNeedCategoryValues = [
  "none",
  "future_scenario_needed",
  "future_trace_needed",
  "future_label_needed",
  "future_runtime_investigation_needed",
  "future_explanation_improvement_needed"
] as const;

export const baselineReviewUseUnavailableReasonValues = [
  "no_review_link_required",
  "review_not_available_for_synthetic_example",
  "review_link_future_work",
  "review_linked"
] as const;

export const baselineMetricCategoryValues = [
  "yes",
  "no",
  "partially",
  "not_applicable",
  "needs_empirical_trace"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const comparisonIdSchema = z
  .string()
  .min(1)
  .regex(/^baseline[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const reviewIdSchema = z
  .string()
  .min(1)
  .regex(/^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

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

const strategyOutcomeSchema = z.object({
  strategyKind: z.enum(agentBaselineComparisonStrategyValues),
  syntheticDecisionCategory: z.enum(baselineSyntheticDecisionCategoryValues),
  syntheticOutcomeCategory: z.enum(baselineSyntheticOutcomeCategoryValues),
  expectedRiskCategory: z.enum(baselineRiskCategoryValues),
  expectedFrictionCategory: z.enum(baselineFrictionCategoryValues),
  evidenceBasisCategory: z.enum(baselineEvidenceBasisCategoryValues)
});

const advisoryStrategyOutcomeSchema = strategyOutcomeSchema.extend({
  advisoryOnly: z.literal(true),
  authoritative: z.literal(false),
  advisoryUncertaintyUsefulness: z.enum(baselineUsefulnessCategoryValues),
  reductionGuidanceUsefulness: z.enum(baselineUsefulnessCategoryValues)
});

export const agentBaselineComparisonSafetySchema = z.object({
  inert: z.literal(true),
  executesAgent: z.literal(false),
  executesCommands: z.literal(false),
  executesPackageScripts: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false),
  touchesRealSecrets: z.literal(false),
  usesRealRepo: z.literal(false),
  containsPrivateData: z.literal(false),
  containsExecutableAction: z.literal(false),
  changesRuntimeBehavior: z.literal(false)
});

export const agentBaselineComparisonPrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const agentBaselineComparisonClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realBaselineEvaluation: z.literal(false),
  realReviewCompleted: z.literal(false),
  actualRuntimeDecision: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

export const baselineComparisonRecordSchema = z.object({
  schemaVersion: z.literal(agentBaselineComparisonSchemaVersion),
  comparisonId: comparisonIdSchema,
  source: z.enum(agentBaselineComparisonSourceValues),
  comparedArtifact: z.object({
    artifactKind: z.enum(agentBaselineComparisonArtifactKindValues),
    runId: runIdSchema.optional(),
    reviewId: reviewIdSchema.optional(),
    traceId: traceIdSchema.optional(),
    personaId: personaIdSchema,
    scenarioId: scenarioIdSchema,
    fixtureRefs: z.array(fixtureRefSchema).min(1),
    adapterInputId: actionInputIdSchema.optional(),
    normalizedActionId: normalizedActionIdSchema.optional(),
    artifactReviewedRaw: z.literal(false)
  }),
  strategies: z.object({
    no_guard: strategyOutcomeSchema.extend({
      strategyKind: z.literal("no_guard")
    }),
    policy_only_guard: strategyOutcomeSchema.extend({
      strategyKind: z.literal("policy_only_guard")
    }),
    deterministic_codingactiongate: strategyOutcomeSchema.extend({
      strategyKind: z.literal("deterministic_codingactiongate")
    }),
    codingactiongate_with_advisory_uq: advisoryStrategyOutcomeSchema.extend({
      strategyKind: z.literal("codingactiongate_with_advisory_uq")
    })
  }),
  decisionComparison: z.object({
    noGuardWouldProceed: z.enum(baselineBooleanCategoryValues),
    policyOnlyWouldIntervene: z.enum(baselineBooleanCategoryValues),
    deterministicCodingActionGateDecision: z.enum(
      baselineSyntheticDecisionCategoryValues
    ),
    advisoryUqDecision: z.enum(baselineSyntheticDecisionCategoryValues),
    policyOnlyMissedUncertainty: z.enum(baselineBooleanCategoryValues),
    deferAddedValue: z.enum(baselineBooleanCategoryValues),
    escalationAddedValue: z.enum(baselineBooleanCategoryValues),
    blockAddedValue: z.enum(baselineBooleanCategoryValues),
    decisionDifferenceCategory: z.enum(baselineDecisionDifferenceCategoryValues)
  }),
  uncertaintyComparison: z.object({
    uncertaintyDimensionsRelevant: z.array(z.enum(uncertaintyDimensions)),
    uncertaintyDriversRelevant: z.array(
      z.enum(knownAgentSimulationUncertaintyDriverIds)
    ),
    reductionStepsRelevant: z.array(z.enum(uncertaintyReductionStepKinds)),
    policyOnlyCapturesUncertainty: z.enum(baselineBooleanCategoryValues),
    deterministicCodingActionGateCapturesUncertainty: z.enum(
      baselineBooleanCategoryValues
    ),
    advisoryUqAddsUsefulMetadata: z.enum(baselineBooleanCategoryValues),
    uncertaintyReductionExpected: z.enum(baselineBooleanCategoryValues),
    uncertaintyComparisonCategory: z.enum(
      baselineUncertaintyComparisonCategoryValues
    ),
    rawUncertaintyProfileIncluded: z.literal(false),
    rawReductionPlanIncluded: z.literal(false)
  }),
  safetyComparison: z.object({
    unsafeProceedRiskNoGuard: z.enum(baselineRiskCategoryValues),
    unsafeProceedRiskPolicyOnly: z.enum(baselineRiskCategoryValues),
    unsafeProceedRiskDeterministicCodingActionGate: z.enum(
      baselineRiskCategoryValues
    ),
    unsafeProceedRiskAdvisoryUq: z.enum(baselineRiskCategoryValues),
    unsafePreventedByCodingActionGate: z.enum(baselineBooleanCategoryValues),
    hardBoundaryCaptured: z.enum(baselineBooleanCategoryValues),
    prematureActionPrevented: z.enum(baselineBooleanCategoryValues),
    sensitiveActionRoutedToReview: z.enum(baselineBooleanCategoryValues),
    safetyDeltaCategory: z.enum(baselineSafetyDeltaCategoryValues)
  }),
  frictionComparison: z.object({
    noGuardFriction: z.enum(baselineFrictionCategoryValues),
    policyOnlyFriction: z.enum(baselineFrictionCategoryValues),
    deterministicCodingActionGateFriction: z.enum(
      baselineFrictionCategoryValues
    ),
    advisoryUqFriction: z.enum(baselineFrictionCategoryValues),
    deferFrictionCategory: z.enum(baselineFrictionCategoryValues),
    escalateFrictionCategory: z.enum(baselineFrictionCategoryValues),
    frictionJustifiedCategory: z.enum(baselineBooleanCategoryValues),
    productivityImpactCategory: z.enum(baselineFrictionCategoryValues),
    frictionTradeoffCategory: z.enum(baselineFrictionTradeoffCategoryValues)
  }),
  coverageComparison: z.object({
    coveredByPolicyOnly: z.enum(baselineBooleanCategoryValues),
    coveredByDeterministicCodingActionGate: z.enum(
      baselineBooleanCategoryValues
    ),
    coveredByAdvisoryUq: z.enum(baselineBooleanCategoryValues),
    missingCoverageCategories: z.array(categoryIdSchema),
    futureCoverageNeed: z.enum(baselineCoverageNeedCategoryValues),
    requiresFutureScenario: z.enum(baselineBooleanCategoryValues),
    requiresFutureTraceExample: z.enum(baselineBooleanCategoryValues),
    requiresFutureCalibrationLabel: z.enum(baselineBooleanCategoryValues),
    requiresRuntimeChange: z.enum(baselineBooleanCategoryValues)
  }),
  reviewLabelUse: z.object({
    linkedReviewId: reviewIdSchema.optional(),
    labelsUsed: z.array(z.enum(agentTraceReviewTopLevelLabelValues)),
    decisionAssessmentUsed: z.enum(baselineBooleanCategoryValues),
    uncertaintyAssessmentUsed: z.enum(baselineBooleanCategoryValues),
    agentBehaviorAssessmentUsed: z.enum(baselineBooleanCategoryValues),
    frictionAssessmentUsed: z.enum(baselineBooleanCategoryValues),
    coverageAssessmentUsed: z.enum(baselineBooleanCategoryValues),
    calibrationReadinessUsed: z.enum(baselineBooleanCategoryValues),
    unavailableReason: z.enum(baselineReviewUseUnavailableReasonValues),
    rawReviewIncluded: z.literal(false)
  }),
  metrics: z.object({
    strategiesComparedCount: z.literal(4),
    syntheticUnsafeProceedAvoidedCategory: z.enum(baselineMetricCategoryValues),
    syntheticPolicyMissCategory: z.enum(baselineMetricCategoryValues),
    syntheticDeferValueCategory: z.enum(baselineMetricCategoryValues),
    syntheticEscalationValueCategory: z.enum(baselineMetricCategoryValues),
    syntheticBlockValueCategory: z.enum(baselineMetricCategoryValues),
    syntheticFrictionCategory: z.enum(baselineFrictionCategoryValues),
    syntheticCoverageGapCategory: z.enum(baselineMetricCategoryValues),
    localSyntheticCountOnly: z.literal(true),
    realWorldPerformanceMetric: z.literal(false),
    calibratedRiskMetric: z.literal(false),
    statisticalEstimate: z.literal(false)
  }),
  safety: agentBaselineComparisonSafetySchema,
  privacy: agentBaselineComparisonPrivacySchema,
  claimBoundaries: agentBaselineComparisonClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type BaselineComparisonRecord = z.infer<
  typeof baselineComparisonRecordSchema
>;

export type BaselineComparisonStrategy = z.infer<typeof strategyOutcomeSchema>;

export interface SyntheticBaselineComparisonMetrics {
  totalComparisons: number;
  strategyCoverage: (typeof agentBaselineComparisonStrategyValues)[number][];
  comparisonFamilyCoverage: string[];
  syntheticPolicyMissCount: number;
  syntheticDeferAddedValueCount: number;
  syntheticEscalationAddedValueCount: number;
  syntheticBlockAddedValueCount: number;
  syntheticCoverageGapCount: number;
  safetyBoundaryViolationCount: number;
  privacyBoundaryViolationCount: number;
  claimBoundaryViolationCount: number;
  localSyntheticCountsOnly: true;
  realWorldPerformanceMetric: false;
  calibratedRiskMetric: false;
  statisticalEstimate: false;
}

export const validateBaselineComparisonRecord = (
  comparison: unknown
): BaselineComparisonRecord => baselineComparisonRecordSchema.parse(comparison);

export const validateBaselineComparisonRecords = (
  comparisons: unknown[]
): BaselineComparisonRecord[] =>
  comparisons
    .map(validateBaselineComparisonRecord)
    .sort((left, right) => left.comparisonId.localeCompare(right.comparisonId));

export const summarizeBaselineComparisonRecord = (
  comparison: BaselineComparisonRecord
): {
  comparisonId: string;
  runId?: string;
  reviewId?: string;
  decisionDifferenceCategory: BaselineComparisonRecord["decisionComparison"]["decisionDifferenceCategory"];
  labelsUsed: BaselineComparisonRecord["reviewLabelUse"]["labelsUsed"];
} => {
  const summary = {
    comparisonId: comparison.comparisonId,
    decisionDifferenceCategory:
      comparison.decisionComparison.decisionDifferenceCategory,
    labelsUsed: comparison.reviewLabelUse.labelsUsed
  } as {
    comparisonId: string;
    runId?: string;
    reviewId?: string;
    decisionDifferenceCategory: BaselineComparisonRecord["decisionComparison"]["decisionDifferenceCategory"];
    labelsUsed: BaselineComparisonRecord["reviewLabelUse"]["labelsUsed"];
  };

  if (comparison.comparedArtifact.runId !== undefined) {
    summary.runId = comparison.comparedArtifact.runId;
  }

  if (comparison.comparedArtifact.reviewId !== undefined) {
    summary.reviewId = comparison.comparedArtifact.reviewId;
  }

  return summary;
};

const hasBoundaryViolation = (
  comparison: BaselineComparisonRecord,
  boundary: "safety" | "privacy" | "claimBoundaries"
): boolean => {
  const parsed = baselineComparisonRecordSchema.safeParse(comparison);

  if (!parsed.success) {
    return true;
  }

  if (boundary === "safety") {
    return (
      comparison.safety.inert !== true ||
      comparison.safety.executesAgent !== false ||
      comparison.safety.executesCommands !== false ||
      comparison.safety.changesRuntimeBehavior !== false
    );
  }

  if (boundary === "privacy") {
    return (
      comparison.privacy.rawPromptIncluded !== false ||
      comparison.privacy.rawReviewIncluded !== false ||
      comparison.privacy.rawAgentOutputIncluded !== false ||
      comparison.privacy.categoryOnly !== true
    );
  }

  return (
    comparison.claimBoundaries.syntheticOnly !== true ||
    comparison.claimBoundaries.realBaselineEvaluation !== false ||
    comparison.claimBoundaries.realWorldResult !== false ||
    comparison.claimBoundaries.calibrationApplied !== false ||
    comparison.claimBoundaries.conformalGuarantee !== false ||
    comparison.claimBoundaries.statisticalGuarantee !== false
  );
};

export const computeSyntheticBaselineComparisonMetrics = (
  comparisons: BaselineComparisonRecord[]
): SyntheticBaselineComparisonMetrics => ({
  totalComparisons: comparisons.length,
  strategyCoverage: [...agentBaselineComparisonStrategyValues],
  comparisonFamilyCoverage: [
    ...new Set(
      comparisons.map((comparison) => comparison.comparedArtifact.scenarioId)
    )
  ].sort((left, right) => left.localeCompare(right)),
  syntheticPolicyMissCount: comparisons.filter(
    (comparison) =>
      comparison.metrics.syntheticPolicyMissCategory === "yes" ||
      comparison.metrics.syntheticPolicyMissCategory === "partially"
  ).length,
  syntheticDeferAddedValueCount: comparisons.filter(
    (comparison) => comparison.decisionComparison.deferAddedValue === "yes"
  ).length,
  syntheticEscalationAddedValueCount: comparisons.filter(
    (comparison) => comparison.decisionComparison.escalationAddedValue === "yes"
  ).length,
  syntheticBlockAddedValueCount: comparisons.filter(
    (comparison) => comparison.decisionComparison.blockAddedValue === "yes"
  ).length,
  syntheticCoverageGapCount: comparisons.filter(
    (comparison) =>
      comparison.metrics.syntheticCoverageGapCategory === "yes" ||
      comparison.coverageComparison.missingCoverageCategories.length > 0
  ).length,
  safetyBoundaryViolationCount: comparisons.filter((comparison) =>
    hasBoundaryViolation(comparison, "safety")
  ).length,
  privacyBoundaryViolationCount: comparisons.filter((comparison) =>
    hasBoundaryViolation(comparison, "privacy")
  ).length,
  claimBoundaryViolationCount: comparisons.filter((comparison) =>
    hasBoundaryViolation(comparison, "claimBoundaries")
  ).length,
  localSyntheticCountsOnly: true,
  realWorldPerformanceMetric: false,
  calibratedRiskMetric: false,
  statisticalEstimate: false
});

const forbiddenBaselinePatterns = [
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

export const baselineComparisonContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenBaselinePatterns.some((pattern) => pattern.test(serialized));
};

export const validateBaselineComparisonRecordSafety = (
  comparison: BaselineComparisonRecord
): void => {
  if (baselineComparisonContainsForbiddenRawString(comparison)) {
    throw new Error(
      `Baseline comparison contains forbidden raw-looking value: ${comparison.comparisonId}`
    );
  }
};
