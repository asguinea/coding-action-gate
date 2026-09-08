import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentSimulationBaselineOutcomeCategories,
  agentSimulationExpectedDecisionValues,
  agentSimulationLiteratureGroundingCategories,
  agentSimulationLoopShapes,
  agentSimulationOutcomeLabels,
  agentSimulationResearchHypothesisCategories,
  agentSimulationResponseToCodingActionGateValues,
  agentSimulationScenarioFamilies,
  agentSimulationScenarioContainsForbiddenRawString,
  agentSimulationTraceEventValues,
  agentSimulationMatrixSchemaVersion,
  agentSimulationPersonaSchemaVersion,
  agentSimulationScenarioSchemaVersion,
  knownAgentSimulationUncertaintyDriverIds,
  requiredAgentSimulationPersonaIds,
  validateAgentSimulationMatrixManifest,
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  validateAgentSimulationScenarioSafety,
  type AgentSimulationMatrixManifest,
  type AgentSimulationPersona,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

const simulationRoot = path.join(process.cwd(), "simulations", "agent");
const personasRoot = path.join(simulationRoot, "personas");
const scenariosRoot = path.join(simulationRoot, "scenarios");

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const jsonFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await jsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

const loadManifest = async (): Promise<AgentSimulationMatrixManifest> =>
  validateAgentSimulationMatrixManifest(
    await readJson(path.join(simulationRoot, "matrix.json"))
  );

const loadPersonas = async (): Promise<AgentSimulationPersona[]> => {
  const personas: AgentSimulationPersona[] = [];

  for (const filePath of await jsonFiles(personasRoot)) {
    personas.push(validateAgentSimulationPersona(await readJson(filePath)));
  }

  return personas.sort((left, right) =>
    left.personaId.localeCompare(right.personaId)
  );
};

const loadScenarios = async (): Promise<AgentSimulationScenario[]> => {
  const scenarios: AgentSimulationScenario[] = [];

  for (const filePath of await jsonFiles(scenariosRoot)) {
    const parsed = await readJson(filePath);
    const entries = Array.isArray(parsed) ? parsed : [parsed];

    for (const entry of entries) {
      const scenario = validateAgentSimulationScenario(entry);

      validateAgentSimulationScenarioSafety(scenario);
      scenarios.push(scenario);
    }
  }

  return scenarios.sort((left, right) =>
    left.scenarioId.localeCompare(right.scenarioId)
  );
};

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

describe("agent persona and scenario simulation matrix", () => {
  it("loads the stable matrix manifest with deterministic IDs and inert safety flags", async () => {
    const manifest = await loadManifest();

    expect(manifest.schemaVersion).toBe(agentSimulationMatrixSchemaVersion);
    expect(manifest.personaIds).toEqual([...manifest.personaIds].sort());
    expect(manifest.scenarioIds).toEqual([...manifest.scenarioIds].sort());
    expect(manifest.scenarioFamilyCoverage).toBeDefined();
    expect(manifest.uncertaintyDimensionCoverage).toBeDefined();
    expect(manifest.literatureGroundingCategoriesUsed).toBeDefined();
    expect(manifest.safety).toEqual({
      inert: true,
      executesAgents: false,
      executesCommands: false,
      requiresNetwork: false,
      mutatesRepository: false,
      containsRealSecrets: false
    });
  });

  it("validates persona files with unique stable IDs and required personas", async () => {
    const personas = await loadPersonas();
    const ids = personas.map((persona) => persona.personaId);

    expect(personas.length).toBeGreaterThanOrEqual(6);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    for (const persona of personas) {
      expect(persona.schemaVersion).toBe(agentSimulationPersonaSchemaVersion);
      expect(persona.personaId).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(persona.displayName).toBeTruthy();
      expect(persona.relevantCodingActionGateConcerns.length).toBeGreaterThan(
        0
      );
      expect(persona.privacyNotes).toBeTruthy();
    }

    for (const requiredPersonaId of requiredAgentSimulationPersonaIds) {
      expect(ids).toContain(requiredPersonaId);
    }
  });

  it("validates scenario files with unique stable IDs and required fields", async () => {
    const scenarios = await loadScenarios();
    const ids = scenarios.map((scenario) => scenario.scenarioId);

    expect(scenarios.length).toBeGreaterThanOrEqual(18);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    for (const scenario of scenarios) {
      expect(scenario.schemaVersion).toBe(agentSimulationScenarioSchemaVersion);
      expect(scenario.scenarioId).toMatch(
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(scenario.personaIds.length).toBeGreaterThan(0);
      expect(
        scenario.codingActionGateInterceptionPoints.length
      ).toBeGreaterThan(0);
      expect(scenario.expectedUncertaintyDimensions.length).toBeGreaterThan(0);
      expect(scenario.expectedUncertaintyDrivers.length).toBeGreaterThan(0);
      expect(scenario.expectedReductionStepKinds.length).toBeGreaterThan(0);
    }
  });

  it("keeps manifest persona and scenario IDs aligned with loaded assets", async () => {
    const manifest = await loadManifest();
    const personas = await loadPersonas();
    const scenarios = await loadScenarios();

    expect(manifest.personaIds).toEqual(
      personas.map((persona) => persona.personaId)
    );
    expect(manifest.scenarioIds).toEqual(
      scenarios.map((scenario) => scenario.scenarioId)
    );
  });

  it("covers required personas, families, uncertainty dimensions, and literature categories", async () => {
    const scenarios = await loadScenarios();
    const personaCounts = new Map<string, number>();
    const familyCounts = new Map<string, number>();
    const dimensionCounts = new Map<string, number>();
    const literatureCategories = new Set<string>();

    for (const scenario of scenarios) {
      for (const personaId of scenario.personaIds) {
        increment(personaCounts, personaId);
      }

      increment(familyCounts, scenario.scenarioFamily);

      for (const dimension of scenario.expectedUncertaintyDimensions) {
        increment(dimensionCounts, dimension);
      }

      for (const category of scenario.literatureGrounding.categories) {
        literatureCategories.add(category);
      }
    }

    for (const personaId of requiredAgentSimulationPersonaIds) {
      expect(personaCounts.get(personaId)).toBeGreaterThanOrEqual(2);
    }

    for (const family of agentSimulationScenarioFamilies) {
      expect(familyCounts.get(family)).toBeGreaterThanOrEqual(1);
    }

    for (const dimension of uncertaintyDimensions) {
      expect(dimensionCounts.get(dimension)).toBeGreaterThanOrEqual(1);
    }

    for (const category of literatureCategories) {
      expect(agentSimulationLiteratureGroundingCategories).toContain(category);
    }

    for (const category of agentSimulationLiteratureGroundingCategories) {
      if (category !== "conformal_risk_control_future_work") {
        expect(literatureCategories.has(category)).toBe(true);
      }
    }
  });

  it("keeps manifest coverage fields aligned with scenario assets", async () => {
    const manifest = await loadManifest();
    const scenarios = await loadScenarios();
    const familyCoverage: Record<string, number> = {};
    const dimensionCoverage: Record<string, number> = {};
    const literatureCategories = new Set<string>();

    for (const scenario of scenarios) {
      familyCoverage[scenario.scenarioFamily] =
        (familyCoverage[scenario.scenarioFamily] ?? 0) + 1;

      for (const dimension of scenario.expectedUncertaintyDimensions) {
        dimensionCoverage[dimension] = (dimensionCoverage[dimension] ?? 0) + 1;
      }

      for (const category of scenario.literatureGrounding.categories) {
        literatureCategories.add(category);
      }
    }

    expect(manifest.scenarioFamilyCoverage).toEqual(familyCoverage);
    expect(manifest.uncertaintyDimensionCoverage).toEqual(dimensionCoverage);
    expect(manifest.literatureGroundingCategoriesUsed).toEqual(
      [...literatureCategories].sort()
    );
  });

  it("uses allowed decisions, labels, drivers, reduction steps, trace fields, baselines, and hypotheses", async () => {
    const knownDrivers = new Set(knownAgentSimulationUncertaintyDriverIds);
    const knownSteps = new Set(uncertaintyReductionStepKinds);

    for (const scenario of await loadScenarios()) {
      expect(agentSimulationExpectedDecisionValues).toContain(
        scenario.expectedProductionDecision
      );
      expect(agentSimulationExpectedDecisionValues).toContain(
        scenario.expectedAdvisoryUncertaintyDecision
      );
      expect(agentSimulationLoopShapes).toContain(
        scenario.expectedAgentLoopShape
      );
      expect(agentSimulationResponseToCodingActionGateValues).toContain(
        scenario.expectedAgentResponseToCodingActionGate
      );
      expect(agentSimulationResearchHypothesisCategories).toContain(
        scenario.researchHypothesisCategory
      );

      for (const label of scenario.expectedOutcomeLabels) {
        expect(agentSimulationOutcomeLabels).toContain(label);
      }

      for (const dimension of scenario.expectedUncertaintyDimensions) {
        expect(uncertaintyDimensions).toContain(dimension);
      }

      for (const driver of scenario.expectedUncertaintyDrivers) {
        expect(knownDrivers.has(driver)).toBe(true);
      }

      for (const stepKind of scenario.expectedReductionStepKinds) {
        expect(knownSteps.has(stepKind)).toBe(true);
      }

      for (const traceEvent of scenario.traceEventsExpected) {
        expect(agentSimulationTraceEventValues).toContain(traceEvent);
      }

      for (const baseline of Object.values(scenario.baselineExpectations)) {
        expect(agentSimulationBaselineOutcomeCategories).toContain(
          baseline.likelyOutcomeCategory
        );
      }
    }
  });

  it("keeps every scenario inert, local, non-mutating, and privacy-safe", async () => {
    for (const scenario of await loadScenarios()) {
      expect(scenario.safety).toEqual({
        inert: true,
        executesAgent: false,
        executesCommands: false,
        executesPackageScripts: false,
        requiresNetwork: false,
        mutatesRepository: false,
        touchesRealSecrets: false,
        usesRealRepo: false,
        containsPrivateData: false
      });

      expect(agentSimulationScenarioContainsForbiddenRawString(scenario)).toBe(
        false
      );

      const serialized = JSON.stringify(scenario);

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
      expect(serialized).not.toMatch(/npm\s+run/i);
      expect(serialized).not.toMatch(/raw prompt from/i);
    }
  });
});
