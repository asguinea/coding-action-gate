import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advisoryComparisonAuthorityBoundarySummarySchema,
  advisoryComparisonFutureEvidenceRequirementValues,
  advisoryComparisonPurposeCategoryValues,
  advisoryComparisonScopeKindValues,
  advisoryComparisonValueCategoryValues,
  advisoryDecisionCategoryValues,
  advisoryPhase14ArtifactKindValues,
  advisorySideBySideClaimBoundariesSchema,
  advisorySideBySideComparisonContainsForbiddenRawString,
  advisorySideBySideComparisonReportSchema,
  advisorySideBySideComparisonSourceValues,
  advisorySideBySidePrivacySchema,
  advisorySideBySideSafetySchema,
  agentAdvisorySideBySideComparisonReportSchemaVersion,
  buildAdvisorySideBySideComparisonReport,
  buildExampleAdvisorySideBySideComparisonReport,
  computeAdvisoryAgreementSummary,
  computeAdvisoryValueSummary,
  loadExampleAdvisoryRoutingSidecars,
  loadExampleAdvisorySideBySideComparisonReport,
  loadExampleMockAdvisoryRoutingOutputs,
  mockAdvisoryAgreementCategoryValues,
  mockAdvisoryDifferenceCategoryValues,
  mockAdvisoryOutputCategoryValues,
  summarizeAdvisorySideBySideComparisonReport,
  validateAdvisoryComparisonAuthorityBoundary,
  validateAdvisoryComparisonClaimBoundaries,
  validateAdvisorySideBySideComparisonReport,
  validateAdvisorySideBySideComparisonReportBoundaries,
  validateAdvisorySideBySideComparisonReports,
  type AdvisorySideBySideComparisonReport
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadReportFromFile =
  async (): Promise<AdvisorySideBySideComparisonReport> =>
    validateAdvisorySideBySideComparisonReport(
      await readJson(
        path.join(
          process.cwd(),
          "simulations",
          "agent",
          "advisory-routing",
          "example-side-by-side-comparison-report.json"
        )
      )
    );

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  mockOnly: true,
  advisoryOnly: true,
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
  implementsAdvisoryRouting: false,
  implementsCalibratedRouting: false,
  implementsProductionRouting: false,
  appliesCalibration: false,
  computesScores: false,
  computesThresholds: false,
  introducesAlpha: false,
  implementsConformalRiskControl: false,
  computesMetrics: false,
  performsEmpiricalEvaluation: false
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
  rawScoreDataIncluded: false,
  rawThresholdDataIncluded: false,
  rawEvaluationDataIncluded: false,
  rawRoutingDataIncluded: false,
  rawComparisonDataIncluded: false,
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
  advisoryOnly: true,
  advisoryRoutingImplemented: false,
  calibratedRoutingImplemented: false,
  productionRoutingChanged: false,
  realCalibrationDataset: false,
  realReviewedTrace: false,
  realScores: false,
  nonconformityScores: false,
  thresholds: false,
  alphaIntroduced: false,
  calibrationApplied: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  realEvaluationResults: false,
  performanceMetricsComputed: false,
  empiricalEvaluationPerformed: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent advisory side-by-side comparison report schema", () => {
  it("validates the example report and stable Batch 15.3 metadata", async () => {
    const report = await loadReportFromFile();

    expect(report).toEqual(loadExampleAdvisorySideBySideComparisonReport());
    expect(report).toEqual(buildExampleAdvisorySideBySideComparisonReport());
    expect(validateAdvisorySideBySideComparisonReports([report])).toEqual([
      report
    ]);
    expect(report.schemaVersion).toBe(
      agentAdvisorySideBySideComparisonReportSchemaVersion
    );
    expect(report.comparisonReportId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(report.comparisonReportId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(advisorySideBySideComparisonSourceValues).toContain(report.source);
    expect(report.source).toBe("synthetic_mock_side_by_side_comparison");
    expect(report.phase).toEqual({
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2"],
      currentBatch: "15.3",
      futureBatches: ["15.4", "15.5"],
      phaseStatus:
        "side_by_side_comparison_over_mock_advisory_outputs_without_runtime_integration"
    });
    expect(report.safety).toEqual(exactSafety);
    expect(report.privacy).toEqual(exactPrivacy);
    expect(report.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(advisorySideBySideComparisonContainsForbiddenRawString(report)).toBe(
      false
    );
  });

  it("requires top-level report objects and rejects invalid enum labels", async () => {
    const report = await loadReportFromFile();

    for (const key of [
      "schemaVersion",
      "comparisonReportId",
      "source",
      "phase",
      "linkedMockAdvisoryOutputs",
      "linkedAdvisorySidecars",
      "linkedPhase14Readiness",
      "comparisonScope",
      "comparedItems",
      "agreementSummary",
      "advisoryValueSummary",
      "authorityBoundarySummary",
      "futureEvidenceRequirements",
      "safety",
      "privacy",
      "claimBoundaries",
      "notes"
    ]) {
      expect(report).toHaveProperty(key);
    }

    expect(() =>
      advisorySideBySideComparisonReportSchema.parse({
        ...report,
        source: "runtime_comparison"
      })
    ).toThrow();
    expect(() =>
      advisorySideBySideComparisonReportSchema.parse({
        ...report,
        comparisonScope: {
          ...report.comparisonScope,
          scopeKind: "runtime_report"
        }
      })
    ).toThrow();
    expect(() =>
      advisorySideBySideSafetySchema.parse({
        ...report.safety,
        computesMetrics: true
      })
    ).toThrow();
    expect(() =>
      advisorySideBySidePrivacySchema.parse({
        ...report.privacy,
        rawComparisonDataIncluded: true
      })
    ).toThrow();
    expect(() =>
      advisorySideBySideClaimBoundariesSchema.parse({
        ...report.claimBoundaries,
        empiricalEvaluationPerformed: true
      })
    ).toThrow();
  });

  it("links Batch 15.2 mock outputs, Batch 15.1 sidecars, and Batch 14.6 readiness without raw payloads", async () => {
    const report = await loadReportFromFile();
    const mockOutputsById = new Map(
      loadExampleMockAdvisoryRoutingOutputs().map((output) => [
        output.mockRoutingOutputId,
        output
      ])
    );
    const sidecarsById = new Map(
      loadExampleAdvisoryRoutingSidecars().map((sidecar) => [
        sidecar.sidecarId,
        sidecar
      ])
    );

    expect(report.linkedMockAdvisoryOutputs.schemaVersion).toBe(
      "agent-mock-advisory-routing-output.v1"
    );
    expect(report.linkedMockAdvisoryOutputs.source).toBe(
      "synthetic_mock_advisory_routing"
    );
    expect(report.linkedMockAdvisoryOutputs.rawMockOutputsIncluded).toBe(false);
    expect(report.linkedAdvisorySidecars.schemaVersion).toBe(
      "agent-advisory-routing-sidecar.v1"
    );
    expect(report.linkedAdvisorySidecars.source).toBe(
      "synthetic_advisory_sidecar_design"
    );
    expect(report.linkedAdvisorySidecars.rawSidecarsIncluded).toBe(false);
    expect(report.linkedPhase14Readiness.readinessSummaryId).toBe(
      "phase-14-offline-readiness-summary-001"
    );
    expect(report.linkedPhase14Readiness.rawReadinessArtifactIncluded).toBe(
      false
    );

    for (const outputId of report.linkedMockAdvisoryOutputs.outputIds) {
      expect(mockOutputsById.has(outputId)).toBe(true);
    }
    for (const sidecarId of report.linkedAdvisorySidecars.sidecarIds) {
      expect(sidecarsById.has(sidecarId)).toBe(true);
    }
    for (const artifactKind of report.linkedPhase14Readiness
      .linkedArtifactKinds) {
      expect(advisoryPhase14ArtifactKindValues).toContain(artifactKind);
    }
  });

  it("keeps comparison scope synthetic/mock-only", async () => {
    const report = await loadReportFromFile();

    expect(advisoryComparisonScopeKindValues).toContain(
      report.comparisonScope.scopeKind
    );
    expect(report.comparisonScope.scopeKind).toBe(
      "synthetic_mock_comparison_report"
    );
    expect(advisoryComparisonPurposeCategoryValues).toContain(
      report.comparisonScope.comparisonPurposeCategory
    );
    expect(report.comparisonScope.usesMockOutputsOnly).toBe(true);
    expect(report.comparisonScope.comparesRuntimeBehavior).toBe(false);
    expect(report.comparisonScope.changesRuntimeBehavior).toBe(false);
    expect(report.comparisonScope.empiricalEvaluation).toBe(false);
    expect(report.comparisonScope.calibratedEvaluation).toBe(false);
    expect(report.comparisonScope.productionEvaluation).toBe(false);
  });

  it("summarizes compared items without changing deterministic decisions", async () => {
    const report = await loadReportFromFile();
    const mockOutputIds = new Set(
      loadExampleMockAdvisoryRoutingOutputs().map(
        (output) => output.mockRoutingOutputId
      )
    );
    const sidecarIds = new Set(
      loadExampleAdvisoryRoutingSidecars().map((sidecar) => sidecar.sidecarId)
    );

    expect(report.comparedItems.length).toBe(5);
    for (const item of report.comparedItems) {
      expect(item.itemId).toMatch(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);
      expect(mockOutputIds.has(item.mockRoutingOutputId)).toBe(true);
      expect(sidecarIds.has(item.sidecarId)).toBe(true);
      expect(advisoryDecisionCategoryValues).toContain(
        item.deterministicDecisionCategory
      );
      expect(mockAdvisoryOutputCategoryValues).toContain(
        item.mockAdvisorySuggestionCategory
      );
      expect(mockAdvisoryAgreementCategoryValues).toContain(
        item.agreementCategory
      );
      expect(mockAdvisoryDifferenceCategoryValues).toContain(
        item.differenceCategory
      );
      for (const valueCategory of item.advisoryValueCategories) {
        expect(advisoryComparisonValueCategoryValues).toContain(valueCategory);
      }
      expect(item.authorityStatus).toBe("deterministic_decision_authoritative");
      expect(item.deterministicDecisionChanged).toBe(false);
      expect(item.advisoryOverrideAttempted).toBe(false);
      expect(item.runtimeDecisionChanged).toBe(false);
      expect(item.rawItemIncluded).toBe(false);
    }
  });

  it("computes deterministic agreement and advisory value summaries without empirical claims", async () => {
    const report = await loadReportFromFile();

    expect(report.agreementSummary.totalComparedItems).toBe(
      report.comparedItems.length
    );
    expect(report.agreementSummary).toEqual(
      computeAdvisoryAgreementSummary(report.comparedItems)
    );
    expect(report.agreementSummary).toMatchObject({
      agreesCount: 1,
      partiallyAgreesCount: 3,
      differsCount: 1,
      insufficientEvidenceCount: 0,
      notApplicableCount: 0,
      deterministicDecisionChangedCount: 0,
      advisoryOverrideAttemptedCount: 0,
      runtimeDecisionChangedCount: 0
    });
    expect(report.advisoryValueSummary).toEqual(
      computeAdvisoryValueSummary(report.comparedItems)
    );
    expect(report.advisoryValueSummary).toMatchObject({
      totalComparedItems: 5,
      explanationValueCount: 5,
      contextReductionValueCount: 1,
      humanReviewValueCount: 1,
      hardStopValueCount: 1,
      frictionReductionValueCount: 1,
      insufficientEvidenceValueCount: 1,
      noAddedValueCount: 0,
      empiricalValueMeasured: false,
      productivityImpactMeasured: false
    });
  });

  it("enforces authority, future evidence, safety, privacy, and claim boundaries", async () => {
    const report = await loadReportFromFile();

    expect(report.authorityBoundarySummary).toEqual({
      deterministicDecisionAuthoritative: true,
      advisoryOutputsNonAuthoritative: true,
      advisoryCanOverrideDecision: false,
      advisoryCanChangeRuntimeBehavior: false,
      advisoryCanTriggerRuntimeAction: false,
      routingBehaviorChanged: false,
      productionRoutingChanged: false
    });
    expect(() =>
      advisoryComparisonAuthorityBoundarySummarySchema.parse({
        ...report.authorityBoundarySummary,
        advisoryCanOverrideDecision: true
      })
    ).toThrow();
    expect(report.futureEvidenceRequirements.requiredCategories).toEqual([
      ...advisoryComparisonFutureEvidenceRequirementValues
    ]);
    expect(report.futureEvidenceRequirements.evidenceStatus).toBe(
      "future_unmet"
    );
    expect(report.futureEvidenceRequirements.allRequirementsFuture).toBe(true);

    validateAdvisoryComparisonAuthorityBoundary(report);
    validateAdvisoryComparisonClaimBoundaries(report);
    validateAdvisorySideBySideComparisonReportBoundaries(report);
  });

  it("keeps helpers pure, deterministic, and boundary-safe", async () => {
    const outputs = loadExampleMockAdvisoryRoutingOutputs();
    const before = JSON.stringify(outputs);
    const first = buildAdvisorySideBySideComparisonReport(outputs);
    const second = buildAdvisorySideBySideComparisonReport(outputs);
    const summary = summarizeAdvisorySideBySideComparisonReport(first);
    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "sideBySideComparisonSchema.ts"
      ),
      "utf8"
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(outputs)).toBe(before);
    expect(summary).toEqual({
      comparisonReportId: "phase-15-side-by-side-comparison-001",
      totalComparedItems: 5,
      linkedMockOutputCount: 5,
      linkedSidecarCount: 5,
      agreesCount: 1,
      partiallyAgreesCount: 3,
      differsCount: 1,
      explanationValueCount: 5,
      deterministicDecisionAuthoritative: true,
      advisoryCanOverrideDecision: false,
      empiricalValueMeasured: false,
      productionRoutingChanged: false
    });
    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/from ["']node:child_process/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bexec(?:File)?\s*\(/);
    expect(source).not.toMatch(/\bspawn\s*\(/);
    expect(source).not.toMatch(/runtimeRouter|decisionEngine/);
  });
});
