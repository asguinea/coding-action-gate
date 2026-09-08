import {
  realRepoCalibrationApprovalRecordSchema,
  realRepoCalibrationApprovalSchemaVersion,
  realRepoCalibrationImplementationTicketSchema,
  realRepoCalibrationImplementationTicketSchemaVersion,
  type RealRepoCalibrationApprovalRecord,
  type RealRepoCalibrationImplementationTicket
} from "./calibrationApprovalTypes.js";
import type { RealRepoCalibrationProposalTarget } from "./calibrationProposalTypes.js";
import {
  realRepoCalibrationImplementationReadinessReviewSchema,
  realRepoCalibrationImplementationReadinessSchemaVersion,
  type RealRepoCalibrationImplementationReadinessReview,
  type RealRepoCalibrationImplementationReadinessState,
  type RealRepoCalibrationImplementationReadinessTicket
} from "./implementationReadinessTypes.js";

export type BuildCalibrationImplementationReadinessOptions = {
  reviewId?: string;
};

const readinessLimitations = [
  "readiness_review_only",
  "no_implementation_applied",
  "requires_scoped_future_batch",
  "no_production_behavior_change",
  "category_only_inputs",
  "not_real_world_accuracy_claim"
] as const;

const commonForbiddenScope = [
  "no_unscoped_runtime_change",
  "no_automatic_tuning",
  "no_remote_telemetry",
  "no_raw_private_data",
  "no_real_repo_data_commit"
] as const;

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const readinessForTicket = (
  ticket: RealRepoCalibrationImplementationTicket
): RealRepoCalibrationImplementationReadinessState => {
  if (ticket.implementationTarget === "analysis_only") {
    return ticket.status === "blocked" ? "blocked" : "needs_more_evidence";
  }

  switch (ticket.status) {
    case "draft":
    case "ready_for_design":
      return "needs_design";
    case "ready_for_implementation":
      return "ready_for_scoped_batch";
    case "blocked":
      return "blocked";
  }
};

const statusBlockersForTicket = (
  ticket: RealRepoCalibrationImplementationTicket
): string[] => {
  const blockers: string[] = [];

  if (ticket.status === "draft") {
    blockers.push("ticket_not_ready");
  }

  if (ticket.status === "blocked") {
    blockers.push("ticket_blocked");
  }

  if (ticket.implementationTarget === "analysis_only") {
    blockers.push("analysis_only_not_implementation_target");
  }

  return blockers;
};

const requiredBeforeForTarget = (
  target: RealRepoCalibrationProposalTarget
): string[] => {
  switch (target) {
    case "policy":
      return [
        "define_policy_change_scope",
        "define_policy_regression_tests",
        "define_rollback_plan"
      ];
    case "detector":
      return [
        "define_detector_change_scope",
        "define_false_positive_tests",
        "define_false_negative_tests",
        "define_privacy_tests"
      ];
    case "benchmark":
      return [
        "define_benchmark_scenario_change",
        "define_fixture_safety_review",
        "define_expected_driver_updates"
      ];
    case "docs":
      return ["define_claim_boundary_review", "define_docs_tests"];
    case "ux":
      return [
        "define_copy_review",
        "define_confusing_case_examples",
        "define_no_claim_overreach_tests"
      ];
    case "analysis_only":
      return ["collect_more_evidence", "complete_additional_review"];
  }
};

const allowedScopeForTarget = (
  target: RealRepoCalibrationProposalTarget
): string[] => {
  switch (target) {
    case "policy":
      return ["policy_config_update", "policy_test_update", "docs_update"];
    case "detector":
      return [
        "detector_logic_update",
        "detector_test_update",
        "privacy_regression_test_update"
      ];
    case "benchmark":
      return [
        "benchmark_scenario_update",
        "fixture_metadata_update",
        "benchmark_test_update"
      ];
    case "docs":
      return ["documentation_update", "docs_tests_update"];
    case "ux":
      return ["explanation_copy_update", "docs_or_ui_copy_test_update"];
    case "analysis_only":
      return ["no_implementation_scope"];
  }
};

const forbiddenScopeForTarget = (
  target: RealRepoCalibrationProposalTarget
): string[] => {
  switch (target) {
    case "policy":
      return [
        ...commonForbiddenScope,
        "no_detector_change_without_separate_batch"
      ];
    case "detector":
      return [
        ...commonForbiddenScope,
        "no_policy_change_without_separate_batch"
      ];
    case "benchmark":
      return [...commonForbiddenScope, "no_runtime_behavior_change"];
    case "docs":
    case "ux":
      return [...commonForbiddenScope, "no_policy_or_detector_change"];
    case "analysis_only":
      return [...commonForbiddenScope, "no_runtime_behavior_change"];
  }
};

const readinessTicketFor = (
  ticket: RealRepoCalibrationImplementationTicket
): RealRepoCalibrationImplementationReadinessTicket => {
  const blockers = statusBlockersForTicket(ticket);
  const requiredBeforeImplementation = [
    ...requiredBeforeForTarget(ticket.implementationTarget)
  ];

  if (ticket.status === "ready_for_design") {
    requiredBeforeImplementation.push("complete_design_review");
  }

  if (ticket.status === "ready_for_implementation") {
    requiredBeforeImplementation.push("create_scoped_implementation_prompt");
  }

  return {
    ticketId: ticket.ticketId,
    implementationTarget: ticket.implementationTarget,
    readiness: readinessForTicket(ticket),
    blockers: uniqueSorted(blockers),
    requiredBeforeImplementation: uniqueSorted(requiredBeforeImplementation),
    allowedImplementationScope: allowedScopeForTarget(
      ticket.implementationTarget
    ),
    forbiddenImplementationScope: uniqueSorted(
      forbiddenScopeForTarget(ticket.implementationTarget)
    ),
    requiredTests: [...ticket.requiredTests],
    privacyRequirements: [...ticket.privacyRequirements]
  };
};

export const buildCalibrationImplementationReadinessReview = (
  approvalRecord: RealRepoCalibrationApprovalRecord,
  tickets: RealRepoCalibrationImplementationTicket[],
  options: BuildCalibrationImplementationReadinessOptions = {}
): RealRepoCalibrationImplementationReadinessReview => {
  const parsedApproval =
    realRepoCalibrationApprovalRecordSchema.parse(approvalRecord);
  const parsedTickets = tickets
    .map((ticket) =>
      realRepoCalibrationImplementationTicketSchema.parse(ticket)
    )
    .filter((ticket) => ticket.sourceApprovalId === parsedApproval.approvalId);
  const readinessTickets = parsedTickets.map(readinessTicketFor);
  const byTarget: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  const blockers: Record<string, number> = {};

  for (const ticket of readinessTickets) {
    increment(byTarget, ticket.implementationTarget);
    increment(byReadiness, ticket.readiness);

    for (const blocker of ticket.blockers) {
      increment(blockers, blocker);
    }
  }

  return realRepoCalibrationImplementationReadinessReviewSchema.parse({
    schemaVersion: realRepoCalibrationImplementationReadinessSchemaVersion,
    sourceApprovalSchemaVersion: realRepoCalibrationApprovalSchemaVersion,
    sourceTicketSchemaVersion:
      realRepoCalibrationImplementationTicketSchemaVersion,
    reviewId: options.reviewId ?? "implementation_readiness_review_draft",
    ticketCount: readinessTickets.length,
    readyTicketCount: readinessTickets.filter(
      (ticket) => ticket.readiness === "ready_for_scoped_batch"
    ).length,
    blockedTicketCount: readinessTickets.filter(
      (ticket) =>
        ticket.readiness === "blocked" ||
        ticket.readiness === "needs_more_evidence"
    ).length,
    tickets: readinessTickets,
    summary: {
      byTarget,
      byReadiness,
      blockers
    },
    safety: {
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    },
    limitations: [...readinessLimitations]
  });
};
