import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineEvaluationFutureEvidenceValues,
  agentOfflineEvaluationFutureMetricFamilyValues,
  agentOfflineEvaluationPlaceholderSectionValues,
  agentOfflineEvaluationPlaceholderStatusValues,
  agentOfflineEvaluationReportSchemaVersion,
  agentOfflineEvaluationReportSourceValues,
  agentOfflineEvaluationScopeKindValues,
  buildSyntheticOfflineEvaluationReport,
  computeEvaluationReportBoundarySummary,
  loadExampleOfflineEvaluationReport,
  loadExampleOfflineScoreInputSet,
  loadExampleOfflineSplitSimulation,
  loadExampleOfflineThresholdSelection,
  offlineEvaluationReportClaimBoundariesSchema,
  offlineEvaluationReportContainsForbiddenRawString,
  offlineEvaluationReportPrivacySchema,
  offlineEvaluationReportSafetySchema,
  offlineEvaluationReportSchema,
  summarizeOfflineEvaluationReport,
  validateOfflineEvaluationReport,
  validateOfflineEvaluationReportBoundaries,
  validateOfflineEvaluationReportLinkage,
  validateOfflineEvaluationReports,
  validateRiskLossDesign,
  type OfflineEvaluationReport
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadReport = async (): Promise<OfflineEvaluationReport> =>
  validateOfflineEvaluationReport(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-evaluation-report.json"
      )
    )
  );

const loadRiskLossDesign = async () =>
  validateRiskLossDesign(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-risk-loss-design.json"
      )
    )
  );

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  mockOnly: true,
  schemaOnly: true,
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
  assignsRealDatasetSplits: false,
  appliesCalibration: false,
  computesNumericLosses: false,
  computesRiskScores: false,
  computesNonconformityScores: false,
  computesRealThresholds: false,
  introducesAlpha: false,
  implementsConformalRiskControl: false,
  performsRealEvaluation: false,
  computesPerformanceMetrics: false
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
  rawScoreDataIncluded: false,
  rawThresholdDataIncluded: false,
  rawEvaluationDataIncluded: false,
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
  mockOnly: true,
  schemaOnly: true,
  realCalibrationDataset: false,
  realCalibrationRecord: false,
  realReviewedTrace: false,
  realAgentExecution: false,
  realStepHarborExecution: false,
  realValidationResult: false,
  realWorldResult: false,
  realEvaluationResults: false,
  calibrationDatasetCreated: false,
  calibrationApplied: false,
  realDatasetSplitsAssigned: false,
  splitManifestCreated: false,
  numericLossesComputed: false,
  riskScoresComputed: false,
  nonconformityScoresComputed: false,
  realThresholdsComputed: false,
  thresholdValuesIncluded: false,
  alphaIntroduced: false,
  performanceMetricsComputed: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent offline evaluation report", () => {
  it("validates schema and stable Phase 14.5 metadata", async () => {
    const report = await loadReport();

    expect(report).toEqual(loadExampleOfflineEvaluationReport());
    expect(report.schemaVersion).toBe(
      agentOfflineEvaluationReportSchemaVersion
    );
    expect(report.evaluationReportId).toBe(
      "offline-evaluation-report-schema-synthetic-v1"
    );
    expect(report.evaluationReportId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(report.evaluationReportId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(agentOfflineEvaluationReportSourceValues).toContain(report.source);
    expect(report.source).toBe("synthetic_mock_evaluation_report_schema");
    expect(report.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3", "14.4"],
      currentBatch: "14.5",
      futureBatches: ["14.6"],
      phaseStatus:
        "offline_evaluation_report_schema_without_real_results_or_guarantees"
    });
    expect(report.linkedRiskLossDesign).toBeTruthy();
    expect(report.linkedScoreInputSet).toBeTruthy();
    expect(report.linkedSplitSimulation).toBeTruthy();
    expect(report.linkedThresholdSelection).toBeTruthy();
    expect(report.reportScope).toBeTruthy();
    expect(report.resultAvailability).toBeTruthy();
    expect(report.placeholderResultSections).toHaveLength(
      agentOfflineEvaluationPlaceholderSectionValues.length
    );
    expect(report.futureMetricDefinitions.metricFamilies).toHaveLength(
      agentOfflineEvaluationFutureMetricFamilyValues.length
    );
    expect(report.requiredFutureEvidence).toBeTruthy();
    expect(report.boundarySummary).toEqual(
      computeEvaluationReportBoundarySummary()
    );
    expect(report.safety).toEqual(exactSafety);
    expect(report.privacy).toEqual(exactPrivacy);
    expect(report.claimBoundaries).toEqual(exactClaimBoundaries);

    expect(() =>
      offlineEvaluationReportSchema.parse({
        ...report,
        source: "real_evaluation_report"
      })
    ).toThrow();
  });

  it("links to Batch 14.1 through Batch 14.4 artifacts without raw payloads", async () => {
    const report = await loadReport();
    const riskLossDesign = await loadRiskLossDesign();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const thresholdSelection = loadExampleOfflineThresholdSelection();

    expect(() =>
      validateOfflineEvaluationReportLinkage(
        report,
        riskLossDesign,
        inputSet,
        splitSimulation,
        thresholdSelection
      )
    ).not.toThrow();
    expect(report.linkedRiskLossDesign.designId).toBe(riskLossDesign.designId);
    expect(report.linkedScoreInputSet.inputSetId).toBe(inputSet.inputSetId);
    expect(report.linkedSplitSimulation.simulationId).toBe(
      splitSimulation.simulationId
    );
    expect(report.linkedThresholdSelection.thresholdSelectionId).toBe(
      thresholdSelection.thresholdSelectionId
    );
    expect(report.linkedRiskLossDesign.rawDesignIncluded).toBe(false);
    expect(report.linkedScoreInputSet.rawScoreInputsIncluded).toBe(false);
    expect(report.linkedSplitSimulation.rawSplitSimulationIncluded).toBe(false);
    expect(report.linkedThresholdSelection.rawThresholdSelectionIncluded).toBe(
      false
    );
  });

  it("keeps report scope schema-only and without evaluation execution", async () => {
    const { reportScope } = await loadReport();

    expect(agentOfflineEvaluationScopeKindValues).toContain(
      reportScope.scopeKind
    );
    expect(["schema_only", "synthetic_mock_report_template"]).toContain(
      reportScope.scopeKind
    );
    expect(reportScope.includesRealResults).toBe(false);
    expect(reportScope.includesMockResultsOnly).toBe(true);
    expect(reportScope.empiricalEvaluationPerformed).toBe(false);
    expect(reportScope.conformalEvaluationPerformed).toBe(false);
    expect(reportScope.productionRoutingEvaluationPerformed).toBe(false);
  });

  it("marks all real result availability as false", async () => {
    const { resultAvailability } = await loadReport();

    expect(resultAvailability).toEqual({
      realEvaluationResultsAvailable: false,
      realCalibrationResultsAvailable: false,
      realConformalResultsAvailable: false,
      realCrcResultsAvailable: false,
      realBaselineResultsAvailable: false,
      realAgentResultsAvailable: false,
      realProductionRoutingResultsAvailable: false,
      mockPlaceholderSectionsAvailable: true
    });
  });

  it("defines placeholder result sections without numeric findings", async () => {
    const report = await loadReport();
    const sectionCategories = new Set(
      agentOfflineEvaluationPlaceholderSectionValues
    );
    const statuses = new Set(agentOfflineEvaluationPlaceholderStatusValues);

    expect(
      report.placeholderResultSections.map((section) => section.sectionCategory)
    ).toEqual([...agentOfflineEvaluationPlaceholderSectionValues]);
    for (const section of report.placeholderResultSections) {
      expect(sectionCategories.has(section.sectionCategory)).toBe(true);
      expect(statuses.has(section.currentStatus)).toBe(true);
      expect(section.containsRealResults).toBe(false);
      expect(section.containsMockValuesOnly).toBe(false);
      expect(section.futureEvidenceRequired.length).toBeGreaterThan(0);
      expect(JSON.stringify(section)).not.toMatch(
        /accuracy|precision|recall|f1|risk reduction|productivity/i
      );
      expect(JSON.stringify(section)).not.toMatch(/result table/i);
      expect(JSON.stringify(section)).not.toMatch(/\b0\.(?:0?1|05|1)\b/);
      expect(JSON.stringify(section)).not.toMatch(/\b(?:1|5|10)%\b/);
    }
  });

  it("defines future metric families without computed metric values", async () => {
    const report = await loadReport();
    const metricFamilies = new Set(
      agentOfflineEvaluationFutureMetricFamilyValues
    );

    expect(
      report.futureMetricDefinitions.metricFamilies.map(
        (metric) => metric.metricFamilyId
      )
    ).toEqual([...agentOfflineEvaluationFutureMetricFamilyValues]);
    for (const metric of report.futureMetricDefinitions.metricFamilies) {
      expect(metricFamilies.has(metric.metricFamilyId)).toBe(true);
      expect(metric.requiredInputs.length).toBeGreaterThan(0);
      expect(metric.requiredSplits.length).toBeGreaterThan(0);
      expect(metric.requiredReviewLabels.length).toBeGreaterThan(0);
      expect(metric.valueComputed).toBe(false);
      expect(metric.realDataRequired).toBe(true);
      expect(metric.statisticalGuaranteeClaimed).toBe(false);
      expect(JSON.stringify(metric)).not.toMatch(/\bvalue\b\s*:/i);
      expect(JSON.stringify(metric)).not.toMatch(/\b0\.(?:0?1|05|1)\b/);
      expect(JSON.stringify(metric)).not.toMatch(/\b(?:1|5|10)%\b/);
    }
  });

  it("keeps all required future evidence unmet", async () => {
    const report = await loadReport();

    expect(
      report.requiredFutureEvidence.requirements.map(
        (requirement) => requirement.requirementId
      )
    ).toEqual([...agentOfflineEvaluationFutureEvidenceValues]);
    expect(report.requiredFutureEvidence.allRequirementsFutureOrUnmet).toBe(
      true
    );
    for (const requirement of report.requiredFutureEvidence.requirements) {
      expect(requirement.status).toBe("future_unmet");
      expect(requirement.requiredBeforeRealEvaluation).toBe(true);
    }
  });

  it("keeps helpers pure, deterministic, and boundary-safe", async () => {
    const report = await loadReport();
    const riskLossDesign = await loadRiskLossDesign();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const thresholdSelection = loadExampleOfflineThresholdSelection();

    expect(
      buildSyntheticOfflineEvaluationReport(
        riskLossDesign,
        inputSet,
        splitSimulation,
        thresholdSelection
      )
    ).toEqual(report);
    expect(validateOfflineEvaluationReports([report, report])).toEqual([
      report,
      report
    ]);
    expect(summarizeOfflineEvaluationReport(report)).toEqual({
      evaluationReportId: "offline-evaluation-report-schema-synthetic-v1",
      placeholderSectionCount:
        agentOfflineEvaluationPlaceholderSectionValues.length,
      futureMetricFamilyCount:
        agentOfflineEvaluationFutureMetricFamilyValues.length,
      realEvaluationResultsAvailable: false,
      performanceMetricsComputed: false
    });
    expect(() =>
      validateOfflineEvaluationReportBoundaries(report)
    ).not.toThrow();
    expect(offlineEvaluationReportContainsForbiddenRawString(report)).toBe(
      false
    );

    expect(offlineEvaluationReportSafetySchema.parse(report.safety)).toEqual(
      exactSafety
    );
    expect(offlineEvaluationReportPrivacySchema.parse(report.privacy)).toEqual(
      exactPrivacy
    );
    expect(
      offlineEvaluationReportClaimBoundariesSchema.parse(report.claimBoundaries)
    ).toEqual(exactClaimBoundaries);
  });

  it("does not add filesystem, command, network, metric, threshold, or alpha execution helpers", async () => {
    const schemaSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "evaluationReportSchema.ts"
      ),
      "utf8"
    );
    const loaderSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "evaluationReport.ts"
      ),
      "utf8"
    );
    const combined = `${schemaSource}\n${loaderSource}`;

    for (const forbidden of [
      /\breadFile\b/,
      /\bwriteFile\b/,
      /\bexec\b/,
      /\bspawn\b/,
      /\bfork\b/,
      /\bfetch\b/,
      /XMLHttpRequest/,
      /computeAccuracy/i,
      /computePrecision/i,
      /computeRecall/i,
      /computeF1/i,
      /computeThreshold/i,
      /introduceAlpha/i,
      /alpha\s*=/i
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
  });
});
