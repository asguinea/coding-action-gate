import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineMockRiskBudgetCategoryValues,
  agentOfflineMockSplitCategoryValues,
  agentOfflineMockThresholdCategoryValues,
  agentOfflineRiskDimensionValues,
  agentOfflineScoreFamilyValues,
  agentOfflineThresholdFutureRequirementValues,
  agentOfflineThresholdPolicyKindValues,
  agentOfflineThresholdSelectionCriterionValues,
  agentOfflineThresholdSelectionSchemaVersion,
  agentOfflineThresholdSelectionStatusValues,
  buildSyntheticOfflineThresholdSelection,
  computeMockThresholdCandidateSummary,
  loadExampleOfflineScoreInputSet,
  loadExampleOfflineSplitSimulation,
  loadExampleOfflineThresholdSelection,
  offlineThresholdSelectionClaimBoundariesSchema,
  offlineThresholdSelectionContainsForbiddenRawString,
  offlineThresholdSelectionPrivacySchema,
  offlineThresholdSelectionSafetySchema,
  offlineThresholdSelectionSchema,
  summarizeOfflineThresholdSelection,
  validateOfflineThresholdSelection,
  validateOfflineThresholdSelectionBoundaries,
  validateOfflineThresholdSelectionLinkage,
  validateOfflineThresholdSelections,
  type OfflineThresholdSelection
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadSelection = async (): Promise<OfflineThresholdSelection> =>
  validateOfflineThresholdSelection(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-threshold-selection.json"
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
  performsRealThresholdSelection: false
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
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent offline threshold selection", () => {
  it("validates schema and stable Phase 14.4 metadata", async () => {
    const selection = await loadSelection();

    expect(selection).toEqual(loadExampleOfflineThresholdSelection());
    expect(selection.schemaVersion).toBe(
      agentOfflineThresholdSelectionSchemaVersion
    );
    expect(selection.thresholdSelectionId).toBe(
      "offline-threshold-selection-synthetic-v1"
    );
    expect(selection.thresholdSelectionId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(selection.thresholdSelectionId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(selection.source).toBe("synthetic_mock_threshold_selection");
    expect(selection.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3"],
      currentBatch: "14.4",
      futureBatches: ["14.5", "14.6"],
      phaseStatus:
        "offline_threshold_selection_mechanics_without_real_thresholds_or_guarantees"
    });
    expect(selection.linkedScoreInputSet).toBeTruthy();
    expect(selection.linkedSplitSimulation).toBeTruthy();
    expect(selection.thresholdPolicy).toBeTruthy();
    expect(selection.mockThresholdCandidates).toHaveLength(3);
    expect(selection.mockBucketSummaries).toBeTruthy();
    expect(selection.mockSelectionSummary).toBeTruthy();
    expect(selection.futureRealThresholdRequirements).toBeTruthy();
    expect(selection.boundarySummary).toBeTruthy();
    expect(selection.safety).toEqual(exactSafety);
    expect(selection.privacy).toEqual(exactPrivacy);
    expect(selection.claimBoundaries).toEqual(exactClaimBoundaries);

    expect(() =>
      offlineThresholdSelectionSchema.parse({
        ...selection,
        source: "real_threshold_selection"
      })
    ).toThrow();
  });

  it("links to Batch 14.2 score inputs and Batch 14.3 split simulation", async () => {
    const selection = await loadSelection();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const scoreInputIds = new Set(
      inputSet.scoreInputs.map((input) => input.scoreInputId)
    );

    expect(() =>
      validateOfflineThresholdSelectionLinkage(
        selection,
        inputSet,
        splitSimulation
      )
    ).not.toThrow();
    expect(selection.linkedScoreInputSet.inputSetId).toBe(inputSet.inputSetId);
    expect(selection.linkedScoreInputSet.rawScoreInputsIncluded).toBe(false);
    expect(selection.linkedSplitSimulation.simulationId).toBe(
      splitSimulation.simulationId
    );
    expect(selection.linkedSplitSimulation.rawSplitSimulationIncluded).toBe(
      false
    );
    for (const scoreInputId of selection.linkedScoreInputSet.scoreInputIds) {
      expect(scoreInputIds.has(scoreInputId)).toBe(true);
    }
    expect(selection.linkedSplitSimulation.mockSplitCategories).toEqual([
      ...agentOfflineMockSplitCategoryValues
    ]);
  });

  it("defines mock-only threshold policy without alpha control", async () => {
    const { thresholdPolicy } = await loadSelection();

    expect(agentOfflineThresholdPolicyKindValues).toContain(
      thresholdPolicy.thresholdPolicyKind
    );
    expect(thresholdPolicy.thresholdPolicyKind).toBe("mock_mechanics_only");
    expect(thresholdPolicy.allowedMockThresholdCategories).toEqual([
      ...agentOfflineMockThresholdCategoryValues
    ]);
    expect(thresholdPolicy.mockRiskBudgetCategories).toEqual([
      ...agentOfflineMockRiskBudgetCategoryValues
    ]);
    expect(thresholdPolicy.selectionCriterionCategories).toEqual([
      ...agentOfflineThresholdSelectionCriterionValues
    ]);
    expect(thresholdPolicy.thresholdSelectionAllowedForMockMechanics).toBe(
      true
    );
    expect(thresholdPolicy.realThresholdSelectionAllowed).toBe(false);
    expect(thresholdPolicy.alphaControlAllowed).toBe(false);
    expect(thresholdPolicy.realCalibrationDataRequiredForRealThreshold).toBe(
      true
    );
    expect(thresholdPolicy.approvedSplitRequiredForRealThreshold).toBe(true);
    expect(thresholdPolicy.conformalProcedureRequiredForGuaranteeClaims).toBe(
      true
    );
    expect(JSON.stringify(thresholdPolicy)).not.toMatch(/\b0\.(?:0?1|05|1)\b/);
    expect(JSON.stringify(thresholdPolicy)).not.toMatch(/\b(?:1|5|10)%\b/);
  });

  it("keeps mock threshold candidates controlled and without values", async () => {
    const selection = await loadSelection();
    const scoreFamilies = new Set(agentOfflineScoreFamilyValues);
    const riskDimensions = new Set(agentOfflineRiskDimensionValues);
    const thresholdCategories = new Set(
      agentOfflineMockThresholdCategoryValues
    );
    const budgetCategories = new Set(agentOfflineMockRiskBudgetCategoryValues);
    const statuses = new Set(agentOfflineThresholdSelectionStatusValues);

    for (const candidate of selection.mockThresholdCandidates) {
      expect(thresholdCategories.has(candidate.mockThresholdCategory)).toBe(
        true
      );
      expect(budgetCategories.has(candidate.mockRiskBudgetCategory)).toBe(true);
      expect(statuses.has(candidate.selectionStatus)).toBe(true);
      expect(
        candidate.relatedScoreFamilies.every((family) =>
          scoreFamilies.has(family)
        )
      ).toBe(true);
      expect(
        candidate.relatedRiskDimensions.every((dimension) =>
          riskDimensions.has(dimension)
        )
      ).toBe(true);
      expect(candidate.realThresholdComputed).toBe(false);
      expect(candidate.numericThresholdValueIncluded).toBe(false);
      expect(candidate.alphaValueIncluded).toBe(false);
      expect(candidate.conformalGuaranteeClaimed).toBe(false);
    }

    expect(
      selection.mockThresholdCandidates.some(
        (candidate) =>
          candidate.selectionStatus === "mock_selected_for_mechanics"
      )
    ).toBe(true);
    expect(
      selection.mockThresholdCandidates.some((candidate) =>
        ["mock_candidate_only", "mock_rejected_for_mechanics"].includes(
          candidate.selectionStatus
        )
      )
    ).toBe(true);
    expect(JSON.stringify(selection.mockThresholdCandidates)).not.toMatch(
      /\b0\.(?:0?1|05|1)\b|\b(?:1|5|10)%\b/
    );
  });

  it("summarizes mock buckets without real calibration or test buckets", async () => {
    const { mockBucketSummaries } = await loadSelection();
    const summaries = [
      mockBucketSummaries.mockTrainSummary,
      mockBucketSummaries.mockCalibrationSummary,
      mockBucketSummaries.mockTestSummary,
      mockBucketSummaries.mockHoldoutSummary,
      mockBucketSummaries.mockNotEligibleSummary
    ];

    expect(mockBucketSummaries.realCalibrationBucketExists).toBe(false);
    expect(mockBucketSummaries.realTestBucketExists).toBe(false);
    for (const summary of summaries) {
      expect(agentOfflineMockSplitCategoryValues).toContain(
        summary.mockSplitCategory
      );
      expect(summary.mockOnly).toBe(true);
      expect(summary.realBucket).toBe(false);
      expect(summary.mockInputCount).toBeGreaterThanOrEqual(0);
    }
    expect(mockBucketSummaries.mockCalibrationSummary.realBucket).toBe(false);
    expect(mockBucketSummaries.mockTestSummary.realBucket).toBe(false);
  });

  it("computes deterministic mock selection summaries with real counts at zero", async () => {
    const selection = await loadSelection();

    expect(
      computeMockThresholdCandidateSummary(selection.mockThresholdCandidates)
    ).toEqual(selection.mockSelectionSummary);
    expect(selection.mockSelectionSummary).toEqual({
      candidateCount: 3,
      mockSelectedCandidateCount: 1,
      mockRejectedCandidateCount: 1,
      realThresholdComputedCount: 0,
      numericThresholdValueCount: 0,
      alphaValueCount: 0,
      conformalGuaranteeClaimCount: 0,
      statisticalGuaranteeClaimCount: 0,
      selectionMechanicsExercised: true,
      realSelectionPerformed: false
    });
  });

  it("keeps all future real threshold requirements unmet", async () => {
    const selection = await loadSelection();

    expect(
      selection.futureRealThresholdRequirements.requirements.map(
        (requirement) => requirement.requirementId
      )
    ).toEqual([...agentOfflineThresholdFutureRequirementValues]);
    expect(
      selection.futureRealThresholdRequirements.allRequirementsFutureOrUnmet
    ).toBe(true);
    for (const requirement of selection.futureRealThresholdRequirements
      .requirements) {
      expect(requirement.status).toBe("future_unmet");
      expect(requirement.requiredBeforeRealThresholdSelection).toBe(true);
    }
  });

  it("keeps helpers deterministic, pure, and boundary-safe", async () => {
    const selection = await loadSelection();
    const inputSet = loadExampleOfflineScoreInputSet();
    const splitSimulation = loadExampleOfflineSplitSimulation();
    const built = buildSyntheticOfflineThresholdSelection(
      inputSet,
      splitSimulation
    );

    expect(built).toEqual(selection);
    expect(validateOfflineThresholdSelections([selection])).toEqual([
      selection
    ]);
    expect(summarizeOfflineThresholdSelection(selection)).toEqual({
      thresholdSelectionId: "offline-threshold-selection-synthetic-v1",
      candidateCount: 3,
      mockSelectedCandidateCount: 1,
      realThresholdComputedCount: 0,
      alphaValueCount: 0,
      realSelectionPerformed: false
    });
    expect(() =>
      validateOfflineThresholdSelectionBoundaries(selection)
    ).not.toThrow();
    expect(
      offlineThresholdSelectionSafetySchema.parse(selection.safety)
    ).toEqual(exactSafety);
    expect(
      offlineThresholdSelectionPrivacySchema.parse(selection.privacy)
    ).toEqual(exactPrivacy);
    expect(
      offlineThresholdSelectionClaimBoundariesSchema.parse(
        selection.claimBoundaries
      )
    ).toEqual(exactClaimBoundaries);
    expect(offlineThresholdSelectionContainsForbiddenRawString(selection)).toBe(
      false
    );
  });

  it("does not add dynamic reads, commands, network calls, thresholds, alpha, scoring, or conformal implementation", async () => {
    const schemaSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "thresholdSelectionSchema.ts"
      ),
      "utf8"
    );
    const loaderSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "thresholdSelection.ts"
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
      /computeRealThreshold/i,
      /thresholdValue\s*=/i,
      /alpha\s*=/i,
      /conformalRiskControlImplemented:\s*true/
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
  });
});
