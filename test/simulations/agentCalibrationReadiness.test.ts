import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentCalibrationReadinessArtifactKindValues,
  agentCalibrationReadinessAvailableInputValues,
  agentCalibrationReadinessBatchValues,
  agentCalibrationReadinessBlockerValues,
  agentCalibrationReadinessMissingEvidenceValues,
  agentCalibrationReadinessMissingInputValues,
  agentCalibrationReadinessPhase14ForbiddenClaimValues,
  agentCalibrationReadinessSchemaVersion,
  buildPhase14HandoffSummary,
  buildSyntheticCalibrationReadinessSummary,
  calibrationReadinessClaimBoundariesSchema,
  calibrationReadinessContainsForbiddenRawString,
  calibrationReadinessPrivacySchema,
  calibrationReadinessSafetySchema,
  calibrationReadinessSummarySchema,
  computeCalibrationReadinessMetrics,
  summarizeCalibrationReadiness,
  validateCalibrationManifest,
  validateCalibrationReadinessBoundaries,
  validateCalibrationReadinessSafety,
  validateCalibrationReadinessSummary,
  validateCalibrationRecords,
  validateLabelCompletenessReport,
  validateSplitPlanningReport,
  type CalibrationManifest,
  type CalibrationReadinessSummary,
  type CalibrationRecord,
  type LabelCompletenessReport,
  type SplitPlanningReport
} from "../../simulations/agent/calibration/index.js";

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

const loadLabelCompletenessReport =
  async (): Promise<LabelCompletenessReport> =>
    validateLabelCompletenessReport(
      await readJson(
        path.join(
          simulationRoot,
          "calibration",
          "example-label-completeness-report.json"
        )
      )
    );

const loadSplitPlanningReport = async (): Promise<SplitPlanningReport> =>
  validateSplitPlanningReport(
    await readJson(
      path.join(
        simulationRoot,
        "calibration",
        "example-split-planning-report.json"
      )
    )
  );

const loadReadinessSummary = async (): Promise<CalibrationReadinessSummary> =>
  validateCalibrationReadinessSummary(
    await readJson(
      path.join(
        simulationRoot,
        "calibration",
        "example-calibration-readiness-summary.json"
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
  createsCalibrationManifest: false,
  createsSplitManifest: false,
  assignsDatasetSplits: false,
  appliesCalibration: false,
  computesNumericLosses: false,
  computesRiskScores: false,
  computesNonconformityScores: false,
  computesThresholds: false,
  implementsConformalRiskControl: false,
  performsAdjudication: false,
  assignsReviewers: false
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
  rawAdjudicationDataIncluded: false,
  rawSplitDataIncluded: false,
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
  realCalibrationReadinessReport: false,
  realCalibrationManifest: false,
  realCalibrationDataset: false,
  realCalibrationRecord: false,
  realReviewedTrace: false,
  realHumanAdjudication: false,
  realReviewerAssigned: false,
  realAgentExecution: false,
  realStepHarborExecution: false,
  realValidationResult: false,
  realWorldResult: false,
  calibrationDatasetCreated: false,
  calibrationApplied: false,
  datasetSplitsAssigned: false,
  splitManifestCreated: false,
  numericLossesComputed: false,
  riskScoresComputed: false,
  nonconformityScoresComputed: false,
  thresholdsComputed: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent calibration readiness summary", () => {
  it("validates schema, deterministic ID, source, and completed phase metadata", async () => {
    const summary = await loadReadinessSummary();

    expect(summary.schemaVersion).toBe(agentCalibrationReadinessSchemaVersion);
    expect(summary.readinessSummaryId).toBe(
      "phase-13-calibration-readiness-summary-001"
    );
    expect(summary.readinessSummaryId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/
    );
    expect(summary.readinessSummaryId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(summary.source).toBe("synthetic_phase_13_readiness_summary");
    expect(summary.phase.completedBatches).toEqual([
      ...agentCalibrationReadinessBatchValues
    ]);
    expect(summary.phase.currentBatch).toBe("13.5");
    expect(summary.phase.phaseStatus).toBe(
      "complete_as_calibration_dataset_readiness_infrastructure_only"
    );
    expect(summary.phase.nextPhaseStatus).toBe(
      "phase-14-offline-conformal-crc-prototype-future"
    );

    expect(() =>
      calibrationReadinessSummarySchema.parse({
        ...summary,
        source: "real_calibration_readiness_summary"
      })
    ).toThrow();
  });

  it("summarizes completed batches and implemented artifacts without real calibration effects", async () => {
    const summary = await loadReadinessSummary();
    const batchIds = summary.completedPhase13Batches.map(
      (batch) => batch.batchId
    );
    const artifactKinds = summary.implementedReadinessArtifacts.artifacts.map(
      (artifact) => artifact.artifactKind
    );

    expect(batchIds).toEqual(["13.1", "13.2", "13.3", "13.4", "13.5"]);
    for (const batch of summary.completedPhase13Batches) {
      expect(batch.createsRealCalibrationData).toBe(false);
      expect(batch.appliesCalibration).toBe(false);
      expect(batch.implementsConformalRiskControl).toBe(false);
      expect(batch.changesRuntimeBehavior).toBe(false);
    }

    expect(artifactKinds).toEqual([
      ...agentCalibrationReadinessArtifactKindValues
    ]);
    for (const artifact of summary.implementedReadinessArtifacts.artifacts) {
      expect(artifact.syntheticOnly).toBe(true);
      expect(artifact.realCalibrationData).toBe(false);
      expect(artifact.runtimeIntegrated).toBe(false);
      expect(artifact.calibrationApplied).toBe(false);
      expect(artifact.conformalImplemented).toBe(false);
    }
  });

  it("keeps required missing evidence and blockers unresolved", async () => {
    const summary = await loadReadinessSummary();

    expect(summary.missingEvidenceSummary.missingEvidenceCategories).toEqual([
      ...agentCalibrationReadinessMissingEvidenceValues
    ]);
    expect(summary.missingEvidenceSummary.allRequiredEvidenceStillFuture).toBe(
      true
    );
    expect(summary.missingEvidenceSummary.realEvidenceIncluded).toBe(false);
    expect(
      summary.blockerSummary.blockers.map((blocker) => blocker.blockerCategory)
    ).toEqual([...agentCalibrationReadinessBlockerValues]);
    expect(summary.blockerSummary.unresolvedBlockerCount).toBe(
      agentCalibrationReadinessBlockerValues.length
    );

    for (const blocker of summary.blockerSummary.blockers) {
      expect(blocker.resolutionRequiresFutureBatch).toBe(true);
      expect(blocker.resolved).toBe(false);
    }
  });

  it("records dataset, label, and split readiness without real data, labels, or splits", async () => {
    const summary = await loadReadinessSummary();

    expect(summary.datasetReadinessSummary).toEqual({
      schemaExists: true,
      inclusionCriteriaExist: true,
      manifestLayerExists: true,
      labelCompletenessLayerExists: true,
      splitPlanningLayerExists: true,
      realCalibrationDatasetExists: false,
      realCalibrationRecordsExist: false,
      eligibleReviewedTracePoolExists: false,
      datasetExportWorkflowExists: false,
      calibrationDatasetApproved: false
    });
    expect(summary.labelReadinessSummary).toEqual({
      labelSchemaExists: true,
      labelCompletenessWorkflowExists: true,
      adjudicationReadinessWorkflowExists: true,
      realHumanReviewPerformed: false,
      realHumanAdjudicationPerformed: false,
      realReviewerAssigned: false,
      labelCompletenessReportIsSyntheticOnly: true,
      realCalibrationLabelsExist: false
    });
    expect(summary.splitReadinessSummary).toEqual({
      splitPlanningSchemaExists: true,
      leakageCheckLayerExists: true,
      futureSplitCategoriesDefined: true,
      leakageRiskCategoriesDefined: true,
      realTrainCalibrationTestSplitAssigned: false,
      splitManifestExists: false,
      realDatasetSplitExists: false,
      conformalCalibrationSplitExists: false
    });
  });

  it("defines Phase 14 handoff inputs and forbidden starting claims", async () => {
    const summary = await loadReadinessSummary();

    expect(summary.phase14HandoffSummary).toEqual(buildPhase14HandoffSummary());
    expect(
      summary.phase14HandoffSummary.handoffReadyForOfflinePrototypeDesign
    ).toBe(true);
    expect(summary.phase14HandoffSummary.handoffReadyForRealCalibration).toBe(
      false
    );
    expect(summary.phase14HandoffSummary.handoffReadyForProductionRouting).toBe(
      false
    );
    expect(summary.phase14HandoffSummary.availableInputs).toEqual([
      ...agentCalibrationReadinessAvailableInputValues
    ]);
    expect(summary.phase14HandoffSummary.missingInputs).toEqual([
      ...agentCalibrationReadinessMissingInputValues
    ]);
    expect(
      summary.phase14HandoffSummary.phase14ForbiddenStartingClaims
    ).toEqual([...agentCalibrationReadinessPhase14ForbiddenClaimValues]);
  });

  it("computes deterministic readiness metrics without performance or calibration metrics", async () => {
    const summary = await loadReadinessSummary();
    const metrics = computeCalibrationReadinessMetrics(summary);
    const metricNames = Object.keys(metrics).join("\n");

    expect(metrics).toEqual({
      completedPhase13BatchCount: 5,
      implementedReadinessArtifactCount: 11,
      syntheticSchemaExampleCount: 5,
      syntheticManifestCount: 1,
      syntheticLabelCompletenessReportCount: 1,
      syntheticSplitPlanningReportCount: 1,
      realCalibrationDatasetCount: 0,
      realCalibrationRecordCount: 0,
      realReviewedTraceCount: 0,
      realHumanAdjudicationCount: 0,
      realSplitManifestCount: 0,
      realTrainCalibrationTestSplitCount: 0,
      numericLossFunctionCount: 0,
      riskScoreCount: 0,
      nonconformityScoreCount: 0,
      thresholdCount: 0,
      conformalImplementationCount: 0,
      productionRoutingChangeCount: 0
    });
    expect(summarizeCalibrationReadiness(summary)).toEqual({
      readinessSummaryId: "phase-13-calibration-readiness-summary-001",
      phaseStatus:
        "complete_as_calibration_dataset_readiness_infrastructure_only",
      completedPhase13BatchCount: 5,
      realCalibrationDatasetCount: 0,
      conformalImplementationCount: 0,
      productionRoutingChangeCount: 0
    });

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

  it("enforces exact safety, privacy, claim-boundary, and zero-boundary flags", async () => {
    const summary = await loadReadinessSummary();

    expect(summary.safety).toEqual(exactSafety);
    expect(summary.privacy).toEqual(exactPrivacy);
    expect(summary.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() =>
      calibrationReadinessSafetySchema.parse(summary.safety)
    ).not.toThrow();
    expect(() =>
      calibrationReadinessPrivacySchema.parse(summary.privacy)
    ).not.toThrow();
    expect(() =>
      calibrationReadinessClaimBoundariesSchema.parse(summary.claimBoundaries)
    ).not.toThrow();
    expect(summary.boundarySummary).toEqual({
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      splitBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    });
    expect(() => validateCalibrationReadinessBoundaries(summary)).not.toThrow();
    expect(() => validateCalibrationReadinessSafety(summary)).not.toThrow();
    expect(calibrationReadinessContainsForbiddenRawString(summary)).toBe(false);
  });

  it("builds the same summary deterministically from synthetic Phase 13 artifacts", async () => {
    const records = await loadCalibrationRecords();
    const manifest = await loadManifest();
    const labelCompletenessReport = await loadLabelCompletenessReport();
    const splitPlanningReport = await loadSplitPlanningReport();
    const expectedSummary = await loadReadinessSummary();
    const builtSummary = buildSyntheticCalibrationReadinessSummary({
      readinessSummaryId: "phase-13-calibration-readiness-summary-001",
      records,
      manifest,
      labelCompletenessReport,
      splitPlanningReport
    });
    const rebuiltSummary = buildSyntheticCalibrationReadinessSummary({
      readinessSummaryId: "phase-13-calibration-readiness-summary-001",
      records,
      manifest,
      labelCompletenessReport,
      splitPlanningReport
    });

    expect(builtSummary).toEqual(expectedSummary);
    expect(rebuiltSummary).toEqual(expectedSummary);
    expect(calibrationReadinessContainsForbiddenRawString(builtSummary)).toBe(
      false
    );
  });

  it("keeps the builder pure, non-executing, non-mutating, and local-only by source inspection", async () => {
    const source = await readFile(
      path.join(simulationRoot, "calibration", "calibrationReadinessSchema.ts"),
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
});
