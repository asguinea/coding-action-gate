import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineArtifactKindValues,
  agentOfflineArtifactLinkageStatusValues,
  agentOfflineArtifactRelationshipValues,
  agentOfflineBlockerCategoryValues,
  agentOfflineMissingEvidenceValues,
  agentOfflinePhase15AvailableInputValues,
  agentOfflinePhase15ForbiddenClaimValues,
  agentOfflinePhase15MissingInputValues,
  agentOfflineReadinessSourceValues,
  agentOfflineReadinessSummarySchemaVersion,
  buildPhase15HandoffSummary,
  buildSyntheticOfflineReadinessSummary,
  computeOfflineReadinessMetrics,
  loadExampleOfflineEvaluationReport,
  loadExampleOfflineReadinessSummary,
  loadExampleOfflineScoreInputSet,
  loadExampleOfflineSplitSimulation,
  loadExampleOfflineThresholdSelection,
  offlineReadinessClaimBoundariesSchema,
  offlineReadinessContainsForbiddenRawString,
  offlineReadinessPrivacySchema,
  offlineReadinessSafetySchema,
  offlineReadinessSummarySchema,
  summarizeOfflineReadiness,
  validateOfflineReadinessBoundaries,
  validateOfflineReadinessLinkage,
  validateOfflineReadinessSummaries,
  validateOfflineReadinessSummary,
  validateRiskLossDesign,
  type OfflineReadinessSummary
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadSummary = async (): Promise<OfflineReadinessSummary> =>
  validateOfflineReadinessSummary(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-offline-readiness-summary.json"
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
  designOnly: true,
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
  implementsAdvisoryRouting: false,
  implementsProductionRouting: false,
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
  rawRoutingDataIncluded: false,
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
  realCalibrationDataset: false,
  realCalibrationRecord: false,
  realReviewedTrace: false,
  realAgentExecution: false,
  realCodingActionGateExecution: false,
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
  advisoryRoutingImplemented: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent offline readiness summary", () => {
  it("validates schema and stable Phase 14.6 metadata", async () => {
    const summary = await loadSummary();

    expect(summary).toEqual(loadExampleOfflineReadinessSummary());
    expect(summary.schemaVersion).toBe(
      agentOfflineReadinessSummarySchemaVersion
    );
    expect(summary.readinessSummaryId).toBe(
      "phase-14-offline-readiness-summary-001"
    );
    expect(summary.readinessSummaryId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(summary.readinessSummaryId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(agentOfflineReadinessSourceValues).toContain(summary.source);
    expect(summary.source).toBe("synthetic_phase_14_readiness_summary");
    expect(summary.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"],
      currentBatch: "14.6",
      phaseStatus:
        "complete_as_offline_synthetic_mock_prototype_groundwork_only",
      nextPhaseStatus: "phase-15-advisory-routing-future"
    });
    expect(summary.completedPhase14Batches).toHaveLength(6);
    expect(summary.implementedOfflineArtifacts.artifacts.length).toBe(8);
    expect(summary.artifactChain.edges).toHaveLength(5);
    expect(summary.safety).toEqual(exactSafety);
    expect(summary.privacy).toEqual(exactPrivacy);
    expect(summary.claimBoundaries).toEqual(exactClaimBoundaries);

    expect(() =>
      offlineReadinessSummarySchema.parse({
        ...summary,
        source: "future_advisory_routing_summary"
      })
    ).toThrow();
  });

  it("summarizes completed batches and artifacts without computation", async () => {
    const summary = await loadSummary();
    const artifactKinds = new Set(agentOfflineArtifactKindValues);

    expect(
      summary.completedPhase14Batches.map((batch) => batch.batchId)
    ).toEqual(["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"]);
    for (const batch of summary.completedPhase14Batches) {
      expect(batch.computesScores).toBe(false);
      expect(batch.computesThresholds).toBe(false);
      expect(batch.introducesAlpha).toBe(false);
      expect(batch.appliesCalibration).toBe(false);
      expect(batch.implementsConformalRiskControl).toBe(false);
      expect(batch.changesRuntimeBehavior).toBe(false);
    }

    expect(
      summary.implementedOfflineArtifacts.artifacts.map(
        (artifact) => artifact.artifactKind
      )
    ).toEqual([...agentOfflineArtifactKindValues]);
    for (const artifact of summary.implementedOfflineArtifacts.artifacts) {
      expect(artifactKinds.has(artifact.artifactKind)).toBe(true);
      expect(artifact.syntheticOnly).toBe(true);
      expect(artifact.realDataUsed).toBe(false);
      expect(artifact.runtimeIntegrated).toBe(false);
      expect(artifact.scoresComputed).toBe(false);
      expect(artifact.thresholdsComputed).toBe(false);
      expect(artifact.alphaIntroduced).toBe(false);
      expect(artifact.calibrationApplied).toBe(false);
      expect(artifact.conformalImplemented).toBe(false);
    }
  });

  it("links the Phase 14 artifact chain to existing synthetic examples", async () => {
    const summary = await loadSummary();
    const riskLossDesign = await loadRiskLossDesign();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const thresholdSelection = loadExampleOfflineThresholdSelection();
    const evaluationReport = loadExampleOfflineEvaluationReport();

    expect(() =>
      validateOfflineReadinessLinkage(
        summary,
        riskLossDesign,
        inputSet,
        splitSimulation,
        thresholdSelection,
        evaluationReport
      )
    ).not.toThrow();
    expect(
      summary.artifactChain.edges.map((edge) => [
        edge.fromArtifact,
        edge.toArtifact
      ])
    ).toEqual([
      ["risk_loss_design", "offline_score_input_schema"],
      ["offline_score_input_schema", "mock_split_simulation"],
      ["mock_split_simulation", "mock_threshold_selection_mechanics"],
      [
        "mock_threshold_selection_mechanics",
        "offline_evaluation_report_schema"
      ],
      ["offline_evaluation_report_schema", "phase_14_readiness_summary"]
    ]);
    for (const edge of summary.artifactChain.edges) {
      expect(agentOfflineArtifactRelationshipValues).toContain(
        edge.relationshipCategory
      );
      expect(agentOfflineArtifactLinkageStatusValues).toContain(
        edge.linkageStatus
      );
      expect(edge.rawArtifactEmbedded).toBe(false);
    }
  });

  it("records positive capabilities while keeping real capabilities unavailable", async () => {
    const { phase14CapabilitySummary } = await loadSummary();

    expect(phase14CapabilitySummary).toEqual({
      riskLossDesignAvailable: true,
      mockScoreInputsAvailable: true,
      mockNonconformityInputsAvailable: true,
      mockSplitMechanicsAvailable: true,
      mockThresholdMechanicsAvailable: true,
      evaluationReportSchemaAvailable: true,
      readinessHandoffAvailable: true,
      offlinePrototypeGroundworkComplete: true,
      realExperimentCapabilityAvailable: false,
      advisoryRoutingCapabilityAvailable: false,
      productionRoutingCapabilityAvailable: false
    });
  });

  it("keeps missing evidence and blockers unresolved for future work", async () => {
    const summary = await loadSummary();

    expect(
      summary.missingEvidenceSummary.missingEvidence.map(
        (evidence) => evidence.evidenceCategory
      )
    ).toEqual([...agentOfflineMissingEvidenceValues]);
    for (const evidence of summary.missingEvidenceSummary.missingEvidence) {
      expect(evidence.status).toBe("future_missing");
      expect(evidence.requiredBeforeRealClaims).toBe(true);
    }

    expect(
      summary.blockerSummary.blockers.map((blocker) => blocker.blockerCategory)
    ).toEqual([...agentOfflineBlockerCategoryValues]);
    for (const blocker of summary.blockerSummary.blockers) {
      expect(blocker.status).toBe("unresolved_future");
      expect(blocker.blocksConformalClaims).toBe(true);
      expect(blocker.blocksProductionRouting).toBe(true);
      expect(blocker.resolutionRequiresFutureBatch).toBe(true);
    }
  });

  it("defines Phase 15 handoff as design-only and not implementation-ready", async () => {
    const { phase15HandoffSummary, advisoryRoutingReadiness } =
      await loadSummary();

    expect(phase15HandoffSummary).toEqual(buildPhase15HandoffSummary());
    expect(phase15HandoffSummary.handoffReadyForAdvisoryRoutingDesign).toBe(
      true
    );
    expect(
      phase15HandoffSummary.handoffReadyForAdvisoryRoutingImplementation
    ).toBe(false);
    expect(phase15HandoffSummary.handoffReadyForProductionRouting).toBe(false);
    expect(phase15HandoffSummary.availableInputs).toEqual([
      ...agentOfflinePhase15AvailableInputValues
    ]);
    expect(phase15HandoffSummary.missingInputs).toEqual([
      ...agentOfflinePhase15MissingInputValues
    ]);
    expect(phase15HandoffSummary.forbiddenPhase15StartingClaims).toEqual([
      ...agentOfflinePhase15ForbiddenClaimValues
    ]);
    expect(advisoryRoutingReadiness).toEqual({
      designInputsAvailable: true,
      mockInputsAvailable: true,
      advisorySchemaCanBeDesigned: true,
      advisoryImplementationAllowedNow: false,
      productionAuthorityAllowedNow: false,
      calibrationRequiredBeforeRealUse: true,
      evaluationRequiredBeforeClaims: true,
      humanApprovalRequiredBeforeRoutingChanges: true
    });
  });

  it("keeps readiness metrics deterministic and non-performance-bearing", async () => {
    const summary = await loadSummary();

    expect(summary.metrics).toEqual({
      completedPhase14BatchCount: 6,
      implementedOfflineArtifactCount: 8,
      artifactChainEdgeCount: 5,
      realCalibrationDatasetCount: 0,
      realReviewedTraceCount: 0,
      realScoreCount: 0,
      realNonconformityScoreCount: 0,
      realThresholdCount: 0,
      alphaValueCount: 0,
      empiricalEvaluationResultCount: 0,
      conformalImplementationCount: 0,
      advisoryRoutingImplementationCount: 0,
      productionRoutingChangeCount: 0
    });
    expect(computeOfflineReadinessMetrics(summary)).toEqual(summary.metrics);
    expect(JSON.stringify(summary.metrics)).not.toMatch(
      /accuracy|precision|recall|f1|risk reduction|statistical confidence|productivity/i
    );
  });

  it("keeps helpers pure, deterministic, and boundary-safe", async () => {
    const summary = await loadSummary();
    const riskLossDesign = await loadRiskLossDesign();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const thresholdSelection = loadExampleOfflineThresholdSelection();
    const evaluationReport = loadExampleOfflineEvaluationReport();

    expect(
      buildSyntheticOfflineReadinessSummary(
        riskLossDesign,
        inputSet,
        splitSimulation,
        thresholdSelection,
        evaluationReport
      )
    ).toEqual(summary);
    expect(validateOfflineReadinessSummaries([summary, summary])).toEqual([
      summary,
      summary
    ]);
    expect(summarizeOfflineReadiness(summary)).toEqual({
      readinessSummaryId: "phase-14-offline-readiness-summary-001",
      completedPhase14BatchCount: 6,
      implementedOfflineArtifactCount: 8,
      artifactChainEdgeCount: 5,
      handoffReadyForAdvisoryRoutingDesign: true,
      advisoryRoutingImplementationAllowedNow: false,
      productionRoutingChangeCount: 0
    });
    expect(() => validateOfflineReadinessBoundaries(summary)).not.toThrow();
    expect(offlineReadinessContainsForbiddenRawString(summary)).toBe(false);
    expect(offlineReadinessSafetySchema.parse(summary.safety)).toEqual(
      exactSafety
    );
    expect(offlineReadinessPrivacySchema.parse(summary.privacy)).toEqual(
      exactPrivacy
    );
    expect(
      offlineReadinessClaimBoundariesSchema.parse(summary.claimBoundaries)
    ).toEqual(exactClaimBoundaries);
  });

  it("does not add filesystem, command, network, metric, threshold, alpha, or routing execution helpers", async () => {
    const schemaSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "offlineReadinessSchema.ts"
      ),
      "utf8"
    );
    const loaderSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "offlineReadiness.ts"
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
      /implementRouting/i,
      /alpha\s*=/i
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
  });
});
