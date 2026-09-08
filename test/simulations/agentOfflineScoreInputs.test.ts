import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineRiskDimensionValues,
  agentOfflineRiskLossFamilyValues,
  agentOfflineScoreFamilyValues,
  agentOfflineScoreFeatureInputValues,
  agentOfflineScoreFutureRequirementValues,
  agentOfflineScoreInputSchemaVersion,
  agentOfflineScoreInputSetSchemaVersion,
  agentOfflineScoreLabelInputValues,
  agentOfflineScoreNonconformityInputFamilyValues,
  computeScoreFamilyCoverage,
  loadExampleOfflineScoreInputSet,
  offlineScoreClaimBoundariesSchema,
  offlineScoreInputContainsForbiddenRawString,
  offlineScoreInputSchema,
  offlineScoreInputSetSchema,
  offlineScorePrivacySchema,
  offlineScoreSafetySchema,
  summarizeOfflineScoreInput,
  summarizeOfflineScoreInputSet,
  validateOfflineScoreBoundaries,
  validateOfflineScoreInput,
  validateOfflineScoreInputSet,
  validateOfflineScoreRiskLossLinkage,
  validateRiskLossDesign,
  type OfflineScoreInputSet
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadInputSet = async (): Promise<OfflineScoreInputSet> =>
  validateOfflineScoreInputSet(
    await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "example-offline-score-inputs.json"
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
  assignsDatasetSplits: false,
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
  realCodingActionGateExecution: false,
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
  alphaIntroduced: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  productionRoutingChanged: false,
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent offline score inputs", () => {
  it("validates aggregate and record schemas with stable Phase 14.2 metadata", async () => {
    const inputSet = await loadInputSet();

    expect(inputSet).toEqual(loadExampleOfflineScoreInputSet());
    expect(inputSet.schemaVersion).toBe(agentOfflineScoreInputSetSchemaVersion);
    expect(inputSet.inputSetId).toBe("offline-score-input-set-synthetic-v1");
    expect(inputSet.inputSetId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(inputSet.inputSetId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(inputSet.source).toBe("synthetic_mock_score_input");
    expect(inputSet.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1"],
      currentBatch: "14.2",
      futureBatches: ["14.3", "14.4", "14.5", "14.6"],
      phaseStatus:
        "offline_score_schema_and_mock_inputs_without_calibration_or_guarantees"
    });
    expect(inputSet.scoreInputs).toHaveLength(5);

    for (const input of inputSet.scoreInputs) {
      expect(input.schemaVersion).toBe(agentOfflineScoreInputSchemaVersion);
      expect(input.scoreInputId).toMatch(
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
      );
      expect(input.source).toBe("synthetic_mock_score_input");
      expect(input.linkedRiskLossDesign).toBeTruthy();
      expect(input.sourceArtifact).toBeTruthy();
      expect(input.candidateScoreFamilies.length).toBeGreaterThan(0);
      expect(input.mockFeatureInputs.length).toBeGreaterThan(0);
      expect(input.mockLabelInputs.length).toBeGreaterThan(0);
      expect(input.mockNonconformityInput).toBeTruthy();
      expect(input.futureScoringRequirements).toBeTruthy();
    }

    expect(() =>
      offlineScoreInputSchema.parse({
        ...inputSet.scoreInputs[0],
        source: "real_score_input"
      })
    ).toThrow();
    expect(() =>
      offlineScoreInputSetSchema.parse({
        ...inputSet,
        source: "future_offline_experiment_score_input"
      })
    ).toThrow();
  });

  it("links to the Batch 14.1 risk/loss design and Phase 13 synthetic artifacts", async () => {
    const inputSet = await loadInputSet();
    const riskLossDesign = validateRiskLossDesign(
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
    const calibrationRecords = (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "calibration",
        "example-calibration-records.json"
      )
    )) as Array<{ calibrationRecordId: string }>;
    const calibrationRecordIds = new Set(
      calibrationRecords.map((record) => record.calibrationRecordId)
    );
    const manifest = (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "calibration",
        "example-calibration-manifest.json"
      )
    )) as { manifestId: string };
    const completeness = (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "calibration",
        "example-label-completeness-report.json"
      )
    )) as { reportId: string };
    const split = (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "calibration",
        "example-split-planning-report.json"
      )
    )) as { reportId: string };
    const readiness = (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "calibration",
        "example-calibration-readiness-summary.json"
      )
    )) as { readinessSummaryId: string };

    for (const input of inputSet.scoreInputs) {
      expect(() =>
        validateOfflineScoreRiskLossLinkage(input, riskLossDesign)
      ).not.toThrow();
      expect(input.linkedRiskLossDesign.rawDesignIncluded).toBe(false);
      expect(input.sourceArtifact.rawArtifactIncluded).toBe(false);
      expect(
        calibrationRecordIds.has(input.sourceArtifact.calibrationRecordId ?? "")
      ).toBe(true);
      expect(input.sourceArtifact.manifestId).toBe(manifest.manifestId);
      expect(input.sourceArtifact.labelCompletenessReportId).toBe(
        completeness.reportId
      );
      expect(input.sourceArtifact.splitPlanningReportId).toBe(split.reportId);
      expect(input.sourceArtifact.readinessSummaryId).toBe(
        readiness.readinessSummaryId
      );
    }
  });

  it("covers all required score families without score values or formulas", async () => {
    const inputSet = await loadInputSet();
    const allFamilies = inputSet.scoreInputs.flatMap(
      (input) => input.candidateScoreFamilies
    );
    const familyIds = allFamilies.map((family) => family.scoreFamilyId);
    const serialized = JSON.stringify(inputSet);

    expect(new Set(familyIds)).toEqual(new Set(agentOfflineScoreFamilyValues));
    expect(serialized).not.toMatch(
      /formula|equation|scoreValue|riskValue|nonconformityValue|thresholdValue|alphaValue/i
    );

    for (const family of allFamilies) {
      expect(agentOfflineRiskDimensionValues).toContain(
        family.relatedRiskDimension
      );
      for (const loss of family.relatedLossFamilies) {
        expect(agentOfflineRiskLossFamilyValues).toContain(loss);
      }
      for (const feature of family.requiredFeatureInputs) {
        expect(agentOfflineScoreFeatureInputValues).toContain(feature);
      }
      for (const label of family.requiredLabelInputs) {
        expect(agentOfflineScoreLabelInputValues).toContain(label);
      }
      expect(family.futureScoreDefinitionNeeded).toBe(true);
      expect(family.mockInputsProvided).toBe(true);
      expect(family.realScoreComputed).toBe(false);
      expect(family.nonconformityScoreComputed).toBe(false);
    }
  });

  it("keeps mock feature and label inputs category-only and non-real", async () => {
    const inputSet = await loadInputSet();

    for (const input of inputSet.scoreInputs) {
      for (const feature of input.mockFeatureInputs) {
        expect(agentOfflineScoreFeatureInputValues).toContain(
          feature.featureFamily
        );
        expect(feature.valueCategory).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(feature.sourceCategory).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(feature.mockOnly).toBe(true);
        expect(feature.computedFromRealData).toBe(false);
      }

      for (const label of input.mockLabelInputs) {
        expect(agentOfflineScoreLabelInputValues).toContain(label.labelFamily);
        expect(label.valueCategory).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(label.sourceCategory).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(label.mockOnly).toBe(true);
        expect(label.realHumanReviewed).toBe(false);
        expect(label.adjudicated).toBe(false);
      }
    }
  });

  it("keeps mock nonconformity inputs non-computing and alpha-free", async () => {
    const inputSet = await loadInputSet();

    for (const input of inputSet.scoreInputs) {
      for (const family of input.mockNonconformityInput.inputFamilies) {
        expect(agentOfflineScoreNonconformityInputFamilyValues).toContain(
          family
        );
      }
      expect(input.mockNonconformityInput.mockInputReadyForSchemaTesting).toBe(
        true
      );
      expect(
        input.mockNonconformityInput.readyForRealNonconformityScoring
      ).toBe(false);
      expect(input.mockNonconformityInput.nonconformityScoreComputed).toBe(
        false
      );
      expect(input.mockNonconformityInput.riskScoreComputed).toBe(false);
      expect(input.mockNonconformityInput.thresholdComputed).toBe(false);
      expect(input.mockNonconformityInput.alphaIntroduced).toBe(false);
    }
  });

  it("keeps all future scoring requirements unmet", async () => {
    const inputSet = await loadInputSet();

    for (const input of inputSet.scoreInputs) {
      expect(
        input.futureScoringRequirements.requirements.map(
          (requirement) => requirement.requirementId
        )
      ).toEqual([...agentOfflineScoreFutureRequirementValues]);
      expect(input.futureScoringRequirements.allRequirementsFutureOrUnmet).toBe(
        true
      );
      for (const requirement of input.futureScoringRequirements.requirements) {
        expect(requirement.status).toBe("future_unmet");
        expect(requirement.requiredBeforeRealScoring).toBe(true);
      }
    }
  });

  it("summarizes aggregate score-family coverage deterministically", async () => {
    const inputSet = await loadInputSet();

    expect(inputSet.scoreFamilyCoverage).toEqual({
      requiredScoreFamilyCount: agentOfflineScoreFamilyValues.length,
      coveredScoreFamilyCount: agentOfflineScoreFamilyValues.length,
      missingScoreFamilyCount: 0,
      scoreComputedCount: 0,
      nonconformityScoreComputedCount: 0,
      thresholdComputedCount: 0
    });
    expect(computeScoreFamilyCoverage(inputSet.scoreInputs)).toEqual(
      inputSet.scoreFamilyCoverage
    );
    expect(summarizeOfflineScoreInputSet(inputSet)).toEqual({
      inputSetId: "offline-score-input-set-synthetic-v1",
      scoreInputCount: 5,
      coveredScoreFamilyCount: agentOfflineScoreFamilyValues.length,
      missingScoreFamilyCount: 0,
      realScoreComputedCount: 0,
      nonconformityScoreComputedCount: 0,
      thresholdComputedCount: 0
    });
    const firstInput = inputSet.scoreInputs[0];
    expect(firstInput).toBeDefined();
    expect(summarizeOfflineScoreInput(firstInput!)).toEqual({
      scoreInputId: "offline-score-input-synthetic-block-001",
      candidateScoreFamilyCount: 3,
      mockFeatureInputCount: 4,
      mockLabelInputCount: 3,
      realScoreComputed: false,
      nonconformityScoreComputed: false,
      thresholdComputed: false,
      alphaIntroduced: false
    });
  });

  it("enforces exact safety, privacy, claim-boundary, and zero-boundary flags", async () => {
    const inputSet = await loadInputSet();

    expect(inputSet.safety).toEqual(exactSafety);
    expect(inputSet.privacy).toEqual(exactPrivacy);
    expect(inputSet.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() => offlineScoreSafetySchema.parse(inputSet.safety)).not.toThrow();
    expect(() =>
      offlineScorePrivacySchema.parse(inputSet.privacy)
    ).not.toThrow();
    expect(() =>
      offlineScoreClaimBoundariesSchema.parse(inputSet.claimBoundaries)
    ).not.toThrow();
    expect(() => validateOfflineScoreBoundaries(inputSet)).not.toThrow();
    expect(offlineScoreInputContainsForbiddenRawString(inputSet)).toBe(false);

    for (const input of inputSet.scoreInputs) {
      expect(input.safety).toEqual(exactSafety);
      expect(input.privacy).toEqual(exactPrivacy);
      expect(input.claimBoundaries).toEqual(exactClaimBoundaries);
      expect(() => validateOfflineScoreBoundaries(input)).not.toThrow();
      expect(offlineScoreInputContainsForbiddenRawString(input)).toBe(false);
      expect(validateOfflineScoreInput(input)).toEqual(input);
    }
  });

  it("keeps helpers pure, non-executing, non-mutating, and local-only by source inspection", async () => {
    const schemaSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "offlineScoreSchema.ts"
      ),
      "utf8"
    );
    const inputsSource = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "offlineScoreInputs.ts"
      ),
      "utf8"
    );

    for (const source of [schemaSource, inputsSource]) {
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
    }
  });
});
