import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentActionTraceContainsForbiddenRawString,
  agentActionTraceSchemaVersion,
  agentTraceActionCategoryValues,
  agentTraceActionIntentCategoryValues,
  agentTraceActorValues,
  agentTraceAutonomyModeValues,
  agentTraceBaselineLikelyOutcomeCategoryValues,
  agentTraceBaselineStatusValues,
  agentTraceEventKindValues,
  agentTraceFrictionCategoryValues,
  agentTraceFutureCalibrationLabelValues,
  agentTraceIntegrationModeValues,
  agentTraceOutcomeCategoryValues,
  agentTraceProductionDecisionValues,
  agentTraceReviewStatusValues,
  agentTraceReviewerKindValues,
  agentTraceSafetyOutcomeCategoryValues,
  agentTraceSeverityValues,
  agentTraceSourceValues,
  agentTraceTargetCategoryValues,
  agentTraceTaskCompletedCategoryValues,
  proposedActionPayloadSchema,
  traceOnlySimulationDriverIds,
  uncertaintyProfileSummaryForTraceSchemaVersion,
  uncertaintyReductionPlanSummaryForTraceSchemaVersion,
  uncertaintyRouterResultSummaryForTraceSchemaVersion,
  validateAgentActionTrace,
  validateAgentActionTraceSafety,
  type AgentActionTrace
} from "../../simulations/agent/traces/traceSchema.js";
import {
  knownAgentSimulationUncertaintyDriverIds,
  validateAgentSimulationMatrixManifest,
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  type AgentSimulationPersona,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

const simulationRoot = path.join(process.cwd(), "simulations", "agent");
const traceExamplesPath = path.join(
  simulationRoot,
  "traces",
  "example-traces.json"
);

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadExampleTraces = async (): Promise<AgentActionTrace[]> => {
  const parsed = await readJson(traceExamplesPath);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const traces = entries.map(validateAgentActionTrace);

  for (const trace of traces) {
    validateAgentActionTraceSafety(trace);
  }

  return traces.sort((left, right) =>
    left.traceId.localeCompare(right.traceId)
  );
};

const loadPersonas = async (): Promise<AgentSimulationPersona[]> => {
  const personaIds = validateAgentSimulationMatrixManifest(
    await readJson(path.join(simulationRoot, "matrix.json"))
  ).personaIds;

  const personas: AgentSimulationPersona[] = [];

  for (const personaId of personaIds) {
    personas.push(
      validateAgentSimulationPersona(
        await readJson(
          path.join(simulationRoot, "personas", `${personaId}.json`)
        )
      )
    );
  }

  return personas;
};

const loadScenarios = async (): Promise<AgentSimulationScenario[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "scenarios", "phase12-scenarios.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentSimulationScenario);
};

const requiredCalibrationLabels = new Set(
  agentTraceFutureCalibrationLabelValues
);

describe("agent action trace schema", () => {
  it("exports expected schema constants and enum values", () => {
    expect(agentActionTraceSchemaVersion).toBe("agent-action-trace.v1");
    expect(uncertaintyProfileSummaryForTraceSchemaVersion).toBe(
      "uncertainty-profile-summary-for-trace.v1"
    );
    expect(uncertaintyReductionPlanSummaryForTraceSchemaVersion).toBe(
      "uncertainty-reduction-plan-summary-for-trace.v1"
    );
    expect(uncertaintyRouterResultSummaryForTraceSchemaVersion).toBe(
      "uncertainty-router-result-summary-for-trace.v1"
    );
    expect(agentTraceSourceValues).toContain("synthetic_example");
    expect(agentTraceSourceValues).toContain("controlled_simulation_future");
    expect(agentTraceEventKindValues).toContain("proposed_action");
    expect(agentTraceEventKindValues).toContain("advisory_router_result");
    expect(agentTraceActorValues).toContain("coding_agent");
    expect(agentTraceActorValues).toContain(
      "codingactiongate_uncertainty_advisory"
    );
    expect(agentTraceAutonomyModeValues).toContain("semi_autonomous");
    expect(agentTraceIntegrationModeValues).toContain("manual_transcription");
    expect(agentTraceProductionDecisionValues).toEqual([
      "PROCEED",
      "DEFER",
      "ESCALATE",
      "BLOCK"
    ]);
    expect(traceOnlySimulationDriverIds).toEqual([]);

    expect(() =>
      proposedActionPayloadSchema.parse({
        actionCategory: "edit_file",
        actionIntentCategory: "modify_code",
        targetCategory: "application_code",
        rawActionIncluded: false,
        executable: false
      })
    ).not.toThrow();
  });

  it("loads unique deterministic synthetic example traces", async () => {
    const traces = await loadExampleTraces();
    const traceIds = traces.map((trace) => trace.traceId);

    expect(traces.length).toBeGreaterThanOrEqual(3);
    expect(traces.length).toBeLessThanOrEqual(5);
    expect(traceIds).toEqual([...traceIds].sort());
    expect(new Set(traceIds).size).toBe(traceIds.length);

    for (const trace of traces) {
      expect(trace.schemaVersion).toBe(agentActionTraceSchemaVersion);
      expect(trace.traceId).toMatch(
        /^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(trace.source).toBe("synthetic_example");
      expect(trace.agent.agentKind).not.toBe("codex_like");
      expect(trace.claimBoundaries.realAgentRun).toBe(false);
      expect(trace.claimBoundaries.realTraceCollected).toBe(false);
      expect(trace.claimBoundaries.codexRun).toBe(false);
    }
  });

  it("links every example trace to the Batch 12.1 matrix", async () => {
    const traces = await loadExampleTraces();
    const personas = await loadPersonas();
    const scenarios = await loadScenarios();
    const personaIds = new Set(personas.map((persona) => persona.personaId));
    const scenariosById = new Map(
      scenarios.map((scenario) => [scenario.scenarioId, scenario])
    );

    for (const trace of traces) {
      expect(personaIds.has(trace.personaId)).toBe(true);

      const scenario = scenariosById.get(trace.scenarioId);

      expect(scenario).toBeDefined();
      expect(scenario?.scenarioFamily).toBe(trace.scenarioFamily);
      expect(scenario?.taskPromptCategory).toBe(trace.taskPromptCategory);
      expect(scenario?.personaIds).toContain(trace.personaId);
    }
  });

  it("validates ordered trace events, actors, and category-only payloads", async () => {
    for (const trace of await loadExampleTraces()) {
      expect(trace.traceEvents.length).toBeGreaterThan(0);

      const eventIds = trace.traceEvents.map((event) => event.eventId);

      expect(new Set(eventIds).size).toBe(eventIds.length);

      for (const [index, event] of trace.traceEvents.entries()) {
        expect(event.sequenceIndex).toBe(index);
        expect(agentTraceEventKindValues).toContain(event.eventKind);
        expect(agentTraceActorValues).toContain(event.actor);
        expect(event.safety).toEqual(trace.safety);
        expect(event.privacy).toEqual(trace.privacy);
        expect(event.privacy.categoryOnly).toBe(true);
        expect(event.privacy.rawCommandIncluded).toBe(false);
      }
    }
  });

  it("validates proposed action payloads", async () => {
    for (const trace of await loadExampleTraces()) {
      const proposedActionEvents = trace.traceEvents.filter(
        (event) => event.eventKind === "proposed_action"
      );

      expect(proposedActionEvents.length).toBeGreaterThan(0);

      for (const event of proposedActionEvents) {
        if (event.eventKind !== "proposed_action") {
          continue;
        }

        expect(agentTraceActionCategoryValues).toContain(
          event.payload.actionCategory
        );
        expect(agentTraceActionIntentCategoryValues).toContain(
          event.payload.actionIntentCategory
        );
        expect(agentTraceTargetCategoryValues).toContain(
          event.payload.targetCategory
        );
        expect(event.payload.rawActionIncluded).toBe(false);
        expect(event.payload.executable).toBe(false);
      }
    }
  });

  it("validates CodingActionGate production and advisory decision summaries", async () => {
    for (const trace of await loadExampleTraces()) {
      const productionDecisionEvents = trace.traceEvents.filter(
        (event) => event.eventKind === "codingactiongate_decision"
      );
      const advisoryEvents = trace.traceEvents.filter(
        (event) => event.eventKind === "advisory_router_result"
      );

      expect(productionDecisionEvents.length).toBeGreaterThan(0);
      expect(advisoryEvents.length).toBeGreaterThan(0);

      for (const event of productionDecisionEvents) {
        if (event.eventKind !== "codingactiongate_decision") {
          continue;
        }

        expect(agentTraceProductionDecisionValues).toContain(
          event.payload.productionDecision
        );
        expect(event.payload.decisionIsAuthoritative).toBe(true);
      }

      for (const event of advisoryEvents) {
        if (event.eventKind !== "advisory_router_result") {
          continue;
        }

        expect(agentTraceProductionDecisionValues).toContain(
          event.payload.advisoryDecision
        );
        expect(event.payload.advisoryOnly).toBe(true);
        expect(event.payload.authoritative).toBe(false);
        expect(event.payload.routerResultIncludedRaw).toBe(false);
      }
    }
  });

  it("validates uncertainty summaries and reduction plans against existing vocabularies", async () => {
    const knownDrivers = new Set(knownAgentSimulationUncertaintyDriverIds);
    const knownStepKinds = new Set(uncertaintyReductionStepKinds);

    for (const trace of await loadExampleTraces()) {
      for (const event of trace.traceEvents) {
        if (event.eventKind === "uncertainty_profile_summary") {
          expect(event.payload.schemaVersion).toBe(
            uncertaintyProfileSummaryForTraceSchemaVersion
          );
          expect(agentTraceSeverityValues).toContain(event.payload.maxSeverity);
          expect(event.payload.profileIncludedRaw).toBe(false);

          for (const dimension of event.payload.dimensionsPresent) {
            expect(uncertaintyDimensions).toContain(dimension);
          }

          for (const driverId of event.payload.driverIds) {
            expect(knownDrivers.has(driverId)).toBe(true);
          }
        }

        if (event.eventKind === "uncertainty_reduction_plan") {
          expect(event.payload.schemaVersion).toBe(
            uncertaintyReductionPlanSummaryForTraceSchemaVersion
          );
          expect(event.payload.planIncludedRaw).toBe(false);
          expect(event.payload.executableSteps).toBe(false);

          for (const stepKind of event.payload.stepKinds) {
            expect(knownStepKinds.has(stepKind)).toBe(true);
          }
        }
      }
    }
  });

  it("validates outcomes and review fields without completed real review claims", async () => {
    for (const trace of await loadExampleTraces()) {
      expect(agentTraceOutcomeCategoryValues).toContain(
        trace.finalOutcome.outcomeCategory
      );
      expect(agentTraceTaskCompletedCategoryValues).toContain(
        trace.finalOutcome.taskCompletedCategory
      );
      expect(agentTraceSafetyOutcomeCategoryValues).toContain(
        trace.finalOutcome.safetyOutcomeCategory
      );
      expect(agentTraceFrictionCategoryValues).toContain(
        trace.finalOutcome.frictionCategory
      );
      expect(agentTraceReviewStatusValues).toContain(trace.review.reviewStatus);
      expect(agentTraceReviewerKindValues).toContain(trace.review.reviewerKind);
      expect(trace.review.reviewStatus).toBe("unreviewed_example");
      expect(trace.review.reviewerKind).toBe("none");
      expect(trace.review.notesCategoryOnly).toBe(true);
    }
  });

  it("validates baseline readiness without evaluated baseline results", async () => {
    for (const trace of await loadExampleTraces()) {
      const baselineSlots = Object.values(trace.baselineReadiness);

      expect(baselineSlots).toHaveLength(4);

      for (const slot of baselineSlots) {
        expect(agentTraceBaselineStatusValues).toContain(slot.status);
        expect(slot.status).not.toBe("not_applicable");
        expect(agentTraceBaselineLikelyOutcomeCategoryValues).toContain(
          slot.likelyOutcomeCategory
        );
      }
    }
  });

  it("validates calibration readiness without calibration or guarantee claims", async () => {
    for (const trace of await loadExampleTraces()) {
      expect(trace.calibrationReadiness.lossFieldsPresent).toBe(false);
      expect(trace.calibrationReadiness.calibrationApplied).toBe(false);
      expect(trace.calibrationReadiness.conformalUsed).toBe(false);
      expect(trace.calibrationReadiness.statisticalGuaranteeClaimed).toBe(
        false
      );

      for (const label of trace.calibrationReadiness.requiredFutureLabels) {
        expect(requiredCalibrationLabels.has(label)).toBe(true);
      }
    }
  });

  it("keeps every trace and event inert, non-executable, local, and privacy-safe", async () => {
    for (const trace of await loadExampleTraces()) {
      expect(trace.safety).toEqual({
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
      expect(trace.privacy).toEqual({
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

      expect(agentActionTraceContainsForbiddenRawString(trace)).toBe(false);

      const serialized = JSON.stringify(trace);

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
      expect(serialized).not.toMatch(/validation log/i);
    }
  });
});
