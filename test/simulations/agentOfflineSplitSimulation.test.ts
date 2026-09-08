import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineFutureSplitCategoryValues,
  agentOfflineMockSplitCategoryValues,
  agentOfflineSplitExclusionReasonValues,
  agentOfflineSplitFutureRequirementValues,
  agentOfflineSplitGroupingKeyValues,
  agentOfflineSplitLeakageRiskValues,
  agentOfflineSplitSimulationSchemaVersion,
  buildSyntheticOfflineSplitSimulation,
  computeMockLeakageSummary,
  computeMockSplitBalance,
  loadExampleOfflineScoreInputSet,
  loadExampleOfflineSplitSimulation,
  offlineSplitSimulationClaimBoundariesSchema,
  offlineSplitSimulationContainsForbiddenRawString,
  offlineSplitSimulationPrivacySchema,
  offlineSplitSimulationSafetySchema,
  offlineSplitSimulationSchema,
  summarizeOfflineSplitSimulation,
  validateOfflineSplitSimulation,
  validateOfflineSplitSimulationBoundaries,
  validateOfflineSplitSimulationScoreInputLinkage,
  validateOfflineSplitSimulations,
  type OfflineSplitSimulation
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadSimulation = async (): Promise<OfflineSplitSimulation> =>
  validateOfflineSplitSimulation(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-split-simulation.json"
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
  rawManifestDataIncluded: false,
  rawAdjudicationDataIncluded: false,
  rawSplitDataIncluded: false,
  rawScoreDataIncluded: false,
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
  realStepHarborExecution: false,
  realValidationResult: false,
  realWorldResult: false,
  calibrationDatasetCreated: false,
  calibrationApplied: false,
  realDatasetSplitsAssigned: false,
  splitManifestCreated: false,
  numericLossesComputed: false,
  riskScoresComputed: false,
  nonconformityScoresComputed: false,
  thresholdsComputed: false,
  alphaIntroduced: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent offline split simulation", () => {
  it("validates schema and stable Phase 14.3 metadata", async () => {
    const simulation = await loadSimulation();

    expect(simulation).toEqual(loadExampleOfflineSplitSimulation());
    expect(simulation.schemaVersion).toBe(
      agentOfflineSplitSimulationSchemaVersion
    );
    expect(simulation.simulationId).toBe(
      "offline-split-simulation-synthetic-v1"
    );
    expect(simulation.simulationId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(simulation.simulationId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(simulation.source).toBe("synthetic_mock_split_simulation");
    expect(simulation.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2"],
      currentBatch: "14.3",
      futureBatches: ["14.4", "14.5", "14.6"],
      phaseStatus:
        "offline_split_mechanics_simulation_without_real_splits_or_calibration"
    });

    expect(simulation.linkedScoreInputSet).toBeTruthy();
    expect(simulation.splitPolicy).toBeTruthy();
    expect(simulation.mockSplitBuckets).toBeTruthy();
    expect(simulation.evaluatedMockInputs).toHaveLength(5);
    expect(simulation.leakageCheckSummary).toBeTruthy();
    expect(simulation.splitBalanceSummary).toBeTruthy();
    expect(simulation.futureRealSplitRequirements).toBeTruthy();
    expect(simulation.boundarySummary).toBeTruthy();
    expect(simulation.safety).toEqual(exactSafety);
    expect(simulation.privacy).toEqual(exactPrivacy);
    expect(simulation.claimBoundaries).toEqual(exactClaimBoundaries);

    expect(() =>
      offlineSplitSimulationSchema.parse({
        ...simulation,
        source: "real_split_simulation"
      })
    ).toThrow();
  });

  it("links only to the Batch 14.2 aggregate mock score input set", async () => {
    const simulation = await loadSimulation();
    const inputSet = loadExampleOfflineScoreInputSet();
    const scoreInputIds = new Set(
      inputSet.scoreInputs.map((input) => input.scoreInputId)
    );

    expect(() =>
      validateOfflineSplitSimulationScoreInputLinkage(simulation, inputSet)
    ).not.toThrow();
    expect(simulation.linkedScoreInputSet).toEqual({
      inputSetId: inputSet.inputSetId,
      schemaVersion: inputSet.schemaVersion,
      source: inputSet.source,
      scoreInputIds: inputSet.scoreInputs.map((input) => input.scoreInputId),
      rawScoreInputsIncluded: false
    });

    for (const bucket of Object.values(simulation.mockSplitBuckets)) {
      for (const scoreInputId of bucket.scoreInputIds) {
        expect(scoreInputIds.has(scoreInputId)).toBe(true);
      }
      expect(bucket.realSplitAssigned).toBe(false);
    }

    for (const evaluatedInput of simulation.evaluatedMockInputs) {
      expect(scoreInputIds.has(evaluatedInput.scoreInputId)).toBe(true);
      expect(evaluatedInput.rawInputIncluded).toBe(false);
    }
  });

  it("defines controlled split policy categories with real split assignment blocked", async () => {
    const { splitPolicy } = await loadSimulation();

    expect(splitPolicy.allowedMockSplitCategories).toEqual([
      ...agentOfflineMockSplitCategoryValues
    ]);
    expect(splitPolicy.futureRealSplitCategories).toEqual([
      ...agentOfflineFutureSplitCategoryValues
    ]);
    expect(splitPolicy.groupingKeys).toEqual([
      ...agentOfflineSplitGroupingKeyValues
    ]);
    expect(splitPolicy.leakageRiskCategories).toEqual([
      ...agentOfflineSplitLeakageRiskValues
    ]);
    expect(splitPolicy.mockSplitAssignmentAllowed).toBe(true);
    expect(splitPolicy.realSplitAssignmentAllowed).toBe(false);
    expect(splitPolicy.realReviewedTracesRequiredForRealSplit).toBe(true);
    expect(splitPolicy.approvedCalibrationDatasetRequiredForRealSplit).toBe(
      true
    );
    expect(splitPolicy.syntheticExamplesCanBeAssignedToRealSplit).toBe(false);
  });

  it("keeps mock buckets mechanics-only and covers required bucket paths", async () => {
    const simulation = await loadSimulation();

    expect(Object.keys(simulation.mockSplitBuckets).sort()).toEqual(
      [...agentOfflineMockSplitCategoryValues].sort()
    );
    expect(
      simulation.mockSplitBuckets.mock_calibration.scoreInputIds
    ).toContain("offline-score-input-synthetic-escalate-001");
    expect(simulation.mockSplitBuckets.mock_test.scoreInputIds).toContain(
      "offline-score-input-synthetic-recovery-001"
    );
    expect(
      simulation.mockSplitBuckets.mock_not_eligible.scoreInputIds
    ).toContain("offline-score-input-synthetic-friction-coverage-001");
    expect(
      Object.values(simulation.mockSplitBuckets).every(
        (bucket) => bucket.realSplitAssigned === false
      )
    ).toBe(true);
    expect(simulation.safety.createsSplitManifest).toBe(false);
    expect(simulation.claimBoundaries.splitManifestCreated).toBe(false);
  });

  it("evaluates mock inputs with controlled categories and no real split claims", async () => {
    const simulation = await loadSimulation();
    const mockCategories = new Set(agentOfflineMockSplitCategoryValues);
    const futureCategories = new Set(agentOfflineFutureSplitCategoryValues);
    const leakageCategories = new Set(agentOfflineSplitLeakageRiskValues);
    const groupingKeys = new Set(agentOfflineSplitGroupingKeyValues);
    const exclusionReasons = new Set(agentOfflineSplitExclusionReasonValues);

    for (const evaluatedInput of simulation.evaluatedMockInputs) {
      expect(mockCategories.has(evaluatedInput.mockSplitCategory)).toBe(true);
      expect(futureCategories.has(evaluatedInput.futureRealSplitCategory)).toBe(
        true
      );
      expect(evaluatedInput.realSplitAssigned).toBe(false);
      expect(evaluatedInput.rawInputIncluded).toBe(false);
      expect(
        evaluatedInput.leakageRiskCategories.every((category) =>
          leakageCategories.has(category)
        )
      ).toBe(true);
      expect(
        evaluatedInput.groupingKeyCategories.every((category) =>
          groupingKeys.has(category)
        )
      ).toBe(true);
      expect(
        evaluatedInput.exclusionReasonCategories.every((category) =>
          exclusionReasons.has(category)
        )
      ).toBe(true);
    }

    expect(
      simulation.evaluatedMockInputs.some(
        (input) => input.mockSplitCategory === "mock_calibration"
      )
    ).toBe(true);
    expect(
      simulation.evaluatedMockInputs.some(
        (input) => input.mockSplitCategory === "mock_test"
      )
    ).toBe(true);
    expect(
      simulation.evaluatedMockInputs.some(
        (input) => input.mockSplitCategory === "mock_not_eligible"
      )
    ).toBe(true);
  });

  it("computes deterministic leakage and split-balance summaries with real counts at zero", async () => {
    const simulation = await loadSimulation();

    expect(computeMockLeakageSummary(simulation.evaluatedMockInputs)).toEqual(
      simulation.leakageCheckSummary
    );
    expect(computeMockSplitBalance(simulation.evaluatedMockInputs)).toEqual(
      simulation.splitBalanceSummary
    );
    expect(simulation.leakageCheckSummary).toMatchObject({
      totalEvaluatedInputs: 5,
      totalInputsWithLeakageRisk: 4,
      sameScenarioFamilyCount: 1,
      sameScoreFamilyCount: 3,
      sameRiskDimensionCount: 2,
      duplicatedOrNearDuplicateMockInputCount: 1,
      syntheticExampleOnlyCount: 4,
      noLeakageRiskDetectedCount: 1,
      realLeakageAnalysisPerformed: false
    });
    expect(simulation.splitBalanceSummary).toEqual({
      totalMockInputs: 5,
      mockTrainCount: 2,
      mockCalibrationCount: 1,
      mockTestCount: 1,
      mockHoldoutCount: 0,
      mockNotEligibleCount: 1,
      realTrainCount: 0,
      realCalibrationCount: 0,
      realTestCount: 0,
      realHoldoutCount: 0,
      realSplitAssignedCount: 0
    });
  });

  it("keeps all future real split requirements unmet", async () => {
    const simulation = await loadSimulation();

    expect(
      simulation.futureRealSplitRequirements.requirements.map(
        (requirement) => requirement.requirementId
      )
    ).toEqual([...agentOfflineSplitFutureRequirementValues]);
    expect(
      simulation.futureRealSplitRequirements.allRequirementsFutureOrUnmet
    ).toBe(true);
    for (const requirement of simulation.futureRealSplitRequirements
      .requirements) {
      expect(requirement.status).toBe("future_unmet");
      expect(requirement.requiredBeforeRealSplit).toBe(true);
    }
  });

  it("keeps helpers deterministic, pure, and boundary-safe", async () => {
    const simulation = await loadSimulation();
    const inputSet = loadExampleOfflineScoreInputSet();
    const built = buildSyntheticOfflineSplitSimulation(inputSet);

    expect(built).toEqual(simulation);
    expect(validateOfflineSplitSimulations([simulation])).toEqual([simulation]);
    expect(summarizeOfflineSplitSimulation(simulation)).toEqual({
      simulationId: "offline-split-simulation-synthetic-v1",
      totalMockInputs: 5,
      mockCalibrationCount: 1,
      mockTestCount: 1,
      realSplitAssignedCount: 0,
      realLeakageAnalysisPerformed: false
    });
    expect(() =>
      validateOfflineSplitSimulationBoundaries(simulation)
    ).not.toThrow();
    expect(offlineSplitSimulationSafetySchema.parse(simulation.safety)).toEqual(
      exactSafety
    );
    expect(
      offlineSplitSimulationPrivacySchema.parse(simulation.privacy)
    ).toEqual(exactPrivacy);
    expect(
      offlineSplitSimulationClaimBoundariesSchema.parse(
        simulation.claimBoundaries
      )
    ).toEqual(exactClaimBoundaries);
    expect(offlineSplitSimulationContainsForbiddenRawString(simulation)).toBe(
      false
    );
  });

  it("does not add dynamic file reads, command execution, network calls, scoring, thresholds, or alpha", async () => {
    const schemaSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "splitSimulationSchema.ts"
      ),
      "utf8"
    );
    const loaderSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "splitSimulation.ts"
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
      /computeRiskScore/i,
      /computeNonconformity/i,
      /computeThreshold/i,
      /alpha\s*=/i
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
  });
});
