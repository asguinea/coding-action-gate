import { describe, expect, it } from "vitest";
import {
  buildRealRepoCalibrationProposals,
  realRepoCalibrationProposalSetSchemaVersion,
  type RealRepoCalibrationPlan
} from "../../trials/real-repo/index.js";

const plan = (): RealRepoCalibrationPlan => ({
  schemaVersion: "real-repo-calibration-plan.v1",
  inputSummary: {
    acceptedTrialCount: 2,
    intakePacketCount: 1,
    gapAnalysisCount: 1,
    caseCount: 6
  },
  readiness: {
    readyForCalibration: true,
    blockers: [],
    requiredNextSteps: []
  },
  calibrationItems: [
    {
      id: "calibration_policy_tuning_001",
      category: "policy_tuning",
      priority: "medium",
      sourceSignals: ["false_positive_observed"],
      opportunityFamilies: ["missing_stale_low_quality_context"],
      driverCategories: ["validation_missing"],
      outcomeCategories: ["false_positive"],
      recommendedAction: "policy_tuning_review",
      evidenceCount: 1,
      safeForImplementation: false
    },
    {
      id: "calibration_detector_gap_001",
      category: "detector_gap",
      priority: "high",
      sourceSignals: ["false_negative_observed"],
      opportunityFamilies: ["environment_deploy_uncertainty"],
      driverCategories: ["environment_unknown"],
      outcomeCategories: ["false_negative"],
      recommendedAction: "investigate_detector_or_policy_gap",
      evidenceCount: 1,
      safeForImplementation: false
    },
    {
      id: "calibration_benchmark_expansion_001",
      category: "benchmark_expansion",
      priority: "medium",
      sourceSignals: ["observed_driver_not_in_benchmark"],
      opportunityFamilies: ["sensitive_surfaces_large_diffs"],
      driverCategories: ["sensitive_change_review_required"],
      outcomeCategories: ["missing_coverage"],
      recommendedAction: "add_benchmark_scenario_or_driver_expectation",
      evidenceCount: 1,
      safeForImplementation: false
    },
    {
      id: "calibration_ux_clarity_001",
      category: "ux_clarity",
      priority: "medium",
      sourceSignals: ["confusing_defer_or_escalate_case"],
      opportunityFamilies: ["missing_stale_low_quality_context"],
      driverCategories: ["validation_missing"],
      outcomeCategories: ["confusing"],
      recommendedAction: "improve_explanation_or_docs",
      evidenceCount: 1,
      safeForImplementation: false
    },
    {
      id: "calibration_documentation_001",
      category: "documentation",
      priority: "medium",
      sourceSignals: ["summary_confusing"],
      opportunityFamilies: ["missing_stale_low_quality_context"],
      driverCategories: ["validation_missing"],
      outcomeCategories: ["confusing"],
      recommendedAction: "update_trial_docs_or_defer_guidance",
      evidenceCount: 1,
      safeForImplementation: false
    },
    {
      id: "calibration_needs_more_evidence_001",
      category: "needs_more_evidence",
      priority: "low",
      sourceSignals: ["reviewer_followup_required"],
      opportunityFamilies: ["sensitive_surfaces_large_diffs"],
      driverCategories: ["sensitive_change_review_required"],
      outcomeCategories: ["needs_review"],
      recommendedAction: "collect_more_reviewed_cases",
      evidenceCount: 1,
      safeForImplementation: false
    }
  ],
  summary: {
    byCategory: {
      policy_tuning: 1,
      detector_gap: 1,
      benchmark_expansion: 1,
      ux_clarity: 1,
      documentation: 1,
      needs_more_evidence: 1
    },
    byPriority: {
      low: 1,
      medium: 4,
      high: 1
    },
    topOpportunityFamilies: {
      missing_stale_low_quality_context: 3,
      environment_deploy_uncertainty: 1,
      sensitive_surfaces_large_diffs: 2
    },
    topDriverCategories: {
      validation_missing: 3,
      environment_unknown: 1,
      sensitive_change_review_required: 2
    }
  },
  safety: {
    categoryOnly: true,
    containsRawPrivateData: false,
    remoteTelemetryUsed: false,
    productionBehaviorChanged: false
  },
  limitations: ["calibration_plan_only"]
});

const emptyPlan = (): RealRepoCalibrationPlan => ({
  ...plan(),
  inputSummary: {
    acceptedTrialCount: 0,
    intakePacketCount: 0,
    gapAnalysisCount: 0,
    caseCount: 0
  },
  readiness: {
    readyForCalibration: false,
    blockers: ["no_accepted_trial_evidence"],
    requiredNextSteps: ["run_supervised_trials"]
  },
  calibrationItems: [],
  summary: {
    byCategory: {},
    byPriority: {},
    topOpportunityFamilies: {},
    topDriverCategories: {}
  }
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
  "validation log:"
];

describe("real-repo calibration proposals", () => {
  it("uses stable schema, source schema, and handles empty plans", () => {
    const proposalSet = buildRealRepoCalibrationProposals(emptyPlan());

    expect(proposalSet.schemaVersion).toBe(
      realRepoCalibrationProposalSetSchemaVersion
    );
    expect(proposalSet.sourcePlanSchemaVersion).toBe(
      "real-repo-calibration-plan.v1"
    );
    expect(proposalSet.proposalCount).toBe(0);
    expect(proposalSet.proposals).toEqual([]);
  });

  it("is deterministic and does not mutate input plans", () => {
    const input = plan();
    const before = JSON.stringify(input);
    const first = buildRealRepoCalibrationProposals(input);
    const second = buildRealRepoCalibrationProposals(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("maps calibration categories to conservative proposal targets and readiness", () => {
    const proposalSet = buildRealRepoCalibrationProposals(plan());
    const byCategory = Object.fromEntries(
      proposalSet.proposals.map((proposal) => [proposal.category, proposal])
    );

    expect(byCategory.policy_tuning).toMatchObject({
      implementationTarget: "policy",
      proposedAction: "review_policy_threshold",
      reviewStatus: "pending_review",
      implementationReadiness: "not_ready"
    });
    expect(byCategory.detector_gap).toMatchObject({
      implementationTarget: "detector",
      proposedAction: "investigate_detector_gap",
      implementationReadiness: "not_ready"
    });
    expect(byCategory.benchmark_expansion).toMatchObject({
      implementationTarget: "benchmark",
      proposedAction: "add_benchmark_scenario",
      implementationReadiness: "ready_for_design"
    });
    expect(byCategory.ux_clarity).toMatchObject({
      implementationTarget: "ux",
      proposedAction: "clarify_defer_explanation",
      implementationReadiness: "ready_for_design"
    });
    expect(byCategory.documentation).toMatchObject({
      implementationTarget: "docs",
      proposedAction: "update_documentation",
      implementationReadiness: "ready_for_design"
    });
    expect(byCategory.needs_more_evidence).toMatchObject({
      implementationTarget: "analysis_only",
      proposedAction: "collect_more_evidence",
      reviewStatus: "needs_more_evidence",
      implementationReadiness: "blocked"
    });
  });

  it("adds baseline and target-specific safeguards", () => {
    const proposalSet = buildRealRepoCalibrationProposals(plan());
    const byTarget = Object.fromEntries(
      proposalSet.proposals.map((proposal) => [
        proposal.implementationTarget,
        proposal
      ])
    );

    for (const proposal of proposalSet.proposals) {
      expect(proposal.safeguards).toEqual(
        expect.arrayContaining([
          "requires_human_review",
          "no_automatic_application",
          "category_only_evidence",
          "requires_test_plan_before_implementation"
        ])
      );
      expect(/^[a-z][a-z0-9_]*$/.test(proposal.proposedAction)).toBe(true);
    }

    expect(byTarget.policy?.safeguards).toContain(
      "requires_policy_regression_tests"
    );
    expect(byTarget.detector?.safeguards).toContain(
      "requires_detector_regression_tests"
    );
    expect(byTarget.benchmark?.safeguards).toContain(
      "requires_benchmark_fixture_review"
    );
    expect(byTarget.docs?.safeguards).toContain(
      "requires_claim_boundary_review"
    );
    expect(byTarget.ux?.safeguards).toContain("requires_copy_review");
    expect(byTarget.analysis_only?.safeguards).toContain(
      "requires_additional_evidence"
    );
  });

  it("summarizes review statuses and keeps safety limitations", () => {
    const proposalSet = buildRealRepoCalibrationProposals(plan());

    expect(proposalSet.reviewSummary).toEqual({
      pendingReview: 5,
      approvedForImplementation: 0,
      rejected: 0,
      needsMoreEvidence: 1
    });
    expect(proposalSet.safety).toEqual({
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    });
    expect(proposalSet.limitations).toEqual(
      expect.arrayContaining([
        "proposals_only",
        "requires_human_review",
        "no_automatic_tuning",
        "no_production_behavior_change",
        "category_only_inputs",
        "not_real_world_accuracy_claim"
      ])
    );
  });

  it("keeps proposal output category-only and private-value safe", () => {
    const proposalSet = buildRealRepoCalibrationProposals(clone(plan()));
    const serialized = JSON.stringify(proposalSet);

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }
  });
});
