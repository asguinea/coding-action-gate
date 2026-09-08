import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentSimulationFixtureActionCategories,
  agentSimulationFixtureContainsForbiddenRawString,
  agentSimulationFixtureDeployTargetCategories,
  agentSimulationFixtureFreshnessCategories,
  agentSimulationFixtureObservedStateCategories,
  agentSimulationFixturePathCategories,
  agentSimulationFixtureRepoTypes,
  agentSimulationFixtureRoleCategories,
  agentSimulationFixtureSchemaVersion,
  agentSimulationFixtureSensitivityCategories,
  agentSimulationFixtureValidationStateCategories,
  fixtureOnlySimulationDriverIds,
  validateAgentSimulationFixture,
  validateAgentSimulationFixtureSafety,
  type AgentSimulationFixture
} from "../../simulations/agent/fixtures/fixtureSchema.js";
import {
  agentSimulationScenarioFamilies,
  knownAgentSimulationUncertaintyDriverIds,
  validateAgentSimulationMatrixManifest,
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  agentActionTraceSchemaVersion,
  agentTraceEventKindValues,
  validateAgentActionTrace,
  type AgentActionTrace
} from "../../simulations/agent/traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

const simulationRoot = path.join(process.cwd(), "simulations", "agent");

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadFixtures = async (): Promise<AgentSimulationFixture[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "fixtures", "controlled-fixtures.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const fixtures = entries.map(validateAgentSimulationFixture);

  for (const fixture of fixtures) {
    validateAgentSimulationFixtureSafety(fixture);
  }

  return fixtures.sort((left, right) =>
    left.fixtureId.localeCompare(right.fixtureId)
  );
};

const loadScenarios = async (): Promise<AgentSimulationScenario[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "scenarios", "phase12-scenarios.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentSimulationScenario);
};

const loadExampleTraces = async (): Promise<AgentActionTrace[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "traces", "example-traces.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentActionTrace);
};

describe("agent simulation fixtures", () => {
  it("exports expected fixture schema constants and loads controlled fixture assets", async () => {
    const fixtures = await loadFixtures();
    const ids = fixtures.map((fixture) => fixture.fixtureId);

    expect(agentSimulationFixtureSchemaVersion).toBe(
      "agent-simulation-fixture.v1"
    );
    expect(agentSimulationFixtureRepoTypes).toContain("synthetic_node_service");
    expect(agentSimulationFixturePathCategories).toContain("application_code");
    expect(agentSimulationFixtureRoleCategories).toContain("target_file");
    expect(agentSimulationFixtureSensitivityCategories).toContain(
      "secret_like"
    );
    expect(agentSimulationFixtureObservedStateCategories).toContain(
      "stale_observation"
    );
    expect(agentSimulationFixtureFreshnessCategories).toContain("missing");
    expect(agentSimulationFixtureValidationStateCategories).toContain("stale");
    expect(agentSimulationFixtureDeployTargetCategories).toContain(
      "production_like"
    );
    expect(fixtureOnlySimulationDriverIds).toEqual([]);

    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    for (const fixture of fixtures) {
      expect(fixture.schemaVersion).toBe(agentSimulationFixtureSchemaVersion);
      expect(fixture.fixtureId).toMatch(
        /^fixture[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$/
      );
      expect(fixture.futureTraceCompatibility.fixtureRef).toBe(
        fixture.fixtureId
      );
    }
  });

  it("links fixtures to existing Batch 12.1 personas and scenarios", async () => {
    const fixtures = await loadFixtures();
    const matrix = validateAgentSimulationMatrixManifest(
      await readJson(path.join(simulationRoot, "matrix.json"))
    );
    const personas = new Set(
      await Promise.all(
        matrix.personaIds.map(async (personaId) => {
          const persona = validateAgentSimulationPersona(
            await readJson(
              path.join(simulationRoot, "personas", `${personaId}.json`)
            )
          );

          return persona.personaId;
        })
      )
    );
    const scenariosById = new Map(
      (await loadScenarios()).map((scenario) => [scenario.scenarioId, scenario])
    );

    for (const fixture of fixtures) {
      for (const personaId of fixture.linkedPersonaIds) {
        expect(personas.has(personaId)).toBe(true);
      }

      for (const scenarioId of fixture.linkedScenarioIds) {
        const scenario = scenariosById.get(scenarioId);

        expect(matrix.scenarioIds).toContain(scenarioId);
        expect(scenario).toBeDefined();
        expect(fixture.scenarioFamilies).toContain(scenario?.scenarioFamily);
        expect(fixture.taskPromptCategories).toContain(
          scenario?.taskPromptCategory
        );
      }
    }
  });

  it("resolves Batch 12.2 example trace fixtureRefs and preserves trace compatibility metadata", async () => {
    const fixtures = await loadFixtures();
    const traces = await loadExampleTraces();
    const fixtureIds = new Set(fixtures.map((fixture) => fixture.fixtureId));
    const fixtureRefs = fixtures.map(
      (fixture) => fixture.futureTraceCompatibility.fixtureRef
    );

    expect(new Set(fixtureRefs).size).toBe(fixtureRefs.length);

    for (const trace of traces) {
      expect(fixtureIds.has(trace.fixtureRef)).toBe(true);
    }

    for (const fixture of fixtures) {
      expect(
        fixture.futureTraceCompatibility.compatibleTraceSchemaVersion
      ).toBe(agentActionTraceSchemaVersion);
      expect(fixture.futureTraceCompatibility.supportsSyntheticExamples).toBe(
        true
      );
      expect(
        fixture.futureTraceCompatibility.supportsControlledSimulation
      ).toBe(true);
      expect(fixture.futureTraceCompatibility.supportsRealTrial).toBe(false);

      for (const eventKind of fixture.futureTraceCompatibility
        .expectedTraceEventKinds) {
        expect(agentTraceEventKindValues).toContain(eventKind);
      }
    }
  });

  it("covers all required scenario families and uncertainty dimensions", async () => {
    const fixtures = await loadFixtures();
    const coveredFamilies = new Set<string>();
    const coveredDimensions = new Set<string>();

    for (const fixture of fixtures) {
      for (const family of fixture.scenarioFamilies) {
        coveredFamilies.add(family);
      }

      for (const dimension of fixture.expectedUncertaintyDimensions) {
        coveredDimensions.add(dimension);
      }
    }

    for (const family of agentSimulationScenarioFamilies) {
      expect(coveredFamilies.has(family)).toBe(true);
    }

    for (const dimension of uncertaintyDimensions) {
      expect(coveredDimensions.has(dimension)).toBe(true);
    }
  });

  it("uses existing uncertainty drivers and reduction step kinds", async () => {
    const knownDrivers = new Set(knownAgentSimulationUncertaintyDriverIds);
    const knownSteps = new Set(uncertaintyReductionStepKinds);

    for (const fixture of await loadFixtures()) {
      for (const driver of fixture.expectedUncertaintyDrivers) {
        expect(knownDrivers.has(driver)).toBe(true);
      }

      for (const stepKind of fixture.expectedReductionStepKinds) {
        expect(knownSteps.has(stepKind)).toBe(true);
      }
    }
  });

  it("validates synthetic file maps without raw paths or source", async () => {
    for (const fixture of await loadFixtures()) {
      expect(fixture.syntheticFileMap.files.length).toBeGreaterThan(0);
      expect(fixture.syntheticFileMap.directories.length).toBeGreaterThan(0);

      for (const file of fixture.syntheticFileMap.files) {
        expect(file.fileRef).toMatch(/^file_[a-z0-9_]+$/);
        expect(agentSimulationFixturePathCategories).toContain(
          file.pathCategory
        );
        expect(agentSimulationFixtureRoleCategories).toContain(
          file.roleCategory
        );
        expect(agentSimulationFixtureSensitivityCategories).toContain(
          file.sensitivityCategory
        );
        expect(agentSimulationFixtureObservedStateCategories).toContain(
          file.observedStateCategory
        );
        expect(agentSimulationFixtureFreshnessCategories).toContain(
          file.freshnessCategory
        );
        expect(file.contentIncluded).toBe(false);
        expect(file.rawPathIncluded).toBe(false);
        expect(file.rawSourceIncluded).toBe(false);
      }

      for (const directory of fixture.syntheticFileMap.directories) {
        expect(directory.directoryRef).toMatch(/^directory_[a-z0-9_]+$/);
        expect(directory.rawPathIncluded).toBe(false);
      }
    }
  });

  it("keeps every surface metadata block category-only and non-executing", async () => {
    for (const fixture of await loadFixtures()) {
      expect(fixture.validationSurface.validationCommandIncluded).toBe(false);
      expect(fixture.validationSurface.rawValidationLogsIncluded).toBe(false);
      expect(fixture.gitWorkflowSurface.rawBranchNameIncluded).toBe(false);
      expect(fixture.gitWorkflowSurface.rawGitCommandIncluded).toBe(false);
      expect(fixture.environmentSurface.rawDeployTargetIncluded).toBe(false);
      expect(fixture.environmentSurface.rawEnvValuesIncluded).toBe(false);
      expect(fixture.sensitivitySurface.rawSecretIncluded).toBe(false);
      expect(fixture.sensitivitySurface.rawPrivateDataIncluded).toBe(false);
      expect(fixture.recoverySurface.rawBackupPathIncluded).toBe(false);
      expect(fixture.recoverySurface.checkpointCreatedByFixture).toBe(false);
    }
  });

  it("uses allowed safe and risky action categories without executable command strings", async () => {
    const allowedActions = new Set(agentSimulationFixtureActionCategories);

    for (const fixture of await loadFixtures()) {
      expect(fixture.expectedSafeActionCategories.length).toBeGreaterThan(0);
      expect(fixture.expectedRiskyActionCategories.length).toBeGreaterThan(0);

      for (const action of fixture.expectedSafeActionCategories) {
        expect(allowedActions.has(action)).toBe(true);
      }

      for (const action of fixture.expectedRiskyActionCategories) {
        expect(allowedActions.has(action)).toBe(true);
      }
    }
  });

  it("keeps every fixture inert, local, non-mutating, and privacy-safe", async () => {
    for (const fixture of await loadFixtures()) {
      expect(fixture.safety).toEqual({
        inert: true,
        executesAgent: false,
        executesCommands: false,
        executesPackageScripts: false,
        requiresNetwork: false,
        mutatesRepository: false,
        touchesRealSecrets: false,
        usesRealRepo: false,
        containsPrivateData: false,
        containsExecutableAction: false
      });
      expect(fixture.privacy).toEqual({
        rawPromptIncluded: false,
        rawActionIncluded: false,
        rawCommandIncluded: false,
        rawDiffIncluded: false,
        rawSourceCodeIncluded: false,
        rawValidationLogIncluded: false,
        realRepoNameIncluded: false,
        realPathIncluded: false,
        realUserIncluded: false,
        realEmailIncluded: false,
        secretIncluded: false,
        categoryOnly: true
      });
      expect(agentSimulationFixtureContainsForbiddenRawString(fixture)).toBe(
        false
      );

      const serialized = JSON.stringify(fixture);

      expect(serialized).not.toMatch(/\/Users\//);
      expect(serialized).not.toMatch(/C:\\/);
      expect(serialized).not.toMatch(/\/home\/[A-Za-z0-9_.-]+/);
      expect(serialized).not.toMatch(/\b[A-Z][A-Z0-9_]*=/);
      expect(serialized).not.toMatch(/PRIVATE KEY/);
      expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
      expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      expect(serialized).not.toContain("diff --git");
      expect(serialized).not.toContain("http://");
      expect(serialized).not.toContain("https://");
      expect(serialized).not.toMatch(/rm\s+-rf/i);
      expect(serialized).not.toMatch(/sudo\b/i);
      expect(serialized).not.toMatch(/eval\s*(?:\(|\b)/i);
      expect(serialized).not.toMatch(/raw prompt from/i);
    }
  });
});
