import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildUncertaintyProfile } from "../../src/uncertainty/uncertaintyProfileBuilder.js";
import { routeUncertainty } from "../../src/uncertainty/uncertaintyRouter.js";
import {
  uncertaintyDimensions,
  type UncertaintyProfile,
  type UncertaintyReductionStepKind
} from "../../src/uncertainty/uncertaintyTypes.js";
import {
  validateFixtureSafety,
  validateOpportunityBenchmarkFixture,
  type OpportunityBenchmarkFixture
} from "./fixtureSchema.js";
import {
  opportunityProblemFamilies,
  validateOpportunityBenchmarkScenario,
  validateScenarioSafety,
  type OpportunityBenchmarkScenario,
  type OpportunityProblemFamily
} from "./scenarioSchema.js";
import { buildSyntheticProfileInput } from "./syntheticProfileInput.js";
import {
  opportunityBenchmarkRunOptionsSchema,
  opportunityBenchmarkRunResultSchema,
  opportunityBenchmarkRunSchemaVersion,
  type OpportunityBenchmarkRunOptions,
  type OpportunityBenchmarkRunResult,
  type OpportunityBenchmarkScenarioResult
} from "./runnerTypes.js";

const benchmarkRoot = path.join(process.cwd(), "benchmarks", "opportunity-map");
const scenariosRoot = path.join(benchmarkRoot, "scenarios");
const fixturesRoot = path.join(benchmarkRoot, "fixtures");

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort();

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

export const loadOpportunityBenchmarkScenarios = async (): Promise<
  OpportunityBenchmarkScenario[]
> => {
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

export const loadOpportunityBenchmarkFixtures = async (): Promise<
  OpportunityBenchmarkFixture[]
> => {
  const fixtureFiles = (await readFilesRecursively(fixturesRoot)).filter(
    (file) => path.basename(file) === "benchmark-fixture.json"
  );
  const fixtures: OpportunityBenchmarkFixture[] = [];

  for (const file of fixtureFiles) {
    const fixture = validateOpportunityBenchmarkFixture(
      JSON.parse(await readFile(file, "utf8")) as unknown
    );

    validateFixtureSafety(fixture);
    fixtures.push(fixture);
  }

  return fixtures.sort((left, right) => left.id.localeCompare(right.id));
};

const collectProfileDrivers = (profile: UncertaintyProfile): string[] =>
  uniqueSorted(
    uncertaintyDimensions.flatMap(
      (dimension) => profile.dimensions[dimension].drivers
    )
  );

const collectReductionStepKinds = (
  profile: UncertaintyProfile
): UncertaintyReductionStepKind[] =>
  uniqueSorted(
    profile.uncertaintyReductionPlan?.steps.map((step) => step.kind) ?? []
  ) as UncertaintyReductionStepKind[];

const includesAll = (
  actual: string[],
  expected: string[] | undefined
): boolean => {
  const actualSet = new Set(actual);

  return (expected ?? []).every((value) => actualSet.has(value));
};

const fixturesForScenario = (
  scenario: OpportunityBenchmarkScenario,
  fixtureById: Map<string, OpportunityBenchmarkFixture>
): OpportunityBenchmarkFixture[] =>
  (scenario.fixtureRefs ?? []).map((fixtureRef) => {
    const fixture = fixtureById.get(fixtureRef);

    if (fixture === undefined) {
      throw new Error(`Scenario references unknown fixture: ${scenario.id}`);
    }

    return fixture;
  });

const runScenario = (
  scenario: OpportunityBenchmarkScenario,
  fixtureById: Map<string, OpportunityBenchmarkFixture>
): OpportunityBenchmarkScenarioResult => {
  const scenarioFixtures = fixturesForScenario(scenario, fixtureById);
  const profile = buildUncertaintyProfile(
    buildSyntheticProfileInput(scenario, scenarioFixtures)
  );
  const routerResult = routeUncertainty(profile);
  const actualDrivers = collectProfileDrivers(profile);
  const actualStepKinds = collectReductionStepKinds(profile);
  const advisoryDecisionMatch =
    routerResult.recommendedDecision ===
    scenario.expected.advisoryRouterDecision;
  const expectedDriversPresent = includesAll(
    actualDrivers,
    scenario.expected.uncertaintyDrivers
  );
  const expectedReductionStepsPresent = includesAll(
    actualStepKinds,
    scenario.expected.reductionStepKinds
  );
  const passed =
    advisoryDecisionMatch &&
    expectedDriversPresent &&
    expectedReductionStepsPresent;

  return {
    scenarioId: scenario.id,
    problemFamily: scenario.problemFamily,
    fixtureRefs: scenario.fixtureRefs ?? [],
    passed,
    expected: {
      advisoryRouterDecision: scenario.expected.advisoryRouterDecision,
      uncertaintyDrivers: scenario.expected.uncertaintyDrivers,
      ...(scenario.expected.reductionStepKinds !== undefined
        ? { reductionStepKinds: scenario.expected.reductionStepKinds }
        : {})
    },
    actual: {
      advisoryRouterDecision: routerResult.recommendedDecision,
      uncertaintyDrivers: actualDrivers,
      reductionStepKinds: actualStepKinds,
      topDrivers: profile.topDrivers,
      overallLevel: profile.overallLevel
    },
    checks: {
      advisoryDecisionMatch,
      expectedDriversPresent,
      expectedReductionStepsPresent
    }
  };
};

const filterScenarios = (
  scenarios: OpportunityBenchmarkScenario[],
  options: OpportunityBenchmarkRunOptions
): OpportunityBenchmarkScenario[] => {
  const scenarioIds =
    options.scenarioIds !== undefined
      ? new Set(options.scenarioIds)
      : undefined;
  const problemFamilies =
    options.problemFamilies !== undefined
      ? new Set(options.problemFamilies)
      : undefined;

  return scenarios.filter(
    (scenario) =>
      (scenarioIds === undefined || scenarioIds.has(scenario.id)) &&
      (problemFamilies === undefined ||
        problemFamilies.has(scenario.problemFamily))
  );
};

const coverageFor = (
  scenarios: OpportunityBenchmarkScenario[]
): {
  problemFamiliesCovered: OpportunityProblemFamily[];
  scenarioCountByFamily: Record<OpportunityProblemFamily, number>;
} => {
  const scenarioCountByFamily = Object.fromEntries(
    opportunityProblemFamilies.map((family) => [family, 0])
  ) as Record<OpportunityProblemFamily, number>;

  for (const scenario of scenarios) {
    scenarioCountByFamily[scenario.problemFamily] += 1;
  }

  return {
    problemFamiliesCovered: opportunityProblemFamilies.filter(
      (family) => scenarioCountByFamily[family] > 0
    ),
    scenarioCountByFamily
  };
};

const assertFixtureReferencesResolve = (
  scenarios: OpportunityBenchmarkScenario[],
  fixtureById: Map<string, OpportunityBenchmarkFixture>
): void => {
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));

  for (const scenario of scenarios) {
    for (const fixtureRef of scenario.fixtureRefs ?? []) {
      if (!fixtureById.has(fixtureRef)) {
        throw new Error(`Scenario references unknown fixture: ${scenario.id}`);
      }
    }
  }

  for (const fixture of fixtureById.values()) {
    for (const scenarioId of fixture.scenarioIds) {
      if (!scenarioIds.has(scenarioId)) {
        throw new Error(`Fixture references unknown scenario: ${fixture.id}`);
      }
    }
  }
};

export const runOpportunityBenchmark = async (
  options: OpportunityBenchmarkRunOptions = {}
): Promise<OpportunityBenchmarkRunResult> => {
  const parsedOptions = opportunityBenchmarkRunOptionsSchema.parse(options);
  const scenarios = await loadOpportunityBenchmarkScenarios();
  const fixtures = await loadOpportunityBenchmarkFixtures();
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  assertFixtureReferencesResolve(scenarios, fixtureById);

  const selectedScenarios = filterScenarios(scenarios, parsedOptions);
  const results = selectedScenarios.map((scenario) =>
    runScenario(scenario, fixtureById)
  );
  const passedScenarios = results.filter((result) => result.passed).length;
  const failedScenarios = results.length - passedScenarios;

  return opportunityBenchmarkRunResultSchema.parse({
    schemaVersion: opportunityBenchmarkRunSchemaVersion,
    totalScenarios: results.length,
    passedScenarios,
    failedScenarios,
    skippedScenarios: 0,
    results,
    coverage: coverageFor(selectedScenarios),
    safety: {
      executedCommands: false,
      requiredNetwork: false,
      mutatedRepository: false,
      touchedRealSecrets: false
    }
  });
};
