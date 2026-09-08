import type { CodexLikeActionInput } from "../adapters/codexActionAdapterSchema.js";
import { normalizeCodexLikeActionInput } from "../adapters/codexActionAdapter.js";
import type { AgentSimulationFixture } from "../fixtures/fixtureSchema.js";
import type { AgentSimulationScenario } from "../personaScenarioSchema.js";
import { agentTraceFutureCalibrationLabelValues } from "../traces/traceSchema.js";
import {
  agentSimulationRunSchemaVersion,
  validateAgentSimulationRun,
  validateAgentSimulationRunBuildInput,
  type AgentSimulationRun,
  type AgentSimulationTraceEventSkeleton
} from "./agentSimulationRunnerSchema.js";

export interface AgentSimulationRunnerContext {
  adapterInputs: CodexLikeActionInput[];
  scenarios: AgentSimulationScenario[];
  fixtures: AgentSimulationFixture[];
}

const uniqueSorted = <T extends string>(values: T[]): T[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

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

const event = (
  eventKind: AgentSimulationTraceEventSkeleton["eventKind"],
  sequenceIndex: number,
  actor: AgentSimulationTraceEventSkeleton["actor"],
  payloadCategory: AgentSimulationTraceEventSkeleton["payloadCategory"]
): AgentSimulationTraceEventSkeleton => ({
  eventKind,
  sequenceIndex,
  actor,
  payloadCategory,
  rawPayloadIncluded: false,
  executable: false
});

const buildTraceEventSkeleton = (
  loopShape: AgentSimulationRun["loopShape"]
): AgentSimulationTraceEventSkeleton[] => {
  const baseEvents: AgentSimulationTraceEventSkeleton[] = [
    event("task_presented", 0, "persona", "task_category"),
    event("proposed_action", 1, "coding_agent", "proposed_action_category"),
    event(
      "stepharbor_decision",
      2,
      "stepharbor_runtime",
      "scripted_decision_category"
    ),
    event(
      "uncertainty_profile_summary",
      3,
      "stepharbor_uncertainty_advisory",
      "uncertainty_summary_category"
    ),
    event(
      "uncertainty_reduction_plan",
      4,
      "stepharbor_uncertainty_advisory",
      "reduction_plan_category"
    ),
    event(
      "advisory_router_result",
      5,
      "stepharbor_uncertainty_advisory",
      "scripted_advisory_category"
    )
  ];
  const loopEventsByShape: Record<
    AgentSimulationRun["loopShape"],
    Omit<AgentSimulationTraceEventSkeleton, "sequenceIndex">[]
  > = {
    single_action: [
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ],
    defer_then_retry: [
      event(
        "agent_followup_action",
        0,
        "coding_agent",
        "agent_response_category"
      ),
      event("retry_decision", 0, "simulation_harness_future", "retry_category"),
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ],
    defer_then_escalate: [
      event(
        "agent_followup_action",
        0,
        "coding_agent",
        "agent_response_category"
      ),
      event(
        "human_review_requested",
        0,
        "simulation_harness_future",
        "human_review_category"
      ),
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ],
    block_and_alternative: [
      event(
        "agent_followup_action",
        0,
        "coding_agent",
        "agent_response_category"
      ),
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ],
    repeated_retry_until_escalate: [
      event(
        "agent_followup_action",
        0,
        "coding_agent",
        "agent_response_category"
      ),
      event("retry_decision", 0, "simulation_harness_future", "retry_category"),
      event(
        "human_review_requested",
        0,
        "simulation_harness_future",
        "human_review_category"
      ),
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ],
    mixed_multi_step: [
      event(
        "agent_followup_action",
        0,
        "coding_agent",
        "agent_response_category"
      ),
      event("retry_decision", 0, "simulation_harness_future", "retry_category"),
      event(
        "validation_observed",
        0,
        "simulation_harness_future",
        "validation_observation_category"
      ),
      event(
        "outcome_label_assigned",
        0,
        "simulation_harness_future",
        "outcome_category"
      )
    ]
  };

  return [...baseEvents, ...loopEventsByShape[loopShape]].map(
    (skeletonEvent, index) => ({
      ...skeletonEvent,
      sequenceIndex: index
    })
  );
};

export const buildAgentSimulationRun = (
  rawInput: unknown,
  context: AgentSimulationRunnerContext
): AgentSimulationRun => {
  const input = validateAgentSimulationRunBuildInput(rawInput);
  const adapterInput = findById(
    context.adapterInputs,
    (candidate) => candidate.inputId === input.adapterInputId,
    `Missing adapter input: ${input.adapterInputId}`
  );
  const scenario = findById(
    context.scenarios,
    (candidate) => candidate.scenarioId === adapterInput.scenarioId,
    `Missing scenario: ${adapterInput.scenarioId}`
  );
  const fixture = findById(
    context.fixtures,
    (candidate) => candidate.fixtureId === adapterInput.fixtureRef,
    `Missing fixture: ${adapterInput.fixtureRef}`
  );
  const normalizedAction = normalizeCodexLikeActionInput(adapterInput, {
    scenarios: context.scenarios,
    fixtures: context.fixtures
  });

  if (!scenario.personaIds.includes(adapterInput.personaId)) {
    throw new Error(`Scenario/persona mismatch: ${input.adapterInputId}`);
  }

  if (!fixture.linkedScenarioIds.includes(adapterInput.scenarioId)) {
    throw new Error(`Fixture/scenario mismatch: ${input.adapterInputId}`);
  }

  if (!fixture.linkedPersonaIds.includes(adapterInput.personaId)) {
    throw new Error(`Fixture/persona mismatch: ${input.adapterInputId}`);
  }

  if (!fixture.taskPromptCategories.includes(adapterInput.taskPromptCategory)) {
    throw new Error(`Fixture/task category mismatch: ${input.adapterInputId}`);
  }

  return validateAgentSimulationRun({
    schemaVersion: agentSimulationRunSchemaVersion,
    runId: input.runId,
    source: "synthetic_example",
    personaId: adapterInput.personaId,
    scenarioId: adapterInput.scenarioId,
    fixtureRef: adapterInput.fixtureRef,
    adapterInputId: adapterInput.inputId,
    normalizedActionId: normalizedAction.normalizedActionId,
    scenarioFamily: scenario.scenarioFamily,
    taskPromptCategory: adapterInput.taskPromptCategory,
    loopShape: input.loopShape,
    scriptedAgentResponse: input.scriptedAgentResponse,
    productionDecisionCategory:
      normalizedAction.expectedProductionDecisionCategory,
    advisoryDecisionCategory: normalizedAction.expectedAdvisoryDecisionCategory,
    uncertaintyDimensions: uniqueSorted(
      normalizedAction.expectedUncertaintyDimensions
    ),
    uncertaintyDrivers: uniqueSorted(
      normalizedAction.expectedUncertaintyDrivers
    ),
    reductionStepKinds: uniqueSorted(
      normalizedAction.expectedReductionStepKinds
    ),
    traceEventSkeleton: buildTraceEventSkeleton(input.loopShape),
    finalOutcome: {
      outcomeCategory: input.outcomeCategory ?? "not_run_yet",
      taskCompletedCategory: input.taskCompletedCategory ?? "not_run_yet",
      safetyOutcomeCategory:
        input.safetyOutcomeCategory ?? "safe_inert_example",
      frictionCategory: input.frictionCategory ?? "unknown_until_simulation"
    },
    baselineReadiness: {
      noGuard: {
        status: "ready_for_future_evaluation",
        likelyOutcomeCategory:
          scenario.baselineExpectations.noGuard.likelyOutcomeCategory
      },
      policyOnlyGuard: {
        status: "ready_for_future_evaluation",
        likelyOutcomeCategory:
          scenario.baselineExpectations.policyOnlyGuard.likelyOutcomeCategory
      },
      stepHarborDeterministic: {
        status: "ready_for_future_evaluation",
        likelyOutcomeCategory:
          scenario.baselineExpectations.stepHarborDeterministic
            .likelyOutcomeCategory
      },
      stepHarborAdvisoryUq: {
        status: "ready_for_future_evaluation",
        likelyOutcomeCategory:
          scenario.baselineExpectations.stepHarborAdvisoryUq
            .likelyOutcomeCategory
      }
    },
    calibrationReadiness: {
      eligibleForFutureCalibration: true,
      requiredFutureLabels: [...agentTraceFutureCalibrationLabelValues],
      lossFieldsPresent: false,
      calibrationApplied: false,
      conformalUsed: false,
      statisticalGuaranteeClaimed: false
    },
    safety: adapterInput.safety,
    privacy: adapterInput.privacy,
    claimBoundaries: {
      actualRuntimeDecision: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      conformalGuarantee: false
    },
    notes: [
      "Synthetic example run only.",
      "Scripted category output; no agent, command, trace runtime, or StepHarbor runtime execution occurred."
    ]
  });
};

export const buildAgentSimulationRuns = (
  inputs: unknown[],
  context: AgentSimulationRunnerContext
): AgentSimulationRun[] =>
  inputs
    .map((input) => buildAgentSimulationRun(input, context))
    .sort((left, right) => left.runId.localeCompare(right.runId));

export const loadExampleAgentSimulationRuns = (
  rawRuns: unknown[]
): AgentSimulationRun[] =>
  rawRuns
    .map(validateAgentSimulationRun)
    .sort((left, right) => left.runId.localeCompare(right.runId));
