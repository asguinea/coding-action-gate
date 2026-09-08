import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advisoryDecisionCategoryValues,
  advisoryDecisionSourceCategoryValues,
  advisoryEvidenceRequirementValues,
  advisoryExplanationCategoryValues,
  advisoryLossFamilyValues,
  advisoryMissingEvidenceCategoryValues,
  advisoryPhase14ArtifactKindValues,
  advisoryPhase14DesignInputValues,
  advisoryRecommendationCategoryValues,
  advisoryRecommendationScopeValues,
  advisoryRecommendationStrengthCategoryValues,
  advisoryRiskDimensionValues,
  advisoryRoutingClaimBoundariesSchema,
  advisoryRoutingContainsForbiddenRawString,
  advisoryRoutingPrivacySchema,
  advisoryRoutingSafetySchema,
  advisoryRoutingSidecarSchema,
  advisoryRoutingSourceValues,
  advisoryUncertaintyDimensionValues,
  agentAdvisoryRoutingSidecarSchemaVersion,
  loadExampleAdvisoryRoutingSidecars,
  summarizeAdvisoryRoutingSidecar,
  validateAdvisoryRoutingAuthorityBoundary,
  validateAdvisoryRoutingClaimBoundaries,
  validateAdvisoryRoutingSidecar,
  validateAdvisoryRoutingSidecarBoundaries,
  validateAdvisoryRoutingSidecars,
  type AdvisoryRoutingSidecar
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadSidecarsFromFile = async (): Promise<AdvisoryRoutingSidecar[]> =>
  validateAdvisoryRoutingSidecars(
    (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "example-advisory-sidecars.json"
      )
    )) as unknown[]
  );

const exactSafety = {
  inert: true,
  syntheticOnly: true,
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
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

const requiredPhase14Artifacts = [
  "risk_loss_design",
  "offline_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_simulation",
  "mock_threshold_selection_mechanics",
  "offline_evaluation_report_schema"
] as const;

describe("agent advisory routing sidecar schema", () => {
  it("validates examples and stable Batch 15.1 metadata", async () => {
    const sidecars = await loadSidecarsFromFile();

    expect(sidecars).toEqual(loadExampleAdvisoryRoutingSidecars());
    expect(sidecars.length).toBeGreaterThanOrEqual(3);
    expect(sidecars.length).toBeLessThanOrEqual(6);

    for (const sidecar of sidecars) {
      expect(sidecar.schemaVersion).toBe(
        agentAdvisoryRoutingSidecarSchemaVersion
      );
      expect(sidecar.sidecarId).toMatch(
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
      );
      expect(sidecar.sidecarId).not.toMatch(
        /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
      );
      expect(advisoryRoutingSourceValues).toContain(sidecar.source);
      expect(sidecar.source).toBe("synthetic_advisory_sidecar_design");
      expect(sidecar.phase).toEqual({
        phaseId: "phase-15",
        phaseName: "Advisory Calibrated Routing Design",
        completedPreviousPhase:
          "phase-14-complete-offline-synthetic-mock-groundwork-only",
        completedBatches: [],
        currentBatch: "15.1",
        futureBatches: ["15.2", "15.3", "15.4", "15.5"],
        phaseStatus:
          "advisory_routing_schema_design_started_without_routing_implementation"
      });
      expect(sidecar.safety).toEqual(exactSafety);
      expect(sidecar.privacy).toEqual(exactPrivacy);
      expect(sidecar.claimBoundaries).toEqual(exactClaimBoundaries);
      expect(advisoryRoutingContainsForbiddenRawString(sidecar)).toBe(false);
    }
  });

  it("requires top-level sidecar objects and rejects invalid enum labels", async () => {
    const sidecars = await loadSidecarsFromFile();
    const sidecar = sidecars[0]!;

    for (const key of [
      "schemaVersion",
      "sidecarId",
      "source",
      "phase",
      "linkedDeterministicDecision",
      "linkedPhase14Readiness",
      "advisoryRecommendation",
      "advisoryExplanation",
      "advisoryEvidenceRequirements",
      "authorityBoundary",
      "futureRoutingRequirements",
      "safety",
      "privacy",
      "claimBoundaries",
      "notes"
    ]) {
      expect(sidecar).toHaveProperty(key);
    }

    expect(() =>
      advisoryRoutingSidecarSchema.parse({
        ...sidecar,
        source: "real_advisory_routing"
      })
    ).toThrow();
    expect(() =>
      advisoryRoutingSidecarSchema.parse({
        ...sidecar,
        linkedDeterministicDecision: {
          ...sidecar.linkedDeterministicDecision,
          decisionCategory: "ALLOW"
        }
      })
    ).toThrow();
    expect(() =>
      advisoryRoutingSidecarSchema.parse({
        ...sidecar,
        advisoryRecommendation: {
          ...sidecar.advisoryRecommendation,
          recommendationCategory: "calibrated_route"
        }
      })
    ).toThrow();
    expect(() =>
      advisoryRoutingSafetySchema.parse({
        ...sidecar.safety,
        computesScores: true
      })
    ).toThrow();
    expect(() =>
      advisoryRoutingPrivacySchema.parse({
        ...sidecar.privacy,
        rawPromptIncluded: true
      })
    ).toThrow();
    expect(() =>
      advisoryRoutingClaimBoundariesSchema.parse({
        ...sidecar.claimBoundaries,
        conformalGuarantee: true
      })
    ).toThrow();
  });

  it("enforces the deterministic decision boundary", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      const linked = sidecar.linkedDeterministicDecision;

      expect(advisoryDecisionCategoryValues).toContain(linked.decisionCategory);
      expect(advisoryDecisionSourceCategoryValues).toContain(
        linked.decisionSourceCategory
      );
      expect(linked.deterministicDecisionRemainsAuthoritative).toBe(true);
      expect(linked.advisoryMayOverrideDecision).toBe(false);
      expect(linked.productionRoutingChanged).toBe(false);
      expect(linked.rawDecisionPayloadIncluded).toBe(false);
    }
  });

  it("links to the Batch 14.6 readiness summary without embedding raw readiness artifacts", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      const readiness = sidecar.linkedPhase14Readiness;

      expect(readiness.readinessSummaryId).toBe(
        "phase-14-offline-readiness-summary-001"
      );
      for (const artifact of requiredPhase14Artifacts) {
        expect(readiness.linkedArtifactKinds).toContain(artifact);
      }
      for (const artifact of readiness.linkedArtifactKinds) {
        expect(advisoryPhase14ArtifactKindValues).toContain(artifact);
      }
      for (const input of readiness.availableDesignInputs) {
        expect(advisoryPhase14DesignInputValues).toContain(input);
      }
      for (const missing of readiness.missingEvidenceCategories) {
        expect(advisoryMissingEvidenceCategoryValues).toContain(missing);
      }
      expect(readiness.rawReadinessArtifactIncluded).toBe(false);
    }
  });

  it("keeps recommendations advisory-only and non-calibrated", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      const recommendation = sidecar.advisoryRecommendation;

      expect(advisoryRecommendationCategoryValues).toContain(
        recommendation.recommendationCategory
      );
      expect(advisoryRecommendationStrengthCategoryValues).toContain(
        recommendation.recommendationStrengthCategory
      );
      expect(advisoryRecommendationScopeValues).toContain(
        recommendation.recommendationScope
      );
      expect(recommendation.advisoryOnly).toBe(true);
      expect(recommendation.calibrated).toBe(false);
      expect(recommendation.conformal).toBe(false);
      expect(recommendation.thresholdBased).toBe(false);
      expect(recommendation.alphaBased).toBe(false);
      expect(recommendation.productionAuthoritative).toBe(false);
    }
  });

  it("keeps explanations category-only with no raw model text", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      const explanation = sidecar.advisoryExplanation;

      for (const category of explanation.explanationCategories) {
        expect(advisoryExplanationCategoryValues).toContain(category);
      }
      for (const dimension of explanation.relatedUncertaintyDimensions) {
        expect(advisoryUncertaintyDimensionValues).toContain(dimension);
      }
      for (const dimension of explanation.relatedRiskDimensions) {
        expect(advisoryRiskDimensionValues).toContain(dimension);
      }
      for (const family of explanation.relatedLossFamilies) {
        expect(advisoryLossFamilyValues).toContain(family);
      }
      expect(explanation.rawExplanationTextIncluded).toBe(false);
    }
  });

  it("records future evidence requirements as unmet", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      expect(sidecar.advisoryEvidenceRequirements.requiredCategories).toEqual([
        ...advisoryEvidenceRequirementValues
      ]);
      expect(sidecar.advisoryEvidenceRequirements.evidenceStatus).toBe(
        "future_unmet"
      );
      expect(sidecar.advisoryEvidenceRequirements.allRequirementsFuture).toBe(
        true
      );
    }
  });

  it("enforces the authority boundary", async () => {
    const sidecars = await loadSidecarsFromFile();

    for (const sidecar of sidecars) {
      const authority = sidecar.authorityBoundary;

      expect(authority.deterministicDecisionAuthoritative).toBe(true);
      expect(authority.advisorySidecarNonAuthoritative).toBe(true);
      expect(authority.advisoryCanBlock).toBe(false);
      expect(authority.advisoryCanProceed).toBe(false);
      expect(authority.advisoryCanEscalate).toBe(false);
      expect(authority.advisoryCanDefer).toBe(false);
      expect(authority.advisoryCanChangeRuntimeDecision).toBe(false);
      expect(authority.requiresExplicitFutureIntegration).toBe(true);
      expect(authority.routingBehaviorChanged).toBe(false);
      expect(() =>
        validateAdvisoryRoutingAuthorityBoundary(sidecar)
      ).not.toThrow();
    }
  });

  it("covers expected example recommendation categories without changing decisions", async () => {
    const sidecars = await loadSidecarsFromFile();
    const categories = new Set(
      sidecars.map(
        (sidecar) => sidecar.advisoryRecommendation.recommendationCategory
      )
    );

    expect(categories).toEqual(
      new Set([
        "advisory_aligns_with_deterministic_decision",
        "advisory_suggests_more_context",
        "advisory_suggests_human_review",
        "advisory_suggests_hard_stop",
        "advisory_suggests_lower_friction"
      ])
    );

    for (const sidecar of sidecars) {
      validateAdvisoryRoutingSidecarBoundaries(sidecar);
      validateAdvisoryRoutingClaimBoundaries(sidecar);
      expect(sidecar.linkedDeterministicDecision.productionRoutingChanged).toBe(
        false
      );
      expect(sidecar.safety.changesRuntimeBehavior).toBe(false);
      expect(sidecar.claimBoundaries.advisoryRoutingImplemented).toBe(false);
      expect(sidecar.claimBoundaries.calibratedRoutingImplemented).toBe(false);
      expect(sidecar.claimBoundaries.productionRoutingChanged).toBe(false);
    }
  });

  it("summarizes sidecar structure without computing routing behavior", async () => {
    const sidecars = await loadSidecarsFromFile();
    const sidecar = sidecars[0]!;
    const summary = summarizeAdvisoryRoutingSidecar(
      validateAdvisoryRoutingSidecar(sidecar)
    );

    expect(summary).toEqual({
      sidecarId: sidecar.sidecarId,
      deterministicDecisionCategory:
        sidecar.linkedDeterministicDecision.decisionCategory,
      recommendationCategory:
        sidecar.advisoryRecommendation.recommendationCategory,
      deterministicDecisionAuthoritative: true,
      advisoryCanChangeRuntimeDecision: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false
    });
  });
});
