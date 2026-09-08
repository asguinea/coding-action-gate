import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExampleProductionRoutingEligibility,
  currentProductionEligibilityCategoryValues,
  deterministicSafetyOverrideCategoryValues,
  loadExampleAdvisoryReadinessSummary,
  loadExampleProductionRoutingEligibility,
  phase15ArtifactValues,
  productionEligibilityBlockerCategoryValues,
  productionEligibilityClaimBoundariesSchema,
  productionEligibilityContainsForbiddenRawString,
  productionEligibilityReasonCategoryValues,
  productionEligibilitySafetySchema,
  productionEligibilitySourceValues,
  productionEvidenceStatusValues,
  productionFallbackCategoryValues,
  productionFallbackTargetCategoryValues,
  productionHumanApprovalCategoryValues,
  productionRequiredEvidenceCategoryValues,
  productionRoutingEligibilitySchema,
  summarizeProductionRoutingEligibility,
  validateProductionRoutingEligibility,
  validateProductionRoutingEligibilityBoundaries,
  validateProductionRoutingEligibilityRecords,
  type ProductionRoutingEligibility
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  gateDesignOnly: true,
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
  addsPolicyFlag: false,
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
  rawGateDataIncluded: false,
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
  gateDesignOnly: true,
  productionRoutingEligible: false,
  advisoryRoutingImplemented: false,
  calibratedRoutingImplemented: false,
  productionRoutingChanged: false,
  policyFlagAdded: false,
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
  "eligibilityRecordId",
  "source",
  "phase",
  "linkedAdvisoryReadiness",
  "eligibilityStatus",
  "requiredEvidence",
  "calibrationRequirements",
  "evaluationRequirements",
  "routingAuthorityRequirements",
  "safetyOverrideRequirements",
  "fallbackRequirements",
  "humanApprovalRequirements",
  "phase17EvidenceHandoff",
  "blockerSummary",
  "safety",
  "privacy",
  "claimBoundaries",
  "notes"
] as const;

describe("agent production routing eligibility schema", () => {
  it("validates the example eligibility record and stable Batch 16.1 metadata", () => {
    const record = loadExampleProductionRoutingEligibility();
    const built = buildExampleProductionRoutingEligibility();

    expect(record).toEqual(built);
    expect(validateProductionRoutingEligibilityRecords([record])).toEqual([
      record
    ]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe(
      "agent-production-routing-eligibility.v1"
    );
    expect(record.eligibilityRecordId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(record.eligibilityRecordId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(productionEligibilitySourceValues).toContain(record.source);
    expect(record.source).toBe("synthetic_production_eligibility_design");
    expect(record.phase).toEqual({
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: [],
      currentBatch: "16.1",
      futureBatches: ["16.2", "16.3", "16.4", "16.5"],
      phaseStatus:
        "production_routing_eligibility_design_started_without_routing_implementation"
    });
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(productionEligibilityContainsForbiddenRawString(record)).toBe(false);
    expect(() =>
      validateProductionRoutingEligibilityBoundaries(record)
    ).not.toThrow();
  });

  it("rejects invalid enum labels and boundary crossings", () => {
    const record = loadExampleProductionRoutingEligibility();

    expect(() =>
      validateProductionRoutingEligibility({
        ...record,
        source: "real_production_eligibility"
      })
    ).toThrow();
    expect(() =>
      productionRoutingEligibilitySchema.parse({
        ...record,
        eligibilityRecordId: "unsafe-repo-branch-001"
      })
    ).toThrow();
    expect(() =>
      productionEligibilitySafetySchema.parse({
        ...record.safety,
        implementsProductionRouting: true
      })
    ).toThrow();
    expect(() =>
      productionEligibilityClaimBoundariesSchema.parse({
        ...record.claimBoundaries,
        productionRoutingEligible: true
      })
    ).toThrow();
  });

  it("links to Batch 15.5 advisory readiness without embedding the raw artifact", () => {
    const record = loadExampleProductionRoutingEligibility();
    const readiness = loadExampleAdvisoryReadinessSummary();

    expect(record.linkedAdvisoryReadiness.readinessSummaryId).toBe(
      readiness.readinessSummaryId
    );
    expect(record.linkedAdvisoryReadiness.schemaVersion).toBe(
      readiness.schemaVersion
    );
    expect(record.linkedAdvisoryReadiness.source).toBe(readiness.source);
    expect(record.linkedAdvisoryReadiness.availablePhase15Artifacts).toEqual([
      ...phase15ArtifactValues
    ]);
    expect(record.linkedAdvisoryReadiness.rawReadinessArtifactIncluded).toBe(
      false
    );
  });

  it("keeps eligibility status controlled and not eligible now", () => {
    const status = loadExampleProductionRoutingEligibility().eligibilityStatus;

    expect(currentProductionEligibilityCategoryValues).toContain(
      status.currentEligibilityCategory
    );
    expect(status.currentEligibilityCategory).toBe("not_eligible");
    expect(status.productionRoutingEligibleNow).toBe(false);
    expect(status.advisoryRoutingEligibleNow).toBe(false);
    expect(status.calibratedRoutingEligibleNow).toBe(false);
    expect(status.eligibilityCanBeReconsideredAfterFutureEvidence).toBe(true);
    expect(status.reasonCategories).toEqual([
      ...productionEligibilityReasonCategoryValues
    ]);
  });

  it("lists required evidence and keeps real evidence missing or future", () => {
    const evidence =
      loadExampleProductionRoutingEligibility().requiredEvidence.evidence;

    expect(evidence.map((entry) => entry.evidenceCategory)).toEqual([
      ...productionRequiredEvidenceCategoryValues
    ]);
    for (const entry of evidence) {
      expect(productionEvidenceStatusValues).toContain(entry.currentStatus);
      expect(["missing", "future_required"]).toContain(entry.currentStatus);
      expect(entry.requiredBeforeProductionAuthority).toBe(true);
      expect(entry.requiredBeforeCalibratedClaims).toBe(true);
      expect(entry.requiredBeforeAdvisoryImplementation).toBe(true);
    }
  });

  it("keeps calibration, evaluation, and routing authority unavailable now", () => {
    const record = loadExampleProductionRoutingEligibility();

    expect(record.calibrationRequirements.calibrationAvailableNow).toBe(false);
    expect(record.evaluationRequirements.realEvaluationResultsAvailable).toBe(
      false
    );
    expect(record.evaluationRequirements.empiricalMetricsAvailable).toBe(false);
    expect(
      record.routingAuthorityRequirements.productionAuthorityAllowedNow
    ).toBe(false);
    expect(record.routingAuthorityRequirements.explicitPolicyFlagRequired).toBe(
      true
    );
    expect(record.routingAuthorityRequirements.defaultOffRequired).toBe(true);
    expect(
      record.routingAuthorityRequirements.deterministicSafetyOverridesRequired
    ).toBe(true);
  });

  it("requires deterministic safety overrides that calibrated layers may not override", () => {
    const overrides =
      loadExampleProductionRoutingEligibility().safetyOverrideRequirements
        .overrides;

    expect(overrides.map((override) => override.overrideCategory)).toEqual([
      ...deterministicSafetyOverrideCategoryValues
    ]);
    for (const override of overrides) {
      expect(override.deterministicOverrideRequired).toBe(true);
      expect(override.calibratedLayerMayOverride).toBe(false);
    }
  });

  it("requires fallback categories with controlled targets", () => {
    const fallbacks =
      loadExampleProductionRoutingEligibility().fallbackRequirements.fallbacks;

    expect(fallbacks.map((fallback) => fallback.fallbackCategory)).toEqual([
      ...productionFallbackCategoryValues
    ]);
    for (const fallback of fallbacks) {
      expect(fallback.fallbackRequired).toBe(true);
      expect(productionFallbackTargetCategoryValues).toContain(
        fallback.fallbackTargetCategory
      );
    }
  });

  it("requires human approvals and keeps all approvals ungranted", () => {
    const approvals =
      loadExampleProductionRoutingEligibility().humanApprovalRequirements
        .approvals;

    expect(approvals.map((approval) => approval.approvalCategory)).toEqual([
      ...productionHumanApprovalCategoryValues
    ]);
    for (const approval of approvals) {
      expect(approval.approvalGranted).toBe(false);
    }
  });

  it("hands off to Phase 17 real-agent evidence before the gate can pass", () => {
    const handoff =
      loadExampleProductionRoutingEligibility().phase17EvidenceHandoff;

    expect(handoff.realAgentEvidenceRequired).toBe(true);
    expect(handoff.controlledTraceCollectionRequired).toBe(true);
    expect(handoff.reviewedTraceLabelsRequired).toBe(true);
    expect(handoff.baselineComparisonOnRealControlledTracesRequired).toBe(true);
    expect(handoff.calibrationDatasetConstructionAfterTraceReviewRequired).toBe(
      true
    );
    expect(handoff.recommendedNextEvidencePhase).toBe(
      "phase-17-real-agent-integration"
    );
    expect(handoff.productionRoutingGateCannotPassWithoutPhase17Evidence).toBe(
      true
    );
  });

  it("lists unresolved blockers for production authority and calibrated claims", () => {
    const blockers =
      loadExampleProductionRoutingEligibility().blockerSummary.blockers;

    expect(blockers.map((blocker) => blocker.blockerCategory)).toEqual([
      ...productionEligibilityBlockerCategoryValues
    ]);
    for (const blocker of blockers) {
      expect(blocker.blocksProductionAuthority).toBe(true);
      expect(blocker.blocksCalibratedClaims).toBe(true);
      expect(blocker.blocksRiskControlClaims).toBe(true);
      expect(blocker.resolutionRequiresFutureEvidence).toBe(true);
      expect(blocker.resolved).toBe(false);
    }
  });

  it("provides deterministic pure summaries without runtime integration", async () => {
    const record = loadExampleProductionRoutingEligibility();
    const first = summarizeProductionRoutingEligibility(record);
    const second = summarizeProductionRoutingEligibility(
      JSON.parse(JSON.stringify(record)) as ProductionRoutingEligibility
    );
    const before = JSON.stringify(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
    expect(first).toMatchObject({
      eligibilityRecordId: "phase-16-production-eligibility-001",
      currentEligibilityCategory: "not_eligible",
      productionRoutingEligibleNow: false,
      calibratedRoutingEligibleNow: false,
      productionAuthorityAllowedNow: false,
      requiredEvidenceCount: productionRequiredEvidenceCategoryValues.length,
      blockerCount: productionEligibilityBlockerCategoryValues.length,
      phase17EvidenceRequired: true,
      deterministicSafetyOverridesRequired: true,
      policyFlagAdded: false
    });

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "productionEligibilitySchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(/runtimeRouter|decisionEngine|router\.route/);
  });
});
