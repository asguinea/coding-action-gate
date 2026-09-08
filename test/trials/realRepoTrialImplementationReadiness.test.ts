import { describe, expect, it } from "vitest";
import {
  buildCalibrationImplementationReadinessReview,
  realRepoCalibrationImplementationReadinessSchemaVersion,
  type RealRepoCalibrationApprovalRecord,
  type RealRepoCalibrationImplementationTicket
} from "../../trials/real-repo/index.js";

const approvalRecord = (): RealRepoCalibrationApprovalRecord => ({
  schemaVersion: "real-repo-calibration-approval.v1",
  approvalId: "approval_readiness_placeholder",
  sourceProposalSetSchemaVersion: "real-repo-calibration-proposals.v1",
  sourceProposalIds: [
    "proposal_policy_tuning_001",
    "proposal_detector_gap_002",
    "proposal_benchmark_expansion_003"
  ],
  approvalStatus: "approved_for_implementation_planning",
  approvedCategories: ["policy_tuning", "detector_gap", "benchmark_expansion"],
  approvedTargets: ["policy", "detector", "benchmark"],
  reviewerRole: "technical_reviewer",
  approvalScope: "implementation_planning_only",
  safeguards: ["requires_human_review", "no_automatic_application"],
  limitations: ["approval_record_only"],
  safety: {
    categoryOnly: true,
    containsRawPrivateData: false,
    productionBehaviorChanged: false,
    automaticTuningApplied: false,
    remoteTelemetryUsed: false
  }
});

const ticket = (
  ticketId: string,
  implementationTarget: RealRepoCalibrationImplementationTicket["implementationTarget"],
  status: RealRepoCalibrationImplementationTicket["status"],
  requiredTests: string[]
): RealRepoCalibrationImplementationTicket => ({
  schemaVersion: "real-repo-calibration-implementation-ticket.v1",
  ticketId,
  sourceApprovalId: "approval_readiness_placeholder",
  sourceProposalIds: [`proposal_${implementationTarget}_001`],
  implementationTarget,
  proposedAction: `${implementationTarget}_action`,
  priority: implementationTarget === "detector" ? "high" : "medium",
  requiredSafeguards: ["requires_human_review", "no_automatic_application"],
  requiredTests,
  nonGoals: [
    "no_automatic_tuning",
    "no_runtime_behavior_change_without_separate_batch"
  ],
  acceptanceCriteria: ["full_suite_passes", "privacy_checks_pass"],
  privacyRequirements: ["category_only_inputs", "no_raw_private_data"],
  status
});

const tickets = (): RealRepoCalibrationImplementationTicket[] => [
  ticket("ticket_policy_001", "policy", "draft", ["policy_regression_tests"]),
  ticket("ticket_detector_002", "detector", "ready_for_design", [
    "detector_unit_tests"
  ]),
  ticket("ticket_benchmark_003", "benchmark", "ready_for_implementation", [
    "benchmark_schema_tests"
  ]),
  ticket("ticket_docs_004", "docs", "ready_for_implementation", [
    "docs_claim_boundary_tests"
  ]),
  ticket("ticket_ux_005", "ux", "ready_for_implementation", [
    "explanation_copy_tests"
  ]),
  ticket("ticket_analysis_only_006", "analysis_only", "ready_for_design", [
    "additional_evidence_required"
  ]),
  ticket("ticket_detector_007", "detector", "blocked", ["detector_unit_tests"])
];

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

describe("real-repo calibration implementation readiness", () => {
  it("builds deterministic schema-stable reviews without mutating inputs", () => {
    const approval = approvalRecord();
    const inputTickets = tickets();
    const beforeApproval = JSON.stringify(approval);
    const beforeTickets = JSON.stringify(inputTickets);
    const first = buildCalibrationImplementationReadinessReview(
      approval,
      inputTickets,
      { reviewId: "readiness_review_placeholder" }
    );
    const second = buildCalibrationImplementationReadinessReview(
      approval,
      inputTickets,
      { reviewId: "readiness_review_placeholder" }
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(approval)).toBe(beforeApproval);
    expect(JSON.stringify(inputTickets)).toBe(beforeTickets);
    expect(first.schemaVersion).toBe(
      realRepoCalibrationImplementationReadinessSchemaVersion
    );
    expect(first.sourceApprovalSchemaVersion).toBe(
      "real-repo-calibration-approval.v1"
    );
    expect(first.sourceTicketSchemaVersion).toBe(
      "real-repo-calibration-implementation-ticket.v1"
    );
  });

  it("classifies ticket readiness and counts summaries", () => {
    const review = buildCalibrationImplementationReadinessReview(
      approvalRecord(),
      tickets(),
      { reviewId: "readiness_review_counts" }
    );
    const byTicket = Object.fromEntries(
      review.tickets.map((entry) => [entry.ticketId, entry])
    );

    expect(review.ticketCount).toBe(7);
    expect(review.readyTicketCount).toBe(3);
    expect(review.blockedTicketCount).toBe(2);
    expect(byTicket.ticket_policy_001?.readiness).toBe("needs_design");
    expect(byTicket.ticket_policy_001?.blockers).toContain("ticket_not_ready");
    expect(byTicket.ticket_detector_002?.readiness).toBe("needs_design");
    expect(
      byTicket.ticket_detector_002?.requiredBeforeImplementation
    ).toContain("complete_design_review");
    expect(byTicket.ticket_benchmark_003?.readiness).toBe(
      "ready_for_scoped_batch"
    );
    expect(
      byTicket.ticket_benchmark_003?.requiredBeforeImplementation
    ).toContain("create_scoped_implementation_prompt");
    expect(byTicket.ticket_detector_007?.readiness).toBe("blocked");
    expect(byTicket.ticket_detector_007?.blockers).toContain("ticket_blocked");
    expect(byTicket.ticket_analysis_only_006?.readiness).toBe(
      "needs_more_evidence"
    );
    expect(byTicket.ticket_analysis_only_006?.blockers).toContain(
      "analysis_only_not_implementation_target"
    );
    expect(review.summary.byTarget).toMatchObject({
      policy: 1,
      detector: 2,
      benchmark: 1,
      docs: 1,
      ux: 1,
      analysis_only: 1
    });
    expect(review.summary.byReadiness).toMatchObject({
      needs_design: 2,
      ready_for_scoped_batch: 3,
      needs_more_evidence: 1,
      blocked: 1
    });
    expect(review.summary.blockers).toMatchObject({
      ticket_not_ready: 1,
      analysis_only_not_implementation_target: 1,
      ticket_blocked: 1
    });
  });

  it("adds target-specific required-before, allowed scope, and forbidden scope", () => {
    const review = buildCalibrationImplementationReadinessReview(
      approvalRecord(),
      tickets(),
      { reviewId: "readiness_review_scope" }
    );
    const byTarget = Object.fromEntries(
      review.tickets.map((entry) => [entry.implementationTarget, entry])
    );

    expect(byTarget.policy?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "define_policy_change_scope",
        "define_policy_regression_tests",
        "define_rollback_plan"
      ])
    );
    expect(byTarget.detector?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "define_detector_change_scope",
        "define_false_positive_tests",
        "define_false_negative_tests",
        "define_privacy_tests"
      ])
    );
    expect(byTarget.benchmark?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "define_benchmark_scenario_change",
        "define_fixture_safety_review",
        "define_expected_driver_updates"
      ])
    );
    expect(byTarget.docs?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "define_claim_boundary_review",
        "define_docs_tests"
      ])
    );
    expect(byTarget.ux?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "define_copy_review",
        "define_confusing_case_examples",
        "define_no_claim_overreach_tests"
      ])
    );
    expect(byTarget.analysis_only?.requiredBeforeImplementation).toEqual(
      expect.arrayContaining([
        "collect_more_evidence",
        "complete_additional_review"
      ])
    );
    expect(byTarget.policy?.allowedImplementationScope).toContain(
      "policy_config_update"
    );
    expect(byTarget.detector?.allowedImplementationScope).toContain(
      "detector_logic_update"
    );
    expect(byTarget.benchmark?.allowedImplementationScope).toContain(
      "benchmark_scenario_update"
    );
    expect(byTarget.docs?.allowedImplementationScope).toContain(
      "documentation_update"
    );
    expect(byTarget.ux?.allowedImplementationScope).toContain(
      "explanation_copy_update"
    );
    expect(byTarget.analysis_only?.allowedImplementationScope).toContain(
      "no_implementation_scope"
    );
  });

  it("preserves required tests and includes common forbidden scope", () => {
    const review = buildCalibrationImplementationReadinessReview(
      approvalRecord(),
      tickets(),
      { reviewId: "readiness_review_tests" }
    );

    for (const readinessTicket of review.tickets) {
      expect(readinessTicket.forbiddenImplementationScope).toEqual(
        expect.arrayContaining([
          "no_automatic_tuning",
          "no_remote_telemetry",
          "no_raw_private_data",
          "no_real_repo_data_commit",
          "no_unscoped_runtime_change"
        ])
      );
      expect(readinessTicket.privacyRequirements).toEqual(
        expect.arrayContaining(["category_only_inputs", "no_raw_private_data"])
      );
    }

    expect(
      review.tickets.find((entry) => entry.ticketId === "ticket_policy_001")
        ?.requiredTests
    ).toContain("policy_regression_tests");
    expect(
      review.tickets.find((entry) => entry.ticketId === "ticket_detector_002")
        ?.requiredTests
    ).toContain("detector_unit_tests");
  });

  it("keeps safety flags, limitations, and serialized output privacy-safe", () => {
    const review = buildCalibrationImplementationReadinessReview(
      clone(approvalRecord()),
      clone(tickets()),
      { reviewId: "readiness_review_privacy" }
    );
    const serialized = JSON.stringify(review);

    expect(review.safety).toEqual({
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    });
    expect(review.limitations).toEqual(
      expect.arrayContaining([
        "readiness_review_only",
        "no_implementation_applied",
        "requires_scoped_future_batch",
        "no_production_behavior_change",
        "category_only_inputs",
        "not_real_world_accuracy_claim"
      ])
    );

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }
  });
});
