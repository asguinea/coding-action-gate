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
  validateAgentSimulationMatrixManifest,
  validateAgentSimulationPersona,
  validateAgentSimulationScenario,
  type AgentSimulationScenario
} from "../../simulations/agent/personaScenarioSchema.js";
import {
  agentTraceReviewArtifactKindValues,
  agentTraceReviewDecisionCategoryValues,
  agentTraceReviewFutureLossLabelValues,
  agentTraceReviewSchemaVersion,
  agentTraceReviewSourceValues,
  agentTraceReviewTopLevelLabelValues,
  getCalibrationEligibilitySummary,
  summarizeTraceReviewRecord,
  traceReviewRecordContainsForbiddenRawString,
  traceReviewRecordSchema,
  validateTraceReviewRecord,
  validateTraceReviewRecordSafety,
  validateTraceReviewRecords,
  type TraceReviewRecord
} from "../../simulations/agent/review/index.js";
import {
  loadExampleAgentSimulationRuns,
  type AgentSimulationRun
} from "../../simulations/agent/runner/index.js";
import {
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

const loadReviews = async (): Promise<TraceReviewRecord[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "review", "example-review-records.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const reviews = validateTraceReviewRecords(entries);

  for (const review of reviews) {
    validateTraceReviewRecordSafety(review);
  }

  return reviews;
};

const loadRuns = async (): Promise<AgentSimulationRun[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "runner", "example-runs.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return loadExampleAgentSimulationRuns(entries);
};

const loadTraces = async (): Promise<AgentActionTrace[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "traces", "example-traces.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map(validateAgentActionTrace);
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

describe("agent trace review protocol", () => {
  it("exports schema constants and validates deterministic synthetic examples", async () => {
    const reviews = await loadReviews();
    const reviewIds = reviews.map((review) => review.reviewId);

    expect(agentTraceReviewSchemaVersion).toBe("agent-trace-review.v1");
    expect(agentTraceReviewSourceValues).toContain("synthetic_example_review");
    expect(agentTraceReviewArtifactKindValues).toContain("synthetic_run");
    expect(agentTraceReviewDecisionCategoryValues).toEqual(
      expect.arrayContaining(["PROCEED", "DEFER", "ESCALATE", "BLOCK"])
    );
    expect(reviews.length).toBeGreaterThanOrEqual(5);
    expect(reviews.length).toBeLessThanOrEqual(8);
    expect(reviewIds).toEqual([...reviewIds].sort());
    expect(new Set(reviewIds).size).toBe(reviewIds.length);

    for (const review of reviews) {
      expect(review.schemaVersion).toBe(agentTraceReviewSchemaVersion);
      expect(review.reviewId).toMatch(
        /^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(review.source).toBe("synthetic_example_review");
      expect(review.reviewedArtifact).toBeDefined();
      expect(review.reviewer.reviewerKind).toBe("simulation_designer_example");
      expect(review.decisionAssessment).toBeDefined();
      expect(review.uncertaintyAssessment).toBeDefined();
      expect(review.agentBehaviorAssessment.rawAgentOutputIncluded).toBe(false);
      expect(review.outcomeAssessment).toBeDefined();
      expect(review.frictionAssessment).toBeDefined();
      expect(review.coverageAssessment).toBeDefined();
      expect(review.calibrationReadinessAssessment).toBeDefined();
      expect(review.labels.length).toBeGreaterThan(0);
    }
  });

  it("rejects uncontrolled labels", async () => {
    const [review] = await loadReviews();
    const invalidReview = {
      ...review,
      labels: ["private_free_text_label"]
    };

    expect(() => traceReviewRecordSchema.parse(invalidReview)).toThrow();
  });

  it("links reviewed artifacts to existing Phase 12 assets", async () => {
    const reviews = await loadReviews();
    const runsById = new Map((await loadRuns()).map((run) => [run.runId, run]));
    const tracesById = new Map(
      (await loadTraces()).map((trace) => [trace.traceId, trace])
    );
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

    for (const review of reviews) {
      const artifact = review.reviewedArtifact;
      const scenario = scenariosById.get(artifact.scenarioId);
      const fixture = fixturesById.get(artifact.fixtureRef);

      expect(personaIds.has(artifact.personaId)).toBe(true);
      expect(scenario).toBeDefined();
      expect(fixture).toBeDefined();
      expect(scenario?.personaIds).toContain(artifact.personaId);
      expect(fixture?.linkedScenarioIds).toContain(artifact.scenarioId);
      expect(fixture?.linkedPersonaIds).toContain(artifact.personaId);
      expect(artifact.artifactReviewedRaw).toBe(false);

      if (artifact.runId !== undefined) {
        const run = runsById.get(artifact.runId);

        expect(run).toBeDefined();
        expect(run?.personaId).toBe(artifact.personaId);
        expect(run?.scenarioId).toBe(artifact.scenarioId);
        expect(run?.fixtureRef).toBe(artifact.fixtureRef);
        expect(run?.adapterInputId).toBe(artifact.adapterInputId);
        expect(run?.normalizedActionId).toBe(artifact.normalizedActionId);
      }

      if (artifact.traceId !== undefined) {
        const trace = tracesById.get(artifact.traceId);

        expect(trace).toBeDefined();
        expect(trace?.source).toBe("synthetic_example");
        expect(trace?.personaId).toBe(artifact.personaId);
        expect(trace?.scenarioId).toBe(artifact.scenarioId);
        expect(trace?.fixtureRef).toBe(artifact.fixtureRef);
      }

      if (artifact.adapterInputId !== undefined) {
        const adapterInput = adapterInputsById.get(artifact.adapterInputId);

        expect(adapterInput).toBeDefined();
        expect(adapterInput?.personaId).toBe(artifact.personaId);
        expect(adapterInput?.scenarioId).toBe(artifact.scenarioId);
        expect(adapterInput?.fixtureRef).toBe(artifact.fixtureRef);
      }
    }
  });

  it("covers required synthetic review situations and helper summaries", async () => {
    const reviews = await loadReviews();
    const labels = new Set(reviews.flatMap((review) => review.labels));
    const scenarioIds = new Set(
      reviews.map((review) => review.reviewedArtifact.scenarioId)
    );
    const summary = getCalibrationEligibilitySummary(reviews);

    expect([...scenarioIds]).toEqual(
      expect.arrayContaining([
        "blind-edit-missing-context-001",
        "sensitive-auth-defer-escalate-001",
        "dangerous-command-hard-block-001",
        "ambiguous-deploy-001",
        "repeated-retry-no-progress-001",
        "broad-refactor-scope-001"
      ])
    );
    expect([...labels]).toEqual(
      expect.arrayContaining([
        "defer_helped",
        "escalation_justified",
        "block_justified",
        "unsafe_prevented",
        "missing_coverage",
        "not_calibration_ready",
        "calibration_candidate"
      ])
    );
    expect(summary.candidateCount).toBeGreaterThan(0);
    expect(summary.notReadyCount).toBeGreaterThan(0);
    expect(summary.adjudicationRequiredCount).toBeGreaterThan(0);

    for (const review of reviews) {
      const compact = summarizeTraceReviewRecord(review);

      expect(compact.reviewId).toBe(review.reviewId);
      expect(compact.artifactKind).toBe(review.reviewedArtifact.artifactKind);
      expect(compact.labels).toBe(review.labels);
    }
  });

  it("uses controlled assessment vocabularies and future loss labels only", async () => {
    for (const review of await loadReviews()) {
      expect(agentTraceReviewTopLevelLabelValues).toEqual(
        expect.arrayContaining(review.labels)
      );

      for (const dimension of review.uncertaintyAssessment
        .uncertaintyDimensionsPresent) {
        expect(uncertaintyDimensions).toContain(dimension);
      }

      for (const step of review.uncertaintyAssessment.reductionStepKinds) {
        expect(uncertaintyReductionStepKinds).toContain(step);
      }

      for (const label of review.calibrationReadinessAssessment
        .futureLossLabels) {
        expect(agentTraceReviewFutureLossLabelValues).toContain(label);
      }
    }
  });

  it("keeps examples synthetic and claim-bounded", async () => {
    for (const review of await loadReviews()) {
      expect(review.claimBoundaries).toEqual({
        realReviewCompleted: false,
        actualRuntimeDecision: false,
        realAgentExecution: false,
        realCodingActionGateExecution: false,
        realValidationResult: false,
        realWorldResult: false,
        baselineEvaluated: false,
        calibrationApplied: false,
        conformalGuarantee: false,
        publicDisclosureApproved: false,
        legalConclusion: false
      });
      expect(review.decisionAssessment.reviewEvidenceIncludedRaw).toBe(false);
      expect(review.uncertaintyAssessment.rawUncertaintyProfileIncluded).toBe(
        false
      );
      expect(review.uncertaintyAssessment.rawReductionPlanIncluded).toBe(false);
      expect(review.reviewer.reviewerIdentityIncluded).toBe(false);
      expect(review.reviewer.reviewerEmailIncluded).toBe(false);
      expect(review.calibrationReadinessAssessment.lossFieldsPresent).toBe(
        false
      );
      expect(review.calibrationReadinessAssessment.calibrationApplied).toBe(
        false
      );
      expect(review.calibrationReadinessAssessment.conformalUsed).toBe(false);
      expect(
        review.calibrationReadinessAssessment.statisticalGuaranteeClaimed
      ).toBe(false);
      expect(
        review.calibrationReadinessAssessment.suitableForCalibrationAsIs
      ).toBe(false);
    }
  });

  it("enforces safety and privacy flags and raw-content scans", async () => {
    for (const review of await loadReviews()) {
      expect(review.safety).toEqual({
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
      expect(review.privacy).toEqual({
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
        rawAgentOutputIncluded: false,
        reviewerIdentityIncluded: false,
        categoryOnly: true
      });
      expect(traceReviewRecordContainsForbiddenRawString(review)).toBe(false);
      expect(() => validateTraceReviewRecord(review)).not.toThrow();

      const serialized = JSON.stringify(review);

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
      expect(serialized).not.toMatch(/raw agent output/i);
      expect(serialized).not.toMatch(/raw Codex output/i);
    }
  });
});
