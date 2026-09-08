import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateBaselineComparisonRecords,
  type BaselineComparisonRecord
} from "../../simulations/agent/baselines/index.js";
import {
  calibrationManifestClaimBoundariesSchema,
  agentCalibrationManifestEligibilityCategoryValues,
  calibrationManifestPrivacySchema,
  calibrationManifestSafetySchema,
  agentCalibrationManifestSchemaVersion,
  buildSyntheticCalibrationManifest,
  calibrationManifestContainsForbiddenRawString,
  calibrationManifestSchema,
  computeCalibrationManifestMetrics,
  summarizeCalibrationManifest,
  validateCalibrationManifest,
  validateCalibrationManifestBoundaries,
  validateCalibrationManifestSafety,
  validateCalibrationManifestSourceLinkage,
  validateCalibrationRecords,
  type CalibrationManifest,
  type CalibrationRecord
} from "../../simulations/agent/calibration/index.js";
import {
  loadExampleResearchArtifactPackages,
  type ResearchArtifactPackage
} from "../../simulations/agent/artifacts/index.js";
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

const loadCalibrationRecords = async (): Promise<CalibrationRecord[]> =>
  validateCalibrationRecords(
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

const loadManifest = async (): Promise<CalibrationManifest> =>
  validateCalibrationManifest(
    await readJson(
      path.join(
        simulationRoot,
        "calibration",
        "example-calibration-manifest.json"
      )
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
  implementsConformalRiskControl: false,
  assignsDatasetSplits: false,
  computesThresholds: false
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
  rawManifestDataIncluded: false,
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
  realCalibrationManifest: false,
  realCalibrationDataset: false,
  realCalibrationRecord: false,
  realReviewedTrace: false,
  realAgentExecution: false,
  realStepHarborExecution: false,
  realValidationResult: false,
  realWorldResult: false,
  calibrationDatasetCreated: false,
  calibrationApplied: false,
  datasetSplitsAssigned: false,
  thresholdsComputed: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent calibration dataset manifest", () => {
  it("validates manifest schema, deterministic ID, source, and phase metadata", async () => {
    const manifest = await loadManifest();

    expect(manifest.schemaVersion).toBe(agentCalibrationManifestSchemaVersion);
    expect(manifest.manifestId).toBe("calibration-synthetic-manifest-001");
    expect(manifest.manifestId).toMatch(
      /^calibration[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
    );
    expect(manifest.manifestId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|repo|user|email/i
    );
    expect(manifest.source).toBe("synthetic_schema_manifest");
    expect(manifest.phase.completedBatches).toEqual(["13.1"]);
    expect(manifest.phase.currentBatch).toBe("13.2");
    expect(manifest.phase.futureBatches).toEqual(["13.3", "13.4", "13.5"]);
    expect(manifest.phase.previousPhaseStatus).toBe(
      "phase-12-complete-synthetic-design-readiness-only"
    );
    expect(manifest.phase.nextPhaseStatus).toBe(
      "phase-14-offline-conformal-crc-prototype-future"
    );

    expect(() =>
      calibrationManifestSchema.parse({
        ...manifest,
        source: "real_calibration_manifest"
      })
    ).toThrow();
  });

  it("summarizes every 13.1 synthetic schema example without raw records", async () => {
    const manifest = await loadManifest();
    const records = await loadCalibrationRecords();
    const recordIds = new Set(
      records.map((record) => record.calibrationRecordId)
    );

    expect(manifest.sourceRecords).toHaveLength(records.length);
    expect(
      manifest.sourceRecords.some((record) =>
        [
          "excluded_synthetic_example_only",
          "excluded_not_real_calibration_data"
        ].includes(record.eligibilityCategory)
      )
    ).toBe(true);

    for (const sourceRecord of manifest.sourceRecords) {
      expect(recordIds.has(sourceRecord.calibrationRecordId)).toBe(true);
      expect(sourceRecord.sourceRecordKind).toBe("synthetic_schema_example");
      expect(agentCalibrationManifestEligibilityCategoryValues).toContain(
        sourceRecord.eligibilityCategory
      );
      expect(sourceRecord.safeForManifest).toBe(true);
      expect(sourceRecord.rawRecordIncluded).toBe(false);
      expect(sourceRecord.exclusionReasonCategories).toContain(
        "synthetic_schema_example_only"
      );
      expect(sourceRecord.exclusionReasonCategories).toContain(
        "not_real_calibration_data"
      );
      expect(sourceRecord.sourceRecordKind).not.toBe(
        "future_controlled_reviewed_trace"
      );
      expect(sourceRecord.sourceRecordKind).not.toBe(
        "future_real_trial_reviewed_trace"
      );
    }
  });

  it("validates source artifact linkage to existing synthetic Phase 12 and Phase 13 IDs", async () => {
    const manifest = await loadManifest();
    const records = await loadCalibrationRecords();
    const reviews = await loadReviews();
    const traces = await loadTraces();
    const runs = await loadRuns();
    const baselines = await loadBaselines();
    const artifactPackages = await loadArtifactPackages();

    validateCalibrationManifestSourceLinkage(manifest, {
      calibrationRecordIds: new Set(
        records.map((record) => record.calibrationRecordId)
      ),
      reviewIds: new Set(reviews.map((review) => review.reviewId)),
      traceIds: new Set(traces.map((trace) => trace.traceId)),
      runIds: new Set(runs.map((run) => run.runId)),
      baselineComparisonIds: new Set(
        baselines.map((comparison) => comparison.comparisonId)
      ),
      artifactPackageIds: new Set(
        artifactPackages.map((artifact) => artifact.artifactPackageId)
      )
    });

    expect(manifest.linkageSummary.totalRecordsWithReviewLink).toBe(5);
    expect(manifest.linkageSummary.totalRecordsWithTraceLink).toBe(4);
    expect(manifest.linkageSummary.totalRecordsWithRunLink).toBe(5);
    expect(manifest.linkageSummary.totalRecordsWithBaselineComparisonLink).toBe(
      5
    );
    expect(manifest.linkageSummary.totalRecordsWithArtifactPackageLink).toBe(5);
    expect(manifest.linkageSummary.unresolvedLinkCount).toBe(0);
    expect(manifest.linkageSummary.rawLinkedArtifactIncluded).toBe(false);
  });

  it("computes deterministic eligibility, exclusion, label, split, and calibration summaries", async () => {
    const manifest = await loadManifest();
    const records = await loadCalibrationRecords();
    const metrics = computeCalibrationManifestMetrics(manifest);
    const summary = summarizeCalibrationManifest(manifest);

    expect(manifest.eligibilitySummary.totalSourceRecords).toBe(records.length);
    expect(
      manifest.eligibilitySummary.structurallyEligibleFutureCandidateCount
    ).toBe(2);
    expect(manifest.eligibilitySummary.needsAdditionalReviewLabelsCount).toBe(
      1
    );
    expect(manifest.eligibilitySummary.needsAdjudicationCount).toBe(1);
    expect(manifest.eligibilitySummary.excludedSyntheticExampleOnlyCount).toBe(
      5
    );
    expect(manifest.eligibilitySummary.excludedBoundaryViolationCount).toBe(0);
    expect(manifest.eligibilitySummary.excludedInsufficientLinkageCount).toBe(
      0
    );
    expect(
      manifest.eligibilitySummary.excludedNotRealCalibrationDataCount
    ).toBe(5);
    expect(manifest.eligibilitySummary.realCalibrationRecordCount).toBe(0);

    expect(
      Object.fromEntries(
        manifest.exclusionSummary.exclusionCounts.map((entry) => [
          entry.exclusionReasonCategory,
          entry.recordCount
        ])
      )
    ).toMatchObject({
      synthetic_schema_example_only: 5,
      not_real_reviewed_trace: 5,
      not_real_calibration_data: 5,
      missing_required_labels: 1,
      needs_adjudication: 3,
      boundary_violation: 0,
      insufficient_source_linkage: 0,
      raw_private_data_present: 0,
      raw_agent_output_present: 0,
      calibration_boundary_not_satisfied: 5,
      split_not_assigned: 5,
      future_trace_required: 5
    });

    expect(manifest.labelReadinessSummary).toMatchObject({
      totalRecords: 5,
      recordsWithDecisionLabels: 5,
      recordsWithUncertaintyLabels: 5,
      recordsWithAgentBehaviorLabels: 5,
      recordsWithOutcomeLabels: 5,
      recordsWithFrictionLabels: 5,
      recordsWithCoverageLabels: 5,
      recordsWithFutureLossLabelCandidates: 5,
      recordsMissingRequiredLabels: 5,
      recordsNeedingAdjudication: 3,
      realHumanReviewedRecordCount: 0
    });
    expect(manifest.splitReadinessSummary).toMatchObject({
      totalRecords: 5,
      splitAssignedCount: 0,
      futureSplitCandidateCount: 0,
      notEligibleForSplitCount: 5,
      leakageRiskCategories: ["high", "low", "medium"],
      splitManifestCreated: false
    });
    expect(manifest.calibrationReadinessSummary).toMatchObject({
      totalRecords: 5,
      futureCalibrationCandidateCount: 2,
      notCalibrationReadyCount: 5,
      syntheticExampleOnlyCount: 5,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      conformalUsed: false,
      statisticalGuaranteeClaimed: false,
      suitableForCalibrationAsIsCount: 0
    });
    expect(metrics).toMatchObject({
      totalManifestRecords: 5,
      syntheticSchemaExampleCount: 5,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realCalibrationRecordCount: 0,
      realReviewedTraceCount: 0,
      unresolvedLinkCount: 0,
      missingRequiredLabelCount: 5,
      adjudicationNeededCount: 3,
      splitAssignedCount: 0,
      calibrationDatasetCreatedCount: 0,
      calibrationAppliedCount: 0,
      thresholdComputedCount: 0,
      conformalImplementationCount: 0
    });
    expect(summary).toEqual({
      manifestId: "calibration-synthetic-manifest-001",
      totalManifestRecords: 5,
      syntheticSchemaExampleCount: 5,
      realCalibrationRecordCount: 0,
      calibrationDatasetCreated: false
    });
  });

  it("enforces exact safety, privacy, claim-boundary, and no-real-data flags", async () => {
    const manifest = await loadManifest();

    expect(manifest.safety).toEqual(exactSafety);
    expect(manifest.privacy).toEqual(exactPrivacy);
    expect(manifest.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() =>
      calibrationManifestSafetySchema.parse(manifest.safety)
    ).not.toThrow();
    expect(() =>
      calibrationManifestPrivacySchema.parse(manifest.privacy)
    ).not.toThrow();
    expect(() =>
      calibrationManifestClaimBoundariesSchema.parse(manifest.claimBoundaries)
    ).not.toThrow();
    expect(manifest.boundarySummary).toEqual({
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    });
    expect(() => validateCalibrationManifestBoundaries(manifest)).not.toThrow();
    expect(() => validateCalibrationManifestSafety(manifest)).not.toThrow();
    expect(calibrationManifestContainsForbiddenRawString(manifest)).toBe(false);
    expect(manifest.claimBoundaries.realCalibrationManifest).toBe(false);
    expect(manifest.claimBoundaries.realCalibrationDataset).toBe(false);
    expect(manifest.claimBoundaries.datasetSplitsAssigned).toBe(false);
    expect(manifest.claimBoundaries.thresholdsComputed).toBe(false);
    expect(manifest.claimBoundaries.productionRoutingChanged).toBe(false);
  });

  it("builds the same boundary-safe manifest deterministically from imported synthetic examples", async () => {
    const records = await loadCalibrationRecords();
    const expectedManifest = await loadManifest();
    const builtManifest = buildSyntheticCalibrationManifest({
      manifestId: "calibration-synthetic-manifest-001",
      records
    });
    const rebuiltManifest = buildSyntheticCalibrationManifest({
      manifestId: "calibration-synthetic-manifest-001",
      records
    });

    expect(builtManifest).toEqual(expectedManifest);
    expect(rebuiltManifest).toEqual(expectedManifest);
    expect(calibrationManifestContainsForbiddenRawString(builtManifest)).toBe(
      false
    );
  });

  it("keeps the builder pure and non-executing by source inspection", async () => {
    const source = await readFile(
      path.join(simulationRoot, "calibration", "calibrationManifestSchema.ts"),
      "utf8"
    );

    for (const forbidden of [
      "readFile",
      "writeFile",
      "appendFile",
      "fetch(",
      "exec(",
      "spawn(",
      "child_process",
      "createWriteStream"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not expose empirical, calibration, threshold, or conformal metrics", async () => {
    const manifest = await loadManifest();
    const metricNames = Object.keys(manifest.metrics).join("\n");

    for (const forbidden of [
      /accuracy/i,
      /precision/i,
      /recall/i,
      /\bf1\b/i,
      /risk_reduction/i,
      /calibrated_risk/i,
      /\balpha\b/i,
      /coverage_guarantee/i,
      /p[-_]?value/i,
      /statistical_confidence/i,
      /productivity_impact/i
    ]) {
      expect(metricNames).not.toMatch(forbidden);
    }
  });
});
