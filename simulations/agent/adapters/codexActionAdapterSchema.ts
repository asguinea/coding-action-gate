import { z } from "zod";
import {
  agentSimulationExpectedDecisionValues,
  knownAgentSimulationUncertaintyDriverIds
} from "../personaScenarioSchema.js";
import {
  agentActionTraceSchemaVersion,
  agentTraceActionCategoryValues,
  agentTraceActionIntentCategoryValues,
  agentTraceAgentKindValues,
  agentTracePrivacySchema,
  agentTraceSafetySchema,
  agentTraceSourceValues,
  agentTraceTargetCategoryValues,
  proposedActionPayloadSchema
} from "../traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const codexLikeActionInputSchemaVersion =
  "codex-like-action-input.v1" as const;

export const normalizedAgentProposedActionSchemaVersion =
  "normalized-agent-proposed-action.v1" as const;

export const codexLikeScopeCategories = [
  "single_file",
  "related_files",
  "multi_file",
  "repo_wide",
  "external_workspace",
  "environment",
  "unknown"
] as const;

export const normalizedDecisionCategoryValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "MIXED",
  "UNKNOWN_UNTIL_RUNTIME"
] as const;

export const adapterMappingStatusValues = [
  "mapped",
  "partially_mapped",
  "unknown_mapping"
] as const;

export const adapterMappingWarningValues = [
  "scenario_fixture_family_mismatch",
  "scenario_fixture_persona_mismatch",
  "unsupported_operation_category",
  "unknown_target_category",
  "missing_fixture_metadata",
  "missing_scenario_metadata"
] as const;

export const adapterOnlySimulationDriverIds = [] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const actionInputIdSchema = z
  .string()
  .min(1)
  .regex(/^adapter[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const normalizedActionIdSchema = z
  .string()
  .min(1)
  .regex(/^normalized[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

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

export const codexLikeActionSchema = z.object({
  agentKind: z.enum(agentTraceAgentKindValues),
  proposedOperationCategory: z.enum(agentTraceActionCategoryValues),
  proposedIntentCategory: z.enum(agentTraceActionIntentCategoryValues),
  proposedTargetCategory: z.enum(agentTraceTargetCategoryValues),
  proposedScopeCategory: z.enum(codexLikeScopeCategories),
  proposedRiskSurface: z.array(z.enum(uncertaintyDimensions)).min(1),
  rawOutputIncluded: z.literal(false),
  rawPromptIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawPathIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceIncluded: z.literal(false),
  executable: z.literal(false)
});

export const codexLikeActionInputSchema = z.object({
  schemaVersion: z.literal(codexLikeActionInputSchemaVersion),
  inputId: actionInputIdSchema,
  source: z.enum(agentTraceSourceValues),
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  fixtureRef: fixtureRefSchema,
  taskPromptCategory: categoryIdSchema,
  syntheticPromptSummary: z.string().min(1),
  codexLikeAction: codexLikeActionSchema,
  safety: agentTraceSafetySchema,
  privacy: agentTracePrivacySchema,
  notes: z.array(z.string().min(1)).min(1)
});

export type CodexLikeActionInput = z.infer<typeof codexLikeActionInputSchema>;

const normalizedDecisionCategorySchema = z.enum(
  normalizedDecisionCategoryValues
);

export const normalizedAgentProposedActionSchema = z.object({
  schemaVersion: z.literal(normalizedAgentProposedActionSchemaVersion),
  normalizedActionId: normalizedActionIdSchema,
  inputId: actionInputIdSchema,
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  fixtureRef: fixtureRefSchema,
  actionCategory: z.enum(agentTraceActionCategoryValues),
  actionIntentCategory: z.enum(agentTraceActionIntentCategoryValues),
  targetCategory: z.enum(agentTraceTargetCategoryValues),
  scopeCategory: z.enum(codexLikeScopeCategories),
  stepHarborActionKind: z.enum(agentTraceActionCategoryValues),
  expectedInterceptionPoints: z.array(categoryIdSchema),
  expectedProductionDecisionCategory: normalizedDecisionCategorySchema,
  expectedAdvisoryDecisionCategory: normalizedDecisionCategorySchema,
  expectedUncertaintyDimensions: z.array(z.enum(uncertaintyDimensions)),
  expectedUncertaintyDrivers: z.array(
    z.enum(knownAgentSimulationUncertaintyDriverIds)
  ),
  expectedReductionStepKinds: z.array(z.enum(uncertaintyReductionStepKinds)),
  tracePayloadCompatibility: z.object({
    compatibleTraceSchemaVersion: z.literal(agentActionTraceSchemaVersion),
    canPopulateProposedActionEvent: z.literal(true),
    rawActionIncluded: z.literal(false),
    executable: z.literal(false)
  }),
  safety: agentTraceSafetySchema,
  privacy: agentTracePrivacySchema,
  mappingDiagnostics: z.object({
    mappingStatus: z.enum(adapterMappingStatusValues),
    missingCategories: z.array(categoryIdSchema),
    warnings: z.array(z.enum(adapterMappingWarningValues)),
    rawDiagnosticsIncluded: z.literal(false)
  })
});

export type NormalizedAgentProposedAction = z.infer<
  typeof normalizedAgentProposedActionSchema
>;

export const validateCodexLikeActionInput = (
  input: unknown
): CodexLikeActionInput => codexLikeActionInputSchema.parse(input);

export const validateNormalizedAgentProposedAction = (
  action: unknown
): NormalizedAgentProposedAction =>
  normalizedAgentProposedActionSchema.parse(action);

export const decisionCategoryForAdapter = (
  decision: (typeof agentSimulationExpectedDecisionValues)[number] | undefined
): (typeof normalizedDecisionCategoryValues)[number] => {
  if (decision === undefined || decision === "UNKNOWN_UNTIL_TRACE") {
    return "UNKNOWN_UNTIL_RUNTIME";
  }

  return decision;
};

export const proposedActionPayloadFromNormalizedAction = (
  action: NormalizedAgentProposedAction
): z.infer<typeof proposedActionPayloadSchema> =>
  proposedActionPayloadSchema.parse({
    actionCategory: action.actionCategory,
    actionIntentCategory: action.actionIntentCategory,
    targetCategory: action.targetCategory,
    rawActionIncluded: action.tracePayloadCompatibility.rawActionIncluded,
    executable: action.tracePayloadCompatibility.executable
  });

const forbiddenAdapterPatterns = [
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

export const codexActionAdapterContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenAdapterPatterns.some((pattern) => pattern.test(serialized));
};

export const validateCodexActionAdapterSafety = (value: unknown): void => {
  if (codexActionAdapterContainsForbiddenRawString(value)) {
    throw new Error("Adapter value contains forbidden raw-looking content");
  }
};
