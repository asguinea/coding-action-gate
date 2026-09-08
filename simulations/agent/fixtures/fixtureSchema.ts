import { z } from "zod";
import {
  agentSimulationScenarioFamilies,
  knownAgentSimulationUncertaintyDriverIds
} from "../personaScenarioSchema.js";
import {
  agentActionTraceSchemaVersion,
  agentTraceEventKindValues,
  agentTracePrivacySchema,
  agentTraceSafetySchema
} from "../traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../../src/uncertainty/uncertaintyTypes.js";

export const agentSimulationFixtureSchemaVersion =
  "agent-simulation-fixture.v1" as const;

export const agentSimulationFixtureRepoTypes = [
  "synthetic_node_service",
  "synthetic_frontend_app",
  "synthetic_cli_tool",
  "synthetic_monorepo",
  "synthetic_infra_config",
  "synthetic_auth_service",
  "synthetic_package_library",
  "synthetic_docs_site",
  "synthetic_unknown_repo"
] as const;

export const agentSimulationFixturePathCategories = [
  "application_code",
  "test_code",
  "auth_security_code",
  "config",
  "ci_workflow",
  "package_metadata",
  "docs",
  "secret_like_path",
  "deployment_surface",
  "workspace_external_path",
  "unknown"
] as const;

export const agentSimulationFixtureRoleCategories = [
  "target_file",
  "related_context",
  "related_test",
  "validation_config",
  "package_metadata",
  "deployment_config",
  "secret_sensitive_surface",
  "recovery_metadata",
  "unknown"
] as const;

export const agentSimulationFixtureSensitivityCategories = [
  "none",
  "low",
  "medium",
  "high",
  "secret_like",
  "unknown"
] as const;

export const agentSimulationFixtureObservedStateCategories = [
  "observed",
  "not_observed",
  "stale_observation",
  "unknown"
] as const;

export const agentSimulationFixtureFreshnessCategories = [
  "fresh",
  "stale",
  "missing",
  "unknown"
] as const;

export const agentSimulationFixtureBooleanStateValues = [
  "true",
  "false",
  "unknown"
] as const;

export const agentSimulationFixtureValidationStateCategories = [
  "missing",
  "passing",
  "failing",
  "stale",
  "unknown",
  "not_applicable"
] as const;

export const agentSimulationFixtureDeployTargetCategories = [
  "local",
  "staging_like",
  "production_like",
  "ambiguous",
  "unknown",
  "not_applicable"
] as const;

export const agentSimulationFixtureCheckpointCategories = [
  "available",
  "missing",
  "unknown",
  "not_applicable"
] as const;

export const agentSimulationFixtureRollbackPlanCategories = [
  "documented",
  "missing",
  "unknown",
  "not_applicable"
] as const;

export const agentSimulationFixtureActionCategories = [
  "read_file",
  "inspect_git_state",
  "validate",
  "run_tests",
  "inspect_related_context",
  "request_human_review",
  "edit_file",
  "delete_file",
  "run_command",
  "git_commit",
  "git_push",
  "deploy",
  "publish",
  "git_reset_or_clean"
] as const;

export const fixtureOnlySimulationDriverIds = [] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const fixtureIdSchema = z
  .string()
  .min(1)
  .regex(/^fixture[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const fileRefSchema = z
  .string()
  .min(1)
  .regex(/^file_[a-z0-9_]+$/);

const directoryRefSchema = z
  .string()
  .min(1)
  .regex(/^directory_[a-z0-9_]+$/);

export const agentSimulationFixtureFileEntrySchema = z.object({
  fileRef: fileRefSchema,
  pathCategory: z.enum(agentSimulationFixturePathCategories),
  roleCategory: z.enum(agentSimulationFixtureRoleCategories),
  sensitivityCategory: z.enum(agentSimulationFixtureSensitivityCategories),
  observedStateCategory: z.enum(agentSimulationFixtureObservedStateCategories),
  freshnessCategory: z.enum(agentSimulationFixtureFreshnessCategories),
  contentIncluded: z.literal(false),
  rawPathIncluded: z.literal(false),
  rawSourceIncluded: z.literal(false)
});

export const agentSimulationFixtureDirectoryEntrySchema = z.object({
  directoryRef: directoryRefSchema,
  roleCategory: z.enum(agentSimulationFixtureRoleCategories),
  rawPathIncluded: z.literal(false)
});

export const agentSimulationFixtureSchema = z.object({
  schemaVersion: z.literal(agentSimulationFixtureSchemaVersion),
  fixtureId: fixtureIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  fixtureRepoType: z.enum(agentSimulationFixtureRepoTypes),
  linkedScenarioIds: z.array(scenarioIdSchema).min(1),
  linkedPersonaIds: z.array(personaIdSchema).min(1),
  scenarioFamilies: z.array(z.enum(agentSimulationScenarioFamilies)).min(1),
  taskPromptCategories: z.array(categoryIdSchema).min(1),
  syntheticFileMap: z.object({
    files: z.array(agentSimulationFixtureFileEntrySchema).min(1),
    directories: z.array(agentSimulationFixtureDirectoryEntrySchema).min(1)
  }),
  validationSurface: z.object({
    validationConfigured: z.enum(agentSimulationFixtureBooleanStateValues),
    validationRequiredForLanding: z.enum(
      agentSimulationFixtureBooleanStateValues
    ),
    validationStateCategory: z.enum(
      agentSimulationFixtureValidationStateCategories
    ),
    validationCommandIncluded: z.literal(false),
    rawValidationLogsIncluded: z.literal(false),
    relatedTestsKnown: z.enum(agentSimulationFixtureBooleanStateValues)
  }),
  gitWorkflowSurface: z.object({
    gitStateKnown: z.enum(agentSimulationFixtureBooleanStateValues),
    protectedBranchRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    landingActionRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    riskyGitOperationRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    rawBranchNameIncluded: z.literal(false),
    rawGitCommandIncluded: z.literal(false)
  }),
  environmentSurface: z.object({
    environmentKnown: z.enum(agentSimulationFixtureBooleanStateValues),
    deployRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    productionRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    publishRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    deployTargetCategory: z.enum(agentSimulationFixtureDeployTargetCategories),
    rawDeployTargetIncluded: z.literal(false),
    rawEnvValuesIncluded: z.literal(false)
  }),
  sensitivitySurface: z.object({
    sensitivePathRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    secretLikeSurfaceRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    authSecurityRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    privateDataRelevant: z.enum(agentSimulationFixtureBooleanStateValues),
    rawSecretIncluded: z.literal(false),
    rawPrivateDataIncluded: z.literal(false)
  }),
  recoverySurface: z.object({
    destructiveOrHighImpactRelevant: z.enum(
      agentSimulationFixtureBooleanStateValues
    ),
    recoveryStateKnown: z.enum(agentSimulationFixtureBooleanStateValues),
    checkpointAvailableCategory: z.enum(
      agentSimulationFixtureCheckpointCategories
    ),
    rollbackPlanCategory: z.enum(agentSimulationFixtureRollbackPlanCategories),
    rawBackupPathIncluded: z.literal(false),
    checkpointCreatedByFixture: z.literal(false)
  }),
  expectedSafeActionCategories: z
    .array(z.enum(agentSimulationFixtureActionCategories))
    .min(1),
  expectedRiskyActionCategories: z
    .array(z.enum(agentSimulationFixtureActionCategories))
    .min(1),
  expectedUncertaintyDimensions: z.array(z.enum(uncertaintyDimensions)).min(1),
  expectedUncertaintyDrivers: z
    .array(z.enum(knownAgentSimulationUncertaintyDriverIds))
    .min(1),
  expectedReductionStepKinds: z
    .array(z.enum(uncertaintyReductionStepKinds))
    .min(1),
  codingActionGateInterceptionPoints: z.array(categoryIdSchema).min(1),
  futureTraceCompatibility: z.object({
    compatibleTraceSchemaVersion: z.literal(agentActionTraceSchemaVersion),
    supportsSyntheticExamples: z.literal(true),
    supportsControlledSimulation: z.literal(true),
    supportsRealTrial: z.literal(false),
    fixtureRef: fixtureIdSchema,
    expectedTraceEventKinds: z.array(z.enum(agentTraceEventKindValues)).min(1),
    expectedLoopShapes: z.array(categoryIdSchema).min(1)
  }),
  safety: agentTraceSafetySchema,
  privacy: agentTracePrivacySchema,
  outOfScopeNotes: z.array(z.string().min(1)).min(1)
});

export type AgentSimulationFixture = z.infer<
  typeof agentSimulationFixtureSchema
>;

export const validateAgentSimulationFixture = (
  fixture: unknown
): AgentSimulationFixture => agentSimulationFixtureSchema.parse(fixture);

const forbiddenFixturePatterns = [
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

export const agentSimulationFixtureContainsForbiddenRawString = (
  fixture: unknown
): boolean => {
  const serialized = JSON.stringify(fixture);

  return forbiddenFixturePatterns.some((pattern) => pattern.test(serialized));
};

export const validateAgentSimulationFixtureSafety = (
  fixture: AgentSimulationFixture
): void => {
  if (agentSimulationFixtureContainsForbiddenRawString(fixture)) {
    throw new Error(
      `Fixture contains forbidden raw-looking value: ${fixture.fixtureId}`
    );
  }
};
