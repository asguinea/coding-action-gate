import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advisoryReadinessBlockerCategoryValues,
  advisoryReadinessClaimBoundariesSchema,
  advisoryReadinessContainsForbiddenRawString,
  advisoryReadinessSafetySchema,
  advisoryReadinessSourceValues,
  advisoryReadinessSummarySchema,
  agentAdvisoryReadinessSummarySchemaVersion,
  artifactRelationshipCategoryValues,
  buildExampleAdvisoryReadinessSummary,
  buildPhase16GateSummary,
  computeAdvisoryReadinessMetrics,
  loadExampleAdvisoryReadinessSummary,
  loadExampleAdvisoryRoutingSidecars,
  loadExampleAdvisorySideBySideComparisonReport,
  loadExampleMockAdvisoryRoutingOutputs,
  missingEvidenceCategoryValues,
  phase15ImplementedArtifactKindValues,
  phase16MissingInputValues,
  summarizeAdvisoryReadiness,
  validateAdvisoryInterfaceBoundary,
  validateAdvisoryReadinessBoundaries,
  validateAdvisoryReadinessSummaries,
  validateAdvisoryReadinessSummary,
  type AdvisoryReadinessSummary
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadInterfaceBoundaryId = async (): Promise<string> =>
  validateAdvisoryInterfaceBoundary(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "example-advisory-interface-boundary.json"
      )
    )
  ).interfaceBoundaryId;

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  mockOnly: true,
  designOnly: true,
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
  implementsUiSurface: false,
  implementsApiSurface: false,
  implementsCliSurface: false,
  appliesCalibration: false,
  computesScores: false,
  computesThresholds: false,
  introducesAlpha: false,
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
  rawScoreDataIncluded: false,
  rawThresholdDataIncluded: false,
  rawEvaluationDataIncluded: false,
  rawRoutingDataIncluded: false,
  rawComparisonDataIncluded: false,
  rawInterfaceDataIncluded: false,
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
  designOnly: true,
  advisoryOnly: true,
  advisoryRoutingImplemented: false,
  calibratedRoutingImplemented: false,
  productionRoutingChanged: false,
  uiSurfaceImplemented: false,
  apiSurfaceImplemented: false,
  cliSurfaceImplemented: false,
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
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

const requiredTopLevelFields = [
  "schemaVersion",
  "readinessSummaryId",
  "source",
  "phase",
  "completedPhase15Batches",
  "implementedAdvisoryArtifacts",
  "artifactChain",
  "phase15CapabilitySummary",
  "missingEvidenceSummary",
  "phase16GateSummary",
  "productionRoutingReadiness",
  "blockerSummary",
  "boundarySummary",
  "metrics",
  "safety",
  "privacy",
  "claimBoundaries",
  "notes"
] as const;

describe("agent advisory readiness summary schema", () => {
  it("validates the example readiness summary and stable Batch 15.5 metadata", async () => {
    const summary = loadExampleAdvisoryReadinessSummary();
    const built = buildExampleAdvisoryReadinessSummary();

    expect(summary).toEqual(built);
    expect(validateAdvisoryReadinessSummaries([summary])).toEqual([summary]);
    expect(summary.schemaVersion).toBe(
      agentAdvisoryReadinessSummarySchemaVersion
    );
    expect(summary.readinessSummaryId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(summary.readinessSummaryId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(advisoryReadinessSourceValues).toContain(summary.source);
    expect(summary.source).toBe("synthetic_phase_15_readiness_summary");
    expect(summary.phase).toEqual({
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2", "15.3", "15.4", "15.5"],
      currentBatch: "15.5",
      phaseStatus:
        "complete_as_advisory_routing_design_and_readiness_groundwork_only",
      nextPhaseStatus:
        "phase-16-production_authoritative_calibrated_routing_gate_future"
    });
    expect(summary.safety).toEqual(exactSafety);
    expect(summary.privacy).toEqual(exactPrivacy);
    expect(summary.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(advisoryReadinessContainsForbiddenRawString(summary)).toBe(false);
    expect(() => validateAdvisoryReadinessBoundaries(summary)).not.toThrow();
  });

  it("requires top-level readiness objects and rejects invalid boundary labels", () => {
    const summary = loadExampleAdvisoryReadinessSummary();

    for (const key of requiredTopLevelFields) {
      expect(summary).toHaveProperty(key);
    }

    expect(() =>
      validateAdvisoryReadinessSummary({
        ...summary,
        source: "real_production_routing_summary"
      })
    ).toThrow();
    expect(() =>
      advisoryReadinessSummarySchema.parse({
        ...summary,
        readinessSummaryId: "unsafe-repo-branch-001"
      })
    ).toThrow();
    expect(() =>
      advisoryReadinessSafetySchema.parse({
        ...summary.safety,
        implementsProductionRouting: true
      })
    ).toThrow();
    expect(() =>
      advisoryReadinessClaimBoundariesSchema.parse({
        ...summary.claimBoundaries,
        calibratedRoutingImplemented: true
      })
    ).toThrow();
  });

  it("summarizes completed Phase 15 batches without routing or surface authority", () => {
    const summary = loadExampleAdvisoryReadinessSummary();

    expect(
      summary.completedPhase15Batches.map((batch) => batch.batchId)
    ).toEqual(["15.1", "15.2", "15.3", "15.4", "15.5"]);
    for (const batch of summary.completedPhase15Batches) {
      expect(batch.implementsAdvisoryRouting).toBe(false);
      expect(batch.implementsCalibratedRouting).toBe(false);
      expect(batch.changesRuntimeBehavior).toBe(false);
      expect(batch.changesProductionRouting).toBe(false);
      expect(batch.addsUiApiCliSurface).toBe(false);
    }

    const artifactKinds = summary.implementedAdvisoryArtifacts.artifacts.map(
      (artifact) => artifact.artifactKind
    );
    expect(artifactKinds).toEqual([...phase15ImplementedArtifactKindValues]);
    for (const artifact of summary.implementedAdvisoryArtifacts.artifacts) {
      expect(artifact.syntheticOnly).toBe(true);
      expect(artifact.advisoryOnly).toBe(true);
      expect(artifact.runtimeIntegrated).toBe(false);
      expect(artifact.advisoryRoutingImplemented).toBe(false);
      expect(artifact.calibratedRoutingImplemented).toBe(false);
      expect(artifact.productionRoutingChanged).toBe(false);
    }
  });

  it("links the expected Phase 14 and Phase 15 artifact chain", async () => {
    const summary = loadExampleAdvisoryReadinessSummary();
    const sidecarIds = new Set(
      loadExampleAdvisoryRoutingSidecars().map((sidecar) => sidecar.sidecarId)
    );
    const mockOutputIds = new Set(
      loadExampleMockAdvisoryRoutingOutputs().map(
        (output) => output.mockRoutingOutputId
      )
    );
    const comparisonReport = loadExampleAdvisorySideBySideComparisonReport();
    const interfaceBoundaryId = await loadInterfaceBoundaryId();

    expect(summary.artifactChain.orderedArtifacts).toEqual([
      "phase14_readiness_summary",
      "advisory_sidecar_schema",
      "mock_advisory_routing_outputs",
      "side_by_side_comparison_report",
      "advisory_interface_boundary",
      "advisory_readiness_summary"
    ]);
    expect(
      summary.artifactChain.edges.map((edge) => [
        edge.fromArtifact,
        edge.toArtifact
      ])
    ).toEqual([
      ["phase14_readiness_summary", "advisory_sidecar_schema"],
      ["advisory_sidecar_schema", "mock_advisory_routing_outputs"],
      ["mock_advisory_routing_outputs", "side_by_side_comparison_report"],
      ["side_by_side_comparison_report", "advisory_interface_boundary"],
      ["advisory_interface_boundary", "advisory_readiness_summary"]
    ]);
    for (const edge of summary.artifactChain.edges) {
      expect(artifactRelationshipCategoryValues).toContain(
        edge.relationshipCategory
      );
      expect(edge.linkageStatus).toBe("linked_by_stable_synthetic_id");
      expect(edge.rawArtifactEmbedded).toBe(false);
    }
    expect(summary.artifactChain.linkedIds.phase14ReadinessSummaryId).toBe(
      "phase-14-offline-readiness-summary-001"
    );
    for (const sidecarId of summary.artifactChain.linkedIds.sidecarIds) {
      expect(sidecarIds.has(sidecarId)).toBe(true);
    }
    for (const outputId of summary.artifactChain.linkedIds
      .mockRoutingOutputIds) {
      expect(mockOutputIds.has(outputId)).toBe(true);
    }
    expect(summary.artifactChain.linkedIds.sideBySideComparisonReportId).toBe(
      comparisonReport.comparisonReportId
    );
    expect(summary.artifactChain.linkedIds.advisoryInterfaceBoundaryId).toBe(
      interfaceBoundaryId
    );
  });

  it("keeps the capability summary positive while blocking real routing authority", () => {
    const capability =
      loadExampleAdvisoryReadinessSummary().phase15CapabilitySummary;

    expect(capability.advisorySidecarSchemaAvailable).toBe(true);
    expect(capability.mockAdvisoryOutputsAvailable).toBe(true);
    expect(capability.sideBySideComparisonAvailable).toBe(true);
    expect(capability.interfaceBoundaryAvailable).toBe(true);
    expect(capability.readinessGateAvailable).toBe(true);
    expect(capability.advisoryDesignGroundworkComplete).toBe(true);
    expect(capability.realAdvisoryRoutingAvailable).toBe(false);
    expect(capability.calibratedAdvisoryRoutingAvailable).toBe(false);
    expect(capability.productionRoutingAuthorityAvailable).toBe(false);
    expect(capability.uiApiCliSurfaceAvailable).toBe(false);
  });

  it("lists missing evidence and unresolved blockers for calibrated or production claims", () => {
    const summary = loadExampleAdvisoryReadinessSummary();

    expect(summary.missingEvidenceSummary.missingCategories).toEqual([
      ...missingEvidenceCategoryValues
    ]);
    expect(summary.missingEvidenceSummary.evidenceStatus).toBe(
      "missing_future"
    );
    expect(summary.missingEvidenceSummary.allEvidenceFuture).toBe(true);
    expect(
      summary.blockerSummary.blockers.map((blocker) => blocker.blockerCategory)
    ).toEqual([...advisoryReadinessBlockerCategoryValues]);
    for (const blocker of summary.blockerSummary.blockers) {
      expect(blocker.blocksCalibratedAdvisoryRouting).toBe(true);
      expect(blocker.blocksProductionRouting).toBe(true);
      expect(blocker.blocksConformalClaims).toBe(true);
      expect(blocker.resolutionRequiresFutureBatch).toBe(true);
      expect(blocker.resolved).toBe(false);
    }
  });

  it("defines the Phase 16 gate without starting implementation", () => {
    const gate = loadExampleAdvisoryReadinessSummary().phase16GateSummary;

    expect(gate).toEqual(buildPhase16GateSummary());
    expect(gate.handoffReadyForProductionRoutingGateDesign).toBe(true);
    expect(gate.handoffReadyForProductionRoutingImplementation).toBe(false);
    expect(gate.handoffReadyForCalibratedRoutingAuthority).toBe(false);
    expect(gate.missingInputs).toEqual([...phase16MissingInputValues]);
    expect(gate.availableInputs).toEqual(
      expect.arrayContaining([
        "advisory_sidecar_schema",
        "mock_advisory_outputs",
        "side_by_side_comparison_report",
        "advisory_interface_boundary",
        "advisory_readiness_summary",
        "phase14_offline_mock_artifacts",
        "boundary_checklists",
        "claim_boundary_docs"
      ])
    );
    expect(gate.forbiddenPhase16StartingClaims).toEqual(
      expect.arrayContaining([
        "production_routing_is_calibrated",
        "advisory_routing_is_calibrated",
        "conformal_guarantee_exists",
        "risk_is_controlled_at_alpha",
        "real_world_validation_exists",
        "codingactiongate_is_production_grade_calibrated_routing"
      ])
    );
  });

  it("keeps production routing readiness design-only", () => {
    const readiness =
      loadExampleAdvisoryReadinessSummary().productionRoutingReadiness;

    expect(readiness.designInputsAvailable).toBe(true);
    expect(readiness.advisoryArtifactsAvailable).toBe(true);
    expect(readiness.mockComparisonAvailable).toBe(true);
    expect(readiness.interfaceBoundaryAvailable).toBe(true);
    expect(readiness.productionRoutingGateCanBeDesigned).toBe(true);
    expect(readiness.productionRoutingImplementationAllowedNow).toBe(false);
    expect(readiness.calibratedRoutingAuthorityAllowedNow).toBe(false);
    expect(readiness.calibrationRequiredBeforeRealUse).toBe(true);
    expect(readiness.evaluationRequiredBeforeClaims).toBe(true);
    expect(readiness.humanApprovalRequiredBeforeRoutingChanges).toBe(true);
    expect(readiness.defaultOffRequiredForAnyFutureImplementation).toBe(true);
  });

  it("uses synthetic readiness counts only and zeroes real implementation counts", () => {
    const summary = loadExampleAdvisoryReadinessSummary();
    const metrics = summary.metrics;

    expect(metrics).toEqual(
      computeAdvisoryReadinessMetrics({
        completedPhase15BatchCount: 999,
        implementedAdvisoryArtifactCount:
          summary.implementedAdvisoryArtifacts.artifacts.length,
        artifactChainEdgeCount: summary.artifactChain.edges.length
      })
    );
    expect(metrics.completedPhase15BatchCount).toBe(5);
    expect(metrics.implementedAdvisoryArtifactCount).toBe(6);
    expect(metrics.artifactChainEdgeCount).toBe(5);
    expect(metrics.realCalibrationDatasetCount).toBe(0);
    expect(metrics.realReviewedTraceCount).toBe(0);
    expect(metrics.realScoreCount).toBe(0);
    expect(metrics.realNonconformityScoreCount).toBe(0);
    expect(metrics.realThresholdCount).toBe(0);
    expect(metrics.alphaValueCount).toBe(0);
    expect(metrics.empiricalEvaluationResultCount).toBe(0);
    expect(metrics.advisoryRoutingImplementationCount).toBe(0);
    expect(metrics.calibratedRoutingImplementationCount).toBe(0);
    expect(metrics.productionRoutingChangeCount).toBe(0);
    expect(metrics.uiSurfaceImplementationCount).toBe(0);
    expect(metrics.apiSurfaceImplementationCount).toBe(0);
    expect(metrics.cliSurfaceImplementationCount).toBe(0);
  });

  it("provides deterministic pure helpers without runtime integration", async () => {
    const summary = loadExampleAdvisoryReadinessSummary();
    const first = summarizeAdvisoryReadiness(summary);
    const second = summarizeAdvisoryReadiness(
      JSON.parse(JSON.stringify(summary)) as AdvisoryReadinessSummary
    );
    const before = JSON.stringify(summary);

    expect(first).toEqual(second);
    expect(JSON.stringify(summary)).toBe(before);
    expect(first).toMatchObject({
      readinessSummaryId: "phase-15-advisory-readiness-summary-001",
      completedPhase15BatchCount: 5,
      implementedAdvisoryArtifactCount: 6,
      artifactChainEdgeCount: 5,
      handoffReadyForProductionRoutingGateDesign: true,
      handoffReadyForProductionRoutingImplementation: false,
      advisoryDesignGroundworkComplete: true,
      productionRoutingImplementationAllowedNow: false,
      calibratedRoutingAuthorityAllowedNow: false,
      advisoryRoutingImplemented: false,
      productionRoutingChanged: false
    });

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "advisoryReadinessSchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(/runtimeRouter|decisionEngine|router\.route/);
  });
});
