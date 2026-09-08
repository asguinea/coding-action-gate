import { z } from "zod";
import { decisionPostureSchema } from "../../src/domain/decisions.js";
import { uncertaintyReductionStepKinds } from "../../src/uncertainty/uncertaintyTypes.js";

export const opportunityBenchmarkScenarioSchemaVersion =
  "opportunity-benchmark-scenario.v1" as const;

export const opportunityProblemFamilies = [
  "destructive_edits_deletes_reverts",
  "dangerous_commands_boundary_escapes",
  "secrets_exfiltration",
  "git_workflow_repo_integrity",
  "missing_stale_low_quality_context",
  "skipped_absent_misleading_verification",
  "runaway_loops_token_burn_context_collapse",
  "sensitive_surfaces_large_diffs",
  "subagent_plugin_provenance",
  "environment_deploy_uncertainty"
] as const;

export const opportunityProblemFamilySchema = z.enum(
  opportunityProblemFamilies
);

export type OpportunityProblemFamily = z.infer<
  typeof opportunityProblemFamilySchema
>;

export const opportunityScenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/);

export const opportunityCategoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const opportunityScenarioActionSchema = z.object({
  type: opportunityCategoryIdSchema,
  category: opportunityCategoryIdSchema,
  commandCategory: opportunityCategoryIdSchema.optional(),
  pathCategory: opportunityCategoryIdSchema.optional(),
  environmentCategory: opportunityCategoryIdSchema.optional(),
  inertExampleCategory: opportunityCategoryIdSchema.optional()
});

export const opportunityScenarioExpectedSchema = z.object({
  productionDecision: decisionPostureSchema.optional(),
  advisoryRouterDecision: decisionPostureSchema,
  uncertaintyDrivers: z.array(opportunityCategoryIdSchema),
  reductionStepKinds: z.array(z.enum(uncertaintyReductionStepKinds)).optional(),
  hardBlockDrivers: z.array(opportunityCategoryIdSchema).optional(),
  escalationDrivers: z.array(opportunityCategoryIdSchema).optional(),
  deferDrivers: z.array(opportunityCategoryIdSchema).optional()
});

export const opportunityScenarioSafetySchema = z.object({
  inert: z.literal(true),
  executesCommands: z.literal(false),
  touchesRealSecrets: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false)
});

export const opportunityFixtureIdSchema = z
  .string()
  .min(1)
  .regex(/^fixture-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const opportunityBenchmarkScenarioSchema = z.object({
  schemaVersion: z.literal(opportunityBenchmarkScenarioSchemaVersion),
  id: opportunityScenarioIdSchema,
  title: z.string().min(1),
  problemFamily: opportunityProblemFamilySchema,
  sourceFromOpportunityMap: z.string().min(1),
  description: z.string().min(1),
  action: opportunityScenarioActionSchema,
  expected: opportunityScenarioExpectedSchema,
  safety: opportunityScenarioSafetySchema,
  fixtureRefs: z.array(opportunityFixtureIdSchema).min(1).optional(),
  fixtureRequired: z.literal(false).optional(),
  fixtureReason: z.string().min(1).optional(),
  notes: z.array(z.string().min(1)).optional()
});

export type OpportunityBenchmarkScenario = z.infer<
  typeof opportunityBenchmarkScenarioSchema
>;

export const validateOpportunityBenchmarkScenario = (
  scenario: unknown
): OpportunityBenchmarkScenario =>
  opportunityBenchmarkScenarioSchema.parse(scenario);

const forbiddenScenarioPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/tmp\/private/,
  /API_KEY=/,
  /SECRET=/,
  /TOKEN=/,
  /PRIVATE_KEY/,
  /diff --git/,
  /https?:\/\//,
  /api\.internal\.customer\.local/i,
  /feature\/customer-prod/,
  /rm\s+-rf/,
  /npm\s+run/,
  /yarn\s+/,
  /pnpm\s+/,
  /bun\s+run/
] as const;

export const scenarioContainsForbiddenRawString = (
  scenario: unknown
): boolean => {
  const serialized = JSON.stringify(scenario);

  return forbiddenScenarioPatterns.some((pattern) => pattern.test(serialized));
};

export const validateScenarioSafety = (
  scenario: OpportunityBenchmarkScenario
): void => {
  if (scenarioContainsForbiddenRawString(scenario)) {
    throw new Error(
      `Scenario contains forbidden raw-looking value: ${scenario.id}`
    );
  }

  if (
    (scenario.fixtureRefs?.length ?? 0) === 0 &&
    scenario.fixtureRequired !== false
  ) {
    throw new Error(
      `Scenario must include fixture refs or explicitly mark fixtureRequired false: ${scenario.id}`
    );
  }

  if (
    scenario.expected.advisoryRouterDecision !== "PROCEED" &&
    scenario.expected.uncertaintyDrivers.length === 0
  ) {
    throw new Error(
      `Scenario must include uncertainty drivers for non-PROCEED recommendation: ${scenario.id}`
    );
  }

  if (
    scenario.expected.advisoryRouterDecision === "DEFER" &&
    (scenario.expected.reductionStepKinds?.length ?? 0) === 0
  ) {
    throw new Error(
      `DEFER scenario must include expected reduction step kinds: ${scenario.id}`
    );
  }

  if (
    scenario.expected.advisoryRouterDecision === "BLOCK" &&
    (scenario.expected.hardBlockDrivers?.length ?? 0) === 0
  ) {
    throw new Error(
      `BLOCK scenario must include hard block drivers: ${scenario.id}`
    );
  }

  if (
    scenario.expected.advisoryRouterDecision === "ESCALATE" &&
    (scenario.expected.escalationDrivers?.length ?? 0) === 0
  ) {
    throw new Error(
      `ESCALATE scenario must include escalation drivers: ${scenario.id}`
    );
  }
};
