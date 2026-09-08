import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fixtureContentContainsForbiddenRawString,
  opportunityBenchmarkFixtureSchemaVersion,
  opportunityProblemFamilies,
  validateFixtureSafety,
  validateOpportunityBenchmarkFixture,
  validateOpportunityBenchmarkScenario,
  validateScenarioSafety,
  type OpportunityBenchmarkFixture,
  type OpportunityBenchmarkScenario
} from "../../benchmarks/opportunity-map/index.js";

const benchmarkRoot = path.join(process.cwd(), "benchmarks", "opportunity-map");
const fixturesRoot = path.join(benchmarkRoot, "fixtures");
const scenariosRoot = path.join(benchmarkRoot, "scenarios");

const safeScriptPattern = /^echo fixture-(test|lint|build)$/;

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

const loadFixtures = async (): Promise<OpportunityBenchmarkFixture[]> => {
  const metadataFiles = (await readFilesRecursively(fixturesRoot)).filter(
    (file) => path.basename(file) === "benchmark-fixture.json"
  );
  const fixtures: OpportunityBenchmarkFixture[] = [];

  for (const file of metadataFiles) {
    const fixture = validateOpportunityBenchmarkFixture(
      JSON.parse(await readFile(file, "utf8")) as unknown
    );

    validateFixtureSafety(fixture);
    fixtures.push(fixture);
  }

  return fixtures.sort((left, right) => left.id.localeCompare(right.id));
};

const loadScenarios = async (): Promise<OpportunityBenchmarkScenario[]> => {
  const scenarioFiles = (await readFilesRecursively(scenariosRoot)).filter(
    (file) => file.endsWith(".json")
  );
  const scenarios: OpportunityBenchmarkScenario[] = [];

  for (const file of scenarioFiles) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];

    for (const entry of entries) {
      const scenario = validateOpportunityBenchmarkScenario(entry);

      validateScenarioSafety(scenario);
      scenarios.push(scenario);
    }
  }

  return scenarios.sort((left, right) => left.id.localeCompare(right.id));
};

const packageJsonFiles = async (): Promise<string[]> =>
  (await readFilesRecursively(fixturesRoot)).filter(
    (file) => path.basename(file) === "package.json"
  );

describe("Opportunity Benchmark fixtures", () => {
  it("parses fixture metadata with stable schema and unique IDs", async () => {
    const fixtures = await loadFixtures();
    const ids = fixtures.map((fixture) => fixture.id);

    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    for (const fixture of fixtures) {
      expect(fixture.schemaVersion).toBe(
        opportunityBenchmarkFixtureSchemaVersion
      );
      expect(fixture.safety).toEqual({
        synthetic: true,
        inert: true,
        containsRealSecrets: false,
        containsExecutableDangerousCommands: false,
        requiresNetwork: false,
        mutatesRepository: false
      });
      const fixtureStats = await stat(
        path.join(process.cwd(), fixture.fixturePath)
      );

      expect(fixtureStats.isDirectory()).toBe(true);
    }
  });

  it("covers every problem family and references existing scenarios", async () => {
    const fixtures = await loadFixtures();
    const scenarios = await loadScenarios();
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
    const coveredFamilies = new Set(
      fixtures.flatMap((fixture) => fixture.supportedProblemFamilies)
    );

    for (const family of opportunityProblemFamilies) {
      expect(coveredFamilies.has(family)).toBe(true);
    }

    for (const fixture of fixtures) {
      for (const scenarioId of fixture.scenarioIds) {
        expect(scenarioIds.has(scenarioId)).toBe(true);
      }
    }
  });

  it("maps every scenario to a known fixture", async () => {
    const fixtures = await loadFixtures();
    const scenarios = await loadScenarios();
    const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));

    for (const scenario of scenarios) {
      expect(scenario.fixtureRefs?.length ?? 0).toBeGreaterThan(0);

      for (const fixtureRef of scenario.fixtureRefs ?? []) {
        expect(fixtureIds.has(fixtureRef)).toBe(true);
      }
    }
  });

  it("keeps fixture files free of forbidden raw values and dangerous script content", async () => {
    for (const file of await readFilesRecursively(fixturesRoot)) {
      const content = await readFile(file, "utf8");

      expect(fixtureContentContainsForbiddenRawString(content)).toBe(false);
      expect(content).not.toContain("API_KEY=");
      expect(content).not.toContain("SECRET=");
      expect(content).not.toContain("TOKEN=");
      expect(content).not.toContain("PRIVATE_KEY");
      expect(content).not.toContain("-----BEGIN");
      expect(content).not.toContain("sk_live");
      expect(content).not.toContain("sk_test");
      expect(content).not.toContain("npm publish");
      expect(content).not.toContain("vercel deploy");
      expect(content).not.toContain("--prod");
      expect(content).not.toContain("rm -rf");
      expect(content).not.toContain("git push --force");
      expect(content).not.toContain("git reset --hard");
      expect(content).not.toContain("git clean -fdx");
      expect(content).not.toContain("http://");
      expect(content).not.toContain("https://");
      expect(content).not.toContain("/Users/");
      expect(content).not.toContain("C:\\");
      expect(content).not.toContain("/tmp/private");
      expect(content).not.toContain("diff --git");
    }
  });

  it("allows only inert package scripts in fixture package.json files", async () => {
    for (const file of await packageJsonFiles()) {
      const parsed = JSON.parse(await readFile(file, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = parsed.scripts ?? {};

      expect(scripts).not.toHaveProperty("preinstall");
      expect(scripts).not.toHaveProperty("postinstall");
      expect(scripts).not.toHaveProperty("prepare");

      for (const [name, command] of Object.entries(scripts)) {
        expect(["test", "lint", "build"]).toContain(name);
        expect(command).toMatch(safeScriptPattern);
      }
    }
  });
});
