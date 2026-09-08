import { z } from "zod";
import { decisionPostureSchema } from "../domain/decisions.js";
import {
  uncertaintyCategoryIdSchema,
  uncertaintyDimensions,
  uncertaintyReductionStepKinds,
  type UncertaintyProfile,
  type UncertaintyReductionStepKind
} from "./uncertaintyTypes.js";

export const uncertaintyRouterResultSchemaVersion =
  "uncertainty-router-result.v1" as const;

export const uncertaintyRoutingDecisionSchema = decisionPostureSchema;

export type UncertaintyRoutingDecision = z.infer<
  typeof uncertaintyRoutingDecisionSchema
>;

export const uncertaintyRouterConfidenceLevels = [
  "low",
  "medium",
  "high"
] as const;

export const uncertaintyRouterConfidenceSchema = z.enum(
  uncertaintyRouterConfidenceLevels
);

export type UncertaintyRouterConfidence = z.infer<
  typeof uncertaintyRouterConfidenceSchema
>;

export const uncertaintyRouterResultSchema = z.object({
  schemaVersion: z.literal(uncertaintyRouterResultSchemaVersion),
  recommendedDecision: uncertaintyRoutingDecisionSchema,
  confidence: uncertaintyRouterConfidenceSchema,
  rationale: z.array(uncertaintyCategoryIdSchema),
  drivers: z.array(uncertaintyCategoryIdSchema),
  blockingDrivers: z.array(uncertaintyCategoryIdSchema),
  deferDrivers: z.array(uncertaintyCategoryIdSchema),
  escalationDrivers: z.array(uncertaintyCategoryIdSchema),
  reductionPlanAvailable: z.boolean()
});

export type UncertaintyRouterResult = z.infer<
  typeof uncertaintyRouterResultSchema
>;

const blockingDriverIds = [
  "command_risk_critical",
  "pipe_to_shell_detected",
  "secret_path_detected",
  "secret_pattern_detected",
  "secret_material_detected",
  "workspace_boundary_violation",
  "force_push_detected",
  "hook_bypass_detected",
  "production_environment_detected",
  "environment_risk_critical",
  "publish_surface_detected",
  "release_surface_detected",
  "package_publish_detected"
] as const;

const escalationDriverIds = [
  "sensitive_path_detected",
  "sensitive_surface_detected",
  "sensitive_change_review_required",
  "protected_branch_risk",
  "direct_mainline_risk",
  "git_workflow_risk_critical",
  "git_workflow_risk_high",
  "validation_failed",
  "command_risk_high",
  "privileged_command_detected",
  "destructive_command_detected",
  "irreversible_operation_risk",
  "autonomy_budget_exceeded",
  "retry_budget_exceeded",
  "repeated_defer_limit_reached",
  "no_net_progress_detected",
  "context_budget_exceeded",
  "provenance_untrusted",
  "environment_risk_high"
] as const;

const deferDriverIds = [
  "target_file_not_observed",
  "target_file_freshness_unknown",
  "target_file_stale",
  "target_file_hash_changed",
  "target_file_missing",
  "related_tests_not_observed",
  "context_completeness_low",
  "context_completeness_medium",
  "validation_missing",
  "validation_stale",
  "validation_target_unclear",
  "validation_unknown",
  "validation_running",
  "sensitive_context_missing",
  "sensitive_surface_context_incomplete",
  "sensitive_validation_missing",
  "command_classification_unknown",
  "package_script_unknown",
  "package_script_classification_missing",
  "deployment_command_detected",
  "environment_unknown",
  "environment_classification_missing",
  "deploy_target_ambiguous",
  "workspace_boundary_unknown",
  "recovery_state_unknown",
  "rollback_confidence_unknown",
  "destructive_operation_recovery_unknown",
  "recovery_checkpoint_missing",
  "git_tracking_unknown",
  "workspace_recovery_boundary_unknown",
  "validation_recovery_evidence_missing",
  "git_state_unknown",
  "dirty_worktree_detected",
  "autonomy_budget_unknown",
  "autonomy_budget_not_tracked",
  "autonomy_budget_warning",
  "retry_count_unknown",
  "retry_count_high",
  "retry_budget_warning",
  "repeated_defer_detected",
  "no_progress_evidence_missing",
  "action_scope_too_broad",
  "diff_churn_unknown",
  "diff_churn_high",
  "context_budget_unknown",
  "context_budget_warning",
  "provenance_unknown",
  "delegated_action_provenance_unknown",
  "provenance_partial",
  "secret_material_possible"
] as const;

const humanReviewStepKind: UncertaintyReductionStepKind =
  "stop_and_request_human_review";

const ordinaryEvidenceStepKinds = new Set<UncertaintyReductionStepKind>(
  uncertaintyReductionStepKinds.filter((kind) => kind !== humanReviewStepKind)
);

const blockingDrivers = new Set<string>(blockingDriverIds);
const escalationDrivers = new Set<string>(escalationDriverIds);
const deferDrivers = new Set<string>(deferDriverIds);

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort();

const collectDrivers = (profile: UncertaintyProfile): string[] =>
  uniqueSorted(
    uncertaintyDimensions.flatMap(
      (dimension) => profile.dimensions[dimension].drivers
    )
  );

const collectMissingEvidence = (profile: UncertaintyProfile): string[] =>
  uniqueSorted(
    uncertaintyDimensions.flatMap(
      (dimension) => profile.dimensions[dimension].missingEvidence
    )
  );

const filterDrivers = (drivers: string[], driverSet: Set<string>): string[] =>
  drivers.filter((driver) => driverSet.has(driver));

const reductionSteps = (profile: UncertaintyProfile) =>
  profile.uncertaintyReductionPlan?.steps ?? [];

const hasOrdinaryEvidenceStep = (profile: UncertaintyProfile): boolean =>
  reductionSteps(profile).some((step) =>
    ordinaryEvidenceStepKinds.has(step.kind)
  );

const hasOnlyHumanReviewSteps = (profile: UncertaintyProfile): boolean => {
  const steps = reductionSteps(profile);

  return (
    steps.length > 0 && steps.every((step) => step.kind === humanReviewStepKind)
  );
};

const isMeaningfullyUncertain = (profile: UncertaintyProfile): boolean =>
  profile.overallLevel !== "low" || collectMissingEvidence(profile).length > 0;

const sensitiveSurfaceDrivers = new Set<string>([
  "sensitive_path_detected",
  "sensitive_surface_detected",
  "sensitive_change_review_required"
]);

const sensitiveMissingEvidenceDrivers = new Set<string>([
  "sensitive_context_missing",
  "sensitive_surface_context_incomplete",
  "sensitive_validation_missing",
  "target_file_not_observed",
  "target_file_freshness_unknown",
  "target_file_stale",
  "target_file_hash_changed",
  "related_tests_not_observed",
  "context_completeness_low",
  "context_completeness_medium",
  "validation_missing",
  "validation_stale",
  "validation_target_unclear",
  "validation_unknown",
  "validation_running"
]);

const hasSensitiveSurface = (drivers: string[]): boolean =>
  drivers.some((driver) => sensitiveSurfaceDrivers.has(driver));

const hasSensitiveMissingEvidence = (drivers: string[]): boolean =>
  drivers.some((driver) => sensitiveMissingEvidenceDrivers.has(driver));

const recoveryUnknownDrivers = new Set<string>([
  "recovery_state_unknown",
  "rollback_confidence_unknown",
  "destructive_operation_recovery_unknown",
  "recovery_checkpoint_missing",
  "git_tracking_unknown",
  "workspace_recovery_boundary_unknown",
  "validation_recovery_evidence_missing"
]);

const recoveryAllowedEscalationDrivers = new Set<string>([
  "destructive_command_detected"
]);

const hasRecoveryUnknown = (drivers: string[]): boolean =>
  drivers.some((driver) => recoveryUnknownDrivers.has(driver));

const hasOnlyRecoveryEscalation = (drivers: string[]): boolean =>
  drivers.every((driver) => recoveryAllowedEscalationDrivers.has(driver));

const confidenceFor = (
  recommendedDecision: UncertaintyRoutingDecision,
  profile: UncertaintyProfile,
  blockingDriverMatches: string[],
  escalationDriverMatches: string[],
  deferDriverMatches: string[]
): UncertaintyRouterConfidence => {
  if (blockingDriverMatches.length > 0) {
    return "high";
  }

  if (
    recommendedDecision === "PROCEED" &&
    profile.overallLevel === "low" &&
    collectMissingEvidence(profile).length === 0
  ) {
    return "high";
  }

  if (
    recommendedDecision === "DEFER" &&
    deferDriverMatches.length > 0 &&
    escalationDriverMatches.length === 0
  ) {
    return "high";
  }

  if (
    recommendedDecision === "ESCALATE" &&
    escalationDriverMatches.length > 0 &&
    deferDriverMatches.length === 0
  ) {
    return "high";
  }

  if (recommendedDecision === "ESCALATE" || recommendedDecision === "DEFER") {
    return "medium";
  }

  return "low";
};

export const routeUncertainty = (
  profile: UncertaintyProfile
): UncertaintyRouterResult => {
  const drivers = collectDrivers(profile);
  const blockingDriverMatches = filterDrivers(drivers, blockingDrivers);
  const escalationDriverMatches = filterDrivers(drivers, escalationDrivers);
  const deferDriverMatches = filterDrivers(drivers, deferDrivers);
  const reductionPlanAvailable = reductionSteps(profile).length > 0;
  const ordinaryReductionAvailable = hasOrdinaryEvidenceStep(profile);
  const onlyHumanReviewAvailable = hasOnlyHumanReviewSteps(profile);
  const sensitiveMissingEvidence =
    hasSensitiveSurface(drivers) && hasSensitiveMissingEvidence(drivers);
  const recoveryUnknown =
    hasRecoveryUnknown(drivers) &&
    reductionPlanAvailable &&
    ordinaryReductionAvailable &&
    hasOnlyRecoveryEscalation(escalationDriverMatches);

  let recommendedDecision: UncertaintyRoutingDecision;
  const rationale: string[] = [];

  if (blockingDriverMatches.length > 0) {
    recommendedDecision = "BLOCK";
    rationale.push("hard_block_driver_present");
  } else if (
    sensitiveMissingEvidence &&
    reductionPlanAvailable &&
    ordinaryReductionAvailable
  ) {
    recommendedDecision = "DEFER";
    rationale.push("reducible_uncertainty_with_reduction_plan");
    rationale.push("sensitive_context_requires_evidence");
  } else if (recoveryUnknown) {
    recommendedDecision = "DEFER";
    rationale.push("reducible_uncertainty_with_reduction_plan");
    rationale.push("recovery_uncertainty_requires_evidence");
  } else if (
    escalationDriverMatches.length > 0 ||
    onlyHumanReviewAvailable ||
    ((profile.impact === "high" || profile.impact === "critical") &&
      (profile.reducibility === "partially_reducible" ||
        profile.reducibility === "irreducible") &&
      !ordinaryReductionAvailable)
  ) {
    recommendedDecision = "ESCALATE";
    rationale.push("escalation_driver_present");

    if (onlyHumanReviewAvailable) {
      rationale.push("human_review_step_present");
    }

    if (
      profile.impact === "high" ||
      profile.impact === "critical" ||
      profile.reducibility === "partially_reducible" ||
      profile.reducibility === "irreducible"
    ) {
      rationale.push("high_impact_partially_reducible_uncertainty");
    }
  } else if (
    isMeaningfullyUncertain(profile) &&
    (profile.reducibility === "reducible" ||
      profile.reducibility === "partially_reducible") &&
    reductionPlanAvailable &&
    ordinaryReductionAvailable &&
    deferDriverMatches.length > 0
  ) {
    recommendedDecision = "DEFER";
    rationale.push("reducible_uncertainty_with_reduction_plan");
  } else if (
    profile.overallLevel === "low" &&
    collectMissingEvidence(profile).length === 0 &&
    !reductionPlanAvailable
  ) {
    recommendedDecision = "PROCEED";
    rationale.push("low_uncertainty_no_missing_evidence");
  } else if (reductionPlanAvailable && ordinaryReductionAvailable) {
    recommendedDecision = "DEFER";
    rationale.push("reducible_uncertainty_with_reduction_plan");
  } else {
    recommendedDecision = "ESCALATE";
    rationale.push("ambiguous_uncertainty_profile");
  }

  return uncertaintyRouterResultSchema.parse({
    schemaVersion: uncertaintyRouterResultSchemaVersion,
    recommendedDecision,
    confidence: confidenceFor(
      recommendedDecision,
      profile,
      blockingDriverMatches,
      escalationDriverMatches,
      deferDriverMatches
    ),
    rationale: uniqueSorted(rationale),
    drivers,
    blockingDrivers: blockingDriverMatches,
    deferDrivers: deferDriverMatches,
    escalationDrivers: escalationDriverMatches,
    reductionPlanAvailable
  });
};
