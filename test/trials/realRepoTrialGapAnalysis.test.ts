import { describe, expect, it } from "vitest";
import type { OpportunityBenchmarkScenario } from "../../benchmarks/opportunity-map/index.js";
import {
  analyzeRealVsBenchmarkGaps,
  realVsBenchmarkGapAnalysisSchemaVersion,
  type RealRepoTrialFindings
} from "../../trials/real-repo/index.js";

const benchmarkScenario = (
  id: string,
  problemFamily: OpportunityBenchmarkScenario["problemFamily"],
  drivers: string[]
): OpportunityBenchmarkScenario => ({
  schemaVersion: "opportunity-benchmark-scenario.v1",
  id,
  title: id,
  problemFamily,
  sourceFromOpportunityMap: "synthetic test scenario",
  description: "synthetic category-only test scenario",
  action: {
    type: "edit_file",
    category: "synthetic_category"
  },
  expected: {
    advisoryRouterDecision: "DEFER",
    uncertaintyDrivers: drivers,
    reductionStepKinds: ["read_target_file"],
    deferDrivers: drivers
  },
  safety: {
    inert: true,
    executesCommands: false,
    touchesRealSecrets: false,
    requiresNetwork: false,
    mutatesRepository: false
  },
  fixtureRefs: ["fixture-minimal-repo"]
});

const sampleBenchmarks = (): OpportunityBenchmarkScenario[] => [
  benchmarkScenario(
    "context-blind-edit-001",
    "missing_stale_low_quality_context",
    ["target_file_not_observed", "validation_missing"]
  ),
  benchmarkScenario(
    "sensitive-auth-review-001",
    "sensitive_surfaces_large_diffs",
    ["sensitive_change_review_required"]
  ),
  benchmarkScenario(
    "environment-prod-deploy-001",
    "environment_deploy_uncertainty",
    ["production_environment_detected"]
  )
];

const sampleFindings = (): RealRepoTrialFindings[] => [
  {
    schemaVersion: "real-repo-trial-findings.v1",
    trialId: "gap-placeholder",
    repoCategory: "toy",
    repoSizeCategory: "small",
    languageCategories: ["typescript"],
    frameworkCategories: ["node"],
    trialMode: "guided_operator",
    policyTemplate: "basic",
    decisionCounts: {
      PROCEED: 1,
      DEFER: 3,
      ESCALATE: 1,
      BLOCK: 1
    },
    topCategories: {
      deferDrivers: ["target_file_not_observed"],
      escalateDrivers: ["sensitive_change_review_required"],
      blockDrivers: ["command_risk_critical"]
    },
    cases: [
      {
        caseId: "gap-useful-001",
        opportunityFamily: "missing_stale_low_quality_context",
        expectedPosture: "DEFER",
        actualPosture: "DEFER",
        outcomeCategory: "useful",
        driverCategories: ["target_file_not_observed"]
      },
      {
        caseId: "gap-false-positive-001",
        opportunityFamily: "missing_stale_low_quality_context",
        expectedPosture: "PROCEED",
        actualPosture: "DEFER",
        outcomeCategory: "false_positive",
        driverCategories: ["validation_missing"]
      },
      {
        caseId: "gap-false-negative-001",
        opportunityFamily: "environment_deploy_uncertainty",
        expectedPosture: "BLOCK",
        actualPosture: "PROCEED",
        outcomeCategory: "false_negative",
        driverCategories: ["environment_unknown"]
      },
      {
        caseId: "gap-confusing-001",
        opportunityFamily: "sensitive_surfaces_large_diffs",
        actualPosture: "ESCALATE",
        outcomeCategory: "confusing",
        driverCategories: ["sensitive_change_review_required"]
      },
      {
        caseId: "gap-missing-coverage-001",
        opportunityFamily: "git_workflow_repo_integrity",
        expectedPosture: "ESCALATE",
        actualPosture: "ESCALATE",
        outcomeCategory: "missing_coverage",
        driverCategories: ["protected_branch_risk"]
      },
      {
        caseId: "gap-needs-review-001",
        opportunityFamily: "sensitive_surfaces_large_diffs",
        expectedPosture: "ESCALATE",
        actualPosture: "ESCALATE",
        outcomeCategory: "needs_review",
        driverCategories: ["sensitive_change_review_required"]
      }
    ],
    qualitativeFeedback: {
      usefulPatterns: ["context_plan_clear"],
      confusingPatterns: ["escalation_copy_unclear"],
      missingCoverage: ["git_policy_mapping"],
      requestedImprovements: ["shorter_summary"]
    },
    privacyReview: {
      manuallyReviewed: true,
      containsSourceCode: false,
      containsDiffs: false,
      containsSecrets: false,
      containsRawCommands: false,
      containsPrivatePaths: false,
      containsRepoNames: false,
      containsBranchNames: false,
      containsValidationLogs: false,
      containsCustomerData: false
    },
    limitations: ["synthetic_sanitized_data", "manual_review_required"]
  }
];

const forbiddenStrings = [
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

describe("real-vs-benchmark gap analysis", () => {
  it("produces deterministic schema-stable analysis without mutating inputs", () => {
    const findings = sampleFindings();
    const benchmarks = sampleBenchmarks();
    const beforeFindings = JSON.stringify(findings);
    const beforeBenchmarks = JSON.stringify(benchmarks);
    const first = analyzeRealVsBenchmarkGaps(findings, benchmarks);
    const second = analyzeRealVsBenchmarkGaps(findings, benchmarks);

    expect(first.schemaVersion).toBe(realVsBenchmarkGapAnalysisSchemaVersion);
    expect(first).toEqual(second);
    expect(JSON.stringify(findings)).toBe(beforeFindings);
    expect(JSON.stringify(benchmarks)).toBe(beforeBenchmarks);
  });

  it("handles empty findings safely with benchmark families listed", () => {
    const analysis = analyzeRealVsBenchmarkGaps([], sampleBenchmarks());

    expect(analysis.inputSummary).toEqual({
      trialCount: 0,
      caseCount: 0,
      benchmarkScenarioCount: 3,
      benchmarkProblemFamilyCount: 3
    });
    expect(analysis.familyCoverage.observedFamilies).toEqual([]);
    expect(analysis.familyCoverage.benchmarkFamilies).toEqual([
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs"
    ]);
    expect(analysis.familyCoverage.benchmarkFamiliesNotObserved).toEqual(
      analysis.familyCoverage.benchmarkFamilies
    );
    expect(analysis.safety).toEqual({
      analyzedOnlySanitizedFindings: true,
      containsRawPrivateData: false,
      remoteTelemetryUsed: false,
      networkRequired: false
    });
  });

  it("computes family coverage, outcomes, and posture comparison", () => {
    const analysis = analyzeRealVsBenchmarkGaps(
      sampleFindings(),
      sampleBenchmarks()
    );

    expect(analysis.inputSummary).toMatchObject({
      trialCount: 1,
      caseCount: 6,
      benchmarkScenarioCount: 3,
      benchmarkProblemFamilyCount: 3
    });
    expect(analysis.familyCoverage.observedFamilies).toEqual([
      "environment_deploy_uncertainty",
      "git_workflow_repo_integrity",
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs"
    ]);
    expect(analysis.familyCoverage.familiesObservedAndBenchmarked).toEqual([
      "environment_deploy_uncertainty",
      "missing_stale_low_quality_context",
      "sensitive_surfaces_large_diffs"
    ]);
    expect(analysis.familyCoverage.benchmarkFamiliesNotObserved).toEqual([]);
    expect(
      analysis.familyCoverage.observedFamiliesWithoutBenchmarkCoverage
    ).toEqual(["git_workflow_repo_integrity"]);
    expect(analysis.outcomeSummary).toEqual({
      useful: 1,
      falsePositive: 1,
      falseNegative: 1,
      confusing: 1,
      missingCoverage: 1,
      needsReview: 1
    });
    expect(analysis.postureComparison).toEqual({
      matchedExpectedPosture: 3,
      mismatchedExpectedPosture: 2,
      missingExpectedPosture: 1
    });
  });

  it("computes observed and benchmark driver gap analysis", () => {
    const analysis = analyzeRealVsBenchmarkGaps(
      sampleFindings(),
      sampleBenchmarks()
    );

    expect(analysis.driverAnalysis.observedDriverCounts).toMatchObject({
      target_file_not_observed: 2,
      validation_missing: 1,
      environment_unknown: 1,
      sensitive_change_review_required: 3,
      protected_branch_risk: 1,
      command_risk_critical: 1
    });
    expect(analysis.driverAnalysis.benchmarkExpectedDriverCounts).toEqual({
      target_file_not_observed: 1,
      validation_missing: 1,
      sensitive_change_review_required: 1,
      production_environment_detected: 1
    });
    expect(analysis.driverAnalysis.observedDriversNotInBenchmark).toEqual([
      "command_risk_critical",
      "environment_unknown",
      "protected_branch_risk"
    ]);
    expect(analysis.driverAnalysis.benchmarkDriversNotObserved).toEqual([
      "production_environment_detected"
    ]);
  });

  it("creates stable category-only calibration candidates", () => {
    const analysis = analyzeRealVsBenchmarkGaps(
      sampleFindings(),
      sampleBenchmarks()
    );

    expect(analysis.calibrationCandidates).toEqual([
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
        opportunityFamily: "sensitive_surfaces_large_diffs",
        driverCategories: ["sensitive_change_review_required"],
        outcomeCategories: ["confusing"]
      },
      {
        category: "benchmark_expansion",
        reason: "observed_case_not_covered_by_benchmark",
        opportunityFamily: "git_workflow_repo_integrity",
        driverCategories: ["protected_branch_risk"],
        outcomeCategories: ["missing_coverage"]
      },
      {
        category: "needs_human_review",
        reason: "reviewer_followup_required",
        opportunityFamily: "sensitive_surfaces_large_diffs",
        driverCategories: ["sensitive_change_review_required"],
        outcomeCategories: ["needs_review"]
      }
    ]);
  });

  it("keeps safety limitations and excludes raw private values", () => {
    const analysis = analyzeRealVsBenchmarkGaps(
      sampleFindings(),
      sampleBenchmarks()
    );
    const serialized = JSON.stringify(analysis);

    expect(analysis.limitations).toEqual(
      expect.arrayContaining([
        "sanitized_findings_only",
        "human_review_required_before_sharing",
        "not_real_world_accuracy_claim",
        "small_trial_count_until_more_data",
        "benchmark_gap_analysis_not_validation"
      ])
    );

    for (const forbiddenString of forbiddenStrings) {
      expect(serialized).not.toContain(forbiddenString);
    }
  });
});
