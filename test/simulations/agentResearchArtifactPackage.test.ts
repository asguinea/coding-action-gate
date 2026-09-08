import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCodexLikeActionInput,
  type CodexLikeActionInput
} from "../../simulations/agent/adapters/codexActionAdapterSchema.js";
import {
  agentBaselineComparisonStrategyValues,
  validateBaselineComparisonRecords,
  type BaselineComparisonRecord
} from "../../simulations/agent/baselines/index.js";
import {
  agentResearchArtifactPackageClaimBoundariesSchema,
  agentResearchArtifactPackagePrivacySchema,
  agentResearchArtifactPackageSafetySchema,
  agentResearchArtifactPackageSchemaVersion,
  artifactDatasetCardNotIntendedUseValues,
  artifactIncludedAssetKindValues,
  computeResearchArtifactPackageMetrics,
  loadExampleResearchArtifactPackages,
  researchArtifactPackageContainsForbiddenRawString,
  researchArtifactPackageSchema,
  summarizeResearchArtifactPackage,
  validateArtifactAssetGraph,
  validateResearchArtifactPackageSafety,
  validateTraceLinkageExamples,
  type ResearchArtifactPackage
} from "../../simulations/agent/artifacts/index.js";
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

const simulationRoot = path.join(process.cwd(), "simulations", "agent");

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value];

const loadPackages = async (): Promise<ResearchArtifactPackage[]> =>
  loadExampleResearchArtifactPackages(
    asArray(
      await readJson(
        path.join(simulationRoot, "artifacts", "example-artifact-package.json")
      )
    )
  );

const loadTraces = async (): Promise<AgentActionTrace[]> =>
  asArray(
    await readJson(path.join(simulationRoot, "traces", "example-traces.json"))
  ).map(validateAgentActionTrace);

const loadRuns = async (): Promise<AgentSimulationRun[]> =>
  loadExampleAgentSimulationRuns(
    asArray(
      await readJson(path.join(simulationRoot, "runner", "example-runs.json"))
    )
  );

const loadReviews = async (): Promise<TraceReviewRecord[]> =>
  validateTraceReviewRecords(
    asArray(
      await readJson(
        path.join(simulationRoot, "review", "example-review-records.json")
      )
    )
  );

const loadBaselines = async (): Promise<BaselineComparisonRecord[]> =>
  validateBaselineComparisonRecords(
    asArray(
      await readJson(
        path.join(
          simulationRoot,
          "baselines",
          "example-baseline-comparisons.json"
        )
      )
    )
  );

const loadScenarios = async (): Promise<AgentSimulationScenario[]> =>
  asArray(
    await readJson(
      path.join(simulationRoot, "scenarios", "phase12-scenarios.json")
    )
  ).map(validateAgentSimulationScenario);

const loadFixtures = async (): Promise<AgentSimulationFixture[]> =>
  asArray(
    await readJson(
      path.join(simulationRoot, "fixtures", "controlled-fixtures.json")
    )
  ).map(validateAgentSimulationFixture);

const loadAdapterInputs = async (): Promise<CodexLikeActionInput[]> =>
  asArray(
    await readJson(
      path.join(simulationRoot, "adapters", "example-adapter-inputs.json")
    )
  ).map(validateCodexLikeActionInput);

const forbiddenMetricTerms = [
  /accuracy/i,
  /precision/i,
  /recall/i,
  /\bf1\b/i,
  /alpha/i,
  /coverage_guarantee/i,
  /conformal_threshold/i,
  /calibrated_threshold/i,
  /empirical_risk_guarantee/i,
  /controlled_risk_guarantee/i,
  /measured_productivity/i
] as const;

describe("agent research artifact package", () => {
  it("validates schema, deterministic ID, source, and phase metadata", async () => {
    const [artifactPackage] = await loadPackages();

    expect(artifactPackage).toBeDefined();
    expect(artifactPackage!.schemaVersion).toBe(
      agentResearchArtifactPackageSchemaVersion
    );
    expect(artifactPackage!.artifactPackageId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]v?\d+$/
    );
    expect(artifactPackage!.source).toBe("synthetic_phase_12_artifact_package");
    expect(artifactPackage!.phase.completedBatches).toEqual([
      "12.1",
      "12.2",
      "12.3",
      "12.4",
      "12.5",
      "12.6",
      "12.7"
    ]);
    expect(artifactPackage!.phase.currentBatch).toBe("12.8");
    expect(artifactPackage!.phase.futureBatches).toEqual([
      "12.9",
      "12.10",
      "12.11",
      "12.12"
    ]);
    expect(() =>
      researchArtifactPackageSchema.parse({
        ...artifactPackage!,
        source: "real_private_dataset"
      })
    ).toThrow();
  });

  it("represents all included assets with matching local counts", async () => {
    const [artifactPackage] = await loadPackages();
    const matrix = validateAgentSimulationMatrixManifest(
      await readJson(path.join(simulationRoot, "matrix.json"))
    );
    const assetCounts = {
      personaScenarioMatrix: matrix.scenarioIds.length,
      traceExamples: (await loadTraces()).length,
      controlledFixtures: (await loadFixtures()).length,
      adapterInputs: (await loadAdapterInputs()).length,
      syntheticRuns: (await loadRuns()).length,
      syntheticReviewRecords: (await loadReviews()).length,
      syntheticBaselineComparisons: (await loadBaselines()).length
    };

    expect(Object.keys(artifactPackage!.includedAssets).sort()).toEqual(
      [...artifactIncludedAssetKindValues].sort()
    );

    for (const assetKind of artifactIncludedAssetKindValues) {
      const asset = artifactPackage!.includedAssets[assetKind];

      expect(asset).toBeDefined();
      expect(asset!.assetKind).toBe(assetKind);
      expect(asset!.assetCount).toBe(assetCounts[assetKind]);
      expect(asset!.syntheticOnly).toBe(true);
      expect(asset!.containsRawCode).toBe(false);
      expect(asset!.containsRawCommands).toBe(false);
      expect(asset!.containsRawPrompts).toBe(false);
      expect(asset!.containsRawAgentOutput).toBe(false);
      expect(asset!.containsPrivateData).toBe(false);
    }
  });

  it("validates asset graph references using existing synthetic IDs", async () => {
    const [artifactPackage] = await loadPackages();
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
    const scenarioIds = new Set(
      (await loadScenarios()).map((s) => s.scenarioId)
    );
    const fixtureIds = new Set((await loadFixtures()).map((f) => f.fixtureId));
    const traceIds = new Set(
      (await loadTraces()).map((trace) => trace.traceId)
    );
    const runIds = new Set((await loadRuns()).map((run) => run.runId));
    const reviewIds = new Set(
      (await loadReviews()).map((review) => review.reviewId)
    );
    const comparisonIds = new Set(
      (await loadBaselines()).map((comparison) => comparison.comparisonId)
    );
    const adapterIds = new Set(
      (await loadAdapterInputs()).map((input) => input.inputId)
    );

    validateArtifactAssetGraph(artifactPackage!);

    for (const edge of artifactPackage!.assetGraph.edges) {
      expect(edge.rawContentIncluded).toBe(false);
      for (const node of [edge.from, edge.to]) {
        if (node.personaId !== undefined)
          expect(personaIds.has(node.personaId)).toBe(true);
        if (node.scenarioId !== undefined)
          expect(scenarioIds.has(node.scenarioId)).toBe(true);
        if (node.fixtureRef !== undefined)
          expect(fixtureIds.has(node.fixtureRef)).toBe(true);
        if (node.traceId !== undefined)
          expect(traceIds.has(node.traceId)).toBe(true);
        if (node.runId !== undefined) expect(runIds.has(node.runId)).toBe(true);
        if (node.reviewId !== undefined)
          expect(reviewIds.has(node.reviewId)).toBe(true);
        if (node.comparisonId !== undefined)
          expect(comparisonIds.has(node.comparisonId)).toBe(true);
        if (node.adapterInputId !== undefined)
          expect(adapterIds.has(node.adapterInputId)).toBe(true);
      }
    }
  });

  it("enforces mandatory direct traceId linkage to a synthetic review", async () => {
    const [artifactPackage] = await loadPackages();
    const tracesById = new Map(
      (await loadTraces()).map((trace) => [trace.traceId, trace])
    );
    const reviewsById = new Map(
      (await loadReviews()).map((review) => [review.reviewId, review])
    );

    validateTraceLinkageExamples(artifactPackage!);

    const directLink = artifactPackage!.traceLinkageExamples.find(
      (linkage) => linkage.directTraceReviewLink
    );

    expect(directLink).toBeDefined();
    expect(directLink!.artifactKind).toBe("synthetic_trace_example");
    expect(directLink!.traceId).toMatch(/^trace[-_]/);
    expect(tracesById.get(directLink!.traceId)?.source).toBe(
      "synthetic_example"
    );
    expect(reviewsById.has(directLink!.reviewId)).toBe(true);
    expect(directLink!.artifactReviewedRaw).toBe(false);
    expect(directLink!.rawTraceIncluded).toBe(false);
    expect(directLink!.rawReviewIncluded).toBe(false);
    expect(directLink!.realReviewCompleted).toBe(false);
    expect(directLink!.realReviewedTrace).toBe(false);
    expect(directLink!.realAgentExecution).toBe(false);
    expect(directLink!.realValidationResult).toBe(false);
    expect(directLink!.linkedViaRunId).toBeUndefined();
  });

  it("validates run, review, and baseline linkage examples", async () => {
    const [artifactPackage] = await loadPackages();
    const runsById = new Map((await loadRuns()).map((run) => [run.runId, run]));
    const reviewsById = new Map(
      (await loadReviews()).map((review) => [review.reviewId, review])
    );
    const baselinesById = new Map(
      (await loadBaselines()).map((comparison) => [
        comparison.comparisonId,
        comparison
      ])
    );

    for (const linkage of artifactPackage!.runLinkageExamples) {
      const run = runsById.get(linkage.runId);

      expect(run).toBeDefined();
      expect(run?.personaId).toBe(linkage.personaId);
      expect(run?.scenarioId).toBe(linkage.scenarioId);
      expect(linkage.fixtureRefs).toContain(run?.fixtureRef);
      expect(linkage.rawRunIncluded).toBe(false);
    }

    for (const linkage of artifactPackage!.reviewLinkageExamples) {
      const review = reviewsById.get(linkage.reviewId);

      expect(review).toBeDefined();
      expect(linkage.labels).toEqual(review?.labels);
      expect(linkage.rawReviewIncluded).toBe(false);
      expect(linkage.reviewerIdentityIncluded).toBe(false);
      expect(linkage.realReviewCompleted).toBe(false);
    }

    for (const linkage of artifactPackage!.baselineLinkageExamples) {
      const comparison = baselinesById.get(linkage.comparisonId);

      expect(comparison).toBeDefined();
      expect(linkage.strategiesRepresented).toEqual([
        ...agentBaselineComparisonStrategyValues
      ]);
      expect(linkage.syntheticMetricsOnly).toBe(true);
      expect(linkage.rawBaselineIncluded).toBe(false);
      expect(linkage.realBaselineEvaluation).toBe(false);
    }
  });

  it("validates dataset card, reproducibility, limitations, and metrics", async () => {
    const [artifactPackage] = await loadPackages();
    const metrics = computeResearchArtifactPackageMetrics(artifactPackage!);
    const summary = summarizeResearchArtifactPackage(artifactPackage!);

    expect(summary.directTraceLinkageExampleCount).toBeGreaterThanOrEqual(1);
    expect(artifactPackage!.datasetCard.syntheticDataStatement).toBe(
      "synthetic_category_only"
    );
    expect(artifactPackage!.datasetCard.notRealCalibrationDataset).toBe(true);
    expect(artifactPackage!.datasetCard.notIntendedUse).toEqual(
      expect.arrayContaining([...artifactDatasetCardNotIntendedUseValues])
    );
    expect(artifactPackage!.reproducibility.localOnly).toBe(true);
    expect(artifactPackage!.reproducibility.deterministic).toBe(true);
    expect(artifactPackage!.reproducibility.requiresNetwork).toBe(false);
    expect(artifactPackage!.reproducibility.requiresAgentExecution).toBe(false);
    expect(artifactPackage!.reproducibility.requiresCommandExecution).toBe(
      false
    );
    expect(artifactPackage!.reproducibility.requiresRealRepo).toBe(false);
    expect(artifactPackage!.reproducibility.requiresSecrets).toBe(false);
    expect(artifactPackage!.reproducibility.packageSafe).toBe(true);
    expect(artifactPackage!.limitations.noCalibrationDataset).toBe(true);
    expect(artifactPackage!.limitations.noConformalRiskControl).toBe(true);
    expect(metrics.directTraceLinkageExampleCount).toBeGreaterThanOrEqual(1);
    expect(metrics.safetyBoundaryViolationCount).toBe(0);
    expect(metrics.privacyBoundaryViolationCount).toBe(0);
    expect(metrics.claimBoundaryViolationCount).toBe(0);
    expect(metrics.realWorldPerformanceMetric).toBe(false);
    expect(metrics.calibratedRiskMetric).toBe(false);
    expect(metrics.statisticalEstimate).toBe(false);
    expect(metrics.measuredProductivityMetric).toBe(false);

    const metricNames = JSON.stringify(Object.keys(artifactPackage!.metrics));
    for (const forbidden of forbiddenMetricTerms) {
      expect(metricNames).not.toMatch(forbidden);
    }
  });

  it("enforces exact safety, privacy, and claim-boundary flags", async () => {
    const [artifactPackage] = await loadPackages();

    expect(() =>
      agentResearchArtifactPackageSafetySchema.parse(artifactPackage!.safety)
    ).not.toThrow();
    expect(() =>
      agentResearchArtifactPackagePrivacySchema.parse(artifactPackage!.privacy)
    ).not.toThrow();
    expect(() =>
      agentResearchArtifactPackageClaimBoundariesSchema.parse(
        artifactPackage!.claimBoundaries
      )
    ).not.toThrow();
    expect(artifactPackage!.safety).toEqual({
      inert: true,
      syntheticOnly: true,
      executesAgent: false,
      executesCommands: false,
      executesPackageScripts: false,
      requiresNetwork: false,
      mutatesRepository: false,
      touchesRealSecrets: false,
      usesRealRepo: false,
      containsPrivateData: false,
      containsExecutableAction: false,
      changesRuntimeBehavior: false,
      createsCalibrationDataset: false,
      runsBaselineEvaluation: false
    });
    expect(artifactPackage!.privacy).toEqual({
      rawPromptIncluded: false,
      rawActionIncluded: false,
      rawCommandIncluded: false,
      rawDiffIncluded: false,
      rawSourceCodeIncluded: false,
      rawValidationLogIncluded: false,
      rawReviewIncluded: false,
      rawTraceIncluded: false,
      rawBaselineIncluded: false,
      realRepoNameIncluded: false,
      realPathIncluded: false,
      realUserIncluded: false,
      realEmailIncluded: false,
      secretIncluded: false,
      rawAgentOutputIncluded: false,
      reviewerIdentityIncluded: false,
      categoryOnly: true
    });
    expect(artifactPackage!.claimBoundaries).toEqual({
      syntheticOnly: true,
      realArtifactDataset: false,
      realBaselineEvaluation: false,
      realReviewCompleted: false,
      realReviewedTrace: false,
      actualRuntimeDecision: false,
      realAgentExecution: false,
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    });
  });

  it("keeps examples category-only and claim bounded", async () => {
    const [artifactPackage] = await loadPackages();

    validateResearchArtifactPackageSafety(artifactPackage!);
    expect(
      researchArtifactPackageContainsForbiddenRawString(artifactPackage)
    ).toBe(false);
    expect(artifactPackage!.claimBoundaries.realArtifactDataset).toBe(false);
    expect(artifactPackage!.claimBoundaries.calibrationDatasetCreated).toBe(
      false
    );
    expect(artifactPackage!.claimBoundaries.calibrationApplied).toBe(false);
    expect(
      artifactPackage!.claimBoundaries.conformalRiskControlImplemented
    ).toBe(false);
    expect(artifactPackage!.claimBoundaries.statisticalGuarantee).toBe(false);
  });
});
