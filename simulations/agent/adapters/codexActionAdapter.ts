import type { AgentSimulationFixture } from "../fixtures/fixtureSchema.js";
import type { AgentSimulationScenario } from "../personaScenarioSchema.js";
import {
  agentActionTraceSchemaVersion,
  agentTraceActionCategoryValues,
  agentTraceActionIntentCategoryValues,
  agentTraceTargetCategoryValues
} from "../traces/traceSchema.js";
import {
  decisionCategoryForAdapter,
  normalizedAgentProposedActionSchemaVersion,
  validateCodexLikeActionInput,
  validateNormalizedAgentProposedAction,
  type CodexLikeActionInput,
  type NormalizedAgentProposedAction
} from "./codexActionAdapterSchema.js";

export interface CodexActionAdapterMappingContext {
  scenarios?: AgentSimulationScenario[];
  fixtures?: AgentSimulationFixture[];
}

const uniqueSorted = <T extends string>(values: T[]): T[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const normalizedIdFromInputId = (inputId: string): string =>
  inputId.replace(/^adapter[-_]/, "normalized-");

const isUnknownActionCategory = (value: string): boolean =>
  value === "unknown" ||
  !agentTraceActionCategoryValues.includes(value as never);

const isUnknownIntentCategory = (value: string): boolean =>
  value === "unknown" ||
  !agentTraceActionIntentCategoryValues.includes(value as never);

const isUnknownTargetCategory = (value: string): boolean =>
  value === "unknown" ||
  !agentTraceTargetCategoryValues.includes(value as never);

const scenarioForInput = (
  input: CodexLikeActionInput,
  context?: CodexActionAdapterMappingContext
): AgentSimulationScenario | undefined =>
  context?.scenarios?.find(
    (scenario) => scenario.scenarioId === input.scenarioId
  );

const fixtureForInput = (
  input: CodexLikeActionInput,
  context?: CodexActionAdapterMappingContext
): AgentSimulationFixture | undefined =>
  context?.fixtures?.find((fixture) => fixture.fixtureId === input.fixtureRef);

export const normalizeCodexLikeActionInput = (
  rawInput: unknown,
  context?: CodexActionAdapterMappingContext
): NormalizedAgentProposedAction => {
  const input = validateCodexLikeActionInput(rawInput);
  const scenario = scenarioForInput(input, context);
  const fixture = fixtureForInput(input, context);
  const warnings: NormalizedAgentProposedAction["mappingDiagnostics"]["warnings"] =
    [];
  const missingCategories: string[] = [];

  if (scenario === undefined) {
    warnings.push("missing_scenario_metadata");
    missingCategories.push("scenario_metadata");
  }

  if (fixture === undefined) {
    warnings.push("missing_fixture_metadata");
    missingCategories.push("fixture_metadata");
  }

  if (
    scenario !== undefined &&
    fixture !== undefined &&
    !fixture.scenarioFamilies.includes(scenario.scenarioFamily)
  ) {
    warnings.push("scenario_fixture_family_mismatch");
  }

  if (
    scenario !== undefined &&
    !scenario.personaIds.includes(input.personaId)
  ) {
    warnings.push("scenario_fixture_persona_mismatch");
  }

  if (
    fixture !== undefined &&
    !fixture.linkedPersonaIds.includes(input.personaId)
  ) {
    warnings.push("scenario_fixture_persona_mismatch");
  }

  if (
    isUnknownActionCategory(input.codexLikeAction.proposedOperationCategory)
  ) {
    warnings.push("unsupported_operation_category");
    missingCategories.push("operation_category");
  }

  if (isUnknownIntentCategory(input.codexLikeAction.proposedIntentCategory)) {
    missingCategories.push("intent_category");
  }

  if (isUnknownTargetCategory(input.codexLikeAction.proposedTargetCategory)) {
    warnings.push("unknown_target_category");
    missingCategories.push("target_category");
  }

  const expectedInterceptionPoints = uniqueSorted([
    ...(scenario?.stepHarborInterceptionPoints ?? []),
    ...(fixture?.stepHarborInterceptionPoints ?? [])
  ]);
  const expectedUncertaintyDimensions = uniqueSorted([
    ...input.codexLikeAction.proposedRiskSurface,
    ...(scenario?.expectedUncertaintyDimensions ?? []),
    ...(fixture?.expectedUncertaintyDimensions ?? [])
  ]);
  const expectedUncertaintyDrivers = uniqueSorted([
    ...(scenario?.expectedUncertaintyDrivers ?? []),
    ...(fixture?.expectedUncertaintyDrivers ?? [])
  ]);
  const expectedReductionStepKinds = uniqueSorted([
    ...(scenario?.expectedReductionStepKinds ?? []),
    ...(fixture?.expectedReductionStepKinds ?? [])
  ]);
  const mappingStatus =
    warnings.length === 0
      ? "mapped"
      : warnings.includes("unsupported_operation_category") ||
          warnings.includes("missing_scenario_metadata") ||
          warnings.includes("missing_fixture_metadata")
        ? "unknown_mapping"
        : "partially_mapped";

  return validateNormalizedAgentProposedAction({
    schemaVersion: normalizedAgentProposedActionSchemaVersion,
    normalizedActionId: normalizedIdFromInputId(input.inputId),
    inputId: input.inputId,
    personaId: input.personaId,
    scenarioId: input.scenarioId,
    fixtureRef: input.fixtureRef,
    actionCategory: input.codexLikeAction.proposedOperationCategory,
    actionIntentCategory: input.codexLikeAction.proposedIntentCategory,
    targetCategory: input.codexLikeAction.proposedTargetCategory,
    scopeCategory: input.codexLikeAction.proposedScopeCategory,
    stepHarborActionKind: input.codexLikeAction.proposedOperationCategory,
    expectedInterceptionPoints,
    expectedProductionDecisionCategory: decisionCategoryForAdapter(
      scenario?.expectedProductionDecision
    ),
    expectedAdvisoryDecisionCategory: decisionCategoryForAdapter(
      scenario?.expectedAdvisoryUncertaintyDecision
    ),
    expectedUncertaintyDimensions,
    expectedUncertaintyDrivers,
    expectedReductionStepKinds,
    tracePayloadCompatibility: {
      compatibleTraceSchemaVersion: agentActionTraceSchemaVersion,
      canPopulateProposedActionEvent: true,
      rawActionIncluded: false,
      executable: false
    },
    safety: input.safety,
    privacy: input.privacy,
    mappingDiagnostics: {
      mappingStatus,
      missingCategories: uniqueSorted(missingCategories),
      warnings: uniqueSorted(warnings),
      rawDiagnosticsIncluded: false
    }
  });
};

export const normalizeCodexLikeActionInputs = (
  inputs: unknown[],
  context?: CodexActionAdapterMappingContext
): NormalizedAgentProposedAction[] =>
  inputs
    .map((input) => normalizeCodexLikeActionInput(input, context))
    .sort((left, right) =>
      left.normalizedActionId.localeCompare(right.normalizedActionId)
    );
