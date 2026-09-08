import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advisoryDecisionCategoryValues,
  advisoryDecisionSourceCategoryValues,
  advisoryRecommendationCategoryValues,
  agentMockAdvisoryRoutingOutputSchemaVersion,
  buildExampleMockAdvisoryRoutingOutputs,
  buildMockAdvisoryRoutingOutput,
  loadExampleAdvisoryRoutingSidecars,
  loadExampleMockAdvisoryRoutingOutputs,
  mapSidecarRecommendationToMockAdvisoryOutput,
  mockAdvisoryAgreementCategoryValues,
  mockAdvisoryConfidenceCategoryValues,
  mockAdvisoryDifferenceCategoryValues,
  mockAdvisoryEvidenceGapValues,
  mockAdvisoryOutputCategoryValues,
  mockAdvisoryRouteCategoryValues,
  mockAdvisoryRoutingClaimBoundariesSchema,
  mockAdvisoryRoutingContainsForbiddenRawString,
  mockAdvisoryRoutingOutputSchema,
  mockAdvisoryRoutingPrivacySchema,
  mockAdvisoryRoutingSafetySchema,
  mockAdvisoryRoutingSourceValues,
  mockAdvisoryRationaleCategoryValues,
  summarizeMockAdvisoryRoutingOutput,
  summarizeMockAdvisoryRoutingOutputs,
  validateMockAdvisoryAuthorityBoundary,
  validateMockAdvisoryClaimBoundaries,
  validateMockAdvisoryRoutingOutput,
  validateMockAdvisoryRoutingOutputBoundaries,
  validateMockAdvisoryRoutingOutputs,
  type MockAdvisoryRoutingOutput
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadOutputsFromFile = async (): Promise<MockAdvisoryRoutingOutput[]> =>
  validateMockAdvisoryRoutingOutputs(
    (await readJson(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "example-mock-advisory-routing.json"
      )
    )) as unknown[]
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
  publicDisclosureApproved: false,
  legalConclusion: false
} as const;

describe("agent mock advisory routing output schema", () => {
  it("validates examples and stable Batch 15.2 metadata", async () => {
    const outputs = await loadOutputsFromFile();

    expect(outputs).toEqual(loadExampleMockAdvisoryRoutingOutputs());
    expect(outputs).toEqual(buildExampleMockAdvisoryRoutingOutputs());
    expect(outputs.length).toBeGreaterThanOrEqual(3);
    expect(outputs.length).toBeLessThanOrEqual(6);

    for (const output of outputs) {
      expect(output.schemaVersion).toBe(
        agentMockAdvisoryRoutingOutputSchemaVersion
      );
      expect(output.mockRoutingOutputId).toMatch(
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
      );
      expect(output.mockRoutingOutputId).not.toMatch(
        /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
      );
      expect(mockAdvisoryRoutingSourceValues).toContain(output.source);
      expect(output.source).toBe("synthetic_mock_advisory_routing");
      expect(output.phase).toEqual({
        phaseId: "phase-15",
        phaseName: "Advisory Calibrated Routing Design",
        completedPreviousPhase:
          "phase-14-complete-offline-synthetic-mock-groundwork-only",
        completedBatches: ["15.1"],
        currentBatch: "15.2",
        futureBatches: ["15.3", "15.4", "15.5"],
        phaseStatus:
          "mock_advisory_routing_prototype_without_runtime_integration"
      });
      expect(output.safety).toEqual(exactSafety);
      expect(output.privacy).toEqual(exactPrivacy);
      expect(output.claimBoundaries).toEqual(exactClaimBoundaries);
      expect(mockAdvisoryRoutingContainsForbiddenRawString(output)).toBe(false);
    }
  });

  it("requires top-level output objects and rejects invalid enum labels", async () => {
    const outputs = await loadOutputsFromFile();
    const output = outputs[0]!;

    for (const key of [
      "schemaVersion",
      "mockRoutingOutputId",
      "source",
      "phase",
      "linkedAdvisorySidecar",
      "linkedDeterministicDecision",
      "mockAdvisoryOutput",
      "sideBySideComparison",
      "advisoryRationale",
      "authorityBoundary",
      "futureEvidenceRequirements",
      "safety",
      "privacy",
      "claimBoundaries",
      "notes"
    ]) {
      expect(output).toHaveProperty(key);
    }

    expect(() =>
      mockAdvisoryRoutingOutputSchema.parse({
        ...output,
        source: "runtime_mock_routing"
      })
    ).toThrow();
    expect(() =>
      mockAdvisoryRoutingOutputSchema.parse({
        ...output,
        mockAdvisoryOutput: {
          ...output.mockAdvisoryOutput,
          mockOutputCategory: "real_route"
        }
      })
    ).toThrow();
    expect(() =>
      mockAdvisoryRoutingSafetySchema.parse({
        ...output.safety,
        implementsAdvisoryRouting: true
      })
    ).toThrow();
    expect(() =>
      mockAdvisoryRoutingPrivacySchema.parse({
        ...output.privacy,
        rawTraceIncluded: true
      })
    ).toThrow();
    expect(() =>
      mockAdvisoryRoutingClaimBoundariesSchema.parse({
        ...output.claimBoundaries,
        calibratedRoutingImplemented: true
      })
    ).toThrow();
  });

  it("links each output to a Batch 15.1 advisory sidecar without embedding the raw sidecar", async () => {
    const outputs = await loadOutputsFromFile();
    const sidecarsById = new Map(
      loadExampleAdvisoryRoutingSidecars().map((sidecar) => [
        sidecar.sidecarId,
        sidecar
      ])
    );

    for (const output of outputs) {
      const sidecar = sidecarsById.get(output.linkedAdvisorySidecar.sidecarId);

      expect(sidecar).toBeDefined();
      expect(output.linkedAdvisorySidecar.schemaVersion).toBe(
        "agent-advisory-routing-sidecar.v1"
      );
      expect(output.linkedAdvisorySidecar.source).toBe(
        "synthetic_advisory_sidecar_design"
      );
      expect(output.linkedAdvisorySidecar.recommendationCategory).toBe(
        sidecar?.advisoryRecommendation.recommendationCategory
      );
      expect(output.linkedAdvisorySidecar.rawSidecarIncluded).toBe(false);
    }
  });

  it("preserves deterministic decision authority", async () => {
    const outputs = await loadOutputsFromFile();

    for (const output of outputs) {
      const linked = output.linkedDeterministicDecision;

      expect(advisoryDecisionCategoryValues).toContain(linked.decisionCategory);
      expect(advisoryDecisionSourceCategoryValues).toContain(
        linked.decisionSourceCategory
      );
      expect(linked.deterministicDecisionRemainsAuthoritative).toBe(true);
      expect(linked.productionRoutingChanged).toBe(false);
      expect(linked.rawDecisionPayloadIncluded).toBe(false);
      expect(output.sideBySideComparison.deterministicDecisionChanged).toBe(
        false
      );
      expect(output.sideBySideComparison.advisoryOverrideAttempted).toBe(false);
    }
  });

  it("keeps mock advisory outputs category-only and non-calibrated", async () => {
    const outputs = await loadOutputsFromFile();

    for (const output of outputs) {
      const mock = output.mockAdvisoryOutput;

      expect(mockAdvisoryOutputCategoryValues).toContain(
        mock.mockOutputCategory
      );
      expect(advisoryRecommendationCategoryValues).toContain(
        mock.mockRecommendationCategory
      );
      expect(mockAdvisoryConfidenceCategoryValues).toContain(
        mock.mockConfidenceCategory
      );
      expect(mockAdvisoryRouteCategoryValues).toContain(mock.mockRouteCategory);
      expect(mock.advisoryOnly).toBe(true);
      expect(mock.calibrated).toBe(false);
      expect(mock.conformal).toBe(false);
      expect(mock.thresholdBased).toBe(false);
      expect(mock.alphaBased).toBe(false);
      expect(mock.runtimeIntegrated).toBe(false);
      expect(mock.productionAuthoritative).toBe(false);
    }
  });

  it("records non-authoritative side-by-side comparisons", async () => {
    const outputs = await loadOutputsFromFile();

    for (const output of outputs) {
      const comparison = output.sideBySideComparison;

      expect(advisoryDecisionCategoryValues).toContain(
        comparison.deterministicDecisionCategory
      );
      expect(mockAdvisoryOutputCategoryValues).toContain(
        comparison.mockAdvisorySuggestionCategory
      );
      expect(mockAdvisoryAgreementCategoryValues).toContain(
        comparison.agreementCategory
      );
      expect(mockAdvisoryDifferenceCategoryValues).toContain(
        comparison.differenceCategory
      );
      expect(comparison.deterministicDecisionChanged).toBe(false);
      expect(comparison.advisoryOverrideAttempted).toBe(false);
      expect(comparison.productionRoutingChanged).toBe(false);
    }
  });

  it("enforces authority boundaries and future evidence requirements", async () => {
    const outputs = await loadOutputsFromFile();

    for (const output of outputs) {
      const authority = output.authorityBoundary;

      expect(authority.deterministicDecisionAuthoritative).toBe(true);
      expect(authority.advisoryOutputNonAuthoritative).toBe(true);
      expect(authority.advisoryCanBlock).toBe(false);
      expect(authority.advisoryCanProceed).toBe(false);
      expect(authority.advisoryCanEscalate).toBe(false);
      expect(authority.advisoryCanDefer).toBe(false);
      expect(authority.advisoryCanChangeRuntimeDecision).toBe(false);
      expect(authority.advisoryCanTriggerRuntimeAction).toBe(false);
      expect(authority.requiresExplicitFutureIntegration).toBe(true);
      expect(authority.routingBehaviorChanged).toBe(false);
      expect(() => validateMockAdvisoryAuthorityBoundary(output)).not.toThrow();

      expect(output.futureEvidenceRequirements.requiredCategories).toEqual([
        ...mockAdvisoryEvidenceGapValues
      ]);
      expect(output.futureEvidenceRequirements.evidenceStatus).toBe(
        "future_unmet"
      );
      expect(output.futureEvidenceRequirements.allRequirementsFuture).toBe(
        true
      );
    }
  });

  it("keeps rationale categories controlled and raw rationale absent", async () => {
    const outputs = await loadOutputsFromFile();

    for (const output of outputs) {
      for (const rationale of output.advisoryRationale.rationaleCategories) {
        expect(mockAdvisoryRationaleCategoryValues).toContain(rationale);
      }
      for (const gap of output.advisoryRationale.relatedEvidenceGaps) {
        expect(mockAdvisoryEvidenceGapValues).toContain(gap);
      }
      expect(output.advisoryRationale.rawRationaleTextIncluded).toBe(false);
    }
  });

  it("covers expected mock output categories without changing decisions", async () => {
    const outputs = await loadOutputsFromFile();
    const categories = new Set(
      outputs.map((output) => output.mockAdvisoryOutput.mockOutputCategory)
    );

    expect(categories).toEqual(
      new Set([
        "mock_align",
        "mock_suggest_defer",
        "mock_suggest_escalate",
        "mock_suggest_block",
        "mock_suggest_reduce_friction"
      ])
    );

    for (const output of outputs) {
      validateMockAdvisoryRoutingOutputBoundaries(output);
      validateMockAdvisoryClaimBoundaries(output);
      expect(output.safety.changesRuntimeBehavior).toBe(false);
      expect(output.claimBoundaries.advisoryRoutingImplemented).toBe(false);
      expect(output.claimBoundaries.calibratedRoutingImplemented).toBe(false);
      expect(output.claimBoundaries.productionRoutingChanged).toBe(false);
    }
  });

  it("uses deterministic pure helpers that do not mutate sidecars or integrate with runtime routing", async () => {
    const sidecars = loadExampleAdvisoryRoutingSidecars();
    const sidecar = sidecars[0]!;
    const before = JSON.stringify(sidecar);

    const first = buildMockAdvisoryRoutingOutput(sidecar);
    const second = buildMockAdvisoryRoutingOutput(sidecar);

    expect(first).toEqual(second);
    expect(JSON.stringify(sidecar)).toBe(before);
    expect(first.linkedDeterministicDecision.decisionCategory).toBe(
      sidecar.linkedDeterministicDecision.decisionCategory
    );
    expect(first.sideBySideComparison.deterministicDecisionChanged).toBe(false);
    expect(first.mockAdvisoryOutput.runtimeIntegrated).toBe(false);
    expect(
      mapSidecarRecommendationToMockAdvisoryOutput(
        "advisory_suggests_hard_stop"
      ).mockOutputCategory
    ).toBe("mock_suggest_block");

    const source = readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "mockAdvisoryRoutingSchema.ts"
      ),
      "utf8"
    );
    await expect(source).resolves.not.toMatch(
      /node:fs|child_process|https?:|fetch\(|exec\(|spawn\(|runtimeRouter|decisionEngine/i
    );
  });

  it("summarizes mock outputs without computing routing behavior", async () => {
    const outputs = await loadOutputsFromFile();
    const output = validateMockAdvisoryRoutingOutput(outputs[0]);
    const summary = summarizeMockAdvisoryRoutingOutput(output);

    expect(summary).toEqual({
      mockRoutingOutputId: output.mockRoutingOutputId,
      linkedSidecarId: output.linkedAdvisorySidecar.sidecarId,
      deterministicDecisionCategory:
        output.linkedDeterministicDecision.decisionCategory,
      mockOutputCategory: output.mockAdvisoryOutput.mockOutputCategory,
      agreementCategory: output.sideBySideComparison.agreementCategory,
      deterministicDecisionAuthoritative: true,
      advisoryCanChangeRuntimeDecision: false,
      calibratedRoutingImplemented: false,
      productionRoutingChanged: false
    });
    expect(summarizeMockAdvisoryRoutingOutputs(outputs)).toHaveLength(
      outputs.length
    );
  });
});
