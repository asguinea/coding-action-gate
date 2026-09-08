import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadOpportunityBenchmarkFixtures,
  loadOpportunityBenchmarkScenarios,
  opportunityBenchmarkRunSchemaVersion,
  opportunityProblemFamilies,
  runOpportunityBenchmark
} from "../../benchmarks/opportunity-map/index.js";

const fixturesRoot = path.join(
  process.cwd(),
  "benchmarks",
  "opportunity-map",
  "fixtures"
);

const runnerSourcePath = path.join(
  process.cwd(),
  "benchmarks",
  "opportunity-map",
  "runner.ts"
);

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

const forbiddenResultStrings = [
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

describe("Opportunity Benchmark runner v1", () => {
  it("loads all scenarios and fixtures deterministically", async () => {
    const firstScenarios = await loadOpportunityBenchmarkScenarios();
    const secondScenarios = await loadOpportunityBenchmarkScenarios();
    const fixtures = await loadOpportunityBenchmarkFixtures();

    expect(firstScenarios).toHaveLength(20);
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    expect(firstScenarios.map((scenario) => scenario.id)).toEqual(
      secondScenarios.map((scenario) => scenario.id)
    );

    const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));

    for (const scenario of firstScenarios) {
      for (const fixtureRef of scenario.fixtureRefs ?? []) {
        expect(fixtureIds.has(fixtureRef)).toBe(true);
      }
    }
  });

  it("runs every scenario through the uncertainty profile and advisory router pipeline", async () => {
    const result = await runOpportunityBenchmark();

    expect(result.schemaVersion).toBe(opportunityBenchmarkRunSchemaVersion);
    expect(result.totalScenarios).toBe(20);
    expect(
      result.results
        .filter((scenarioResult) => !scenarioResult.passed)
        .map((scenarioResult) => ({
          scenarioId: scenarioResult.scenarioId,
          checks: scenarioResult.checks,
          expected: scenarioResult.expected,
          actual: scenarioResult.actual
        }))
    ).toEqual([]);
    expect(result.passedScenarios).toBe(20);
    expect(result.failedScenarios).toBe(0);
    expect(result.skippedScenarios).toBe(0);
    expect(result.safety).toEqual({
      executedCommands: false,
      requiredNetwork: false,
      mutatedRepository: false,
      touchedRealSecrets: false
    });

    for (const family of opportunityProblemFamilies) {
      expect(result.coverage.problemFamiliesCovered).toContain(family);
      expect(
        result.coverage.scenarioCountByFamily[family]
      ).toBeGreaterThanOrEqual(2);
    }

    for (const scenarioResult of result.results) {
      expect(scenarioResult.fixtureRefs.length).toBeGreaterThan(0);
      expect(scenarioResult.actual.uncertaintyDrivers.length).toBeGreaterThan(
        0
      );
      expect(scenarioResult.checks.advisoryDecisionMatch).toBe(true);
      expect(scenarioResult.checks.expectedDriversPresent).toBe(true);
      expect(scenarioResult.checks.expectedReductionStepsPresent).toBe(true);
    }
  });

  it("supports deterministic scenario and problem-family filtering", async () => {
    const byScenario = await runOpportunityBenchmark({
      scenarioIds: ["context-blind-edit-001"]
    });
    const byScenarioAgain = await runOpportunityBenchmark({
      scenarioIds: ["context-blind-edit-001"]
    });
    const byFamily = await runOpportunityBenchmark({
      problemFamilies: ["environment_deploy_uncertainty"]
    });

    expect(byScenario.totalScenarios).toBe(1);
    expect(byScenario.results[0]?.scenarioId).toBe("context-blind-edit-001");
    expect(byScenario).toEqual(byScenarioAgain);
    expect(byFamily.totalScenarios).toBe(2);
    expect(
      byFamily.results.every(
        (result) => result.problemFamily === "environment_deploy_uncertainty"
      )
    ).toBe(true);
  });

  it("does not import execution, network, or process-spawn modules", async () => {
    const source = await readFile(runnerSourcePath, "utf8");

    expect(source).not.toContain("child_process");
    expect(source).not.toContain("spawn");
    expect(source).not.toContain("exec(");
    expect(source).not.toContain("http");
    expect(source).not.toContain("https");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("net");
    expect(source).not.toContain("dgram");
  });

  it("does not mutate fixture files or write report artifacts", async () => {
    const before = await fixtureSnapshot();
    const result = await runOpportunityBenchmark();
    const after = await fixtureSnapshot();

    expect(result.totalScenarios).toBe(20);
    expect(after).toEqual(before);
  });

  it("serializes benchmark results with category IDs only", async () => {
    const serialized = JSON.stringify(await runOpportunityBenchmark());

    for (const forbidden of forbiddenResultStrings) {
      expect(serialized).not.toContain(forbidden);
    }

    expect(serialized).toContain("target_file_not_observed");
    expect(serialized).toContain("production_environment_detected");
    expect(serialized).toContain("stop_and_request_human_review");
  });
});
