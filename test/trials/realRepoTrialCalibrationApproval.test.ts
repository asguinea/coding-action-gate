import { describe, expect, it } from "vitest";
import {
  buildCalibrationApprovalRecord,
  buildCalibrationImplementationTickets,
  realRepoCalibrationApprovalSchemaVersion,
  realRepoCalibrationImplementationTicketSchemaVersion,
  type RealRepoCalibrationProposal,
  type RealRepoCalibrationProposalSet
} from "../../trials/real-repo/index.js";

const proposal = (
  category: RealRepoCalibrationProposal["category"],
  implementationTarget: RealRepoCalibrationProposal["implementationTarget"],
  index: number,
  reviewStatus: RealRepoCalibrationProposal["reviewStatus"] = "approved_for_implementation"
): RealRepoCalibrationProposal => ({
  id: `proposal_${category}_${String(index).padStart(3, "0")}`,
  sourceCalibrationItemId: `calibration_${category}_${String(index).padStart(3, "0")}`,
  category,
  priority: category === "detector_gap" ? "high" : "medium",
  proposedAction:
    category === "policy_tuning"
      ? "review_policy_threshold"
      : category === "detector_gap"
        ? "investigate_detector_gap"
        : category === "benchmark_expansion"
          ? "add_benchmark_scenario"
          : category === "ux_clarity"
            ? "clarify_defer_explanation"
            : category === "documentation"
              ? "update_documentation"
              : "collect_more_evidence",
  implementationTarget,
  reviewStatus,
  implementationReadiness:
    reviewStatus === "needs_more_evidence" ? "blocked" : "ready_for_design",
  sourceSignals: ["accepted_sanitized_evidence"],
  opportunityFamilies: ["missing_stale_low_quality_context"],
  driverCategories: ["validation_missing"],
  outcomeCategories: ["false_positive"],
  evidenceCount: 1,
  safeguards: [
    "requires_human_review",
    "no_automatic_application",
    "category_only_evidence",
    "requires_test_plan_before_implementation"
  ]
});

const proposalSet = (): RealRepoCalibrationProposalSet => ({
  schemaVersion: "real-repo-calibration-proposals.v1",
  sourcePlanSchemaVersion: "real-repo-calibration-plan.v1",
  proposalCount: 8,
  proposals: [
    proposal("policy_tuning", "policy", 1),
    proposal("detector_gap", "detector", 2),
    proposal("benchmark_expansion", "benchmark", 3),
    proposal("documentation", "docs", 4),
    proposal("ux_clarity", "ux", 5),
    proposal("needs_more_evidence", "analysis_only", 6, "needs_more_evidence"),
    proposal("policy_tuning", "policy", 7, "rejected"),
    proposal("benchmark_expansion", "benchmark", 8, "pending_review")
  ],
  reviewSummary: {
    pendingReview: 1,
    approvedForImplementation: 5,
    rejected: 1,
    needsMoreEvidence: 1
  },
  safety: {
    categoryOnly: true,
    containsRawPrivateData: false,
    productionBehaviorChanged: false,
    automaticTuningApplied: false,
    remoteTelemetryUsed: false
  },
  limitations: ["proposals_only"]
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const forbiddenRawStrings = [
  "/Users/",
  "C:\\",
  "/tmp/private",
  "diff --git",
  "API_KEY=",
  "SECRET=",
  "TOKEN=",
  "PRIVATE_KEY",
  "http://",
  "https://",
  "rm -rf",
  "git push",
  "private-repo",
  "feature/customer-prod",
  "validation log:",
  "@example",
  "Alice",
  "Bob"
];

describe("real-repo calibration approval and implementation tickets", () => {
  it("builds deterministic approval records without mutating proposal sets", () => {
    const input = proposalSet();
    const before = JSON.stringify(input);
    const first = buildCalibrationApprovalRecord(input, {
      approvalId: "approval_placeholder",
      sourceProposalIds: ["proposal_policy_tuning_001"],
      approvalStatus: "approved_for_implementation_planning",
      reviewerRole: "security_reviewer",
      approvalScope: "implementation_planning_only"
    });
    const second = buildCalibrationApprovalRecord(input, {
      approvalId: "approval_placeholder",
      sourceProposalIds: ["proposal_policy_tuning_001"],
      approvalStatus: "approved_for_implementation_planning",
      reviewerRole: "security_reviewer",
      approvalScope: "implementation_planning_only"
    });

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(first.schemaVersion).toBe(realRepoCalibrationApprovalSchemaVersion);
    expect(first.sourceProposalSetSchemaVersion).toBe(
      "real-repo-calibration-proposals.v1"
    );
    expect(first.reviewerRole).toBe("security_reviewer");
    expect(first.safety).toEqual({
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    });
    expect(first.limitations).toEqual(
      expect.arrayContaining([
        "approval_record_only",
        "no_automatic_application",
        "implementation_requires_separate_batch",
        "category_only_inputs",
        "not_real_world_accuracy_claim"
      ])
    );
  });

  it("filters rejected and needs-more-evidence proposals from approved IDs", () => {
    const approval = buildCalibrationApprovalRecord(proposalSet(), {
      approvalId: "approval_filtered",
      sourceProposalIds: [
        "proposal_policy_tuning_001",
        "proposal_needs_more_evidence_006",
        "proposal_policy_tuning_007",
        "proposal_benchmark_expansion_008"
      ],
      approvalStatus: "approved_for_design",
      reviewerRole: "technical_reviewer",
      approvalScope: "implementation_planning_only"
    });

    expect(approval.sourceProposalIds).toEqual([
      "proposal_benchmark_expansion_008",
      "proposal_policy_tuning_001"
    ]);
    expect(approval.approvedCategories).toEqual([
      "benchmark_expansion",
      "policy_tuning"
    ]);
    expect(approval.approvedTargets).toEqual(["benchmark", "policy"]);
  });

  it("does not create tickets for rejected, deferred, or needs-more-evidence approvals", () => {
    for (const approvalStatus of [
      "rejected",
      "deferred",
      "needs_more_evidence"
    ] as const) {
      const approval = buildCalibrationApprovalRecord(proposalSet(), {
        approvalId: `approval_${approvalStatus}`,
        sourceProposalIds: ["proposal_policy_tuning_001"],
        approvalStatus
      });

      expect(
        buildCalibrationImplementationTickets(proposalSet(), approval)
      ).toEqual([]);
    }
  });

  it("creates target-specific implementation ticket templates only for approved proposal IDs", () => {
    const approval = buildCalibrationApprovalRecord(proposalSet(), {
      approvalId: "approval_all_targets",
      sourceProposalIds: [
        "proposal_policy_tuning_001",
        "proposal_detector_gap_002",
        "proposal_benchmark_expansion_003",
        "proposal_documentation_004",
        "proposal_ux_clarity_005",
        "proposal_needs_more_evidence_006"
      ],
      approvalStatus: "approved_for_implementation_planning",
      reviewerRole: "maintainer",
      approvalScope: "implementation_planning_only"
    });
    const tickets = buildCalibrationImplementationTickets(
      proposalSet(),
      approval
    );
    const byTarget = Object.fromEntries(
      tickets.map((ticket) => [ticket.implementationTarget, ticket])
    );

    expect(tickets).toHaveLength(5);
    expect(
      tickets.every(
        (ticket) =>
          ticket.schemaVersion ===
          realRepoCalibrationImplementationTicketSchemaVersion
      )
    ).toBe(true);
    expect(
      tickets.every((ticket) => ticket.sourceApprovalId === approval.approvalId)
    ).toBe(true);
    expect(byTarget.policy?.requiredTests).toEqual(
      expect.arrayContaining([
        "policy_regression_tests",
        "decision_routing_non_regression",
        "privacy_serialization_tests"
      ])
    );
    expect(byTarget.detector?.requiredTests).toEqual(
      expect.arrayContaining([
        "detector_unit_tests",
        "false_positive_regression_tests",
        "false_negative_regression_tests"
      ])
    );
    expect(byTarget.benchmark?.requiredTests).toEqual(
      expect.arrayContaining([
        "benchmark_schema_tests",
        "fixture_safety_tests",
        "benchmark_runner_regression_tests"
      ])
    );
    expect(byTarget.docs?.requiredTests).toEqual(
      expect.arrayContaining([
        "docs_claim_boundary_tests",
        "package_metadata_tests"
      ])
    );
    expect(byTarget.ux?.requiredTests).toEqual(
      expect.arrayContaining([
        "explanation_copy_tests",
        "docs_claim_boundary_tests"
      ])
    );
    expect(byTarget.analysis_only).toBeUndefined();
  });

  it("adds safeguards, non-goals, acceptance criteria, and privacy requirements", () => {
    const approval = buildCalibrationApprovalRecord(proposalSet(), {
      approvalId: "approval_safeguards",
      sourceProposalIds: ["proposal_policy_tuning_001"],
      approvalStatus: "approved_for_design"
    });
    const tickets = buildCalibrationImplementationTickets(
      proposalSet(),
      approval
    );
    const ticket = tickets[0];

    expect(ticket).toBeDefined();
    expect(ticket?.requiredSafeguards).toEqual(
      expect.arrayContaining([
        "requires_human_review",
        "no_automatic_application",
        "category_only_evidence",
        "requires_test_plan_before_implementation"
      ])
    );
    expect(ticket?.nonGoals).toEqual(
      expect.arrayContaining([
        "no_automatic_tuning",
        "no_runtime_behavior_change_without_separate_batch",
        "no_remote_telemetry",
        "no_raw_private_data"
      ])
    );
    expect(ticket?.acceptanceCriteria).toEqual(
      expect.arrayContaining([
        "implementation_scoped_to_ticket",
        "tests_added_or_updated",
        "full_suite_passes",
        "privacy_checks_pass",
        "no_forbidden_claims_added",
        "production_routing_change_explicitly_scoped"
      ])
    );
    expect(ticket?.privacyRequirements).toEqual(
      expect.arrayContaining([
        "category_only_inputs",
        "no_raw_private_data",
        "no_human_names_or_emails",
        "privacy_serialization_checks"
      ])
    );
    expect(ticket?.status).toBe("ready_for_design");
  });

  it("keeps approval and ticket output private-value safe and deterministic", () => {
    const input = clone(proposalSet());
    const approval = buildCalibrationApprovalRecord(input, {
      approvalId: "approval_privacy",
      sourceProposalIds: ["proposal_policy_tuning_001"],
      approvalStatus: "approved_for_implementation_planning"
    });
    const firstTickets = buildCalibrationImplementationTickets(input, approval);
    const secondTickets = buildCalibrationImplementationTickets(
      input,
      approval
    );
    const serialized = `${JSON.stringify(approval)}\n${JSON.stringify(firstTickets)}`;

    expect(firstTickets).toEqual(secondTickets);

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }
  });
});
