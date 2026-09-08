import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  codexActionAdapterContainsForbiddenRawString,
  codexLikeActionInputSchemaVersion,
  codexLikeScopeCategories,
  normalizeCodexLikeActionInput,
  normalizeCodexLikeActionInputs,
  normalizedAgentProposedActionSchemaVersion,
  normalizedDecisionCategoryValues,
  proposedActionPayloadFromNormalizedAction,
  validateCodexActionAdapterSafety,
  validateCodexLikeActionInput,
  type CodexLikeActionInput
} from "../../simulations/agent/adapters/index.js";
import {
  validateAgentSimulationFixture,
  type AgentSimulationFixture
} from "../../simulations/agent/fixtures/index.js";
import {
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  agentActionTraceSchemaVersion,
  agentTraceActionCategoryValues,
  agentTraceActionIntentCategoryValues,
  agentTraceTargetCategoryValues,
  proposedActionPayloadSchema
} from "../../simulations/agent/traces/index.js";
import {
  uncertaintyDimensions,
  uncertaintyReductionStepKinds
} from "../../src/uncertainty/uncertaintyTypes.js";

const simulationRoot = path.join(process.cwd(), "simulations", "agent");

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadInputs = async (): Promise<CodexLikeActionInput[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "adapters", "example-adapter-inputs.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const inputs = entries.map(validateCodexLikeActionInput);

  for (const input of inputs) {
    validateCodexActionAdapterSafety(input);
  }

  return inputs.sort((left, right) =>
    left.inputId.localeCompare(right.inputId)
  );
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

describe("Codex-like action adapter", () => {
  it("exports schema constants and loads deterministic synthetic examples", async () => {
    const inputs = await loadInputs();
    const inputIds = inputs.map((input) => input.inputId);

    expect(codexLikeActionInputSchemaVersion).toBe(
      "codex-like-action-input.v1"
    );
    expect(normalizedAgentProposedActionSchemaVersion).toBe(
      "normalized-agent-proposed-action.v1"
    );
    expect(codexLikeScopeCategories).toContain("multi_file");
    expect(normalizedDecisionCategoryValues).toContain("UNKNOWN_UNTIL_RUNTIME");
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    expect(inputs.length).toBeLessThanOrEqual(8);
    expect(inputIds).toEqual([...inputIds].sort());
    expect(new Set(inputIds).size).toBe(inputIds.length);

    for (const input of inputs) {
      expect(input.schemaVersion).toBe(codexLikeActionInputSchemaVersion);
      expect(input.inputId).toMatch(
        /^adapter[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(input.source).toBe("synthetic_example");
      expect(input.codexLikeAction.rawOutputIncluded).toBe(false);
      expect(input.codexLikeAction.executable).toBe(false);
    }
  });

  it("links adapter examples to personas, scenarios, and fixtures", async () => {
    const inputs = await loadInputs();
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();
    const scenarioById = new Map(
      scenarios.map((scenario) => [scenario.scenarioId, scenario])
    );
    const fixtureById = new Map(
      fixtures.map((fixture) => [fixture.fixtureId, fixture])
    );
    const personaIds = new Set(
      await Promise.all(
        [
          "ai_power_user_vibe_coder",
          "devops_platform_engineer",
          "fast_solo_founder",
          "junior_developer_with_agent",
          "maintainer_reviewing_agent_prs",
          "security_conscious_backend_engineer"
        ].map(
          async (personaId) =>
            validateAgentSimulationPersona(
              await readJson(
                path.join(simulationRoot, "personas", `${personaId}.json`)
              )
            ).personaId
        )
      )
    );

    for (const input of inputs) {
      const scenario = scenarioById.get(input.scenarioId);
      const fixture = fixtureById.get(input.fixtureRef);

      expect(personaIds.has(input.personaId)).toBe(true);
      expect(scenario).toBeDefined();
      expect(fixture).toBeDefined();
      expect(scenario?.personaIds).toContain(input.personaId);
      expect(scenario?.taskPromptCategory).toBe(input.taskPromptCategory);
      expect(fixture?.linkedScenarioIds).toContain(input.scenarioId);
      expect(fixture?.linkedPersonaIds).toContain(input.personaId);
      expect(fixture?.taskPromptCategories).toContain(input.taskPromptCategory);
    }
  });

  it("normalizes examples deterministically and preserves core identity fields", async () => {
    const inputs = await loadInputs();
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();
    const normalized = normalizeCodexLikeActionInputs(inputs, {
      scenarios,
      fixtures
    });

    expect(normalized.map((action) => action.normalizedActionId)).toEqual(
      [...normalized.map((action) => action.normalizedActionId)].sort()
    );

    for (const input of inputs) {
      const action = normalizeCodexLikeActionInput(input, {
        scenarios,
        fixtures
      });

      expect(action.schemaVersion).toBe(
        normalizedAgentProposedActionSchemaVersion
      );
      expect(action.normalizedActionId).toBe(
        input.inputId.replace(/^adapter[-_]/, "normalized-")
      );
      expect(action.inputId).toBe(input.inputId);
      expect(action.personaId).toBe(input.personaId);
      expect(action.scenarioId).toBe(input.scenarioId);
      expect(action.fixtureRef).toBe(input.fixtureRef);
      expect(action.actionCategory).toBe(
        input.codexLikeAction.proposedOperationCategory
      );
      expect(action.stepHarborActionKind).toBe(
        input.codexLikeAction.proposedOperationCategory
      );
      expect(action.actionIntentCategory).toBe(
        input.codexLikeAction.proposedIntentCategory
      );
      expect(action.targetCategory).toBe(
        input.codexLikeAction.proposedTargetCategory
      );
      expect(action.scopeCategory).toBe(
        input.codexLikeAction.proposedScopeCategory
      );
      expect(action.mappingDiagnostics.mappingStatus).toBe("mapped");
      expect(action.mappingDiagnostics.rawDiagnosticsIncluded).toBe(false);
    }
  });

  it("enriches normalized actions with scenario and fixture metadata", async () => {
    const inputs = await loadInputs();
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();
    const scenarioById = new Map(
      scenarios.map((scenario) => [scenario.scenarioId, scenario])
    );
    const fixtureById = new Map(
      fixtures.map((fixture) => [fixture.fixtureId, fixture])
    );

    for (const input of inputs) {
      const scenario = scenarioById.get(input.scenarioId)!;
      const fixture = fixtureById.get(input.fixtureRef)!;
      const action = normalizeCodexLikeActionInput(input, {
        scenarios,
        fixtures
      });

      for (const interceptionPoint of scenario.stepHarborInterceptionPoints) {
        expect(action.expectedInterceptionPoints).toContain(interceptionPoint);
      }

      for (const interceptionPoint of fixture.stepHarborInterceptionPoints) {
        expect(action.expectedInterceptionPoints).toContain(interceptionPoint);
      }

      for (const dimension of scenario.expectedUncertaintyDimensions) {
        expect(action.expectedUncertaintyDimensions).toContain(dimension);
      }

      for (const driver of scenario.expectedUncertaintyDrivers) {
        expect(action.expectedUncertaintyDrivers).toContain(driver);
      }

      for (const stepKind of scenario.expectedReductionStepKinds) {
        expect(action.expectedReductionStepKinds).toContain(stepKind);
      }
    }
  });

  it("can populate Batch 12.2 proposed_action trace payloads", async () => {
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();

    for (const input of await loadInputs()) {
      const action = normalizeCodexLikeActionInput(input, {
        scenarios,
        fixtures
      });
      const payload = proposedActionPayloadFromNormalizedAction(action);

      expect(() => proposedActionPayloadSchema.parse(payload)).not.toThrow();
      expect(action.tracePayloadCompatibility).toEqual({
        compatibleTraceSchemaVersion: agentActionTraceSchemaVersion,
        canPopulateProposedActionEvent: true,
        rawActionIncluded: false,
        executable: false
      });
      expect(payload.rawActionIncluded).toBe(false);
      expect(payload.executable).toBe(false);
    }
  });

  it("uses allowed decision, action, intent, target, uncertainty, and reduction vocabularies", async () => {
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();

    for (const input of await loadInputs()) {
      const action = normalizeCodexLikeActionInput(input, {
        scenarios,
        fixtures
      });

      expect(normalizedDecisionCategoryValues).toContain(
        action.expectedProductionDecisionCategory
      );
      expect(normalizedDecisionCategoryValues).toContain(
        action.expectedAdvisoryDecisionCategory
      );
      expect(agentTraceActionCategoryValues).toContain(action.actionCategory);
      expect(agentTraceActionCategoryValues).toContain(
        action.stepHarborActionKind
      );
      expect(agentTraceActionIntentCategoryValues).toContain(
        action.actionIntentCategory
      );
      expect(agentTraceTargetCategoryValues).toContain(action.targetCategory);

      for (const dimension of action.expectedUncertaintyDimensions) {
        expect(uncertaintyDimensions).toContain(dimension);
      }

      for (const stepKind of action.expectedReductionStepKinds) {
        expect(uncertaintyReductionStepKinds).toContain(stepKind);
      }
    }
  });

  it("returns safe diagnostics for unknown mappings without raw diagnostics", async () => {
    const [baseInput] = await loadInputs();
    const unknownInput: CodexLikeActionInput = {
      ...baseInput!,
      inputId: "adapter-unknown-mapping-001",
      codexLikeAction: {
        ...baseInput!.codexLikeAction,
        proposedOperationCategory: "unknown",
        proposedIntentCategory: "unknown",
        proposedTargetCategory: "unknown"
      }
    };
    const action = normalizeCodexLikeActionInput(unknownInput);

    expect(action.mappingDiagnostics.mappingStatus).toBe("unknown_mapping");
    expect(action.mappingDiagnostics.warnings).toEqual(
      expect.arrayContaining([
        "missing_fixture_metadata",
        "missing_scenario_metadata",
        "unknown_target_category",
        "unsupported_operation_category"
      ])
    );
    expect(action.mappingDiagnostics.missingCategories).toEqual(
      expect.arrayContaining([
        "fixture_metadata",
        "operation_category",
        "scenario_metadata",
        "target_category"
      ])
    );
    expect(action.mappingDiagnostics.rawDiagnosticsIncluded).toBe(false);
  });

  it("keeps inputs and normalized outputs inert, local, category-only, and privacy-safe", async () => {
    const scenarios = await loadScenarios();
    const fixtures = await loadFixtures();

    for (const input of await loadInputs()) {
      const action = normalizeCodexLikeActionInput(input, {
        scenarios,
        fixtures
      });

      for (const value of [input, action]) {
        expect(value.safety).toEqual({
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
        expect(value.privacy).toEqual({
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
        expect(codexActionAdapterContainsForbiddenRawString(value)).toBe(false);

        const serialized = JSON.stringify(value);

        expect(serialized).not.toMatch(/\/Users\//);
        expect(serialized).not.toMatch(/C:\\/);
        expect(serialized).not.toMatch(/\/home\/[A-Za-z0-9_.-]+/);
        expect(serialized).not.toMatch(/\b[A-Z][A-Z0-9_]*=/);
        expect(serialized).not.toMatch(/PRIVATE KEY/);
        expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
        expect(serialized).not.toMatch(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
        );
        expect(serialized).not.toContain("diff --git");
        expect(serialized).not.toContain("http://");
        expect(serialized).not.toContain("https://");
        expect(serialized).not.toMatch(/rm\s+-rf/i);
        expect(serialized).not.toMatch(/sudo\b/i);
        expect(serialized).not.toMatch(/eval\s*(?:\(|\b)/i);
        expect(serialized).not.toMatch(/raw prompt from/i);
      }
    }
  });
});
