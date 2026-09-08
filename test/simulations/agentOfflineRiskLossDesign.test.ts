import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentOfflineRiskCrcIntendedUseValues,
  agentOfflineRiskDimensionValues,
  agentOfflineRiskForbiddenCurrentUseValues,
  agentOfflineRiskFutureEvidenceValues,
  agentOfflineRiskLabelInputStatusValues,
  agentOfflineRiskLabelInputValues,
  agentOfflineRiskLossDesignSchemaVersion,
  agentOfflineRiskLossFamilyValues,
  agentOfflineRiskLossSeverityValues,
  agentOfflineRiskNonconformityInputFamilyValues,
  agentOfflineRiskUnsuitableCurrentUseValues,
  computeRiskLossDesignBoundarySummary,
  riskLossDesignClaimBoundariesSchema,
  riskLossDesignContainsForbiddenRawString,
  riskLossDesignPrivacySchema,
  riskLossDesignSafetySchema,
  riskLossDesignSchema,
  summarizeRiskLossDesign,
  validateRiskLossDesign,
  validateRiskLossDesignSafety,
  type RiskLossDesign
} from "../../simulations/agent/index.js";

const designPath = path.join(
  process.cwd(),
  "simulations",
  "agent",
  "offline-risk",
  "example-risk-loss-design.json"
);

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadDesign = async (): Promise<RiskLossDesign> =>
  validateRiskLossDesign(await readJson(designPath));

const exactSafety = {
  inert: true,
  syntheticOnly: true,
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

describe("agent offline risk/loss design", () => {
  it("validates design schema, deterministic ID, source, and Phase 14 metadata", async () => {
    const design = await loadDesign();

    expect(design.schemaVersion).toBe(agentOfflineRiskLossDesignSchemaVersion);
    expect(design.designId).toBe("phase-14-offline-risk-loss-design-v1");
    expect(design.designId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(design.designId).not.toMatch(
      /@|\/|\\|uuid|timestamp|branch|package|user|email/i
    );
    expect(design.source).toBe("synthetic_design_only");
    expect(design.phase).toEqual({
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: [],
      currentBatch: "14.1",
      futureBatches: ["14.2", "14.3", "14.4", "14.5", "14.6"],
      phaseStatus:
        "offline_prototype_design_started_without_calibration_or_guarantees"
    });

    expect(() =>
      riskLossDesignSchema.parse({ ...design, source: "real_calibration_data" })
    ).toThrow();
  });

  it("defines all required loss families without numeric losses or formulas", async () => {
    const design = await loadDesign();
    const lossIds = design.candidateLossFamilies.map(
      (loss) => loss.lossFamilyId
    );
    const serialized = JSON.stringify(design);

    expect(lossIds).toEqual([...agentOfflineRiskLossFamilyValues]);
    expect(serialized).not.toMatch(
      /formula|equation|weight|numericValue|lossValue/i
    );

    for (const loss of design.candidateLossFamilies) {
      expect(agentOfflineRiskLossSeverityValues).toContain(
        loss.severityCategory
      );
      expect(loss.futureNumericDefinitionNeeded).toBe(true);
      expect(loss.numericLossComputed).toBe(false);
      expect(loss.computableWithCurrentSyntheticExamples).toBe(false);
      expect(loss.realReviewedTracesRequired).toBe(true);
      expect(loss.requiredLabels.length).toBeGreaterThan(0);
      expect(loss.requiredEvidence).toContain("real_reviewed_traces");
    }
  });

  it("defines all required risk dimensions without risk score computation", async () => {
    const design = await loadDesign();
    const lossIds = new Set(
      design.candidateLossFamilies.map((loss) => loss.lossFamilyId)
    );

    expect(
      design.candidateRiskDimensions.map((risk) => risk.riskDimensionId)
    ).toEqual([...agentOfflineRiskDimensionValues]);

    for (const risk of design.candidateRiskDimensions) {
      expect(
        risk.relatedUncertaintyDimensions.every((dimension) =>
          /^[a-z][a-z0-9_]*$/.test(dimension)
        )
      ).toBe(true);
      for (const lossFamily of risk.relatedLossFamilies) {
        expect(lossIds.has(lossFamily)).toBe(true);
      }
      expect(risk.futureScoreNeeded).toBe(true);
      expect(risk.scoreComputed).toBe(false);
      expect(risk.realDataRequired).toBe(true);
      expect(risk.requiredEvidence).toContain("risk_score_definitions");
    }
  });

  it("keeps label inputs and future evidence category-only and future-bound", async () => {
    const design = await loadDesign();

    expect(
      design.requiredLabelInputs.map((input) => input.labelInputId)
    ).toEqual([...agentOfflineRiskLabelInputValues]);
    for (const input of design.requiredLabelInputs) {
      expect(agentOfflineRiskLabelInputStatusValues).toContain(
        input.currentStatus
      );
      expect(input.currentStatus).not.toBe("real_label_available");
      expect(input.realReviewedTraceRequired).toBe(true);
      expect(input.adjudicationRequiredBeforeUse).toBe(true);
    }

    expect(design.requiredFutureEvidence.evidenceCategories).toEqual([
      ...agentOfflineRiskFutureEvidenceValues
    ]);
    expect(design.requiredFutureEvidence.allEvidenceFutureOrMissing).toBe(true);
    expect(design.requiredFutureEvidence.realEvidenceIncluded).toBe(false);
  });

  it("keeps nonconformity and CRC/conformal design non-computing and non-claiming", async () => {
    const design = await loadDesign();

    expect(design.nonconformityInputDesign.possibleInputFamilies).toEqual([
      ...agentOfflineRiskNonconformityInputFamilyValues
    ]);
    expect(design.nonconformityInputDesign.nonconformityScoresComputed).toBe(
      false
    );
    expect(design.nonconformityInputDesign.riskScoresComputed).toBe(false);
    expect(design.nonconformityInputDesign.thresholdsComputed).toBe(false);
    expect(design.crcUseDesign.intendedFutureUse).toEqual([
      ...agentOfflineRiskCrcIntendedUseValues
    ]);
    expect(design.crcUseDesign.forbiddenCurrentUse).toEqual([
      ...agentOfflineRiskForbiddenCurrentUseValues
    ]);
    expect(design.crcUseDesign.crcImplemented).toBe(false);
    expect(design.crcUseDesign.conformalImplemented).toBe(false);
    expect(design.crcUseDesign.statisticalGuaranteeClaimed).toBe(false);
    expect(design.crcUseDesign.alphaIntroduced).toBe(false);
  });

  it("lists unsuitable current uses explicitly", async () => {
    const design = await loadDesign();

    expect(design.unsuitableCurrentUses).toEqual([
      ...agentOfflineRiskUnsuitableCurrentUseValues
    ]);
  });

  it("enforces exact safety, privacy, claim-boundary, and zero-boundary flags", async () => {
    const design = await loadDesign();

    expect(design.safety).toEqual(exactSafety);
    expect(design.privacy).toEqual(exactPrivacy);
    expect(design.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(() => riskLossDesignSafetySchema.parse(design.safety)).not.toThrow();
    expect(() =>
      riskLossDesignPrivacySchema.parse(design.privacy)
    ).not.toThrow();
    expect(() =>
      riskLossDesignClaimBoundariesSchema.parse(design.claimBoundaries)
    ).not.toThrow();
    expect(computeRiskLossDesignBoundarySummary(design)).toEqual({
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0,
      numericComputationBoundaryViolationCount: 0
    });
    expect(() => validateRiskLossDesignSafety(design)).not.toThrow();
    expect(riskLossDesignContainsForbiddenRawString(design)).toBe(false);
  });

  it("summarizes design boundaries without computing losses, scores, thresholds, or alpha", async () => {
    const design = await loadDesign();

    expect(summarizeRiskLossDesign(design)).toEqual({
      designId: "phase-14-offline-risk-loss-design-v1",
      candidateLossFamilyCount: agentOfflineRiskLossFamilyValues.length,
      candidateRiskDimensionCount: agentOfflineRiskDimensionValues.length,
      numericLossesComputed: false,
      riskScoresComputed: false,
      thresholdsComputed: false,
      alphaIntroduced: false
    });
  });

  it("keeps helpers pure, non-executing, non-mutating, and local-only by source inspection", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "offline-risk",
        "riskLossDesignSchema.ts"
      ),
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
