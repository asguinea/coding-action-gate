import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCodexLikeActionInput,
  type CodexLikeActionInput
} from "../../simulations/agent/adapters/codexActionAdapterSchema.js";
import {
  agentBaselineComparisonClaimBoundariesSchema,
  agentBaselineComparisonPrivacySchema,
  agentBaselineComparisonSafetySchema,
  agentBaselineComparisonSchemaVersion,
  agentBaselineComparisonSourceValues,
  agentBaselineComparisonStrategyValues,
  baselineComparisonContainsForbiddenRawString,
  baselineComparisonRecordSchema,
  baselineDecisionDifferenceCategoryValues,
  baselineEvidenceBasisCategoryValues,
  baselineFrictionCategoryValues,
  baselineMetricCategoryValues,
  baselineRiskCategoryValues,
  baselineSyntheticDecisionCategoryValues,
  baselineSyntheticOutcomeCategoryValues,
  buildBaselineComparisonRecord,
  computeSyntheticBaselineComparisonMetrics,
  summarizeBaselineComparisonRecord,
  validateBaselineComparisonRecordSafety,
  validateBaselineComparisonRecords,
  type BaselineComparisonRecord
} from "../../simulations/agent/baselines/index.js";
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

const loadComparisons = async (): Promise<BaselineComparisonRecord[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "baselines", "example-baseline-comparisons.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const comparisons = validateBaselineComparisonRecords(entries);

  for (const comparison of comparisons) {
    validateBaselineComparisonRecordSafety(comparison);
  }

  return comparisons;
};

const loadRuns = async (): Promise<AgentSimulationRun[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "runner", "example-runs.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return loadExampleAgentSimulationRuns(entries);
};

const loadReviews = async (): Promise<TraceReviewRecord[]> => {
  const parsed = await readJson(
    path.join(simulationRoot, "review", "example-review-records.json")
  );
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return validateTraceReviewRecords(entries);
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

const forbiddenMetricTerms = [
  /alpha/i,
  /coverage_guarantee/i,
  /conformal_threshold/i,
  /calibrated_threshold/i,
  /empirical_risk_guarantee/i,
  /controlled_risk_guarantee/i
] as const;

describe("agent baseline comparisons", () => {
  it("exports schema constants and validates deterministic examples", async () => {
    const comparisons = await loadComparisons();
    const comparisonIds = comparisons.map(
      (comparison) => comparison.comparisonId
    );

    expect(agentBaselineComparisonSchemaVersion).toBe(
      "agent-baseline-comparison.v1"
    );
    expect(agentBaselineComparisonSourceValues).toContain(
      "synthetic_example_comparison"
    );
    expect(agentBaselineComparisonStrategyValues).toEqual([
      "no_guard",
      "policy_only_guard",
      "deterministic_stepharbor",
      "stepharbor_with_advisory_uq"
    ]);
    expect(comparisons.length).toBeGreaterThanOrEqual(5);
    expect(comparisons.length).toBeLessThanOrEqual(8);
    expect(comparisonIds).toEqual([...comparisonIds].sort());
    expect(new Set(comparisonIds).size).toBe(comparisonIds.length);

    for (const comparison of comparisons) {
      expect(comparison.schemaVersion).toBe(
        agentBaselineComparisonSchemaVersion
      );
      expect(comparison.comparisonId).toMatch(
        /^baseline[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(comparison.source).toBe("synthetic_example_comparison");
      expect(comparison.comparedArtifact.artifactReviewedRaw).toBe(false);
      expect(comparison.strategies).toBeDefined();
      expect(comparison.decisionComparison).toBeDefined();
      expect(comparison.uncertaintyComparison).toBeDefined();
      expect(comparison.safetyComparison).toBeDefined();
      expect(comparison.frictionComparison).toBeDefined();
      expect(comparison.coverageComparison).toBeDefined();
      expect(comparison.reviewLabelUse.rawReviewIncluded).toBe(false);
      expect(comparison.metrics.strategiesComparedCount).toBe(4);
    }
  });

  it("rejects uncontrolled enum labels", async () => {
    const comparisons = await loadComparisons();
    const comparison = comparisons[0];

    expect(comparison).toBeDefined();

    expect(() =>
      baselineComparisonRecordSchema.parse({
        ...comparison!,
        decisionComparison: {
          ...comparison!.decisionComparison,
          decisionDifferenceCategory: "private_free_text"
        }
      })
    ).toThrow();
  });

  it("includes all four strategies with controlled categories", async () => {
    const comparisons = await loadComparisons();

    for (const comparison of comparisons) {
      for (const strategyName of agentBaselineComparisonStrategyValues) {
        const strategy = comparison.strategies[strategyName];

        expect(strategy.strategyKind).toBe(strategyName);
        expect(baselineSyntheticDecisionCategoryValues).toContain(
          strategy.syntheticDecisionCategory
        );
        expect(baselineSyntheticOutcomeCategoryValues).toContain(
          strategy.syntheticOutcomeCategory
        );
        expect(baselineRiskCategoryValues).toContain(
          strategy.expectedRiskCategory
        );
        expect(baselineFrictionCategoryValues).toContain(
          strategy.expectedFrictionCategory
        );
        expect(baselineEvidenceBasisCategoryValues).toContain(
          strategy.evidenceBasisCategory
        );
      }

      expect(
        comparison.strategies.stepharbor_with_advisory_uq.advisoryOnly
      ).toBe(true);
      expect(
        comparison.strategies.stepharbor_with_advisory_uq.authoritative
      ).toBe(false);
    }
  });

  it("links compared artifacts to existing Phase 12 assets", async () => {
    const comparisons = await loadComparisons();
    const runsById = new Map((await loadRuns()).map((run) => [run.runId, run]));
    const reviewsById = new Map(
      (await loadReviews()).map((review) => [review.reviewId, review])
    );
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

    for (const comparison of comparisons) {
      const artifact = comparison.comparedArtifact;
      const scenario = scenariosById.get(artifact.scenarioId);

      expect(personaIds.has(artifact.personaId)).toBe(true);
      expect(scenario).toBeDefined();
      expect(scenario?.personaIds).toContain(artifact.personaId);
      expect(artifact.artifactReviewedRaw).toBe(false);

      for (const fixtureRef of artifact.fixtureRefs) {
        const fixture = fixturesById.get(fixtureRef);

        expect(fixture).toBeDefined();
        expect(fixture?.linkedScenarioIds).toContain(artifact.scenarioId);
        expect(fixture?.linkedPersonaIds).toContain(artifact.personaId);
      }

      if (artifact.runId !== undefined) {
        const run = runsById.get(artifact.runId);

        expect(run).toBeDefined();
        expect(run?.personaId).toBe(artifact.personaId);
        expect(run?.scenarioId).toBe(artifact.scenarioId);
        expect(artifact.fixtureRefs).toContain(run?.fixtureRef);
        expect(run?.adapterInputId).toBe(artifact.adapterInputId);
        expect(run?.normalizedActionId).toBe(artifact.normalizedActionId);
      }

      if (artifact.reviewId !== undefined) {
        const review = reviewsById.get(artifact.reviewId);

        expect(review).toBeDefined();
        expect(review?.source).toBe("synthetic_example_review");
        expect(review?.reviewedArtifact.runId).toBe(artifact.runId);
        expect(review?.reviewedArtifact.personaId).toBe(artifact.personaId);
        expect(review?.reviewedArtifact.scenarioId).toBe(artifact.scenarioId);
      }

      if (artifact.traceId !== undefined) {
        const trace = tracesById.get(artifact.traceId);

        expect(trace).toBeDefined();
        expect(trace?.source).toBe("synthetic_example");
        expect(trace?.personaId).toBe(artifact.personaId);
        expect(trace?.scenarioId).toBe(artifact.scenarioId);
      }

      if (artifact.adapterInputId !== undefined) {
        const adapterInput = adapterInputsById.get(artifact.adapterInputId);

        expect(adapterInput).toBeDefined();
        expect(adapterInput?.personaId).toBe(artifact.personaId);
        expect(adapterInput?.scenarioId).toBe(artifact.scenarioId);
        expect(artifact.fixtureRefs).toContain(adapterInput?.fixtureRef);
      }
    }
  });

  it("covers required synthetic comparison situations", async () => {
    const comparisons = await loadComparisons();
    const scenarioIds = new Set(
      comparisons.map((comparison) => comparison.comparedArtifact.scenarioId)
    );
    const labels = new Set(
      comparisons.flatMap((comparison) => comparison.reviewLabelUse.labelsUsed)
    );

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
        "missing_coverage"
      ])
    );
    expect(
      comparisons.some(
        (comparison) =>
          comparison.comparedArtifact.reviewId !== undefined &&
          comparison.reviewLabelUse.unavailableReason === "review_linked"
      )
    ).toBe(true);
  });

  it("validates uncertainty, decision, and review-label vocabulary", async () => {
    const comparisons = await loadComparisons();

    for (const comparison of comparisons) {
      expect(baselineDecisionDifferenceCategoryValues).toContain(
        comparison.decisionComparison.decisionDifferenceCategory
      );
      for (const dimension of comparison.uncertaintyComparison
        .uncertaintyDimensionsRelevant) {
        expect(uncertaintyDimensions).toContain(dimension);
      }
      for (const stepKind of comparison.uncertaintyComparison
        .reductionStepsRelevant) {
        expect(uncertaintyReductionStepKinds).toContain(stepKind);
      }
      for (const value of [
        comparison.metrics.syntheticUnsafeProceedAvoidedCategory,
        comparison.metrics.syntheticPolicyMissCategory,
        comparison.metrics.syntheticDeferValueCategory,
        comparison.metrics.syntheticEscalationValueCategory,
        comparison.metrics.syntheticBlockValueCategory,
        comparison.metrics.syntheticCoverageGapCategory
      ]) {
        expect(baselineMetricCategoryValues).toContain(value);
      }
    }
  });

  it("computes deterministic local synthetic metrics", async () => {
    const comparisons = await loadComparisons();
    const comparison = comparisons[0];
    const metrics = computeSyntheticBaselineComparisonMetrics(comparisons);

    expect(comparison).toBeDefined();

    const summary = summarizeBaselineComparisonRecord(comparison!);

    expect(summary.comparisonId).toBe(comparison!.comparisonId);
    expect(metrics.totalComparisons).toBe(comparisons.length);
    expect(metrics.strategyCoverage).toEqual([
      "no_guard",
      "policy_only_guard",
      "deterministic_stepharbor",
      "stepharbor_with_advisory_uq"
    ]);
    expect(metrics.syntheticPolicyMissCount).toBeGreaterThan(0);
    expect(metrics.syntheticDeferAddedValueCount).toBeGreaterThan(0);
    expect(metrics.syntheticEscalationAddedValueCount).toBeGreaterThan(0);
    expect(metrics.syntheticBlockAddedValueCount).toBeGreaterThan(0);
    expect(metrics.syntheticCoverageGapCount).toBeGreaterThan(0);
    expect(metrics.safetyBoundaryViolationCount).toBe(0);
    expect(metrics.privacyBoundaryViolationCount).toBe(0);
    expect(metrics.claimBoundaryViolationCount).toBe(0);
    expect(metrics.localSyntheticCountsOnly).toBe(true);
    expect(metrics.realWorldPerformanceMetric).toBe(false);
    expect(metrics.calibratedRiskMetric).toBe(false);
    expect(metrics.statisticalEstimate).toBe(false);

    const metricNames = JSON.stringify(Object.keys(metrics));
    for (const forbidden of forbiddenMetricTerms) {
      expect(metricNames).not.toMatch(forbidden);
    }
  });

  it("builds a synthetic comparison record from run and review metadata", async () => {
    const comparisons = await loadComparisons();
    const comparison = comparisons[0];
    const runs = await loadRuns();
    const reviews = await loadReviews();

    expect(comparison).toBeDefined();

    const buildInput =
      comparison!.comparedArtifact.reviewId === undefined
        ? {
            comparisonId: "baseline-builder-smoke-001",
            runId: comparison!.comparedArtifact.runId ?? ""
          }
        : {
            comparisonId: "baseline-builder-smoke-001",
            runId: comparison!.comparedArtifact.runId ?? "",
            reviewId: comparison!.comparedArtifact.reviewId
          };
    const built = buildBaselineComparisonRecord(buildInput, { runs, reviews });

    expect(built.schemaVersion).toBe(agentBaselineComparisonSchemaVersion);
    expect(built.comparedArtifact.runId).toBe(
      comparison!.comparedArtifact.runId
    );
    expect(built.comparedArtifact.reviewId).toBe(
      comparison!.comparedArtifact.reviewId
    );
    expect(built.claimBoundaries.actualRuntimeDecision).toBe(false);
    expect(built.claimBoundaries.realStepHarborExecution).toBe(false);
    expect(built.strategies.stepharbor_with_advisory_uq.authoritative).toBe(
      false
    );
  });

  it("enforces exact safety, privacy, and claim-boundary flags", async () => {
    const comparisons = await loadComparisons();

    for (const comparison of comparisons) {
      expect(() =>
        agentBaselineComparisonSafetySchema.parse(comparison.safety)
      ).not.toThrow();
      expect(() =>
        agentBaselineComparisonPrivacySchema.parse(comparison.privacy)
      ).not.toThrow();
      expect(() =>
        agentBaselineComparisonClaimBoundariesSchema.parse(
          comparison.claimBoundaries
        )
      ).not.toThrow();
      expect(comparison.safety).toEqual({
        inert: true,
        executesAgent: false,
        executesCommands: false,
        executesPackageScripts: false,
        requiresNetwork: false,
        mutatesRepository: false,
        touchesRealSecrets: false,
        usesRealRepo: false,
        containsPrivateData: false,
        containsExecutableAction: false,
        changesRuntimeBehavior: false
      });
      expect(comparison.privacy).toEqual({
        rawPromptIncluded: false,
        rawActionIncluded: false,
        rawCommandIncluded: false,
        rawDiffIncluded: false,
        rawSourceCodeIncluded: false,
        rawValidationLogIncluded: false,
        rawReviewIncluded: false,
        realRepoNameIncluded: false,
        realPathIncluded: false,
        realUserIncluded: false,
        realEmailIncluded: false,
        secretIncluded: false,
        rawAgentOutputIncluded: false,
        reviewerIdentityIncluded: false,
        categoryOnly: true
      });
      expect(comparison.claimBoundaries).toEqual({
        syntheticOnly: true,
        realBaselineEvaluation: false,
        realReviewCompleted: false,
        actualRuntimeDecision: false,
        realAgentExecution: false,
        realStepHarborExecution: false,
        realValidationResult: false,
        realWorldResult: false,
        calibrationDatasetCreated: false,
        calibrationApplied: false,
        conformalGuarantee: false,
        statisticalGuarantee: false,
        publicDisclosureApproved: false,
        legalConclusion: false
      });
    }
  });

  it("keeps examples category-only and calibration/conformal bounded", async () => {
    const comparisons = await loadComparisons();

    for (const comparison of comparisons) {
      expect(comparison.claimBoundaries.realBaselineEvaluation).toBe(false);
      expect(comparison.claimBoundaries.calibrationDatasetCreated).toBe(false);
      expect(comparison.claimBoundaries.calibrationApplied).toBe(false);
      expect(comparison.claimBoundaries.conformalGuarantee).toBe(false);
      expect(comparison.claimBoundaries.statisticalGuarantee).toBe(false);
      expect(comparison.metrics.realWorldPerformanceMetric).toBe(false);
      expect(comparison.metrics.calibratedRiskMetric).toBe(false);
      expect(comparison.metrics.statisticalEstimate).toBe(false);
      expect(baselineComparisonContainsForbiddenRawString(comparison)).toBe(
        false
      );
    }
  });
});
