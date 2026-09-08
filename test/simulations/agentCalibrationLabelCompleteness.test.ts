import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentCalibrationAdjudicationReasonValues,
  agentCalibrationAdjudicationStatusValues,
  agentCalibrationAdjudicationTriggerValues,
  agentCalibrationCompletenessStatusValues,
  agentCalibrationConflictCategoryValues,
  agentCalibrationEvaluatedRecordKindValues,
  agentCalibrationExclusionTriggerValues,
  agentCalibrationLabelCompletenessSchemaVersion,
  agentCalibrationLabelGroupValues,
  agentCalibrationOptionalLabelGroupValues,
  agentCalibrationReadinessStatusValues,
  agentCalibrationRequiredLabelGroupStatusValues,
  buildSyntheticLabelCompletenessReport,
  computeLabelCompletenessMetrics,
  detectMissingLabelGroups,
  detectSyntheticLabelConflicts,
  labelCompletenessClaimBoundariesSchema,
  labelCompletenessContainsForbiddenRawString,
  labelCompletenessPrivacySchema,
  labelCompletenessReportSchema,
  labelCompletenessSafetySchema,
  summarizeLabelCompletenessReport,
  validateCalibrationManifest,
  validateCalibrationRecords,
  validateLabelCompletenessBoundaries,
  validateLabelCompletenessReport,
  validateLabelCompletenessSafety,
  type CalibrationManifest,
  type CalibrationRecord,
  type LabelCompletenessReport
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

const loadReport = async (): Promise<LabelCompletenessReport> =>
  validateLabelCompletenessReport(
    await readJson(
      path.join(
        simulationRoot,
        "calibration",
        "example-label-completeness-report.json"
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
  realLabelCompletenessReport: false,
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
  thresholdsComputed: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent calibration label completeness", () => {
  it("validates report schema, deterministic ID, source, and phase metadata", async () => {
    const report = await loadReport();

    expect(report.schemaVersion).toBe(
      agentCalibrationLabelCompletenessSchemaVersion
    );
    expect(report.reportId).toBe(
      "calibration-label-completeness-synthetic-report-001"
    );
    expect(report.reportId).toMatch(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);
    expect(report.reportId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(report.source).toBe("synthetic_schema_label_completeness_report");
    expect(report.phase.completedBatches).toEqual(["13.1", "13.2"]);
    expect(report.phase.currentBatch).toBe("13.3");
    expect(report.phase.futureBatches).toEqual(["13.4", "13.5"]);
    expect(report.phase.nextPhaseStatus).toBe(
      "phase-14-offline-conformal-crc-prototype-future"
    );

    expect(() =>
      labelCompletenessReportSchema.parse({
        ...report,
        source: "real_label_completeness_report"
      })
    ).toThrow();
  });

  it("defines controlled completeness policy categories", async () => {
    const report = await loadReport();

    expect(report.completenessPolicy.requiredLabelGroups).toEqual([
      ...agentCalibrationLabelGroupValues
    ]);
    expect(report.completenessPolicy.optionalLabelGroups).toEqual([
      ...agentCalibrationOptionalLabelGroupValues
    ]);
    expect(report.completenessPolicy.adjudicationTriggerCategories).toEqual([
      ...agentCalibrationAdjudicationTriggerValues
    ]);
    expect(report.completenessPolicy.exclusionTriggerCategories).toEqual([
      ...agentCalibrationExclusionTriggerValues
    ]);
    expect(report.completenessPolicy.boundaryRequired).toBe(true);
    expect(
      report.completenessPolicy.realHumanReviewRequiredForRealCalibration
    ).toBe(true);
    expect(
      report.completenessPolicy.syntheticExamplesCanSatisfyRealCalibration
    ).toBe(false);
  });

  it("evaluates every synthetic calibration record without raw records or real adjudication", async () => {
    const report = await loadReport();
    const records = await loadCalibrationRecords();
    const manifest = await loadManifest();
    const recordIds = new Set(
      records.map((record) => record.calibrationRecordId)
    );
    const manifestRecordIds = new Set(
      manifest.sourceRecords.map((record) => record.calibrationRecordId)
    );

    expect(report.evaluatedRecords).toHaveLength(records.length);
    expect(
      report.evaluatedRecords.some(
        (record) => record.completenessStatus === "complete_but_synthetic_only"
      )
    ).toBe(true);
    expect(
      report.evaluatedRecords.some((record) =>
        ["needs_adjudication", "incomplete_missing_required_labels"].includes(
          record.completenessStatus
        )
      )
    ).toBe(true);

    for (const evaluatedRecord of report.evaluatedRecords) {
      expect(recordIds.has(evaluatedRecord.calibrationRecordId)).toBe(true);
      expect(
        manifestRecordIds.has(
          evaluatedRecord.manifestSourceRecordRef.calibrationRecordId
        )
      ).toBe(true);
      expect(evaluatedRecord.sourceRecordKind).toBe("synthetic_schema_example");
      expect(agentCalibrationEvaluatedRecordKindValues).toContain(
        evaluatedRecord.sourceRecordKind
      );
      expect(agentCalibrationCompletenessStatusValues).toContain(
        evaluatedRecord.completenessStatus
      );
      expect(agentCalibrationAdjudicationStatusValues).toContain(
        evaluatedRecord.adjudicationStatus
      );
      expect(agentCalibrationReadinessStatusValues).toContain(
        evaluatedRecord.readinessStatus
      );
      expect(evaluatedRecord.rawRecordIncluded).toBe(false);
      expect(evaluatedRecord.realHumanAdjudicationPerformed).toBe(false);
      expect(evaluatedRecord.readinessStatus).not.toBe(
        "ready_for_future_manifest_planning"
      );
    }
  });

  it("represents required label groups, missing labels, conflicts, and adjudication reasons with controlled values", async () => {
    const report = await loadReport();

    for (const evaluatedRecord of report.evaluatedRecords) {
      expect(
        Object.keys(evaluatedRecord.requiredLabelGroupStatus).sort()
      ).toEqual([...agentCalibrationLabelGroupValues].sort());

      for (const status of Object.values(
        evaluatedRecord.requiredLabelGroupStatus
      )) {
        expect(agentCalibrationRequiredLabelGroupStatusValues).toContain(
          status
        );
      }

      expect(evaluatedRecord.missingLabelGroups).toEqual(
        detectMissingLabelGroups(evaluatedRecord.requiredLabelGroupStatus)
      );
      expect(evaluatedRecord.conflictCategories).toEqual(
        detectSyntheticLabelConflicts(evaluatedRecord.requiredLabelGroupStatus)
      );

      for (const conflict of evaluatedRecord.conflictCategories) {
        expect(agentCalibrationConflictCategoryValues).toContain(conflict);
      }

      for (const reason of evaluatedRecord.adjudicationReasonCategories) {
        expect(agentCalibrationAdjudicationReasonValues).toContain(reason);
      }
    }
  });

  it("computes deterministic completeness, missing-label, conflict, adjudication, exclusion, and readiness summaries", async () => {
    const report = await loadReport();
    const metrics = computeLabelCompletenessMetrics(report);
    const summary = summarizeLabelCompletenessReport(report);

    expect(report.completenessSummary).toMatchObject({
      totalEvaluatedRecords: 5,
      completeForFutureDatasetDesignCount: 0,
      completeButSyntheticOnlyCount: 2,
      missingRequiredLabelsCount: 2,
      needsAdjudicationCount: 3,
      excludedDueToConflictCount: 0,
      excludedDueToBoundaryViolationCount: 0,
      syntheticExampleOnlyCount: 5,
      realHumanAdjudicatedRecordCount: 0
    });
    expect(report.missingLabelSummary).toMatchObject({
      totalRecordsWithMissingLabels: 2,
      missingDecisionLabelsCount: 1,
      missingUncertaintyLabelsCount: 0,
      missingAgentBehaviorLabelsCount: 1,
      missingOutcomeLabelsCount: 1,
      missingFrictionLabelsCount: 0,
      missingCoverageLabelsCount: 0,
      missingFutureLossLabelCandidatesCount: 0,
      missingSourceLinkageCount: 0,
      missingBoundaryFlagsCount: 0
    });
    expect(report.conflictSummary).toMatchObject({
      totalRecordsWithConflicts: 1,
      decisionLabelConflictCount: 0,
      uncertaintyLabelConflictCount: 0,
      agentBehaviorConflictCount: 0,
      outcomeLabelConflictCount: 0,
      frictionLabelConflictCount: 0,
      coverageLabelConflictCount: 1,
      sourceLinkageConflictCount: 0,
      boundaryFlagConflictCount: 0
    });
    expect(report.adjudicationSummary).toMatchObject({
      totalRecordsNeedingAdjudication: 3,
      totalRecordsAdjudicated: 0,
      futureHumanReviewRequiredCount: 5,
      adjudicationBlockedCount: 0,
      adjudicationNotPerformedCount: 3,
      realReviewerAssignedCount: 0
    });
    expect(report.exclusionSummary).toMatchObject({
      totalExcludedRecords: 5,
      excludedSyntheticOnlyCount: 5,
      excludedBoundaryViolationCount: 0,
      excludedConflictCount: 1,
      excludedUnresolvedAdjudicationCount: 3,
      excludedRawPrivateDataCount: 0,
      excludedRawAgentOutputCount: 0,
      excludedUnresolvedSourceLinkageCount: 0
    });
    expect(report.readinessSummary).toMatchObject({
      readyForFutureManifestPlanningCount: 0,
      needsAdditionalLabelsBeforeFutureDatasetUseCount: 2,
      needsAdjudicationBeforeFutureDatasetUseCount: 1,
      excludedFromFutureDatasetUseCount: 0,
      syntheticExampleOnlyNotRealDataCount: 2,
      realCalibrationReadyCount: 0
    });
    expect(metrics).toMatchObject({
      totalEvaluatedRecords: 5,
      syntheticSchemaExampleCount: 5,
      futureControlledTraceCount: 0,
      futureRealTrialTraceCount: 0,
      realReviewedTraceCount: 0,
      realHumanAdjudicatedRecordCount: 0,
      realCalibrationReadyCount: 0,
      missingRequiredLabelsCount: 2,
      needsAdjudicationCount: 3,
      unresolvedConflictCount: 1,
      boundaryViolationCount: 0,
      calibrationDatasetCreatedCount: 0,
      calibrationAppliedCount: 0,
      thresholdComputedCount: 0,
      conformalImplementationCount: 0
    });
    expect(summary).toEqual({
      reportId: "calibration-label-completeness-synthetic-report-001",
      totalEvaluatedRecords: 5,
      realHumanAdjudicatedRecordCount: 0,
      realCalibrationReadyCount: 0,
      calibrationDatasetCreated: false
    });
  });

  it("enforces exact safety, privacy, claim-boundary, and no-real-adjudication flags", async () => {
    const report = await loadReport();

    expect(report.safety).toEqual(exactSafety);
    expect(report.privacy).toEqual(exactPrivacy);
    expect(report.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() =>
      labelCompletenessSafetySchema.parse(report.safety)
    ).not.toThrow();
    expect(() =>
      labelCompletenessPrivacySchema.parse(report.privacy)
    ).not.toThrow();
    expect(() =>
      labelCompletenessClaimBoundariesSchema.parse(report.claimBoundaries)
    ).not.toThrow();
    expect(report.boundarySummary).toEqual({
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      adjudicationBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    });
    expect(() => validateLabelCompletenessBoundaries(report)).not.toThrow();
    expect(() => validateLabelCompletenessSafety(report)).not.toThrow();
    expect(labelCompletenessContainsForbiddenRawString(report)).toBe(false);
  });

  it("builds the same boundary-safe report deterministically from synthetic records and manifest data", async () => {
    const records = await loadCalibrationRecords();
    const manifest = await loadManifest();
    const expectedReport = await loadReport();
    const builtReport = buildSyntheticLabelCompletenessReport({
      reportId: "calibration-label-completeness-synthetic-report-001",
      records,
      manifest
    });
    const rebuiltReport = buildSyntheticLabelCompletenessReport({
      reportId: "calibration-label-completeness-synthetic-report-001",
      records,
      manifest
    });

    expect(builtReport).toEqual(expectedReport);
    expect(rebuiltReport).toEqual(expectedReport);
    expect(labelCompletenessContainsForbiddenRawString(builtReport)).toBe(
      false
    );
  });

  it("keeps the builder pure, non-executing, non-mutating, and local-only by source inspection", async () => {
    const source = await readFile(
      path.join(simulationRoot, "calibration", "labelCompletenessSchema.ts"),
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
