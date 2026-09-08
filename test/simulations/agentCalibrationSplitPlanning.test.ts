import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentCalibrationRequiredBeforeSplitValues,
  agentCalibrationSplitExclusionTriggerValues,
  agentCalibrationSplitFutureCategoryValues,
  agentCalibrationSplitGroupingKeyValues,
  agentCalibrationSplitLeakageRiskValues,
  agentCalibrationSplitPlanningSchemaVersion,
  agentCalibrationSplitReadinessStatusValues,
  agentCalibrationSplitRecordKindValues,
  buildSyntheticSplitPlanningReport,
  computeSplitPlanningMetrics,
  detectSyntheticLeakageRisks,
  splitPlanningClaimBoundariesSchema,
  splitPlanningContainsForbiddenRawString,
  splitPlanningPrivacySchema,
  splitPlanningReportSchema,
  splitPlanningSafetySchema,
  summarizeFutureSplitReadiness,
  summarizeSplitPlanningReport,
  validateCalibrationManifest,
  validateCalibrationRecords,
  validateLabelCompletenessReport,
  validateSplitPlanningBoundaries,
  validateSplitPlanningReport,
  validateSplitPlanningSafety,
  type CalibrationManifest,
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

const loadReport = async (): Promise<SplitPlanningReport> =>
  validateSplitPlanningReport(
    await readJson(
      path.join(
        simulationRoot,
        "calibration",
        "example-split-planning-report.json"
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
  createsSplitManifest: false,
  computesThresholds: false,
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
  realSplitPlanningReport: false,
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
  thresholdsComputed: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent calibration split planning", () => {
  it("validates report schema, deterministic ID, source, and phase metadata", async () => {
    const report = await loadReport();

    expect(report.schemaVersion).toBe(
      agentCalibrationSplitPlanningSchemaVersion
    );
    expect(report.reportId).toBe(
      "calibration-split-planning-synthetic-report-001"
    );
    expect(report.reportId).toMatch(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);
    expect(report.reportId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(report.source).toBe("synthetic_schema_split_planning_report");
    expect(report.phase.completedBatches).toEqual(["13.1", "13.2", "13.3"]);
    expect(report.phase.currentBatch).toBe("13.4");
    expect(report.phase.futureBatches).toEqual(["13.5"]);
    expect(report.phase.nextPhaseStatus).toBe(
      "phase-14-offline-conformal-crc-prototype-future"
    );

    expect(() =>
      splitPlanningReportSchema.parse({
        ...report,
        source: "real_split_planning_report"
      })
    ).toThrow();
  });

  it("defines controlled split policy categories without allowing assignments", async () => {
    const report = await loadReport();

    expect(report.splitPolicy.allowedFutureSplitCategories).toEqual([
      ...agentCalibrationSplitFutureCategoryValues
    ]);
    expect(report.splitPolicy.leakageRiskCategories).toEqual([
      ...agentCalibrationSplitLeakageRiskValues
    ]);
    expect(report.splitPolicy.groupingKeys).toEqual([
      ...agentCalibrationSplitGroupingKeyValues
    ]);
    expect(report.splitPolicy.exclusionTriggerCategories).toEqual([
      ...agentCalibrationSplitExclusionTriggerValues
    ]);
    expect(report.splitPolicy.splitAssignmentAllowed).toBe(false);
    expect(report.splitPolicy.realReviewedTracesRequiredForRealSplit).toBe(
      true
    );
    expect(report.splitPolicy.syntheticExamplesCanBeAssignedToRealSplit).toBe(
      false
    );
  });

  it("evaluates every synthetic source record without assigning real splits", async () => {
    const report = await loadReport();
    const records = await loadCalibrationRecords();
    const manifest = await loadManifest();
    const labelReport = await loadLabelCompletenessReport();
    const recordIds = new Set(
      records.map((record) => record.calibrationRecordId)
    );
    const manifestRecordIds = new Set(
      manifest.sourceRecords.map((record) => record.calibrationRecordId)
    );
    const labelRecordIds = new Set(
      labelReport.evaluatedRecords.map((record) => record.calibrationRecordId)
    );

    expect(report.evaluatedRecords).toHaveLength(records.length);
    expect(
      report.evaluatedRecords.some((record) =>
        [
          "needs_adjudication_before_future_split",
          "needs_labels_before_future_split"
        ].includes(record.splitReadinessStatus)
      )
    ).toBe(true);
    expect(
      report.evaluatedRecords.some(
        (record) =>
          record.splitReadinessStatus === "synthetic_example_only_not_real_data"
      )
    ).toBe(true);

    for (const evaluatedRecord of report.evaluatedRecords) {
      expect(recordIds.has(evaluatedRecord.calibrationRecordId)).toBe(true);
      expect(
        manifestRecordIds.has(
          evaluatedRecord.manifestSourceRecordRef.calibrationRecordId
        )
      ).toBe(true);
      expect(
        labelRecordIds.has(
          evaluatedRecord.labelCompletenessRecordRef.calibrationRecordId
        )
      ).toBe(true);
      expect(evaluatedRecord.sourceRecordKind).toBe("synthetic_schema_example");
      expect(agentCalibrationSplitRecordKindValues).toContain(
        evaluatedRecord.sourceRecordKind
      );
      expect(agentCalibrationSplitFutureCategoryValues).toContain(
        evaluatedRecord.proposedFutureSplitCategory
      );
      expect(evaluatedRecord.proposedFutureSplitCategory).toBe("not_eligible");
      expect(evaluatedRecord.splitAssigned).toBe(false);
      expect(agentCalibrationSplitReadinessStatusValues).toContain(
        evaluatedRecord.splitReadinessStatus
      );
      expect(evaluatedRecord.rawRecordIncluded).toBe(false);

      for (const risk of evaluatedRecord.leakageRiskCategories) {
        expect(agentCalibrationSplitLeakageRiskValues).toContain(risk);
      }
      for (const groupingKey of evaluatedRecord.groupingKeyCategories) {
        expect(agentCalibrationSplitGroupingKeyValues).toContain(groupingKey);
      }
      for (const reason of evaluatedRecord.exclusionReasonCategories) {
        expect(agentCalibrationSplitExclusionTriggerValues).toContain(reason);
      }
      for (const requirement of evaluatedRecord.requiredBeforeSplitCategories) {
        expect(agentCalibrationRequiredBeforeSplitValues).toContain(
          requirement
        );
      }
    }
  });

  it("detects synthetic leakage risks deterministically", async () => {
    const report = await loadReport();
    const records = await loadCalibrationRecords();
    const byId = new Map(
      records.map((record) => [record.calibrationRecordId, record])
    );

    for (const evaluatedRecord of report.evaluatedRecords) {
      const sourceRecord = byId.get(evaluatedRecord.calibrationRecordId);

      expect(sourceRecord).toBeDefined();
      expect(evaluatedRecord.leakageRiskCategories).toEqual(
        detectSyntheticLeakageRisks(sourceRecord!, records)
      );
      expect(evaluatedRecord.leakageRiskCategories).toContain(
        "synthetic_example_only"
      );
    }

    expect(report.leakageRiskSummary).toMatchObject({
      totalRecordsWithLeakageRisk: 5,
      sameScenarioFamilyCount: 0,
      sameFixtureFamilyCount: 5,
      sameTraceSourceCount: 4,
      sameAgentSessionFutureCount: 0,
      sameReviewerBatchFutureCount: 0,
      duplicatedOrNearDuplicateRecordCount: 0,
      sameNormalizedActionCategoryCount: 3,
      sameBaselineComparisonFamilyCount: 5,
      syntheticExampleOnlyCount: 5,
      unresolvedSourceLinkageCount: 0,
      noLeakageRiskDetectedCount: 0
    });
  });

  it("computes deterministic split, exclusion, label-dependency, and future-plan summaries", async () => {
    const report = await loadReport();
    const metrics = computeSplitPlanningMetrics(report);
    const summary = summarizeSplitPlanningReport(report);

    expect(report.splitReadinessSummary).toEqual({
      totalEvaluatedRecords: 5,
      readyForFutureSplitDesignCount: 0,
      needsLabelsBeforeFutureSplitCount: 2,
      needsAdjudicationBeforeFutureSplitCount: 1,
      excludedFromFutureSplitCount: 0,
      syntheticExampleOnlyNotRealDataCount: 2,
      actualSplitAssignedCount: 0,
      realSplitReadyCount: 0
    });
    expect(summarizeFutureSplitReadiness(report.evaluatedRecords)).toEqual(
      report.splitReadinessSummary
    );
    expect(report.exclusionSummary).toMatchObject({
      totalExcludedFromFutureSplit: 5,
      excludedSyntheticExampleOnlyCount: 5,
      excludedMissingLabelsCount: 2,
      excludedNeedsAdjudicationCount: 3,
      excludedUnresolvedSourceLinkageCount: 0,
      excludedBoundaryViolationCount: 0,
      excludedRawPrivateDataCount: 0,
      excludedRawAgentOutputCount: 0,
      excludedSplitAssignmentNotAllowedCount: 5
    });
    expect(report.labelDependencySummary).toMatchObject({
      totalRecordsDependingOnLabelCompleteness: 5,
      recordsNeedingDecisionLabels: 1,
      recordsNeedingUncertaintyLabels: 0,
      recordsNeedingAgentBehaviorLabels: 1,
      recordsNeedingOutcomeLabels: 1,
      recordsNeedingFrictionLabels: 0,
      recordsNeedingCoverageLabels: 0,
      recordsNeedingAdjudicationResolution: 3,
      realHumanReviewRequiredCount: 5
    });
    expect(report.futureSplitPlanSummary).toEqual({
      futureTrainCandidateCount: 0,
      futureCalibrationCandidateCount: 0,
      futureTestCandidateCount: 0,
      futureHoldoutCandidateCount: 0,
      notEligibleCount: 5,
      splitAssignmentPerformed: false,
      splitManifestCreated: false,
      realDatasetSplitExists: false
    });
    expect(metrics).toMatchObject({
      totalEvaluatedRecords: 5,
      syntheticSchemaExampleCount: 5,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realReviewedTraceCount: 0,
      actualSplitAssignedCount: 0,
      realSplitReadyCount: 0,
      splitManifestCreatedCount: 0,
      realDatasetSplitCount: 0,
      leakageRiskCategoryCount: 5,
      excludedFromFutureSplitCount: 5,
      calibrationDatasetCreatedCount: 0,
      calibrationAppliedCount: 0,
      thresholdComputedCount: 0,
      conformalImplementationCount: 0
    });
    expect(summary).toEqual({
      reportId: "calibration-split-planning-synthetic-report-001",
      totalEvaluatedRecords: 5,
      actualSplitAssignedCount: 0,
      realSplitReadyCount: 0,
      splitManifestCreated: false
    });
  });

  it("enforces exact safety, privacy, claim-boundary, and no-split flags", async () => {
    const report = await loadReport();

    expect(report.safety).toEqual(exactSafety);
    expect(report.privacy).toEqual(exactPrivacy);
    expect(report.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() => splitPlanningSafetySchema.parse(report.safety)).not.toThrow();
    expect(() =>
      splitPlanningPrivacySchema.parse(report.privacy)
    ).not.toThrow();
    expect(() =>
      splitPlanningClaimBoundariesSchema.parse(report.claimBoundaries)
    ).not.toThrow();
    expect(report.boundarySummary).toEqual({
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      splitBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    });
    expect(() => validateSplitPlanningBoundaries(report)).not.toThrow();
    expect(() => validateSplitPlanningSafety(report)).not.toThrow();
    expect(splitPlanningContainsForbiddenRawString(report)).toBe(false);
  });

  it("builds the same boundary-safe report deterministically from synthetic readiness artifacts", async () => {
    const records = await loadCalibrationRecords();
    const manifest = await loadManifest();
    const labelCompletenessReport = await loadLabelCompletenessReport();
    const expectedReport = await loadReport();
    const builtReport = buildSyntheticSplitPlanningReport({
      reportId: "calibration-split-planning-synthetic-report-001",
      records,
      manifest,
      labelCompletenessReport
    });
    const rebuiltReport = buildSyntheticSplitPlanningReport({
      reportId: "calibration-split-planning-synthetic-report-001",
      records,
      manifest,
      labelCompletenessReport
    });

    expect(builtReport).toEqual(expectedReport);
    expect(rebuiltReport).toEqual(expectedReport);
    expect(splitPlanningContainsForbiddenRawString(builtReport)).toBe(false);
  });

  it("keeps the builder pure, non-executing, non-mutating, and local-only by source inspection", async () => {
    const source = await readFile(
      path.join(simulationRoot, "calibration", "splitPlanningSchema.ts"),
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
    const report = await loadReport();
    const metricNames = Object.keys(report.metrics).join("\n");

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
