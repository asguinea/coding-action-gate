import type { CodingActionGateSignals } from "../../src/domain/signals.js";
import type {
  AutonomyBudgetProfileInput,
  BuildUncertaintyProfileInput
} from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import type { OpportunityBenchmarkFixture } from "./fixtureSchema.js";
import type { OpportunityBenchmarkScenario } from "./scenarioSchema.js";

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort();

const allScenarioCategories = (
  scenario: OpportunityBenchmarkScenario
): string[] =>
  uniqueSorted(
    [
      scenario.action.type,
      scenario.action.category,
      scenario.action.commandCategory,
      scenario.action.pathCategory,
      scenario.action.environmentCategory,
      scenario.action.inertExampleCategory,
      ...scenario.expected.uncertaintyDrivers,
      ...(scenario.expected.hardBlockDrivers ?? []),
      ...(scenario.expected.escalationDrivers ?? []),
      ...(scenario.expected.deferDrivers ?? [])
    ].filter((value): value is string => value !== undefined)
  );

export const categoryIdsForScenario = (
  scenario: OpportunityBenchmarkScenario,
  fixtures: OpportunityBenchmarkFixture[]
): string[] => {
  const scenarioCategories = allScenarioCategories(scenario);
  const scenarioCategorySet = new Set(scenarioCategories);
  const matchingFixtureCategories = fixtures
    .filter((fixture) => scenario.fixtureRefs?.includes(fixture.id) === true)
    .flatMap((fixture) => fixture.categoryMarkers ?? [])
    .filter((category) => scenarioCategorySet.has(category));

  return uniqueSorted([...scenarioCategories, ...matchingFixtureCategories]);
};

const mergeSignals = (
  signals: CodingActionGateSignals,
  update: CodingActionGateSignals
): void => {
  Object.assign(signals, update);
};

const mergeAutonomyBudget = (
  autonomyBudget: AutonomyBudgetProfileInput,
  update: AutonomyBudgetProfileInput
): void => {
  Object.assign(autonomyBudget, update);
};

export const buildSyntheticProfileInput = (
  scenario: OpportunityBenchmarkScenario,
  fixtures: OpportunityBenchmarkFixture[]
): BuildUncertaintyProfileInput => {
  const categories = new Set(categoryIdsForScenario(scenario, fixtures));
  const signals: CodingActionGateSignals = {};
  const autonomyBudget: AutonomyBudgetProfileInput = {};

  if (categories.has("target_file_not_observed")) {
    mergeSignals(signals, { targetFileReadRecently: false });
  }

  if (
    categories.has("target_file_stale") ||
    categories.has("target_file_hash_changed")
  ) {
    mergeSignals(signals, {
      targetFileFreshness: "stale",
      fileChangedSinceRead: categories.has("target_file_hash_changed")
    });
  }

  if (categories.has("validation_missing")) {
    mergeSignals(signals, {
      validationRequired: true,
      validationStatus: "not_run"
    });
  }

  if (categories.has("validation_failed")) {
    mergeSignals(signals, {
      validationRequired: true,
      validationStatus: "failed"
    });
  }

  if (categories.has("command_risk_critical")) {
    mergeSignals(signals, { commandRiskScore: "critical" });
  }

  if (categories.has("destructive_command_detected")) {
    mergeSignals(signals, {
      destructiveOperation: true,
      destructiveSeverity: categories.has("command_risk_critical")
        ? "critical"
        : "high"
    });
  }

  if (
    categories.has("destructive_file_change_detected") ||
    categories.has("destructive_operation_recovery_unknown") ||
    categories.has("recovery_state_unknown") ||
    categories.has("rollback_confidence_unknown") ||
    categories.has("recovery_checkpoint_missing")
  ) {
    mergeSignals(signals, {
      destructiveOperation: true,
      destructiveSeverity:
        categories.has("irreversible_operation_risk") ||
        categories.has("command_risk_critical")
          ? "critical"
          : "high"
    });
  }

  if (categories.has("overwrite_operation_detected")) {
    mergeSignals(signals, {
      destructiveOperation: true,
      destructiveSubtype: "overwrite"
    });
  }

  if (categories.has("workspace_boundary_violation")) {
    mergeSignals(signals, { workspaceBoundaryViolation: true });
  }

  if (categories.has("workspace_recovery_boundary_unknown")) {
    mergeSignals(signals, {
      destructiveOperation: true,
      workspaceBoundaryStatus: "unknown"
    });
  }

  if (categories.has("secret_path_detected")) {
    mergeSignals(signals, { secretPathMatch: true });
  }

  if (categories.has("secret_pattern_detected")) {
    mergeSignals(signals, { secretPatternMatch: true });
  }

  if (categories.has("secret_material_detected")) {
    mergeSignals(signals, { secretTouch: "confirmed" });
  }

  if (
    categories.has("sensitive_path_detected") ||
    categories.has("sensitive_context_missing") ||
    categories.has("sensitive_change_review_required")
  ) {
    mergeSignals(signals, { pathSensitivity: "high" });
  }

  if (categories.has("sensitive_context_missing")) {
    mergeSignals(signals, {
      targetFileReadRecently: false,
      contextCompletenessScore: 0.4
    });
  }

  if (categories.has("sensitive_change_review_required")) {
    mergeSignals(signals, {
      targetFileReadRecently: true,
      relatedTestsRead: true,
      contextCompletenessScore: 0.8
    });
  }

  if (categories.has("force_push_detected")) {
    mergeSignals(signals, { forcePush: true });
  }

  if (categories.has("protected_branch_risk")) {
    mergeSignals(signals, { protectedBranch: true });
  }

  if (categories.has("direct_mainline_risk")) {
    mergeSignals(signals, { directMainlineCommit: true });
  }

  if (categories.has("landing_action_detected")) {
    mergeSignals(signals, {
      landingAction: true,
      landingRisk: categories.has("protected_branch_risk") ? "high" : "medium"
    });
  }

  if (
    categories.has("environment_unknown") ||
    categories.has("deploy_target_ambiguous")
  ) {
    mergeSignals(signals, {
      environmentClassification: "unknown",
      landingAction: true,
      landingActionType: "deploy"
    });
  }

  if (categories.has("deployment_command_detected")) {
    mergeSignals(signals, {
      landingAction: true,
      landingActionType: "deploy",
      ...(categories.has("environment_risk_critical")
        ? { deploymentRisk: "critical" as const }
        : {})
    });
  }

  if (categories.has("production_environment_detected")) {
    mergeSignals(signals, {
      environmentClassification: "production",
      deploymentRisk: "critical",
      landingAction: true,
      landingActionType: "deploy"
    });
  }

  if (categories.has("environment_risk_critical")) {
    mergeSignals(signals, { deploymentRisk: "critical" });
  }

  if (categories.has("retry_budget_exceeded")) {
    mergeAutonomyBudget(autonomyBudget, {
      relevant: true,
      retryBudgetStatus: "exceeded"
    });
  }

  if (categories.has("repeated_defer_detected")) {
    mergeAutonomyBudget(autonomyBudget, {
      relevant: true,
      repeatedDeferCount: 2
    });
  }

  if (categories.has("no_net_progress_detected")) {
    mergeAutonomyBudget(autonomyBudget, {
      relevant: true,
      noNetProgress: true,
      progressState: "no_progress"
    });
  }

  if (categories.has("action_scope_too_broad")) {
    mergeAutonomyBudget(autonomyBudget, {
      relevant: true,
      actionScope: "broad"
    });
  }

  if (categories.has("provenance_unknown")) {
    mergeSignals(signals, { delegationProvenance: "unknown" });
  }

  if (categories.has("provenance_untrusted")) {
    mergeSignals(signals, { delegationProvenance: "untrusted" });
  }

  return {
    signals,
    ...(Object.keys(autonomyBudget).length > 0 ? { autonomyBudget } : {})
  };
};
