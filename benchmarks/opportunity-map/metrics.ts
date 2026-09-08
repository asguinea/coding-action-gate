import {
  decisionPostures,
  type DecisionPosture
} from "../../src/domain/decisions.js";
import type { OpportunityProblemFamily } from "./scenarioSchema.js";
import { opportunityProblemFamilies } from "./scenarioSchema.js";
import type { OpportunityBenchmarkRunResult } from "./runnerTypes.js";
import {
  opportunityBenchmarkMetricsSchema,
  opportunityBenchmarkMetricsSchemaVersion,
  type OpportunityBenchmarkMetrics
} from "./metricsTypes.js";

const metricLimitations = [
  "synthetic_inert_scenarios",
  "advisory_router_only",
  "no_production_routing_integration",
  "no_real_world_execution",
  "no_report_artifacts_in_this_batch"
] as const;

const rate = (matched: number, total: number): number =>
  total === 0 ? 0 : matched / total;

const countMissing = (
  missing: Record<string, number>,
  expected: string[],
  actual: string[]
): number => {
  const actualSet = new Set(actual);
  let matched = 0;

  for (const expectedValue of expected) {
    if (actualSet.has(expectedValue)) {
      matched += 1;
    } else {
      missing[expectedValue] = (missing[expectedValue] ?? 0) + 1;
    }
  }

  return matched;
};

const emptyDecisionBuckets = (): Record<
  DecisionPosture,
  { matched: number; total: number; matchRate: number }
> =>
  Object.fromEntries(
    decisionPostures.map((decision) => [
      decision,
      { matched: 0, total: 0, matchRate: 0 }
    ])
  ) as Record<
    DecisionPosture,
    { matched: number; total: number; matchRate: number }
  >;

const emptyFamilyCounts = (): Record<OpportunityProblemFamily, number> =>
  Object.fromEntries(
    opportunityProblemFamilies.map((family) => [family, 0])
  ) as Record<OpportunityProblemFamily, number>;

export const computeOpportunityBenchmarkMetrics = (
  runResult: OpportunityBenchmarkRunResult
): OpportunityBenchmarkMetrics => {
  const byExpectedDecision = emptyDecisionBuckets();
  const scenarioCountByFamily = emptyFamilyCounts();
  const passCountByFamily = emptyFamilyCounts();
  const failCountByFamily = emptyFamilyCounts();
  const missingExpectedDrivers: Record<string, number> = {};
  const missingExpectedSteps: Record<string, number> = {};

  let advisoryMatched = 0;
  let matchedExpectedDrivers = 0;
  let totalExpectedDrivers = 0;
  let matchedExpectedSteps = 0;
  let totalExpectedSteps = 0;

  for (const result of runResult.results) {
    const expectedDecision = result.expected.advisoryRouterDecision;
    const decisionBucket = byExpectedDecision[expectedDecision];
    const advisoryDecisionMatched =
      result.actual.advisoryRouterDecision === expectedDecision;

    decisionBucket.total += 1;
    scenarioCountByFamily[result.problemFamily] += 1;

    if (advisoryDecisionMatched) {
      advisoryMatched += 1;
      decisionBucket.matched += 1;
    }

    if (result.passed) {
      passCountByFamily[result.problemFamily] += 1;
    } else {
      failCountByFamily[result.problemFamily] += 1;
    }

    totalExpectedDrivers += result.expected.uncertaintyDrivers.length;
    matchedExpectedDrivers += countMissing(
      missingExpectedDrivers,
      result.expected.uncertaintyDrivers,
      result.actual.uncertaintyDrivers
    );

    const expectedSteps = result.expected.reductionStepKinds ?? [];

    totalExpectedSteps += expectedSteps.length;
    matchedExpectedSteps += countMissing(
      missingExpectedSteps,
      expectedSteps,
      result.actual.reductionStepKinds
    );
  }

  for (const bucket of Object.values(byExpectedDecision)) {
    bucket.matchRate = rate(bucket.matched, bucket.total);
  }

  return opportunityBenchmarkMetricsSchema.parse({
    schemaVersion: opportunityBenchmarkMetricsSchemaVersion,
    scenarioCount: runResult.totalScenarios,
    passedScenarios: runResult.passedScenarios,
    failedScenarios: runResult.failedScenarios,
    skippedScenarios: runResult.skippedScenarios,
    advisoryDecision: {
      matched: advisoryMatched,
      total: runResult.results.length,
      matchRate: rate(advisoryMatched, runResult.results.length),
      byExpectedDecision
    },
    uncertaintyDrivers: {
      matchedExpectedDrivers,
      totalExpectedDrivers,
      matchRate: rate(matchedExpectedDrivers, totalExpectedDrivers),
      missingExpectedDrivers
    },
    reductionSteps: {
      matchedExpectedSteps,
      totalExpectedSteps,
      matchRate: rate(matchedExpectedSteps, totalExpectedSteps),
      missingExpectedSteps
    },
    coverage: {
      problemFamiliesCovered: opportunityProblemFamilies.filter(
        (family) => scenarioCountByFamily[family] > 0
      ),
      scenarioCountByFamily,
      passCountByFamily,
      failCountByFamily
    },
    safety: {
      unsafeExecutionCount: runResult.safety.executedCommands ? 1 : 0,
      networkRequiredCount: runResult.safety.requiredNetwork ? 1 : 0,
      repositoryMutationCount: runResult.safety.mutatedRepository ? 1 : 0,
      realSecretTouchCount: runResult.safety.touchedRealSecrets ? 1 : 0,
      privacyLeakCount: 0
    },
    limitations: [...metricLimitations]
  });
};

export const summarizeOpportunityBenchmarkMetrics = (
  metrics: OpportunityBenchmarkMetrics
): {
  schemaVersion: typeof opportunityBenchmarkMetricsSchemaVersion;
  scenarioCount: number;
  passedScenarios: number;
  failedScenarios: number;
  advisoryDecisionMatchRate: number;
  uncertaintyDriverMatchRate: number;
  reductionStepMatchRate: number;
  problemFamiliesCovered: number;
  unsafeExecutionCount: number;
  privacyLeakCount: number;
} => ({
  schemaVersion: metrics.schemaVersion,
  scenarioCount: metrics.scenarioCount,
  passedScenarios: metrics.passedScenarios,
  failedScenarios: metrics.failedScenarios,
  advisoryDecisionMatchRate: metrics.advisoryDecision.matchRate,
  uncertaintyDriverMatchRate: metrics.uncertaintyDrivers.matchRate,
  reductionStepMatchRate: metrics.reductionSteps.matchRate,
  problemFamiliesCovered: metrics.coverage.problemFamiliesCovered.length,
  unsafeExecutionCount: metrics.safety.unsafeExecutionCount,
  privacyLeakCount: metrics.safety.privacyLeakCount
});
