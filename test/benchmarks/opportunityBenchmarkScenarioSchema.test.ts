import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  opportunityBenchmarkScenarioSchemaVersion,
  scenarioContainsForbiddenRawString,
  validateOpportunityBenchmarkScenario,
  validateScenarioSafety,
  type OpportunityBenchmarkScenario
} from "../../benchmarks/opportunity-map/scenarioSchema.js";

const scenariosRoot = path.join(
  process.cwd(),
  "benchmarks",
  "opportunity-map",
  "scenarios"
);

const scenarioFiles = async (directory = scenariosRoot): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await scenarioFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

const loadScenarios = async (): Promise<OpportunityBenchmarkScenario[]> => {
  const scenarios: OpportunityBenchmarkScenario[] = [];

  for (const file of await scenarioFiles()) {
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

describe("Opportunity Benchmark scenario schema", () => {
  it("parses every inert scenario file with the stable schema version", async () => {
    const scenarios = await loadScenarios();

    expect(scenarios.length).toBeGreaterThanOrEqual(20);

    for (const scenario of scenarios) {
      expect(scenario.schemaVersion).toBe(
        opportunityBenchmarkScenarioSchemaVersion
      );
      expect(scenario.safety).toEqual({
        inert: true,
        executesCommands: false,
        touchesRealSecrets: false,
        requiresNetwork: false,
        mutatesRepository: false
      });
    }
  });

  it("uses unique stable scenario IDs and deterministic loading order", async () => {
    const first = await loadScenarios();
    const second = await loadScenarios();
    const ids = first.map((scenario) => scenario.id);

    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.map((scenario) => scenario.id)).toEqual(ids);
  });

  it("requires expected advisory decisions and driver metadata", async () => {
    for (const scenario of await loadScenarios()) {
      expect(["PROCEED", "DEFER", "ESCALATE", "BLOCK"]).toContain(
        scenario.expected.advisoryRouterDecision
      );

      if (scenario.expected.advisoryRouterDecision !== "PROCEED") {
        expect(scenario.expected.uncertaintyDrivers.length).toBeGreaterThan(0);
      }

      if (scenario.expected.advisoryRouterDecision === "DEFER") {
        expect(
          scenario.expected.reductionStepKinds?.length ?? 0
        ).toBeGreaterThan(0);
      }

      if (scenario.expected.advisoryRouterDecision === "BLOCK") {
        expect(scenario.expected.hardBlockDrivers?.length ?? 0).toBeGreaterThan(
          0
        );
      }

      if (scenario.expected.advisoryRouterDecision === "ESCALATE") {
        expect(
          scenario.expected.escalationDrivers?.length ?? 0
        ).toBeGreaterThan(0);
      }
    }
  });

  it("rejects forbidden raw-looking values in scenario content", () => {
    const unsafeScenario = {
      schemaVersion: opportunityBenchmarkScenarioSchemaVersion,
      id: "unsafe-private-path-001",
      title: "Unsafe private path",
      problemFamily: "missing_stale_low_quality_context",
      sourceFromOpportunityMap: "Problem landscape: unsafe test case",
      description: "/Users/example/private-repo/src/auth/login.ts",
      action: {
        type: "edit_file",
        category: "context_blind_edit"
      },
      expected: {
        advisoryRouterDecision: "DEFER",
        uncertaintyDrivers: ["target_file_not_observed"],
        reductionStepKinds: ["read_target_file"],
        deferDrivers: ["target_file_not_observed"]
      },
      safety: {
        inert: true,
        executesCommands: false,
        touchesRealSecrets: false,
        requiresNetwork: false,
        mutatesRepository: false
      }
    };

    expect(scenarioContainsForbiddenRawString(unsafeScenario)).toBe(true);
  });
});
