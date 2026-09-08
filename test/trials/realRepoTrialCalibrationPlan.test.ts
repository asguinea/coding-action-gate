import { describe, expect, it } from "vitest";
import {
  buildRealRepoCalibrationPlan,
  realRepoCalibrationPlanSchemaVersion,
  type BuildRealRepoCalibrationPlanInput,
  type RealRepoTrialFindingsSummary,
  type RealRepoTrialIntakePacket,
  type RealVsBenchmarkGapAnalysis
} from "../../trials/real-repo/index.js";

const summary = (): RealRepoTrialFindingsSummary => ({
  schemaVersion: "real-repo-trial-findings-summary.v1",
  trialCount: 2,
  totalDecisionCounts: {
    PROCEED: 5,
    DEFER: 4,
    ESCALATE: 2,
    BLOCK: 1
  },
  outcomeCounts: {
    useful: 1,
    false_positive: 1,
    false_negative: 2,
    confusing: 2,
    missing_coverage: 2,
    needs_review: 1
  },
  opportunityFamilyCounts: {
    environment_deploy_uncertainty: 2,
    missing_stale_low_quality_context: 2,
    sensitive_surfaces_large_diffs: 1
  },
  topDriverCounts: {
    environment_unknown: 2,
    validation_missing: 1,
    sensitive_change_review_required: 1
  },
  privacyReview: {
    allManuallyReviewed: true,
    unsafeFindingCount: 0
  },
  limitations: ["sanitized_category_level_findings"]
});

const intakePacket = (
  overrides: Partial<RealRepoTrialIntakePacket> = {}
): RealRepoTrialIntakePacket => ({
  schemaVersion: "real-repo-trial-intake-packet.v1",
  packetId: "calibration-packet",
  sourceFindingsId: "calibration-findings",
  intakeStatus: "accepted_for_summary",
  trialMode: "guided_operator",
  repoCategory: "toy",
  repoSizeCategory: "small",
  languageCategories: ["typescript"],
  privacyReview: {
    reviewed: true,
    safeToSummarize: true,
    safeForExternalSharing: false
  },
  summary: {
    decisionCounts: {
      PROCEED: 5,
      DEFER: 4,
      ESCALATE: 2,
      BLOCK: 1
    },
    outcomeCounts: {
      false_positive: 1,
      false_negative: 1,
      confusing: 1,
      missing_coverage: 1,
      needs_review: 1
    },
    observedFamilies: [
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context"
    ],
    topDriverCategories: ["environment_unknown", "validation_missing"]
  },
  gapAnalysisReady: true,
  limitations: ["sanitized_findings_only"],
  ...overrides
});

const gapAnalysis = (): RealVsBenchmarkGapAnalysis => ({
  schemaVersion: "real-vs-benchmark-gap-analysis.v1",
  inputSummary: {
    trialCount: 2,
    caseCount: 6,
    benchmarkScenarioCount: 20,
    benchmarkProblemFamilyCount: 10
  },
  familyCoverage: {
    observedFamilies: [
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs"
    ],
    benchmarkFamilies: [
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context"
    ],
    familiesObservedAndBenchmarked: [
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context"
    ],
    benchmarkFamiliesNotObserved: [],
    observedFamiliesWithoutBenchmarkCoverage: ["sensitive_surfaces_large_diffs"]
  },
  outcomeSummary: {
    useful: 1,
    falsePositive: 1,
    falseNegative: 1,
    confusing: 1,
    missingCoverage: 1,
    needsReview: 1
  },
  postureComparison: {
    matchedExpectedPosture: 3,
    mismatchedExpectedPosture: 2,
    missingExpectedPosture: 1
  },
  driverAnalysis: {
    observedDriverCounts: {
      environment_unknown: 2,
      validation_missing: 1,
      sensitive_change_review_required: 1
    },
    benchmarkExpectedDriverCounts: {
      validation_missing: 1
    },
    observedDriversNotInBenchmark: [
      "environment_unknown",
      "sensitive_change_review_required"
    ],
    benchmarkDriversNotObserved: []
  },
  calibrationCandidates: [
    {
      category: "policy_tuning",
      reason: "false_positive_observed",
      opportunityFamily: "missing_stale_low_quality_context",
      driverCategories: ["validation_missing"],
      outcomeCategories: ["false_positive"]
    },
    {
      category: "detector_gap",
      reason: "false_negative_observed",
      opportunityFamily: "environment_deploy_uncertainty",
      driverCategories: ["environment_unknown"],
      outcomeCategories: ["false_negative"]
    },
    {
      category: "ux_clarity",
      reason: "confusing_defer_or_escalate_case",
      opportunityFamily: "missing_stale_low_quality_context",
      driverCategories: ["validation_missing"],
      outcomeCategories: ["confusing"]
    },
    {
      category: "benchmark_expansion",
      reason: "observed_case_not_covered_by_benchmark",
      opportunityFamily: "sensitive_surfaces_large_diffs",
      driverCategories: ["sensitive_change_review_required"],
      outcomeCategories: ["missing_coverage"]
    },
    {
      category: "needs_human_review",
      reason: "reviewer_followup_required",
      opportunityFamily: "sensitive_surfaces_large_diffs",
      driverCategories: ["sensitive_change_review_required"],
      outcomeCategories: ["needs_review"]
    }
  ],
  safety: {
    analyzedOnlySanitizedFindings: true,
    containsRawPrivateData: false,
    remoteTelemetryUsed: false,
    networkRequired: false
  },
  limitations: ["sanitized_findings_only"]
});

const acceptedInput = (): BuildRealRepoCalibrationPlanInput => ({
  findingsSummaries: [summary()],
  intakePackets: [intakePacket()],
  gapAnalyses: [gapAnalysis()]
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

describe("real-repo trial calibration plan", () => {
  it("uses stable schema and blocks readiness for empty inputs", () => {
    const plan = buildRealRepoCalibrationPlan();

    expect(plan.schemaVersion).toBe(realRepoCalibrationPlanSchemaVersion);
    expect(plan.readiness.readyForCalibration).toBe(false);
    expect(plan.readiness.blockers).toContain("no_accepted_trial_evidence");
    expect(plan.readiness.requiredNextSteps).toEqual(
      expect.arrayContaining([
        "run_supervised_trials",
        "accept_sanitized_findings"
      ])
    );
  });

  it("blocks non-accepted intake and requires gap analysis when missing", () => {
    const nonAccepted = buildRealRepoCalibrationPlan({
      findingsSummaries: [summary()],
      intakePackets: [
        intakePacket({
          intakeStatus: "needs_redaction",
          gapAnalysisReady: false
        })
      ],
      gapAnalyses: [gapAnalysis()]
    });
    const missingGap = buildRealRepoCalibrationPlan({
      findingsSummaries: [summary()],
      intakePackets: [intakePacket()]
    });

    expect(nonAccepted.readiness.readyForCalibration).toBe(false);
    expect(nonAccepted.readiness.blockers).toContain("intake_not_accepted");
    expect(missingGap.readiness.readyForCalibration).toBe(false);
    expect(missingGap.readiness.requiredNextSteps).toContain(
      "complete_gap_analysis"
    );
  });

  it("produces ready deterministic plans from accepted evidence and gap analysis", () => {
    const input = acceptedInput();
    const before = JSON.stringify(input);
    const first = buildRealRepoCalibrationPlan(input);
    const second = buildRealRepoCalibrationPlan(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(first.readiness.readyForCalibration).toBe(true);
    expect(first.inputSummary).toEqual({
      acceptedTrialCount: 2,
      intakePacketCount: 1,
      gapAnalysisCount: 1,
      caseCount: 6
    });
  });

  it("generates category-specific calibration items with stable actions", () => {
    const plan = buildRealRepoCalibrationPlan(acceptedInput());
    const byCategory = Object.fromEntries(
      plan.calibrationItems.map((item) => [item.category, item])
    );

    expect(byCategory.policy_tuning?.recommendedAction).toBe(
      "policy_tuning_review"
    );
    expect(byCategory.detector_gap?.recommendedAction).toBe(
      "investigate_detector_or_policy_gap"
    );
    expect(byCategory.ux_clarity?.recommendedAction).toBe(
      "improve_explanation_or_docs"
    );
    expect(byCategory.documentation?.recommendedAction).toBe(
      "update_trial_docs_or_defer_guidance"
    );
    expect(byCategory.benchmark_expansion?.recommendedAction).toBe(
      "add_benchmark_scenario_or_driver_expectation"
    );
    expect(byCategory.needs_more_evidence?.recommendedAction).toBe(
      "collect_more_reviewed_cases"
    );
    expect(byCategory.detector_gap?.priority).toBe("critical");
    expect(byCategory.needs_more_evidence?.priority).toBe("medium");

    for (const item of plan.calibrationItems) {
      expect(item.safeForImplementation).toBe(false);
      expect(
        item.sourceSignals.every((signal) => /^[a-z][a-z0-9_]*$/.test(signal))
      ).toBe(true);
    }
  });

  it("summarizes categories, priorities, families, and drivers", () => {
    const plan = buildRealRepoCalibrationPlan(acceptedInput());

    expect(plan.summary.byCategory).toMatchObject({
      policy_tuning: 1,
      detector_gap: 1,
      ux_clarity: 1,
      documentation: 1,
      benchmark_expansion: 1,
      needs_more_evidence: 1
    });
    expect(plan.summary.byPriority).toMatchObject({
      critical: 1,
      high: 1,
      medium: 4
    });
    expect(plan.summary.topOpportunityFamilies).toMatchObject({
      environment_deploy_uncertainty: expect.any(Number),
      missing_stale_low_quality_context: expect.any(Number),
      sensitive_surfaces_large_diffs: expect.any(Number)
    });
    expect(plan.summary.topDriverCategories).toMatchObject({
      environment_unknown: expect.any(Number),
      validation_missing: expect.any(Number)
    });
  });

  it("keeps safety flags, limitations, and serialized output privacy-safe", () => {
    const input = clone(acceptedInput());
    const plan = buildRealRepoCalibrationPlan(input);
    const serialized = JSON.stringify(plan);

    expect(plan.safety).toEqual({
      categoryOnly: true,
      containsRawPrivateData: false,
      remoteTelemetryUsed: false,
      productionBehaviorChanged: false
    });
    expect(plan.limitations).toEqual(
      expect.arrayContaining([
        "calibration_plan_only",
        "no_automatic_policy_changes",
        "no_production_behavior_change",
        "category_only_inputs",
        "requires_human_review",
        "not_real_world_accuracy_claim"
      ])
    );

    for (const rawString of forbiddenRawStrings) {
      expect(serialized).not.toContain(rawString);
    }
  });
});
