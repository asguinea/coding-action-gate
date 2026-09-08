import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCodexLikeActionInput,
  type CodexLikeActionInput
} from "../../simulations/agent/adapters/codexActionAdapterSchema.js";
import {
  validateBaselineComparisonRecords,
  type BaselineComparisonRecord
} from "../../simulations/agent/baselines/index.js";
import {
  computeCalibrationSchemaReadinessSummary,
  calibrationRecordContainsForbiddenRawString,
  calibrationRecordSchema,
  agentCalibrationRecordClaimBoundariesSchema,
  agentCalibrationRecordPrivacySchema,
  agentCalibrationRecordSafetySchema,
  agentCalibrationRecordSchemaVersion,
  agentCalibrationRecordSourceValues,
  agentCalibrationFutureSplitCategoryValues,
  validateCalibrationRecordSafety,
  validateCalibrationRecords,
  validateCalibrationSourceArtifactLinkage,
  type CalibrationRecord
} from "../../simulations/agent/calibration/index.js";
import {
  loadExampleResearchArtifactPackages,
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

const loadCalibrationRecords = async (): Promise<CalibrationRecord[]> => {
  const records = validateCalibrationRecords(
    asArray(
      await readJson(
        path.join(
          simulationRoot,
          "calibration",
          "example-calibration-records.json"
        )
      )
    )
  );

  for (const record of records) {
    validateCalibrationRecordSafety(record);
  }

  return records;
};

const loadReviews = async (): Promise<TraceReviewRecord[]> =>
  validateTraceReviewRecords(
    asArray(
      await readJson(
        path.join(simulationRoot, "review", "example-review-records.json")
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

const loadArtifactPackages = async (): Promise<ResearchArtifactPackage[]> =>
  loadExampleResearchArtifactPackages(
    asArray(
      await readJson(
        path.join(simulationRoot, "artifacts", "example-artifact-package.json")
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

const exactSafety = {
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
  appliesCalibration: false,
  implementsConformalRiskControl: false
} as const;

const exactPrivacy = {
  rawPromptIncluded: false,
  rawActionIncluded: false,
  rawCommandIncluded: false,
  rawDiffIncluded: false,
  rawSourceCodeIncluded: false,
  rawValidationLogIncluded: false,
  rawReviewIncluded: false,
  rawTraceIncluded: false,
  rawBaselineIncluded: false,
  rawCalibrationDataIncluded: false,
  realRepoNameIncluded: false,
  realPathIncluded: false,
  realUserIncluded: false,
  realEmailIncluded: false,
  secretIncluded: false,
  rawAgentOutputIncluded: false,
  reviewerIdentityIncluded: false,
  categoryOnly: true
} as const;

const exactClaimBoundaries = {
  syntheticOnly: true,
  realCalibrationRecord: false,
  realReviewedTrace: false,
  realAgentExecution: false,
  realCodingActionGateExecution: false,
  realValidationResult: false,
  realWorldResult: false,
  calibrationDatasetCreated: false,
  calibrationApplied: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent calibration dataset schema", () => {
  it("validates required top-level fields, deterministic IDs, and controlled source", async () => {
    const records = await loadCalibrationRecords();
    const recordIds = records.map((record) => record.calibrationRecordId);

    expect(agentCalibrationRecordSchemaVersion).toBe(
      "agent-calibration-record.v1"
    );
    expect(agentCalibrationRecordSourceValues).toContain(
      "synthetic_schema_example"
    );
    expect(records).toHaveLength(5);
    expect(recordIds).toEqual([...recordIds].sort());
    expect(new Set(recordIds).size).toBe(recordIds.length);

    for (const record of records) {
      expect(record.schemaVersion).toBe(agentCalibrationRecordSchemaVersion);
      expect(record.calibrationRecordId).toMatch(
        /^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
      );
      expect(record.source).toBe("synthetic_schema_example");
      expect(record.sourceArtifact).toBeDefined();
      expect(record.decisionContext).toBeDefined();
      expect(record.reviewedDecisionLabels).toBeDefined();
      expect(record.uncertaintyLabels).toBeDefined();
      expect(record.agentBehaviorLabels).toBeDefined();
      expect(record.outcomeLabels).toBeDefined();
      expect(record.frictionLabels).toBeDefined();
      expect(record.coverageLabels).toBeDefined();
      expect(record.futureLossLabels).toBeDefined();
      expect(record.splitEligibility).toBeDefined();
      expect(record.calibrationEligibility).toBeDefined();
      expect(record.safety).toEqual(exactSafety);
      expect(record.privacy).toEqual(exactPrivacy);
      expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    }
  });

  it("rejects uncontrolled enum labels and unsafe boundary flags", async () => {
    const [record] = await loadCalibrationRecords();

    expect(record).toBeDefined();
    expect(() =>
      calibrationRecordSchema.parse({
        ...record!,
        source: "real_private_calibration_record"
      })
    ).toThrow();
    expect(() =>
      calibrationRecordSchema.parse({
        ...record!,
        reviewedDecisionLabels: {
          ...record!.reviewedDecisionLabels,
          productionDecisionAppropriateness: "free_text"
        }
      })
    ).toThrow();
    expect(() =>
      agentCalibrationRecordSafetySchema.parse({
        ...record!.safety,
        executesAgent: true
      })
    ).toThrow();
    expect(() =>
      agentCalibrationRecordPrivacySchema.parse({
        ...record!.privacy,
        rawPromptIncluded: true
      })
    ).toThrow();
    expect(() =>
      agentCalibrationRecordClaimBoundariesSchema.parse({
        ...record!.claimBoundaries,
        calibrationApplied: true
      })
    ).toThrow();
  });

  it("links source artifacts to existing Phase 12 synthetic assets", async () => {
    const records = await loadCalibrationRecords();
    const reviewsById = new Map(
      (await loadReviews()).map((review) => [review.reviewId, review])
    );
    const tracesById = new Map(
      (await loadTraces()).map((trace) => [trace.traceId, trace])
    );
    const runsById = new Map((await loadRuns()).map((run) => [run.runId, run]));
    const baselinesById = new Map(
      (await loadBaselines()).map((comparison) => [
        comparison.comparisonId,
        comparison
      ])
    );
    const artifactPackagesById = new Map(
      (await loadArtifactPackages()).map((artifactPackage) => [
        artifactPackage.artifactPackageId,
        artifactPackage
      ])
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

    const context = {
      reviewIds: new Set(reviewsById.keys()),
      traceIds: new Set(tracesById.keys()),
      runIds: new Set(runsById.keys()),
      baselineComparisonIds: new Set(baselinesById.keys()),
      artifactPackageIds: new Set(artifactPackagesById.keys()),
      personaIds,
      scenarioIds: new Set(scenariosById.keys()),
      fixtureRefs: new Set(fixturesById.keys()),
      adapterInputIds: new Set(adapterInputsById.keys())
    };

    for (const record of records) {
      const artifact = record.sourceArtifact;

      validateCalibrationSourceArtifactLinkage(record, context);
      expect(artifact.rawArtifactIncluded).toBe(false);
      expect(personaIds.has(artifact.personaId)).toBe(true);
      expect(scenariosById.get(artifact.scenarioId)?.personaIds).toContain(
        artifact.personaId
      );

      if (artifact.reviewId !== undefined) {
        const review = reviewsById.get(artifact.reviewId);

        expect(review).toBeDefined();
        expect(review?.source).toBe("synthetic_example_review");
        expect(review?.reviewedArtifact.personaId).toBe(artifact.personaId);
        expect(review?.reviewedArtifact.scenarioId).toBe(artifact.scenarioId);
      }

      if (artifact.traceId !== undefined) {
        const trace = tracesById.get(artifact.traceId);

        expect(trace).toBeDefined();
        expect(trace?.personaId).toBe(artifact.personaId);
        expect(trace?.scenarioId).toBe(artifact.scenarioId);
      }

      if (artifact.runId !== undefined) {
        const run = runsById.get(artifact.runId);

        expect(run).toBeDefined();
        expect(run?.personaId).toBe(artifact.personaId);
        expect(run?.scenarioId).toBe(artifact.scenarioId);
        expect(run?.adapterInputId).toBe(artifact.adapterInputId);
        expect(run?.normalizedActionId).toBe(artifact.normalizedActionId);
      }

      if (artifact.baselineComparisonId !== undefined) {
        const baseline = baselinesById.get(artifact.baselineComparisonId);

        expect(baseline).toBeDefined();
        expect(baseline?.comparedArtifact.personaId).toBe(artifact.personaId);
        expect(baseline?.comparedArtifact.scenarioId).toBe(artifact.scenarioId);
      }

      if (artifact.artifactPackageId !== undefined) {
        expect(artifactPackagesById.has(artifact.artifactPackageId)).toBe(true);
      }

      for (const fixtureRef of artifact.fixtureRefs) {
        const fixture = fixturesById.get(fixtureRef);

        expect(fixture).toBeDefined();
        expect(fixture?.linkedScenarioIds).toContain(artifact.scenarioId);
      }
    }
  });

  it("keeps examples synthetic-only and covers DEFER, ESCALATE, and BLOCK", async () => {
    const records = await loadCalibrationRecords();
    const decisions = new Set(
      records.map((record) => record.decisionContext.productionDecisionCategory)
    );

    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.length).toBeLessThanOrEqual(6);
    expect(decisions.has("DEFER")).toBe(true);
    expect(decisions.has("MIXED")).toBe(true);
    expect(decisions.has("BLOCK")).toBe(true);

    for (const record of records) {
      expect(record.source).toBe("synthetic_schema_example");
      expect(record.reviewedDecisionLabels.labelSourceCategory).toBe(
        "synthetic_review_label"
      );
      expect(record.reviewedDecisionLabels.reviewedByHuman).toBe(false);
      expect(record.decisionContext.decisionWasRuntimeActual).toBe(false);
      expect(record.agentBehaviorLabels.agentBehaviorObserved).toBe(false);
      expect(record.outcomeLabels.realOutcomeObserved).toBe(false);
      expect(record.frictionLabels.developerFrictionObserved).toBe(false);
      expect(record.coverageLabels.coverageGapObservedInRealUse).toBe(false);
      expect(record.calibrationEligibility.calibrationDatasetCreated).toBe(
        false
      );
      expect(record.calibrationEligibility.calibrationApplied).toBe(false);
      expect(record.calibrationEligibility.conformalUsed).toBe(false);
      expect(record.calibrationEligibility.statisticalGuaranteeClaimed).toBe(
        false
      );
    }
  });

  it("enforces future loss-label boundaries without numeric losses or scores", async () => {
    const records = await loadCalibrationRecords();
    const serialized = JSON.stringify(records);

    for (const record of records) {
      expect(record.futureLossLabels.lossFieldsPresent).toBe(false);
      expect(record.futureLossLabels.lossValuesComputed).toBe(false);
      expect(
        record.futureLossLabels.futureLossLabelCategories.length
      ).toBeGreaterThan(0);
    }

    for (const forbidden of [
      /nonconformity/i,
      /threshold/i,
      /\balpha\b/i,
      /coverage guarantee/i,
      /empirical risk guarantee/i,
      /risk score/i
    ]) {
      expect(serialized).not.toMatch(forbidden);
    }
  });

  it("enforces split and calibration eligibility boundaries", async () => {
    const records = await loadCalibrationRecords();
    const summary = computeCalibrationSchemaReadinessSummary(records);

    expect(summary.totalRecords).toBe(records.length);
    expect(summary.syntheticSchemaExampleCount).toBe(records.length);
    expect(summary.futureCalibrationEligibleAsIsCount).toBe(0);
    expect(summary.splitAssignedCount).toBe(0);
    expect(summary.lossFieldsPresentCount).toBe(0);
    expect(summary.lossValuesComputedCount).toBe(0);
    expect(summary.calibrationDatasetCreatedCount).toBe(0);
    expect(summary.calibrationAppliedCount).toBe(0);
    expect(summary.conformalUsedCount).toBe(0);
    expect(summary.statisticalGuaranteeClaimedCount).toBe(0);

    for (const record of records) {
      expect(record.splitEligibility.splitAssigned).toBe(false);
      expect(record.splitEligibility.allowedFutureSplitCategories).toEqual([
        "not_eligible"
      ]);
      for (const split of record.splitEligibility
        .allowedFutureSplitCategories) {
        expect(agentCalibrationFutureSplitCategoryValues).toContain(split);
      }
      expect(record.calibrationEligibility.suitableForCalibrationAsIs).toBe(
        false
      );
      expect(record.claimBoundaries.realCalibrationRecord).toBe(false);
    }
  });

  it("rejects forbidden raw-looking content in examples", async () => {
    const records = await loadCalibrationRecords();

    expect(calibrationRecordContainsForbiddenRawString(records)).toBe(false);
    expect(
      calibrationRecordContainsForbiddenRawString({
        ...records[0],
        notes: ["npm run forbidden_raw_command"]
      })
    ).toBe(true);
  });
});
