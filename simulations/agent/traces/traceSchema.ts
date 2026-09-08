import { z } from "zod";
import {
  agentSimulationBaselineOutcomeCategories,
  agentSimulationLoopShapes,
  agentSimulationOutcomeLabels,
  agentSimulationResponseToStepHarborValues,
  agentSimulationScenarioFamilies,
  knownAgentSimulationUncertaintyDriverIds
} from "../personaScenarioSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentActionTraceSchemaVersion = "agent-action-trace.v1" as const;

export const uncertaintyProfileSummaryForTraceSchemaVersion =
  "uncertainty-profile-summary-for-trace.v1" as const;

export const uncertaintyReductionPlanSummaryForTraceSchemaVersion =
  "uncertainty-reduction-plan-summary-for-trace.v1" as const;

export const uncertaintyRouterResultSummaryForTraceSchemaVersion =
  "uncertainty-router-result-summary-for-trace.v1" as const;

export const agentTraceSourceValues = [
  "synthetic_example",
  "controlled_simulation_future",
  "reviewed_simulation_future",
  "real_trial_future"
] as const;

export const agentTraceAgentKindValues = [
  "codex_like",
  "generic_coding_agent",
  "scripted_agent_stub",
  "human_simulated_agent"
] as const;

export const agentTraceAutonomyModeValues = [
  "manual",
  "semi_autonomous",
  "autonomous",
  "unknown"
] as const;

export const agentTraceIntegrationModeValues = [
  "proposed_action_json",
  "cli_wrapper_future",
  "api_adapter_future",
  "manual_transcription"
] as const;

export const agentTraceEventKindValues = [
  "task_presented",
  "proposed_action",
  "stepharbor_decision",
  "uncertainty_profile_summary",
  "uncertainty_reduction_plan",
  "advisory_router_result",
  "agent_followup_action",
  "retry_decision",
  "human_review_requested",
  "human_review_result",
  "validation_observed",
  "outcome_label_assigned",
  "trace_review_completed"
] as const;

export const agentTraceActorValues = [
  "persona",
  "coding_agent",
  "stepharbor_runtime",
  "stepharbor_uncertainty_advisory",
  "human_reviewer",
  "simulation_harness_future",
  "baseline_evaluator_future"
] as const;

export const agentTraceActionCategoryValues = [
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "install_dependency",
  "run_tests",
  "git_commit",
  "git_push",
  "git_reset_or_clean",
  "deploy",
  "publish",
  "inspect_git_state",
  "validate",
  "unknown"
] as const;

export const agentTraceActionIntentCategoryValues = [
  "gather_context",
  "modify_code",
  "modify_tests",
  "validate_change",
  "land_change",
  "deploy_change",
  "inspect_environment",
  "recover_or_rollback",
  "broad_refactor",
  "sensitive_change",
  "unknown"
] as const;

export const agentTraceTargetCategoryValues = [
  "application_code",
  "test_code",
  "auth_security_code",
  "config",
  "ci_workflow",
  "package_metadata",
  "secret_like_path",
  "workspace_external_path",
  "deployment_surface",
  "git_state",
  "unknown"
] as const;

export const agentTraceProductionDecisionValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK"
] as const;

export const agentTraceSeverityValues = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
  "unknown"
] as const;

export const agentTraceOutcomeCategoryValues = [
  ...agentSimulationOutcomeLabels,
  "not_run_yet"
] as const;

export const agentTraceTaskCompletedCategoryValues = [
  "completed",
  "partially_completed",
  "blocked",
  "escalated",
  "not_run_yet"
] as const;

export const agentTraceSafetyOutcomeCategoryValues = [
  "safe_inert_example",
  "unsafe_prevented",
  "unsafe_possible_without_guard",
  "unknown_until_simulation"
] as const;

export const agentTraceFrictionCategoryValues = [
  "low",
  "medium",
  "high",
  "unknown_until_simulation"
] as const;

export const agentTraceReviewStatusValues = [
  "unreviewed_example",
  "pending_future_review",
  "reviewed_future"
] as const;

export const agentTraceReviewerKindValues = [
  "none",
  "internal_reviewer_future",
  "domain_reviewer_future"
] as const;

export const agentTraceBaselineStatusValues = [
  "not_evaluated",
  "ready_for_future_evaluation",
  "not_applicable"
] as const;

export const agentTraceBaselineLikelyOutcomeCategoryValues = [
  ...agentSimulationBaselineOutcomeCategories,
  "not_evaluated"
] as const;

export const agentTraceFutureCalibrationLabelValues = [
  "production_decision_correctness",
  "advisory_decision_usefulness",
  "unsafe_proceed_loss",
  "unnecessary_defer_loss",
  "unnecessary_escalate_loss",
  "incorrect_block_loss",
  "agent_recovery_after_defer",
  "friction_label"
] as const;

export const traceOnlySimulationDriverIds = [] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const eventIdSchema = z
  .string()
  .min(1)
  .regex(/^event[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const safeStringSchema = z.string().min(1);

export const agentTraceSafetySchema = z.object({
  inert: z.literal(true),
  executesAgent: z.literal(false),
  executesCommands: z.literal(false),
  executesPackageScripts: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false),
  touchesRealSecrets: z.literal(false),
  usesRealRepo: z.literal(false),
  containsPrivateData: z.literal(false),
  containsExecutableAction: z.literal(false)
});

export const agentTracePrivacySchema = z.object({
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
  categoryOnly: z.literal(true)
});

const agentIdentitySchema = z.object({
  kind: z.literal("category_only"),
  value: categoryIdSchema
});

export const agentTraceAgentSchema = z.object({
  agentKind: z.enum(agentTraceAgentKindValues),
  autonomyMode: z.enum(agentTraceAutonomyModeValues),
  integrationMode: z.enum(agentTraceIntegrationModeValues),
  identity: agentIdentitySchema
});

const traceEventBaseSchema = z.object({
  eventId: eventIdSchema,
  sequenceIndex: z.number().int().min(0),
  actor: z.enum(agentTraceActorValues),
  safety: agentTraceSafetySchema,
  privacy: agentTracePrivacySchema
});

const taskPresentedEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("task_presented"),
  payload: z.object({
    taskPromptCategory: categoryIdSchema,
    syntheticPromptSummary: safeStringSchema,
    rawPromptIncluded: z.literal(false)
  })
});

export const proposedActionPayloadSchema = z.object({
  actionCategory: z.enum(agentTraceActionCategoryValues),
  actionIntentCategory: z.enum(agentTraceActionIntentCategoryValues),
  targetCategory: z.enum(agentTraceTargetCategoryValues),
  rawActionIncluded: z.literal(false),
  executable: z.literal(false)
});

const proposedActionEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("proposed_action"),
  payload: proposedActionPayloadSchema
});

export const stepHarborDecisionPayloadSchema = z.object({
  productionDecision: z.enum(agentTraceProductionDecisionValues),
  primaryReasonCategory: categoryIdSchema,
  supportingSignalCategories: z.array(categoryIdSchema),
  deferIdCategory: categoryIdSchema.optional(),
  policyCategory: categoryIdSchema,
  decisionIsAuthoritative: z.literal(true)
});

const stepHarborDecisionEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("stepharbor_decision"),
  payload: stepHarborDecisionPayloadSchema
});

export const uncertaintyProfileSummaryPayloadSchema = z.object({
  schemaVersion: z.literal(uncertaintyProfileSummaryForTraceSchemaVersion),
  dimensionsPresent: z.array(z.enum(uncertaintyDimensions)),
  driverIds: z.array(z.enum(knownAgentSimulationUncertaintyDriverIds)),
  maxSeverity: z.enum(agentTraceSeverityValues),
  profileIncludedRaw: z.literal(false)
});

const uncertaintyProfileSummaryEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("uncertainty_profile_summary"),
  payload: uncertaintyProfileSummaryPayloadSchema
});

export const uncertaintyReductionPlanPayloadSchema = z.object({
  schemaVersion: z.literal(
    uncertaintyReductionPlanSummaryForTraceSchemaVersion
  ),
  stepKinds: z.array(z.enum(uncertaintyReductionStepKinds)),
  planIncludedRaw: z.literal(false),
  executableSteps: z.literal(false)
});

const uncertaintyReductionPlanEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("uncertainty_reduction_plan"),
  payload: uncertaintyReductionPlanPayloadSchema
});

export const advisoryRouterResultPayloadSchema = z.object({
  schemaVersion: z.literal(uncertaintyRouterResultSummaryForTraceSchemaVersion),
  advisoryDecision: z.enum(agentTraceProductionDecisionValues),
  advisoryOnly: z.literal(true),
  authoritative: z.literal(false),
  routerResultIncludedRaw: z.literal(false)
});

const advisoryRouterResultEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("advisory_router_result"),
  payload: advisoryRouterResultPayloadSchema
});

const agentFollowupActionEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("agent_followup_action"),
  payload: z.object({
    agentResponseCategory: z.enum(agentSimulationResponseToStepHarborValues),
    uncertaintyReduced: z.boolean(),
    followupActionCategory: z.enum(agentTraceActionCategoryValues),
    rawActionIncluded: z.literal(false),
    executable: z.literal(false)
  })
});

const retryDecisionEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("retry_decision"),
  payload: z.object({
    loopShape: z.enum(agentSimulationLoopShapes),
    agentResponseCategory: z.enum(agentSimulationResponseToStepHarborValues),
    retryWouldBeAttempted: z.boolean(),
    retryExecuted: z.literal(false)
  })
});

const humanReviewRequestedEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("human_review_requested"),
  payload: z.object({
    requestCategory: categoryIdSchema,
    reviewCompleted: z.literal(false),
    notesCategoryOnly: z.literal(true)
  })
});

const humanReviewResultEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("human_review_result"),
  payload: z.object({
    reviewStatus: z.enum(agentTraceReviewStatusValues),
    resultCategory: categoryIdSchema,
    realReviewCompleted: z.literal(false),
    notesCategoryOnly: z.literal(true)
  })
});

const validationObservedEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("validation_observed"),
  payload: z.object({
    validationCategory: categoryIdSchema,
    rawValidationLogIncluded: z.literal(false),
    validationExecutedByTrace: z.literal(false)
  })
});

const outcomeLabelAssignedEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("outcome_label_assigned"),
  payload: z.object({
    outcomeLabels: z.array(z.enum(agentTraceOutcomeCategoryValues)).min(1),
    labelSource: z.enum(["synthetic_example", "future_review"]),
    notesCategoryOnly: z.literal(true)
  })
});

const traceReviewCompletedEventSchema = traceEventBaseSchema.extend({
  eventKind: z.literal("trace_review_completed"),
  payload: z.object({
    reviewStatus: z.enum(agentTraceReviewStatusValues),
    realReviewCompleted: z.literal(false),
    notesCategoryOnly: z.literal(true)
  })
});

export const agentTraceEventSchema = z.discriminatedUnion("eventKind", [
  taskPresentedEventSchema,
  proposedActionEventSchema,
  stepHarborDecisionEventSchema,
  uncertaintyProfileSummaryEventSchema,
  uncertaintyReductionPlanEventSchema,
  advisoryRouterResultEventSchema,
  agentFollowupActionEventSchema,
  retryDecisionEventSchema,
  humanReviewRequestedEventSchema,
  humanReviewResultEventSchema,
  validationObservedEventSchema,
  outcomeLabelAssignedEventSchema,
  traceReviewCompletedEventSchema
]);

export type AgentTraceEvent = z.infer<typeof agentTraceEventSchema>;

const baselineSlotSchema = z.object({
  status: z.enum(agentTraceBaselineStatusValues),
  likelyOutcomeCategory: z.enum(agentTraceBaselineLikelyOutcomeCategoryValues)
});

export const agentActionTraceSchema = z.object({
  schemaVersion: z.literal(agentActionTraceSchemaVersion),
  traceId: traceIdSchema,
  createdAtCategory: categoryIdSchema,
  source: z.enum(agentTraceSourceValues),
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  scenarioFamily: z.enum(agentSimulationScenarioFamilies),
  fixtureRef: categoryIdSchema,
  taskPromptCategory: categoryIdSchema,
  syntheticPromptSummary: safeStringSchema,
  agent: agentTraceAgentSchema,
  traceEvents: z.array(agentTraceEventSchema).min(1),
  finalOutcome: z.object({
    outcomeCategory: z.enum(agentTraceOutcomeCategoryValues),
    taskCompletedCategory: z.enum(agentTraceTaskCompletedCategoryValues),
    safetyOutcomeCategory: z.enum(agentTraceSafetyOutcomeCategoryValues),
    frictionCategory: z.enum(agentTraceFrictionCategoryValues)
  }),
  review: z.object({
    reviewStatus: z.enum(agentTraceReviewStatusValues),
    reviewerKind: z.enum(agentTraceReviewerKindValues),
    labels: z.array(z.enum(agentTraceOutcomeCategoryValues)),
    notesCategoryOnly: z.literal(true)
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
  claimBoundaries: z.object({
    syntheticExampleOnly: z.boolean(),
    realAgentRun: z.literal(false),
    realTraceCollected: z.literal(false),
    codexRun: z.literal(false),
    agentValidationClaimed: z.literal(false),
    realWorldValidationClaimed: z.literal(false),
    conformalGuaranteeClaimed: z.literal(false),
    statisticalGuaranteeClaimed: z.literal(false),
    productionRoutingChanged: z.literal(false)
  }),
  notes: z.array(safeStringSchema)
});

export type AgentActionTrace = z.infer<typeof agentActionTraceSchema>;

export const validateAgentActionTrace = (trace: unknown): AgentActionTrace =>
  agentActionTraceSchema.parse(trace);

const forbiddenTracePatterns = [
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

export const agentActionTraceContainsForbiddenRawString = (
  trace: unknown
): boolean => {
  const serialized = JSON.stringify(trace);

  return forbiddenTracePatterns.some((pattern) => pattern.test(serialized));
};

export const validateAgentActionTraceSafety = (
  trace: AgentActionTrace
): void => {
  if (agentActionTraceContainsForbiddenRawString(trace)) {
    throw new Error(
      `Trace contains forbidden raw-looking value: ${trace.traceId}`
    );
  }
};
