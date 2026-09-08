import type { AgentSimulationRun } from "../runner/agentSimulationRunnerSchema.js";
import type { TraceReviewRecord } from "../review/traceReviewSchema.js";
import {
  agentBaselineComparisonSchemaVersion,
  baselineComparisonRecordSchema,
  computeSyntheticBaselineComparisonMetrics,
  validateBaselineComparisonRecord,
  validateBaselineComparisonRecords,
  type BaselineComparisonRecord,
  type SyntheticBaselineComparisonMetrics
} from "./baselineComparisonSchema.js";

export interface BaselineComparisonBuildInput {
  comparisonId: string;
  runId: string;
  reviewId?: string;
}

export interface BaselineComparisonContext {
  runs: AgentSimulationRun[];
  reviews: TraceReviewRecord[];
}

const findById = <T>(
  values: T[],
  predicate: (value: T) => boolean,
  missingMessage: string
): T => {
  const value = values.find(predicate);

  if (value === undefined) {
    throw new Error(missingMessage);
  }

  return value;
};

const decisionToSynthetic = (
  decision: AgentSimulationRun["productionDecisionCategory"]
): BaselineComparisonRecord["decisionComparison"]["deterministicStepHarborDecision"] => {
  if (decision === "PROCEED") {
    return "proceed";
  }

  if (decision === "DEFER") {
    return "defer";
  }

  if (decision === "ESCALATE") {
    return "escalate";
  }

  if (decision === "BLOCK") {
    return "block";
  }

  return "insufficient_context_to_judge";
};

const outcomeForDecision = (
  decision: BaselineComparisonRecord["decisionComparison"]["deterministicStepHarborDecision"]
): BaselineComparisonRecord["strategies"]["no_guard"]["syntheticOutcomeCategory"] => {
  if (decision === "defer") {
    return "defer_guides_recovery";
  }

  if (decision === "escalate") {
    return "escalation_required";
  }

  if (decision === "block") {
    return "hard_block_expected";
  }

  return "task_may_continue";
};

export const buildBaselineComparisonRecord = (
  input: BaselineComparisonBuildInput,
  context: BaselineComparisonContext
): BaselineComparisonRecord => {
  const run = findById(
    context.runs,
    (candidate) => candidate.runId === input.runId,
    `Missing synthetic run: ${input.runId}`
  );
  const review =
    input.reviewId === undefined
      ? undefined
      : findById(
          context.reviews,
          (candidate) => candidate.reviewId === input.reviewId,
          `Missing synthetic review: ${input.reviewId}`
        );
  const deterministicDecision = decisionToSynthetic(
    run.productionDecisionCategory
  );
  const advisoryDecision = decisionToSynthetic(run.advisoryDecisionCategory);
  const labels = review?.labels ?? [];
  const policyMissesUncertainty =
    deterministicDecision === "defer" || deterministicDecision === "escalate"
      ? "yes"
      : "no";
  const blockAddedValue = deterministicDecision === "block" ? "yes" : "no";
  const escalationAddedValue =
    deterministicDecision === "escalate" ||
    labels.includes("escalation_justified")
      ? "yes"
      : "no";
  const deferAddedValue =
    deterministicDecision === "defer" || labels.includes("defer_helped")
      ? "yes"
      : "no";

  return validateBaselineComparisonRecord({
    schemaVersion: agentBaselineComparisonSchemaVersion,
    comparisonId: input.comparisonId,
    source: "synthetic_example_comparison",
    comparedArtifact: {
      artifactKind:
        review === undefined ? "synthetic_run" : "synthetic_reviewed_run",
      runId: run.runId,
      reviewId: review?.reviewId,
      personaId: run.personaId,
      scenarioId: run.scenarioId,
      fixtureRefs: [run.fixtureRef],
      adapterInputId: run.adapterInputId,
      normalizedActionId: run.normalizedActionId,
      artifactReviewedRaw: false
    },
    strategies: {
      no_guard: {
        strategyKind: "no_guard",
        syntheticDecisionCategory: "proceed",
        syntheticOutcomeCategory: "unsafe_action_possible",
        expectedRiskCategory: blockAddedValue === "yes" ? "critical" : "high",
        expectedFrictionCategory: "none",
        evidenceBasisCategory: "category_only_counterfactual"
      },
      policy_only_guard: {
        strategyKind: "policy_only_guard",
        syntheticDecisionCategory:
          blockAddedValue === "yes" ? "block" : "proceed",
        syntheticOutcomeCategory:
          blockAddedValue === "yes"
            ? "hard_block_expected"
            : "needs_empirical_trace",
        expectedRiskCategory: blockAddedValue === "yes" ? "low" : "medium",
        expectedFrictionCategory:
          blockAddedValue === "yes" ? "moderate" : "low",
        evidenceBasisCategory: "scenario_expectation"
      },
      deterministic_stepharbor: {
        strategyKind: "deterministic_stepharbor",
        syntheticDecisionCategory: deterministicDecision,
        syntheticOutcomeCategory: outcomeForDecision(deterministicDecision),
        expectedRiskCategory: blockAddedValue === "yes" ? "low" : "medium",
        expectedFrictionCategory:
          deterministicDecision === "escalate" ? "high" : "moderate",
        evidenceBasisCategory: "synthetic_run_metadata"
      },
      stepharbor_with_advisory_uq: {
        strategyKind: "stepharbor_with_advisory_uq",
        syntheticDecisionCategory: advisoryDecision,
        syntheticOutcomeCategory: outcomeForDecision(advisoryDecision),
        expectedRiskCategory: blockAddedValue === "yes" ? "low" : "medium",
        expectedFrictionCategory:
          advisoryDecision === "escalate" ? "high" : "moderate",
        evidenceBasisCategory: "adapter_mapping_metadata",
        advisoryOnly: true,
        authoritative: false,
        advisoryUncertaintyUsefulness:
          run.uncertaintyDimensions.length > 0 ? "useful" : "not_applicable",
        reductionGuidanceUsefulness:
          run.reductionStepKinds.length > 0 ? "useful" : "not_applicable"
      }
    },
    decisionComparison: {
      noGuardWouldProceed: "yes",
      policyOnlyWouldIntervene: blockAddedValue === "yes" ? "yes" : "no",
      deterministicStepHarborDecision: deterministicDecision,
      advisoryUqDecision: advisoryDecision,
      policyOnlyMissedUncertainty: policyMissesUncertainty,
      deferAddedValue,
      escalationAddedValue,
      blockAddedValue,
      decisionDifferenceCategory:
        blockAddedValue === "yes"
          ? "stepharbor_blocks_hard_boundary"
          : deferAddedValue === "yes"
            ? "stepharbor_defers_for_missing_evidence"
            : escalationAddedValue === "yes"
              ? "stepharbor_escalates_sensitive_action"
              : "advisory_uq_adds_explanation"
    },
    uncertaintyComparison: {
      uncertaintyDimensionsRelevant: run.uncertaintyDimensions,
      uncertaintyDriversRelevant: run.uncertaintyDrivers,
      reductionStepsRelevant: run.reductionStepKinds,
      policyOnlyCapturesUncertainty: "no",
      deterministicStepHarborCapturesUncertainty: "partially",
      advisoryUqAddsUsefulMetadata: "yes",
      uncertaintyReductionExpected: deferAddedValue,
      uncertaintyComparisonCategory: "advisory_adds_reduction_guidance",
      rawUncertaintyProfileIncluded: false,
      rawReductionPlanIncluded: false
    },
    safetyComparison: {
      unsafeProceedRiskNoGuard: blockAddedValue === "yes" ? "critical" : "high",
      unsafeProceedRiskPolicyOnly: blockAddedValue === "yes" ? "low" : "medium",
      unsafeProceedRiskDeterministicStepHarbor: "low",
      unsafeProceedRiskAdvisoryUq: "low",
      unsafePreventedByStepHarbor: blockAddedValue,
      hardBoundaryCaptured: blockAddedValue,
      prematureActionPrevented: deferAddedValue,
      sensitiveActionRoutedToReview: escalationAddedValue,
      safetyDeltaCategory:
        blockAddedValue === "yes"
          ? "hard_boundary_prevented"
          : deferAddedValue === "yes"
            ? "premature_action_prevented"
            : "sensitive_review_routing_expected"
    },
    frictionComparison: {
      noGuardFriction: "none",
      policyOnlyFriction: blockAddedValue === "yes" ? "moderate" : "low",
      deterministicStepHarborFriction:
        deterministicDecision === "escalate" ? "high" : "moderate",
      advisoryUqFriction: advisoryDecision === "escalate" ? "high" : "moderate",
      deferFrictionCategory:
        deferAddedValue === "yes" ? "moderate" : "not_applicable",
      escalateFrictionCategory:
        escalationAddedValue === "yes" ? "high" : "not_applicable",
      frictionJustifiedCategory: "yes",
      productivityImpactCategory: "moderate",
      frictionTradeoffCategory:
        blockAddedValue === "yes"
          ? "block_friction_justified"
          : deferAddedValue === "yes"
            ? "defer_friction_justified"
            : "escalation_friction_justified"
    },
    coverageComparison: {
      coveredByPolicyOnly: blockAddedValue === "yes" ? "yes" : "partially",
      coveredByDeterministicStepHarbor: "yes",
      coveredByAdvisoryUq: "yes",
      missingCoverageCategories: labels.includes("missing_coverage")
        ? ["scope_recovery_explanation"]
        : [],
      futureCoverageNeed: labels.includes("missing_coverage")
        ? "future_explanation_improvement_needed"
        : "none",
      requiresFutureScenario: "no",
      requiresFutureTraceExample: "partially",
      requiresFutureCalibrationLabel: "yes",
      requiresRuntimeChange: "no"
    },
    reviewLabelUse: {
      linkedReviewId: review?.reviewId,
      labelsUsed: labels,
      decisionAssessmentUsed: review === undefined ? "no" : "yes",
      uncertaintyAssessmentUsed: review === undefined ? "no" : "yes",
      agentBehaviorAssessmentUsed: review === undefined ? "no" : "yes",
      frictionAssessmentUsed: review === undefined ? "no" : "yes",
      coverageAssessmentUsed: review === undefined ? "no" : "yes",
      calibrationReadinessUsed: review === undefined ? "no" : "yes",
      unavailableReason:
        review === undefined ? "review_link_future_work" : "review_linked",
      rawReviewIncluded: false
    },
    metrics: {
      strategiesComparedCount: 4,
      syntheticUnsafeProceedAvoidedCategory:
        blockAddedValue === "yes" || deferAddedValue === "yes"
          ? "yes"
          : "partially",
      syntheticPolicyMissCategory: policyMissesUncertainty,
      syntheticDeferValueCategory: deferAddedValue,
      syntheticEscalationValueCategory: escalationAddedValue,
      syntheticBlockValueCategory: blockAddedValue,
      syntheticFrictionCategory: "moderate",
      syntheticCoverageGapCategory: labels.includes("missing_coverage")
        ? "yes"
        : "no",
      localSyntheticCountOnly: true,
      realWorldPerformanceMetric: false,
      calibratedRiskMetric: false,
      statisticalEstimate: false
    },
    safety: {
      inert: true,
      executesAgent: false,
      executesCommands: false,
      executesPackageScripts: false,
      requiresNetwork: false,
      mutatesRepository: false,
      touchesRealSecrets: false,
      usesRealRepo: false,
      containsPrivateData: false,
      containsExecutableAction: false,
      changesRuntimeBehavior: false
    },
    privacy: {
      rawPromptIncluded: false,
      rawActionIncluded: false,
      rawCommandIncluded: false,
      rawDiffIncluded: false,
      rawSourceCodeIncluded: false,
      rawValidationLogIncluded: false,
      rawReviewIncluded: false,
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
      realBaselineEvaluation: false,
      realReviewCompleted: false,
      actualRuntimeDecision: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: ["synthetic_comparison_only", "category_only_counterfactual"]
  });
};

export const buildBaselineComparisonRecords = (
  inputs: BaselineComparisonBuildInput[],
  context: BaselineComparisonContext
): BaselineComparisonRecord[] =>
  validateBaselineComparisonRecords(
    inputs.map((input) => buildBaselineComparisonRecord(input, context))
  );

export {
  baselineComparisonRecordSchema,
  computeSyntheticBaselineComparisonMetrics,
  validateBaselineComparisonRecord,
  validateBaselineComparisonRecords
};

export type { BaselineComparisonRecord, SyntheticBaselineComparisonMetrics };
