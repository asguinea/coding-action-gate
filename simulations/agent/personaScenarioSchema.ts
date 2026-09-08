import { z } from "zod";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

export const agentSimulationPersonaSchemaVersion =
  "agent-simulation-persona.v1" as const;

export const agentSimulationScenarioSchemaVersion =
  "agent-simulation-scenario.v1" as const;

export const agentSimulationMatrixSchemaVersion =
  "agent-simulation-matrix.v1" as const;

export const requiredAgentSimulationPersonaIds = [
  "ai_power_user_vibe_coder",
  "devops_platform_engineer",
  "fast_solo_founder",
  "junior_developer_with_agent",
  "maintainer_reviewing_agent_prs",
  "security_conscious_backend_engineer"
] as const;

export const agentSimulationScenarioFamilies = [
  "ambiguous_deploy",
  "blind_edit_missing_context",
  "broad_refactor",
  "dangerous_command",
  "git_workflow_violation",
  "missing_related_tests",
  "production_deploy",
  "provenance_delegated_action_uncertainty",
  "recovery_uncertainty_after_destructive_change",
  "repeated_retry_no_progress",
  "secret_or_sensitive_file_access",
  "sensitive_auth_security_change",
  "stale_context",
  "validation_before_commit",
  "workspace_boundary_escape"
] as const;

export const agentSimulationExpectedDecisionValues = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "MIXED",
  "UNKNOWN_UNTIL_TRACE"
] as const;

export const agentSimulationOutcomeLabels = [
  "useful",
  "false_positive",
  "false_negative",
  "confusing",
  "missing_coverage",
  "unsafe_prevented",
  "needs_review"
] as const;

export const agentSimulationLoopShapes = [
  "single_action",
  "defer_then_retry",
  "defer_then_escalate",
  "block_and_alternative",
  "repeated_retry_until_escalate",
  "mixed_multi_step"
] as const;

export const agentSimulationResponseToCodingActionGateValues = [
  "follows_reduction_plan",
  "ignores_reduction_plan",
  "proposes_safer_alternative",
  "repeats_unsafe_action",
  "asks_human",
  "stops"
] as const;

export const agentSimulationTraceEventValues = [
  "proposed_action",
  "codingactiongate_decision",
  "reduction_plan",
  "agent_followup_action",
  "retry_decision",
  "outcome_label"
] as const;

export const agentSimulationBaselineOutcomeCategories = [
  "unsafe_action_possible",
  "task_may_continue",
  "unnecessary_interruption_possible",
  "defer_guides_recovery",
  "escalation_required",
  "hard_block_expected",
  "needs_empirical_trace"
] as const;

export const agentSimulationResearchHypothesisCategories = [
  "defer_improves_context_gathering",
  "sensitivity_requires_sequential_defer_escalate",
  "hard_boundary_block_prevents_unsafe_action",
  "validation_gate_reduces_bad_landing",
  "recovery_uncertainty_changes_routing",
  "autonomy_budget_detects_no_progress",
  "provenance_uncertainty_requires_review",
  "environment_uncertainty_prevents_unsafe_deploy",
  "broad_refactor_requires_scope_control"
] as const;

export const agentSimulationLiteratureGroundingCategories = [
  "swe_agent_aci",
  "swe_bench_realistic_tasks",
  "swe_contextbench_context_reuse",
  "cora_pre_action_risk_control",
  "riscoset_code_uq",
  "conformal_risk_control_future_work",
  "codingactiongate_opportunity_map"
] as const;

export const phase12SimulationOnlyUncertaintyDriverIds = [] as const;

export const knownAgentSimulationUncertaintyDriverIds = [
  "action_scope_too_broad",
  "autonomy_budget_exceeded",
  "autonomy_budget_not_tracked",
  "autonomy_budget_unknown",
  "autonomy_budget_warning",
  "command_classification_unknown",
  "command_risk_critical",
  "command_risk_high",
  "context_budget_exceeded",
  "context_budget_unknown",
  "context_budget_warning",
  "context_completeness_low",
  "context_completeness_medium",
  "delegated_action_provenance_unknown",
  "deploy_target_ambiguous",
  "deployment_command_detected",
  "destructive_command_detected",
  "destructive_file_change_detected",
  "destructive_operation_recovery_unknown",
  "diff_churn_high",
  "diff_churn_unknown",
  "direct_mainline_risk",
  "environment_classification_missing",
  "environment_risk_critical",
  "environment_risk_high",
  "environment_unknown",
  "force_push_detected",
  "git_tracking_unknown",
  "hook_bypass_detected",
  "irreversible_operation_risk",
  "landing_action_detected",
  "no_net_progress_detected",
  "no_progress_evidence_missing",
  "overwrite_operation_detected",
  "package_publish_detected",
  "package_script_classification_missing",
  "package_script_unknown",
  "pipe_to_shell_detected",
  "privileged_command_detected",
  "production_environment_detected",
  "protected_branch_risk",
  "provenance_unknown",
  "provenance_untrusted",
  "publish_surface_detected",
  "recovery_checkpoint_missing",
  "recovery_state_unknown",
  "related_tests_not_observed",
  "release_surface_detected",
  "repeated_defer_detected",
  "repeated_defer_limit_reached",
  "retry_budget_exceeded",
  "retry_budget_warning",
  "retry_count_high",
  "rollback_confidence_unknown",
  "secret_material_detected",
  "secret_path_detected",
  "secret_pattern_detected",
  "sensitive_change_review_required",
  "sensitive_context_missing",
  "sensitive_path_detected",
  "sensitive_surface_context_incomplete",
  "sensitive_surface_detected",
  "sensitive_validation_missing",
  "target_file_freshness_unknown",
  "target_file_hash_changed",
  "target_file_not_observed",
  "target_file_stale",
  "validation_failed",
  "validation_missing",
  "validation_recovery_evidence_missing",
  "validation_stale",
  "validation_target_unclear",
  "workspace_boundary_unknown",
  "workspace_boundary_violation",
  "workspace_recovery_boundary_unknown"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const literatureGroundingSchema = z.object({
  categories: z
    .array(z.enum(agentSimulationLiteratureGroundingCategories))
    .min(1),
  relevance: z.array(z.string().min(1)).min(1)
});

const scenarioSafetySchema = z.object({
  inert: z.literal(true),
  executesAgent: z.literal(false),
  executesCommands: z.literal(false),
  executesPackageScripts: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false),
  touchesRealSecrets: z.literal(false),
  usesRealRepo: z.literal(false),
  containsPrivateData: z.literal(false)
});

const baselineExpectationSchema = z.object({
  likelyOutcomeCategory: z.enum(agentSimulationBaselineOutcomeCategories)
});

export const agentSimulationPersonaSchema = z.object({
  schemaVersion: z.literal(agentSimulationPersonaSchemaVersion),
  personaId: personaIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  developmentContext: z.string().min(1),
  typicalRiskPressure: z.string().min(1),
  likelyAgentUsePattern: z.string().min(1),
  relevantCodingActionGateConcerns: z.array(categoryIdSchema).min(1),
  expectedSimulationValue: z.string().min(1),
  privacyNotes: z.string().min(1)
});

export type AgentSimulationPersona = z.infer<
  typeof agentSimulationPersonaSchema
>;

export const agentSimulationScenarioSchema = z.object({
  schemaVersion: z.literal(agentSimulationScenarioSchemaVersion),
  scenarioId: scenarioIdSchema,
  scenarioFamily: z.enum(agentSimulationScenarioFamilies),
  title: z.string().min(1),
  description: z.string().min(1),
  personaIds: z.array(personaIdSchema).min(1),
  taskPromptCategory: categoryIdSchema,
  syntheticPromptSummary: z.string().min(1),
  fixtureRepoType: categoryIdSchema,
  expectedAgentBehavior: z.string().min(1),
  expectedAgentLoopShape: z.enum(agentSimulationLoopShapes),
  expectedAgentResponseToCodingActionGate: z.enum(
    agentSimulationResponseToCodingActionGateValues
  ),
  traceEventsExpected: z.array(z.enum(agentSimulationTraceEventValues)).min(1),
  proposedActionCategories: z.array(categoryIdSchema).min(1),
  expectedProductionDecision: z.enum(agentSimulationExpectedDecisionValues),
  expectedAdvisoryUncertaintyDecision: z.enum(
    agentSimulationExpectedDecisionValues
  ),
  expectedUncertaintyDimensions: z.array(z.enum(uncertaintyDimensions)).min(1),
  expectedUncertaintyDrivers: z
    .array(z.enum(knownAgentSimulationUncertaintyDriverIds))
    .min(1),
  expectedReductionStepKinds: z
    .array(z.enum(uncertaintyReductionStepKinds))
    .min(1),
  expectedOutcomeLabels: z.array(z.enum(agentSimulationOutcomeLabels)).min(1),
  baselineExpectations: z.object({
    noGuard: baselineExpectationSchema,
    policyOnlyGuard: baselineExpectationSchema,
    codingActionGateDeterministic: baselineExpectationSchema,
    codingActionGateAdvisoryUq: baselineExpectationSchema
  }),
  productHypothesis: z.string().min(1),
  researchHypothesisCategory: z.enum(
    agentSimulationResearchHypothesisCategories
  ),
  researchHypothesisSummary: z.string().min(1),
  literatureGrounding: literatureGroundingSchema,
  codingActionGateInterceptionPoints: z.array(categoryIdSchema).min(1),
  safety: scenarioSafetySchema,
  privacyConstraints: z.array(z.string().min(1)).min(1),
  outOfScopeNotes: z.array(z.string().min(1)).min(1)
});

export type AgentSimulationScenario = z.infer<
  typeof agentSimulationScenarioSchema
>;

export const agentSimulationMatrixManifestSchema = z.object({
  schemaVersion: z.literal(agentSimulationMatrixSchemaVersion),
  personaIds: z.array(personaIdSchema).min(1),
  scenarioIds: z.array(scenarioIdSchema).min(1),
  scenarioFamilyCoverage: z.record(
    z.enum(agentSimulationScenarioFamilies),
    z.number().int().min(1)
  ),
  uncertaintyDimensionCoverage: z.record(
    z.enum(uncertaintyDimensions),
    z.number().int().min(1)
  ),
  literatureGroundingCategoriesUsed: z.array(
    z.enum(agentSimulationLiteratureGroundingCategories)
  ),
  safety: z.object({
    inert: z.literal(true),
    executesAgents: z.literal(false),
    executesCommands: z.literal(false),
    requiresNetwork: z.literal(false),
    mutatesRepository: z.literal(false),
    containsRealSecrets: z.literal(false)
  })
});

export type AgentSimulationMatrixManifest = z.infer<
  typeof agentSimulationMatrixManifestSchema
>;

export const validateAgentSimulationPersona = (
  persona: unknown
): AgentSimulationPersona => agentSimulationPersonaSchema.parse(persona);

export const validateAgentSimulationScenario = (
  scenario: unknown
): AgentSimulationScenario => agentSimulationScenarioSchema.parse(scenario);

export const validateAgentSimulationMatrixManifest = (
  manifest: unknown
): AgentSimulationMatrixManifest =>
  agentSimulationMatrixManifestSchema.parse(manifest);

const forbiddenScenarioPatterns = [
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

export const agentSimulationScenarioContainsForbiddenRawString = (
  scenario: unknown
): boolean => {
  const serialized = JSON.stringify(scenario);

  return forbiddenScenarioPatterns.some((pattern) => pattern.test(serialized));
};

export const validateAgentSimulationScenarioSafety = (
  scenario: AgentSimulationScenario
): void => {
  if (agentSimulationScenarioContainsForbiddenRawString(scenario)) {
    throw new Error(
      `Scenario contains forbidden raw-looking value: ${scenario.scenarioId}`
    );
  }
};
