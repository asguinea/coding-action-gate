import { z } from "zod";
import {
  agentSimulationLoopShapes,
  agentSimulationResponseToStepHarborValues,
  agentSimulationScenarioFamilies,
  knownAgentSimulationUncertaintyDriverIds
} from "../personaScenarioSchema.js";
import {
  agentTraceActorValues,
  agentTraceBaselineLikelyOutcomeCategoryValues,
  agentTraceBaselineStatusValues,
  agentTraceEventKindValues,
  agentTraceFrictionCategoryValues,
  agentTraceFutureCalibrationLabelValues,
  agentTraceOutcomeCategoryValues,
  agentTracePrivacySchema,
  agentTraceSafetyOutcomeCategoryValues,
  agentTraceSafetySchema,
  agentTraceTaskCompletedCategoryValues
} from "../traces/traceSchema.js";
import { normalizedDecisionCategoryValues } from "../adapters/codexActionAdapterSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentSimulationRunSchemaVersion =
  "agent-simulation-run.v1" as const;

export const agentSimulationRunSourceValues = [
  "synthetic_example",
  "controlled_simulation_future"
] as const;

export const agentSimulationRunnerPayloadCategories = [
  "task_category",
  "proposed_action_category",
  "scripted_decision_category",
  "uncertainty_summary_category",
  "reduction_plan_category",
  "scripted_advisory_category",
  "agent_response_category",
  "retry_category",
  "human_review_category",
  "validation_observation_category",
  "outcome_category"
] as const;

export const agentSimulationRunOnlyDriverIds = [] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

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

export const agentSimulationTraceEventSkeletonSchema = z.object({
  eventKind: z.enum(agentTraceEventKindValues),
  sequenceIndex: z.number().int().min(0),
  actor: z.enum(agentTraceActorValues),
  payloadCategory: z.enum(agentSimulationRunnerPayloadCategories),
  rawPayloadIncluded: z.literal(false),
  executable: z.literal(false)
});

const baselineSlotSchema = z.object({
  status: z.enum(agentTraceBaselineStatusValues),
  likelyOutcomeCategory: z.enum(agentTraceBaselineLikelyOutcomeCategoryValues)
});

export const agentSimulationRunClaimBoundarySchema = z.object({
  actualRuntimeDecision: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  conformalGuarantee: z.literal(false)
});

export const agentSimulationRunSchema = z.object({
  schemaVersion: z.literal(agentSimulationRunSchemaVersion),
  runId: runIdSchema,
  source: z.enum(agentSimulationRunSourceValues),
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  fixtureRef: fixtureRefSchema,
  adapterInputId: actionInputIdSchema,
  normalizedActionId: normalizedActionIdSchema,
  scenarioFamily: z.enum(agentSimulationScenarioFamilies),
  taskPromptCategory: categoryIdSchema,
  loopShape: z.enum(agentSimulationLoopShapes),
  scriptedAgentResponse: z.enum(agentSimulationResponseToStepHarborValues),
  productionDecisionCategory: z.enum(normalizedDecisionCategoryValues),
  advisoryDecisionCategory: z.enum(normalizedDecisionCategoryValues),
  uncertaintyDimensions: z.array(z.enum(uncertaintyDimensions)).min(1),
  uncertaintyDrivers: z
    .array(z.enum(knownAgentSimulationUncertaintyDriverIds))
    .min(1),
  reductionStepKinds: z.array(z.enum(uncertaintyReductionStepKinds)).min(1),
  traceEventSkeleton: z.array(agentSimulationTraceEventSkeletonSchema).min(1),
  finalOutcome: z.object({
    outcomeCategory: z.enum(agentTraceOutcomeCategoryValues),
    taskCompletedCategory: z.enum(agentTraceTaskCompletedCategoryValues),
    safetyOutcomeCategory: z.enum(agentTraceSafetyOutcomeCategoryValues),
    frictionCategory: z.enum(agentTraceFrictionCategoryValues)
  }),
  baselineReadiness: z.object({
    noGuard: baselineSlotSchema,
    policyOnlyGuard: baselineSlotSchema,
    stepHarborDeterministic: baselineSlotSchema,
    stepHarborAdvisoryUq: baselineSlotSchema
  }),
  calibrationReadiness: z.object({
    eligibleForFutureCalibration: z.boolean(),
    requiredFutureLabels: z.array(
      z.enum(agentTraceFutureCalibrationLabelValues)
    ),
    lossFieldsPresent: z.literal(false),
    calibrationApplied: z.literal(false),
    conformalUsed: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false)
  }),
  safety: agentTraceSafetySchema,
  privacy: agentTracePrivacySchema,
  claimBoundaries: agentSimulationRunClaimBoundarySchema,
  notes: z.array(z.string().min(1)).min(1)
});

export type AgentSimulationTraceEventSkeleton = z.infer<
  typeof agentSimulationTraceEventSkeletonSchema
>;

export type AgentSimulationRun = z.infer<typeof agentSimulationRunSchema>;

export const agentSimulationRunBuildInputSchema = z.object({
  runId: runIdSchema,
  adapterInputId: actionInputIdSchema,
  loopShape: z.enum(agentSimulationLoopShapes),
  scriptedAgentResponse: z.enum(agentSimulationResponseToStepHarborValues),
  outcomeCategory: z.enum(agentTraceOutcomeCategoryValues).optional(),
  taskCompletedCategory: z
    .enum(agentTraceTaskCompletedCategoryValues)
    .optional(),
  safetyOutcomeCategory: z
    .enum(agentTraceSafetyOutcomeCategoryValues)
    .optional(),
  frictionCategory: z.enum(agentTraceFrictionCategoryValues).optional()
});

export type AgentSimulationRunBuildInput = z.infer<
  typeof agentSimulationRunBuildInputSchema
>;

export const validateAgentSimulationRun = (run: unknown): AgentSimulationRun =>
  agentSimulationRunSchema.parse(run);

export const validateAgentSimulationRunBuildInput = (
  input: unknown
): AgentSimulationRunBuildInput =>
  agentSimulationRunBuildInputSchema.parse(input);

const forbiddenRunnerPatterns = [
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

export const agentSimulationRunContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenRunnerPatterns.some((pattern) => pattern.test(serialized));
};

export const validateAgentSimulationRunSafety = (
  run: AgentSimulationRun
): void => {
  if (agentSimulationRunContainsForbiddenRawString(run)) {
    throw new Error(`Run contains forbidden raw-looking value: ${run.runId}`);
  }
};
