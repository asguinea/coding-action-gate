import {
  realRepoCalibrationApprovalRecordSchema,
  realRepoCalibrationApprovalSchemaVersion,
  realRepoCalibrationImplementationTicketSchema,
  realRepoCalibrationImplementationTicketSchemaVersion,
  type RealRepoCalibrationApprovalRecord,
  type RealRepoCalibrationApprovalScope,
  type RealRepoCalibrationApprovalStatus,
  type RealRepoCalibrationImplementationTicket,
  type RealRepoCalibrationReviewerRole,
  type RealRepoCalibrationTicketStatus
} from "./calibrationApprovalTypes.js";
import {
  realRepoCalibrationProposalSetSchema,
  realRepoCalibrationProposalSetSchemaVersion,
  type RealRepoCalibrationProposal,
  type RealRepoCalibrationProposalSet,
  type RealRepoCalibrationProposalTarget
} from "./calibrationProposalTypes.js";

export type BuildCalibrationApprovalRecordOptions = {
  approvalId?: string;
  sourceProposalIds?: string[];
  approvalStatus?: RealRepoCalibrationApprovalStatus;
  reviewerRole?: RealRepoCalibrationReviewerRole;
  approvalScope?: RealRepoCalibrationApprovalScope;
};

const approvalLimitations = [
  "approval_record_only",
  "no_automatic_application",
  "implementation_requires_separate_batch",
  "category_only_inputs",
  "not_real_world_accuracy_claim"
] as const;

const baselineNonGoals = [
  "no_automatic_tuning",
  "no_runtime_behavior_change_without_separate_batch",
  "no_remote_telemetry",
  "no_raw_private_data"
] as const;

const baselineAcceptanceCriteria = [
  "implementation_scoped_to_ticket",
  "tests_added_or_updated",
  "full_suite_passes",
  "privacy_checks_pass",
  "no_forbidden_claims_added",
  "production_routing_change_explicitly_scoped"
] as const;

const privacyRequirements = [
  "category_only_inputs",
  "no_raw_private_data",
  "no_human_names_or_emails",
  "privacy_serialization_checks"
] as const;

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const isApprovedStatus = (status: RealRepoCalibrationApprovalStatus): boolean =>
  status === "approved_for_design" ||
  status === "approved_for_implementation_planning";

const isProposalEligibleForApproval = (
  proposal: RealRepoCalibrationProposal
): boolean =>
  proposal.reviewStatus !== "rejected" &&
  proposal.reviewStatus !== "needs_more_evidence";

const targetTestsFor = (
  target: RealRepoCalibrationProposalTarget
): string[] => {
  switch (target) {
    case "policy":
      return [
        "policy_regression_tests",
        "decision_routing_non_regression",
        "privacy_serialization_tests"
      ];
    case "detector":
      return [
        "detector_unit_tests",
        "false_positive_regression_tests",
        "false_negative_regression_tests",
        "privacy_serialization_tests"
      ];
    case "benchmark":
      return [
        "benchmark_schema_tests",
        "fixture_safety_tests",
        "benchmark_runner_regression_tests"
      ];
    case "docs":
      return ["docs_claim_boundary_tests", "package_metadata_tests"];
    case "ux":
      return ["explanation_copy_tests", "docs_claim_boundary_tests"];
    case "analysis_only":
      return [
        "no_implementation_tests_required",
        "additional_evidence_required"
      ];
  }
};

const ticketStatusFor = (
  approvalStatus: RealRepoCalibrationApprovalStatus,
  target: RealRepoCalibrationProposalTarget
): RealRepoCalibrationTicketStatus => {
  if (target === "analysis_only") {
    return "blocked";
  }

  if (approvalStatus === "approved_for_implementation_planning") {
    return "ready_for_implementation";
  }

  return "ready_for_design";
};

export const buildCalibrationApprovalRecord = (
  proposalSet: RealRepoCalibrationProposalSet,
  options: BuildCalibrationApprovalRecordOptions = {}
): RealRepoCalibrationApprovalRecord => {
  const parsedProposalSet =
    realRepoCalibrationProposalSetSchema.parse(proposalSet);
  const approvalStatus = options.approvalStatus ?? "deferred";
  const requestedProposalIds = options.sourceProposalIds ?? [];
  const requestedIdSet = new Set(requestedProposalIds);
  const selectedProposals = parsedProposalSet.proposals.filter((proposal) =>
    requestedIdSet.has(proposal.id)
  );
  const approvedProposals = isApprovedStatus(approvalStatus)
    ? selectedProposals.filter(isProposalEligibleForApproval)
    : [];

  return realRepoCalibrationApprovalRecordSchema.parse({
    schemaVersion: realRepoCalibrationApprovalSchemaVersion,
    approvalId: options.approvalId ?? "calibration_approval_draft",
    sourceProposalSetSchemaVersion: realRepoCalibrationProposalSetSchemaVersion,
    sourceProposalIds: approvedProposals.map((proposal) => proposal.id).sort(),
    approvalStatus,
    approvedCategories: uniqueSorted(
      approvedProposals.map((proposal) => proposal.category)
    ),
    approvedTargets: uniqueSorted(
      approvedProposals.map((proposal) => proposal.implementationTarget)
    ),
    reviewerRole: options.reviewerRole ?? "technical_reviewer",
    approvalScope: options.approvalScope ?? "implementation_planning_only",
    safeguards: uniqueSorted([
      "requires_human_review",
      "no_automatic_application",
      "category_only_evidence",
      "requires_test_plan_before_implementation",
      ...approvedProposals.flatMap((proposal) => proposal.safeguards)
    ]),
    limitations: [...approvalLimitations],
    safety: {
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    }
  });
};

export const buildCalibrationImplementationTickets = (
  proposalSet: RealRepoCalibrationProposalSet,
  approvalRecord: RealRepoCalibrationApprovalRecord
): RealRepoCalibrationImplementationTicket[] => {
  const parsedProposalSet =
    realRepoCalibrationProposalSetSchema.parse(proposalSet);
  const parsedApproval =
    realRepoCalibrationApprovalRecordSchema.parse(approvalRecord);

  if (!isApprovedStatus(parsedApproval.approvalStatus)) {
    return [];
  }

  const approvedIdSet = new Set(parsedApproval.sourceProposalIds);
  const approvedProposals = parsedProposalSet.proposals.filter(
    (proposal) =>
      approvedIdSet.has(proposal.id) && isProposalEligibleForApproval(proposal)
  );

  return approvedProposals.map((proposal, index) =>
    realRepoCalibrationImplementationTicketSchema.parse({
      schemaVersion: realRepoCalibrationImplementationTicketSchemaVersion,
      ticketId: `ticket_${proposal.implementationTarget}_${String(index + 1).padStart(3, "0")}`,
      sourceApprovalId: parsedApproval.approvalId,
      sourceProposalIds: [proposal.id],
      implementationTarget: proposal.implementationTarget,
      proposedAction: proposal.proposedAction,
      priority: proposal.priority,
      requiredSafeguards: uniqueSorted([
        ...proposal.safeguards,
        ...parsedApproval.safeguards
      ]),
      requiredTests: targetTestsFor(proposal.implementationTarget),
      nonGoals: [...baselineNonGoals],
      acceptanceCriteria: [...baselineAcceptanceCriteria],
      privacyRequirements: [...privacyRequirements],
      status: ticketStatusFor(
        parsedApproval.approvalStatus,
        proposal.implementationTarget
      )
    })
  );
};
