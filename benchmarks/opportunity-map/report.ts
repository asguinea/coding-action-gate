import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { decisionPostures } from "../../src/domain/decisions.js";
import { opportunityBenchmarkFixtureSchemaVersion } from "./fixtureSchema.js";
import {
  opportunityBenchmarkMetricsSchemaVersion,
  type OpportunityBenchmarkMetrics
} from "./metricsTypes.js";
import { summarizeOpportunityBenchmarkMetrics } from "./metrics.js";
import {
  opportunityBenchmarkRunSchemaVersion,
  type OpportunityBenchmarkRunResult,
  type OpportunityBenchmarkScenarioResult
} from "./runnerTypes.js";
import {
  opportunityBenchmarkScenarioSchemaVersion,
  opportunityProblemFamilies,
  type OpportunityProblemFamily
} from "./scenarioSchema.js";
import {
  opportunityBenchmarkReportSchema,
  opportunityBenchmarkReportSchemaVersion,
  type CreateOpportunityBenchmarkReportOptions,
  type OpportunityBenchmarkReport,
  type WrittenOpportunityBenchmarkReport
} from "./reportTypes.js";

const reportLimitations = [
  "synthetic_inert_scenarios",
  "advisory_router_only",
  "no_production_routing_integration",
  "no_real_world_execution",
  "no_real_world_repo_validation",
  "no_public_performance_claim",
  "no_remote_telemetry",
  "no_dashboard_surface",
  "no_report_artifacts_by_default"
] as const;

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort();

const posturesInStableOrder = (values: string[]): string[] => {
  const valueSet = new Set(values);

  return decisionPostures.filter((posture) => valueSet.has(posture));
};

const evidenceForFamily = (
  family: OpportunityProblemFamily,
  results: OpportunityBenchmarkScenarioResult[]
) => {
  const familyResults = results.filter(
    (result) => result.problemFamily === family
  );

  return {
    problemFamily: family,
    scenarioCount: familyResults.length,
    passedScenarios: familyResults.filter((result) => result.passed).length,
    failedScenarios: familyResults.filter((result) => !result.passed).length,
    representativeScenarioIds: familyResults.map((result) => result.scenarioId),
    expectedPostures: posturesInStableOrder(
      familyResults.map((result) => result.expected.advisoryRouterDecision)
    ),
    keyExpectedDrivers: uniqueSorted(
      familyResults.flatMap((result) => result.expected.uncertaintyDrivers)
    ),
    keyReductionSteps: uniqueSorted(
      familyResults.flatMap(
        (result) => result.expected.reductionStepKinds ?? []
      )
    )
  };
};

export const createOpportunityBenchmarkReport = (
  runResult: OpportunityBenchmarkRunResult,
  metrics: OpportunityBenchmarkMetrics,
  options: CreateOpportunityBenchmarkReportOptions = {}
): OpportunityBenchmarkReport => {
  const summary = summarizeOpportunityBenchmarkMetrics(metrics);

  return opportunityBenchmarkReportSchema.parse({
    schemaVersion: opportunityBenchmarkReportSchemaVersion,
    ...(options.generatedAt !== undefined
      ? { generatedAt: options.generatedAt }
      : {}),
    benchmark: {
      scenarioSchemaVersion: opportunityBenchmarkScenarioSchemaVersion,
      fixtureSchemaVersion: opportunityBenchmarkFixtureSchemaVersion,
      runSchemaVersion: opportunityBenchmarkRunSchemaVersion,
      metricsSchemaVersion: opportunityBenchmarkMetricsSchemaVersion
    },
    summary,
    evidenceByFamily: opportunityProblemFamilies.map((family) =>
      evidenceForFamily(family, runResult.results)
    ),
    limitations: uniqueSorted([...metrics.limitations, ...reportLimitations]),
    safety: {
      syntheticInertScenarios: true,
      executesCommands: false,
      executesPackageScripts: false,
      requiresNetwork: false,
      mutatesRepository: false,
      touchesRealSecrets: false,
      productionRoutingAuthoritative: false
    }
  });
};

const listValue = (values: string[]): string =>
  values.length === 0 ? "none" : values.join(", ");

export const formatOpportunityBenchmarkSummaryMarkdown = (
  report: OpportunityBenchmarkReport
): string => {
  const lines = [
    "# Opportunity Benchmark Local Evidence",
    "",
    "These are local raw metrics over synthetic inert scenarios. They evaluate the advisory uncertainty benchmark pipeline, not production routing or real-world repository performance.",
    "",
    "## Summary",
    "",
    `- Scenarios: ${report.summary.scenarioCount}`,
    `- Passed scenarios: ${report.summary.passedScenarios}`,
    `- Failed scenarios: ${report.summary.failedScenarios}`,
    `- Advisory decision match rate: ${report.summary.advisoryDecisionMatchRate}`,
    `- Expected driver match rate: ${report.summary.uncertaintyDriverMatchRate}`,
    `- Expected reduction-step match rate: ${report.summary.reductionStepMatchRate}`,
    `- Problem families covered: ${report.summary.problemFamiliesCovered}`,
    "",
    "## Evidence By Family",
    "",
    "| Problem family | Scenarios | Passed | Failed | Expected postures | Key expected drivers | Key reduction steps |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
    ...report.evidenceByFamily.map(
      (family) =>
        `| \`${family.problemFamily}\` | ${family.scenarioCount} | ${family.passedScenarios} | ${family.failedScenarios} | ${listValue(family.expectedPostures)} | ${listValue(family.keyExpectedDrivers)} | ${listValue(family.keyReductionSteps)} |`
    ),
    "",
    "## Safety Counters",
    "",
    `- Unsafe execution count: ${report.summary.unsafeExecutionCount}`,
    `- Privacy leak count: ${report.summary.privacyLeakCount}`,
    `- Executes commands: ${report.safety.executesCommands}`,
    `- Executes package scripts: ${report.safety.executesPackageScripts}`,
    `- Requires network: ${report.safety.requiresNetwork}`,
    `- Mutates repository: ${report.safety.mutatesRepository}`,
    `- Touches real secrets: ${report.safety.touchesRealSecrets}`,
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- \`${limitation}\``),
    "",
    "This evidence package is suitable for local engineering checks only. It is not a public performance claim."
  ];

  return `${lines.join("\n")}\n`;
};

export const writeOpportunityBenchmarkReport = async (
  report: OpportunityBenchmarkReport,
  outputDir: string
): Promise<WrittenOpportunityBenchmarkReport> => {
  await mkdir(outputDir, { recursive: true });

  const reportJsonPath = path.join(outputDir, "report.json");
  const summaryMarkdownPath = path.join(outputDir, "summary.md");

  await writeFile(
    reportJsonPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    summaryMarkdownPath,
    formatOpportunityBenchmarkSummaryMarkdown(report),
    "utf8"
  );

  return {
    reportJsonPath,
    summaryMarkdownPath
  };
};
