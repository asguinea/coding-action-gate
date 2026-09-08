import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCodexLikeActionInput,
  type CodexLikeActionInput
} from "../../simulations/agent/adapters/codexActionAdapterSchema.js";
import {
  validateAgentSimulationFixture,
  type AgentSimulationFixture
} from "../../simulations/agent/fixtures/fixtureSchema.js";
import {
  agentSimulationLoopShapes,
  agentSimulationResponseToStepHarborValues,
  knownAgentSimulationUncertaintyDriverIds,
  validateAgentSimulationMatrixManifest,
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  agentSimulationRunContainsForbiddenRawString,
  agentSimulationRunOnlyDriverIds,
  agentSimulationRunSchemaVersion,
  agentSimulationRunSourceValues,
  agentSimulationRunnerPayloadCategories,
  buildAgentSimulationRun,
  buildAgentSimulationRuns,
  loadExampleAgentSimulationRuns,
  validateAgentSimulationRun,
  validateAgentSimulationRunSafety,
  type AgentSimulationRun
} from "../../simulations/agent/runner/index.js";
import {
  agentTraceActorValues,
  agentTraceBaselineLikelyOutcomeCategoryValues,
  agentTraceBaselineStatusValues,
  agentTraceEventKindValues,
  agentTraceFrictionCategoryValues,
  agentTraceFutureCalibrationLabelValues,
  agentTraceOutcomeCategoryValues,
  agentTraceSafetyOutcomeCategoryValues,
  agentTraceTaskCompletedCategoryValues
} from "../../simulations/agent/traces/traceSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

const simulationRoot = path.join(process.cwd(), "simulations", "agent");

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadRuns = async (): Promise<AgentSimulationRun[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "runner", "example-runs.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const runs = loadExampleAgentSimulationRuns(entries);

  for (const run of runs) {
    validateAgentSimulationRunSafety(run);
  }

  return runs;
};

const loadScenarios = async (): Promise<AgentSimulationScenario[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "scenarios", "phase12-scenarios.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentSimulationScenario);
};

const loadFixtures = async (): Promise<AgentSimulationFixture[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "fixtures", "controlled-fixtures.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentSimulationFixture);
};

const loadAdapterInputs = async (): Promise<CodexLikeActionInput[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "adapters", "example-adapter-inputs.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateCodexLikeActionInput);
};

describe("agent simulation runner", () => {
  it("exports runner schema constants and loads deterministic synthetic example runs", async () => {
    const runs = await loadRuns();
    const runIds = runs.map((run) => run.runId);

    expect(agentSimulationRunSchemaVersion).toBe("agent-simulation-run.v1");
    expect(agentSimulationRunSourceValues).toEqual([
      "synthetic_example",
      "controlled_simulation_future"
    ]);
    expect(agentSimulationRunnerPayloadCategories).toContain(
      "scripted_decision_category"
    );
    expect(agentSimulationRunOnlyDriverIds).toEqual([]);
    expect(runs.length).toBeGreaterThanOrEqual(5);
    expect(runs.length).toBeLessThanOrEqual(8);
    expect(runIds).toEqual([...runIds].sort());
    expect(new Set(runIds).size).toBe(runIds.length);

    for (const run of runs) {
      expect(run.schemaVersion).toBe(agentSimulationRunSchemaVersion);
      expect(run.runId).toMatch(
        /^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(run.source).toBe("synthetic_example");
    }
  });

  it("links every run to existing personas, scenarios, fixtures, and adapter inputs", async () => {
    const runs = await loadRuns();
    const scenariosById = new Map(
      (await loadScenarios()).map((scenario) => [scenario.scenarioId, scenario])
    );
    const fixturesById = new Map(
      (await loadFixtures()).map((fixture) => [fixture.fixtureId, fixture])
    );
    const adapterInputsById = new Map(
      (await loadAdapterInputs()).map((input) => [input.inputId, input])
    );
    const matrix = validateAgentSimulationMatrixManifest(
      await readJson(path.join(simulationRoot, "matrix.json"))
    );
    const personaIds = new Set(
      await Promise.all(
        matrix.personaIds.map(
          async (personaId) =>
            validateAgentSimulationPersona(
              await readJson(
                path.join(simulationRoot, "personas", `${personaId}.json`)
              )
            ).personaId
        )
      )
    );

    for (const run of runs) {
      const scenario = scenariosById.get(run.scenarioId);
      const fixture = fixturesById.get(run.fixtureRef);
      const adapterInput = adapterInputsById.get(run.adapterInputId);

      expect(personaIds.has(run.personaId)).toBe(true);
      expect(scenario).toBeDefined();
      expect(fixture).toBeDefined();
      expect(adapterInput).toBeDefined();
      expect(scenario?.personaIds).toContain(run.personaId);
      expect(scenario?.scenarioFamily).toBe(run.scenarioFamily);
      expect(scenario?.taskPromptCategory).toBe(run.taskPromptCategory);
      expect(fixture?.linkedScenarioIds).toContain(run.scenarioId);
      expect(fixture?.linkedPersonaIds).toContain(run.personaId);
      expect(fixture?.taskPromptCategories).toContain(run.taskPromptCategory);
      expect(adapterInput?.personaId).toBe(run.personaId);
      expect(adapterInput?.scenarioId).toBe(run.scenarioId);
      expect(adapterInput?.fixtureRef).toBe(run.fixtureRef);
      expect(adapterInput?.taskPromptCategory).toBe(run.taskPromptCategory);
    }
  });

  it("builds runs deterministically from adapter inputs and metadata", async () => {
    const runs = await loadRuns();
    const context = {
      adapterInputs: await loadAdapterInputs(),
      scenarios: await loadScenarios(),
      fixtures: await loadFixtures()
    };
    const builtRuns = buildAgentSimulationRuns(
      runs.map((run) => ({
        runId: run.runId,
        adapterInputId: run.adapterInputId,
        loopShape: run.loopShape,
        scriptedAgentResponse: run.scriptedAgentResponse,
        outcomeCategory: run.finalOutcome.outcomeCategory,
        taskCompletedCategory: run.finalOutcome.taskCompletedCategory,
        safetyOutcomeCategory: run.finalOutcome.safetyOutcomeCategory,
        frictionCategory: run.finalOutcome.frictionCategory
      })),
      context
    );

    expect(builtRuns).toEqual(runs);

    for (const run of builtRuns) {
      expect(run.claimBoundaries.actualRuntimeDecision).toBe(false);
      expect(run.claimBoundaries.realStepHarborExecution).toBe(false);
      expect(run.notes.join(" ")).toContain("Scripted category output");
    }
  });

  it("enriches run output with scenario, fixture, and normalized action metadata", async () => {
    const runs = await loadRuns();
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();
    const context = {
      adapterInputs: await loadAdapterInputs(),
      scenarios,
      fixtures
    };
    const scenariosById = new Map(
      scenarios.map((scenario) => [scenario.scenarioId, scenario])
    );
    const fixturesById = new Map(
      fixtures.map((fixture) => [fixture.fixtureId, fixture])
    );

    for (const run of runs) {
      const scenario = scenariosById.get(run.scenarioId)!;
      const fixture = fixturesById.get(run.fixtureRef)!;
      const built = buildAgentSimulationRun(
        {
          runId: run.runId,
          adapterInputId: run.adapterInputId,
          loopShape: run.loopShape,
          scriptedAgentResponse: run.scriptedAgentResponse
        },
        context
      );

      expect(built.normalizedActionId).toBe(run.normalizedActionId);
      expect(built.productionDecisionCategory).toBe(
        run.productionDecisionCategory
      );
      expect(built.advisoryDecisionCategory).toBe(run.advisoryDecisionCategory);

      for (const dimension of scenario.expectedUncertaintyDimensions) {
        expect(built.uncertaintyDimensions).toContain(dimension);
      }

      for (const dimension of fixture.expectedUncertaintyDimensions) {
        expect(built.uncertaintyDimensions).toContain(dimension);
      }

      for (const driver of scenario.expectedUncertaintyDrivers) {
        expect(built.uncertaintyDrivers).toContain(driver);
      }

      for (const step of fixture.expectedReductionStepKinds) {
        expect(built.reductionStepKinds).toContain(step);
      }
    }
  });

  it("uses trace event skeletons compatible with Batch 12.2 event vocabulary", async () => {
    for (const run of await loadRuns()) {
      expect(run.traceEventSkeleton.length).toBeGreaterThan(0);
      expect(
        run.traceEventSkeleton.map((event) => event.sequenceIndex)
      ).toEqual(run.traceEventSkeleton.map((_, index) => index));

      for (const event of run.traceEventSkeleton) {
        expect(agentTraceEventKindValues).toContain(event.eventKind);
        expect(agentTraceActorValues).toContain(event.actor);
        expect(agentSimulationRunnerPayloadCategories).toContain(
          event.payloadCategory
        );
        expect(event.rawPayloadIncluded).toBe(false);
        expect(event.executable).toBe(false);
      }
    }
  });

  it("uses valid loop shapes, responses, decisions, outcomes, and vocabularies", async () => {
    const loopShapes = new Set<AgentSimulationRun["loopShape"]>();

    for (const run of await loadRuns()) {
      loopShapes.add(run.loopShape);
      expect(agentSimulationLoopShapes).toContain(run.loopShape);
      expect(agentSimulationResponseToStepHarborValues).toContain(
        run.scriptedAgentResponse
      );
      expect([
        "PROCEED",
        "DEFER",
        "ESCALATE",
        "BLOCK",
        "MIXED",
        "UNKNOWN_UNTIL_RUNTIME"
      ]).toContain(run.productionDecisionCategory);
      expect([
        "PROCEED",
        "DEFER",
        "ESCALATE",
        "BLOCK",
        "MIXED",
        "UNKNOWN_UNTIL_RUNTIME"
      ]).toContain(run.advisoryDecisionCategory);
      expect(agentTraceOutcomeCategoryValues).toContain(
        run.finalOutcome.outcomeCategory
      );
      expect(agentTraceTaskCompletedCategoryValues).toContain(
        run.finalOutcome.taskCompletedCategory
      );
      expect(agentTraceSafetyOutcomeCategoryValues).toContain(
        run.finalOutcome.safetyOutcomeCategory
      );
      expect(agentTraceFrictionCategoryValues).toContain(
        run.finalOutcome.frictionCategory
      );
      expect(run.finalOutcome.taskCompletedCategory).toBe("not_run_yet");

      for (const dimension of run.uncertaintyDimensions) {
        expect(uncertaintyDimensions).toContain(dimension);
      }

      for (const driver of run.uncertaintyDrivers) {
        expect([
          ...knownAgentSimulationUncertaintyDriverIds,
          ...agentSimulationRunOnlyDriverIds
        ]).toContain(driver);
      }

      for (const step of run.reductionStepKinds) {
        expect(uncertaintyReductionStepKinds).toContain(step);
      }
    }

    expect([...loopShapes]).toEqual(
      expect.arrayContaining([
        "defer_then_retry",
        "defer_then_escalate",
        "block_and_alternative",
        "repeated_retry_until_escalate"
      ])
    );
  });

  it("keeps baseline and calibration fields ready but unevaluated", async () => {
    for (const run of await loadRuns()) {
      for (const slot of [
        run.baselineReadiness.noGuard,
        run.baselineReadiness.policyOnlyGuard,
        run.baselineReadiness.stepHarborDeterministic,
        run.baselineReadiness.stepHarborAdvisoryUq
      ]) {
        expect(agentTraceBaselineStatusValues).toContain(slot.status);
        expect(slot.status).not.toBe("not_applicable");
        expect(agentTraceBaselineLikelyOutcomeCategoryValues).toContain(
          slot.likelyOutcomeCategory
        );
      }

      expect(run.calibrationReadiness.requiredFutureLabels).toEqual([
        ...agentTraceFutureCalibrationLabelValues
      ]);
      expect(run.calibrationReadiness.lossFieldsPresent).toBe(false);
      expect(run.calibrationReadiness.calibrationApplied).toBe(false);
      expect(run.calibrationReadiness.conformalUsed).toBe(false);
      expect(run.calibrationReadiness.statisticalGuaranteeClaimed).toBe(false);
    }
  });

  it("keeps runs inert, local, category-only, and privacy-safe", async () => {
    for (const run of await loadRuns()) {
      expect(run.safety).toEqual({
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
      expect(run.privacy).toEqual({
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
      expect(run.claimBoundaries).toEqual({
        actualRuntimeDecision: false,
        realAgentExecution: false,
        realStepHarborExecution: false,
        realValidationResult: false,
        realWorldResult: false,
        conformalGuarantee: false
      });
      expect(agentSimulationRunContainsForbiddenRawString(run)).toBe(false);
      expect(() => validateAgentSimulationRun(run)).not.toThrow();

      const serialized = JSON.stringify(run);

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
