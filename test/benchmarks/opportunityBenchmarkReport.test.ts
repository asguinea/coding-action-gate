import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeOpportunityBenchmarkMetrics,
  createOpportunityBenchmarkReport,
  formatOpportunityBenchmarkSummaryMarkdown,
  opportunityBenchmarkReportSchemaVersion,
  runOpportunityBenchmark,
  writeOpportunityBenchmarkReport
} from "../../benchmarks/opportunity-map/index.js";

const tempDirs: string[] = [];
const fixturesRoot = path.join(
  process.cwd(),
  "benchmarks",
  "opportunity-map",
  "fixtures"
);

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-ob-report-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true }))
  );
});

const readFilesRecursively = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await readFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

const fixtureSnapshot = async (): Promise<Map<string, string>> => {
  const snapshot = new Map<string, string>();

  for (const file of await readFilesRecursively(fixturesRoot)) {
    snapshot.set(file, await readFile(file, "utf8"));
  }

  return snapshot;
};

const buildReport = async () => {
  const runResult = await runOpportunityBenchmark();
  const metrics = computeOpportunityBenchmarkMetrics(runResult);

  return {
    runResult,
    metrics,
    report: createOpportunityBenchmarkReport(runResult, metrics, {
      generatedAt: "2026-05-20T00:00:00.000Z"
    })
  };
};

const forbiddenStrings = [
  "/Users/",
  "C:\\",
  "/tmp/private",
  "API_KEY=",
  "SECRET=",
  "TOKEN=",
  "PRIVATE_KEY",
  "-----BEGIN",
  "sk_live",
  "sk_test",
  "npm publish",
  "vercel deploy",
  "rm -rf",
  "curl ",
  "wget ",
  "sudo ",
  "git push --force",
  "git reset --hard",
  "git clean -fdx",
  "http://",
  "https://",
  "diff --git"
];

const forbiddenClaims = [
  "StepHarbor is benchmark-proven",
  "StepHarbor achieves 100% real-world accuracy",
  "StepHarbor prevents all agentic coding failures",
  "StepHarbor has been validated across real-world repositories"
];

describe("Opportunity Benchmark report and evidence table", () => {
  it("creates a deterministic report with schema versions, summary, evidence, safety, and limitations", async () => {
    const { runResult, metrics, report } = await buildReport();
    const repeated = createOpportunityBenchmarkReport(runResult, metrics, {
      generatedAt: "2026-05-20T00:00:00.000Z"
    });

    expect(report).toEqual(repeated);
    expect(report.schemaVersion).toBe(opportunityBenchmarkReportSchemaVersion);
    expect(report.benchmark).toEqual({
      scenarioSchemaVersion: "opportunity-benchmark-scenario.v1",
      fixtureSchemaVersion: "opportunity-benchmark-fixture.v1",
      runSchemaVersion: "opportunity-benchmark-run.v1",
      metricsSchemaVersion: "opportunity-benchmark-metrics.v1"
    });
    expect(report.summary).toMatchObject({
      scenarioCount: 20,
      passedScenarios: 20,
      failedScenarios: 0,
      advisoryDecisionMatchRate: 1,
      uncertaintyDriverMatchRate: 1,
      reductionStepMatchRate: 1,
      problemFamiliesCovered: 10,
      unsafeExecutionCount: 0,
      privacyLeakCount: 0
    });
    expect(report.evidenceByFamily).toHaveLength(10);
    expect(
      report.evidenceByFamily.every((family) => family.scenarioCount >= 2)
    ).toBe(true);
    expect(report.safety).toEqual({
      syntheticInertScenarios: true,
      executesCommands: false,
      executesPackageScripts: false,
      requiresNetwork: false,
      mutatesRepository: false,
      touchesRealSecrets: false,
      productionRoutingAuthoritative: false
    });
    expect(report.limitations).toEqual(
      expect.arrayContaining([
        "synthetic_inert_scenarios",
        "advisory_router_only",
        "no_real_world_repo_validation",
        "no_public_performance_claim",
        "no_remote_telemetry",
        "no_dashboard_surface"
      ])
    );
  });

  it("does not mutate run results, metrics, or fixture files", async () => {
    const runResult = await runOpportunityBenchmark();
    const metrics = computeOpportunityBenchmarkMetrics(runResult);
    const runBefore = JSON.stringify(runResult);
    const metricsBefore = JSON.stringify(metrics);
    const fixturesBefore = await fixtureSnapshot();

    createOpportunityBenchmarkReport(runResult, metrics);
    expect(JSON.stringify(runResult)).toBe(runBefore);
    expect(JSON.stringify(metrics)).toBe(metricsBefore);
    expect(await fixtureSnapshot()).toEqual(fixturesBefore);
  });

  it("writes report artifacts only under an explicit output directory", async () => {
    const outputDir = await createTempDir();
    const { report } = await buildReport();
    const written = await writeOpportunityBenchmarkReport(report, outputDir);
    const files = (await readdir(outputDir)).sort();

    expect(files).toEqual(["report.json", "summary.md"]);
    expect(written.reportJsonPath).toBe(path.join(outputDir, "report.json"));
    expect(written.summaryMarkdownPath).toBe(
      path.join(outputDir, "summary.md")
    );
    await expect(stat(written.reportJsonPath)).resolves.toBeDefined();
    await expect(stat(written.summaryMarkdownPath)).resolves.toBeDefined();

    const parsedReport = JSON.parse(
      await readFile(written.reportJsonPath, "utf8")
    ) as unknown;
    const markdown = await readFile(written.summaryMarkdownPath, "utf8");

    expect(parsedReport).toEqual(report);
    expect(markdown).toContain("Opportunity Benchmark Local Evidence");
    expect(markdown).toContain(
      "These are local raw metrics over synthetic inert scenarios."
    );
  });

  it("keeps report JSON and Markdown privacy-safe", async () => {
    const { report } = await buildReport();
    const serialized = JSON.stringify(report);
    const markdown = formatOpportunityBenchmarkSummaryMarkdown(report);

    for (const forbidden of forbiddenStrings) {
      expect(serialized).not.toContain(forbidden);
      expect(markdown).not.toContain(forbidden);
    }
  });

  it("documents results without forbidden marketing claims", async () => {
    const resultsDoc = await readFile(
      path.join(process.cwd(), "docs", "opportunity-benchmark-results.md"),
      "utf8"
    );
    const docsIndex = await readFile(
      path.join(process.cwd(), "docs", "index.md"),
      "utf8"
    );

    expect(resultsDoc).toContain("synthetic inert scenarios");
    expect(resultsDoc).toContain("not production routing");
    expect(resultsDoc).toContain("Problem family");
    expect(docsIndex).toContain("opportunity-benchmark-results.md");

    for (const forbiddenClaim of forbiddenClaims) {
      expect(resultsDoc).not.toContain(forbiddenClaim);
    }
  });
});
