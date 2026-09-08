import type { OpportunityBenchmarkScenario } from "../../benchmarks/opportunity-map/scenarioSchema.js";
import { opportunityProblemFamilies } from "../../benchmarks/opportunity-map/scenarioSchema.js";
import type {
  RealRepoTrialCase,
  RealRepoTrialFindings
} from "./findingsSchema.js";
import { validateRealRepoTrialFindings } from "./findingsSchema.js";
import {
  realVsBenchmarkGapAnalysisSchema,
  realVsBenchmarkGapAnalysisSchemaVersion,
  type RealVsBenchmarkCalibrationCandidate,
  type RealVsBenchmarkGapAnalysis
} from "./gapAnalysisTypes.js";

const gapAnalysisLimitations = [
  "sanitized_findings_only",
  "human_review_required_before_sharing",
  "not_real_world_accuracy_claim",
  "small_trial_count_until_more_data",
  "benchmark_gap_analysis_not_validation"
] as const;

const sortedKeys = (counts: Record<string, number>): string[] =>
  Object.keys(counts).sort();

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const difference = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);

  return left.filter((value) => !rightSet.has(value));
};

const emptyOutcomeSummary =
  (): RealVsBenchmarkGapAnalysis["outcomeSummary"] => ({
    useful: 0,
    falsePositive: 0,
    falseNegative: 0,
    confusing: 0,
    missingCoverage: 0,
    needsReview: 0
  });

const addOutcome = (
  outcomeSummary: RealVsBenchmarkGapAnalysis["outcomeSummary"],
  outcomeCategory: RealRepoTrialCase["outcomeCategory"]
): void => {
  switch (outcomeCategory) {
    case "useful":
      outcomeSummary.useful += 1;
      break;
    case "false_positive":
      outcomeSummary.falsePositive += 1;
      break;
    case "false_negative":
      outcomeSummary.falseNegative += 1;
      break;
    case "confusing":
      outcomeSummary.confusing += 1;
      break;
    case "missing_coverage":
      outcomeSummary.missingCoverage += 1;
      break;
    case "needs_review":
      outcomeSummary.needsReview += 1;
      break;
  }
};

const candidateForCase = (
  trialCase: RealRepoTrialCase
): RealVsBenchmarkCalibrationCandidate | undefined => {
  switch (trialCase.outcomeCategory) {
    case "false_positive":
      return {
        category: "policy_tuning",
        reason: "false_positive_observed",
        opportunityFamily: trialCase.opportunityFamily,
        driverCategories: [...trialCase.driverCategories].sort(),
        outcomeCategories: [trialCase.outcomeCategory]
      };
    case "false_negative":
      return {
        category: "detector_gap",
        reason: "false_negative_observed",
        opportunityFamily: trialCase.opportunityFamily,
        driverCategories: [...trialCase.driverCategories].sort(),
        outcomeCategories: [trialCase.outcomeCategory]
      };
    case "confusing":
      return {
        category: "ux_clarity",
        reason: "confusing_defer_or_escalate_case",
        opportunityFamily: trialCase.opportunityFamily,
        driverCategories: [...trialCase.driverCategories].sort(),
        outcomeCategories: [trialCase.outcomeCategory]
      };
    case "missing_coverage":
      return {
        category: "benchmark_expansion",
        reason: "observed_case_not_covered_by_benchmark",
        opportunityFamily: trialCase.opportunityFamily,
        driverCategories: [...trialCase.driverCategories].sort(),
        outcomeCategories: [trialCase.outcomeCategory]
      };
    case "needs_review":
      return {
        category: "needs_human_review",
        reason: "reviewer_followup_required",
        opportunityFamily: trialCase.opportunityFamily,
        driverCategories: [...trialCase.driverCategories].sort(),
        outcomeCategories: [trialCase.outcomeCategory]
      };
    case "useful":
      return undefined;
  }
};

export const analyzeRealVsBenchmarkGaps = (
  findingsList: RealRepoTrialFindings[],
  benchmarkScenarios: OpportunityBenchmarkScenario[]
): RealVsBenchmarkGapAnalysis => {
  const findings = findingsList.map((entry) =>
    validateRealRepoTrialFindings(entry)
  );
  const observedFamilyCounts: Record<string, number> = {};
  const observedDriverCounts: Record<string, number> = {};
  const benchmarkExpectedDriverCounts: Record<string, number> = {};
  const outcomeSummary = emptyOutcomeSummary();
  const calibrationCandidates: RealVsBenchmarkCalibrationCandidate[] = [];
  let caseCount = 0;
  let matchedExpectedPosture = 0;
  let mismatchedExpectedPosture = 0;
  let missingExpectedPosture = 0;

  for (const entry of findings) {
    for (const trialCase of entry.cases) {
      caseCount += 1;
      increment(observedFamilyCounts, trialCase.opportunityFamily);

      for (const driver of trialCase.driverCategories) {
        increment(observedDriverCounts, driver);
      }

      addOutcome(outcomeSummary, trialCase.outcomeCategory);

      if (trialCase.expectedPosture === undefined) {
        missingExpectedPosture += 1;
      } else if (trialCase.expectedPosture === trialCase.actualPosture) {
        matchedExpectedPosture += 1;
      } else {
        mismatchedExpectedPosture += 1;
      }

      const candidate = candidateForCase(trialCase);

      if (candidate !== undefined) {
        calibrationCandidates.push(candidate);
      }
    }

    for (const driver of entry.topCategories.deferDrivers) {
      increment(observedDriverCounts, driver);
    }
    for (const driver of entry.topCategories.escalateDrivers) {
      increment(observedDriverCounts, driver);
    }
    for (const driver of entry.topCategories.blockDrivers) {
      increment(observedDriverCounts, driver);
    }
  }

  for (const scenario of benchmarkScenarios) {
    for (const driver of scenario.expected.uncertaintyDrivers) {
      increment(benchmarkExpectedDriverCounts, driver);
    }
  }

  const observedFamilies = sortedKeys(observedFamilyCounts);
  const benchmarkFamilies =
    benchmarkScenarios.length === 0
      ? [...opportunityProblemFamilies]
      : uniqueSorted(
          benchmarkScenarios.map((scenario) => scenario.problemFamily)
        );
  const observedDrivers = sortedKeys(observedDriverCounts);
  const benchmarkDrivers = sortedKeys(benchmarkExpectedDriverCounts);

  return realVsBenchmarkGapAnalysisSchema.parse({
    schemaVersion: realVsBenchmarkGapAnalysisSchemaVersion,
    inputSummary: {
      trialCount: findings.length,
      caseCount,
      benchmarkScenarioCount: benchmarkScenarios.length,
      benchmarkProblemFamilyCount: benchmarkFamilies.length
    },
    familyCoverage: {
      observedFamilies,
      benchmarkFamilies,
      familiesObservedAndBenchmarked: observedFamilies.filter((family) =>
        benchmarkFamilies.includes(family)
      ),
      benchmarkFamiliesNotObserved: difference(
        benchmarkFamilies,
        observedFamilies
      ),
      observedFamiliesWithoutBenchmarkCoverage: difference(
        observedFamilies,
        benchmarkFamilies
      )
    },
    outcomeSummary,
    postureComparison: {
      matchedExpectedPosture,
      mismatchedExpectedPosture,
      missingExpectedPosture
    },
    driverAnalysis: {
      observedDriverCounts,
      benchmarkExpectedDriverCounts,
      observedDriversNotInBenchmark: difference(
        observedDrivers,
        benchmarkDrivers
      ),
      benchmarkDriversNotObserved: difference(benchmarkDrivers, observedDrivers)
    },
    calibrationCandidates,
    safety: {
      analyzedOnlySanitizedFindings: true,
      containsRawPrivateData: false,
      remoteTelemetryUsed: false,
      networkRequired: false
    },
    limitations: [...gapAnalysisLimitations]
  });
};
