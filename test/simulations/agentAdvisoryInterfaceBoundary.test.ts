import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advisoryDisplayAuthorityBoundarySchema,
  advisoryFutureCommandCategoryValues,
  advisoryFutureDisplayModeValues,
  advisoryFutureEndpointCategoryValues,
  advisoryFutureInterfaceArtifactValues,
  advisoryFutureOutputShapeValues,
  advisoryFuturePanelCategoryValues,
  advisoryFutureResponseShapeValues,
  advisoryInterfaceBoundaryContainsForbiddenRawString,
  advisoryInterfaceBoundarySchema,
  advisoryInterfaceBoundarySourceValues,
  advisoryInterfaceClaimBoundariesSchema,
  advisoryInterfaceFutureImplementationRequirementValues,
  advisoryInterfacePrivacySchema,
  advisoryInterfaceSafetySchema,
  advisoryInterfaceScopeKindValues,
  advisoryPrivacyRedactionBoundarySchema,
  advisoryProhibitedFutureContentValues,
  agentAdvisoryInterfaceBoundarySchemaVersion,
  buildAdvisoryInterfaceBoundary,
  loadExampleAdvisoryRoutingSidecars,
  loadExampleAdvisorySideBySideComparisonReport,
  loadExampleMockAdvisoryRoutingOutputs,
  summarizeAdvisoryInterfaceBoundary,
  validateAdvisoryInterfaceAuthorityBoundary,
  validateAdvisoryInterfaceBoundaries,
  validateAdvisoryInterfaceBoundary,
  validateAdvisoryInterfaceBoundaryBoundaries,
  validateAdvisoryInterfaceClaimBoundaries,
  validateAdvisoryInterfacePrivacyBoundary,
  type AdvisoryInterfaceBoundary
} from "../../simulations/agent/index.js";

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

const loadBoundaryFromFile = async (): Promise<AdvisoryInterfaceBoundary> =>
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
  );

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  advisoryOnly: true,
  interfaceDesignOnly: true,
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
  implementsUiSurface: false,
  implementsApiSurface: false,
  implementsCliSurface: false,
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
  designOnly: true,
  advisoryOnly: true,
  interfaceImplemented: false,
  uiSurfaceImplemented: false,
  apiSurfaceImplemented: false,
  cliSurfaceImplemented: false,
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

const expectedProhibitedContent = [
  "raw_prompt",
  "raw_agent_output",
  "raw_command",
  "raw_diff",
  "raw_source_code",
  "raw_trace",
  "raw_review_text",
  "raw_score_data",
  "raw_threshold_data",
  "raw_private_data"
] as const;

describe("agent advisory interface boundary schema", () => {
  it("validates the example boundary and stable Batch 15.4 metadata", async () => {
    const boundary = await loadBoundaryFromFile();
    const built = buildAdvisoryInterfaceBoundary({
      sidecarIds: loadExampleAdvisoryRoutingSidecars().map(
        (sidecar) => sidecar.sidecarId
      ),
      mockRoutingOutputIds: loadExampleMockAdvisoryRoutingOutputs().map(
        (output) => output.mockRoutingOutputId
      ),
      sideBySideComparisonReportId:
        loadExampleAdvisorySideBySideComparisonReport().comparisonReportId
    });

    expect(boundary).toEqual(built);
    expect(validateAdvisoryInterfaceBoundaries([boundary])).toEqual([boundary]);
    expect(boundary.schemaVersion).toBe(
      agentAdvisoryInterfaceBoundarySchemaVersion
    );
    expect(boundary.interfaceBoundaryId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(boundary.interfaceBoundaryId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(advisoryInterfaceBoundarySourceValues).toContain(boundary.source);
    expect(boundary.source).toBe("synthetic_advisory_interface_boundary");
    expect(boundary.phase).toEqual({
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2", "15.3"],
      currentBatch: "15.4",
      futureBatches: ["15.5"],
      phaseStatus:
        "advisory_interface_boundary_design_without_ui_api_cli_implementation"
    });
    expect(boundary.safety).toEqual(exactSafety);
    expect(boundary.privacy).toEqual(exactPrivacy);
    expect(boundary.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(advisoryInterfaceBoundaryContainsForbiddenRawString(boundary)).toBe(
      false
    );
  });

  it("requires top-level interface objects and rejects invalid enum labels", async () => {
    const boundary = await loadBoundaryFromFile();

    for (const key of [
      "schemaVersion",
      "interfaceBoundaryId",
      "source",
      "phase",
      "linkedAdvisoryArtifacts",
      "interfaceScope",
      "futureUiBoundary",
      "futureApiBoundary",
      "futureCliBoundary",
      "displayAuthorityBoundary",
      "privacyRedactionBoundary",
      "futureImplementationRequirements",
      "safety",
      "privacy",
      "claimBoundaries",
      "notes"
    ]) {
      expect(boundary).toHaveProperty(key);
    }

    expect(() =>
      advisoryInterfaceBoundarySchema.parse({
        ...boundary,
        source: "implemented_interface"
      })
    ).toThrow();
    expect(() =>
      advisoryInterfaceBoundarySchema.parse({
        ...boundary,
        interfaceScope: {
          ...boundary.interfaceScope,
          scopeKind: "runtime_interface"
        }
      })
    ).toThrow();
    expect(() =>
      advisoryInterfaceSafetySchema.parse({
        ...boundary.safety,
        implementsUiSurface: true
      })
    ).toThrow();
    expect(() =>
      advisoryInterfacePrivacySchema.parse({
        ...boundary.privacy,
        rawInterfaceDataIncluded: true
      })
    ).toThrow();
    expect(() =>
      advisoryInterfaceClaimBoundariesSchema.parse({
        ...boundary.claimBoundaries,
        interfaceImplemented: true
      })
    ).toThrow();
  });

  it("links Batch 15.1, 15.2, 15.3, and Phase 14 artifacts without raw payloads", async () => {
    const boundary = await loadBoundaryFromFile();
    const sidecarIds = new Set(
      loadExampleAdvisoryRoutingSidecars().map((sidecar) => sidecar.sidecarId)
    );
    const outputIds = new Set(
      loadExampleMockAdvisoryRoutingOutputs().map(
        (output) => output.mockRoutingOutputId
      )
    );
    const report = loadExampleAdvisorySideBySideComparisonReport();

    for (const sidecarId of boundary.linkedAdvisoryArtifacts.sidecarIds) {
      expect(sidecarIds.has(sidecarId)).toBe(true);
    }
    for (const outputId of boundary.linkedAdvisoryArtifacts
      .mockRoutingOutputIds) {
      expect(outputIds.has(outputId)).toBe(true);
    }
    expect(boundary.linkedAdvisoryArtifacts.sideBySideComparisonReportId).toBe(
      report.comparisonReportId
    );
    expect(boundary.linkedAdvisoryArtifacts.phase14ReadinessSummaryId).toBe(
      "phase-14-offline-readiness-summary-001"
    );
    expect(boundary.linkedAdvisoryArtifacts.rawArtifactsIncluded).toBe(false);
  });

  it("keeps interface scope design-only and unimplemented", async () => {
    const boundary = await loadBoundaryFromFile();

    expect(advisoryInterfaceScopeKindValues).toContain(
      boundary.interfaceScope.scopeKind
    );
    expect(boundary.interfaceScope.scopeKind).toBe("boundary_design_only");
    expect(boundary.interfaceScope.uiImplemented).toBe(false);
    expect(boundary.interfaceScope.apiImplemented).toBe(false);
    expect(boundary.interfaceScope.cliImplemented).toBe(false);
    expect(boundary.interfaceScope.runtimeIntegrated).toBe(false);
    expect(boundary.interfaceScope.productionEnabled).toBe(false);
  });

  it("defines future UI boundary categories without adding a dashboard panel", async () => {
    const { futureUiBoundary } = await loadBoundaryFromFile();

    for (const category of futureUiBoundary.futurePanelCategories) {
      expect(advisoryFuturePanelCategoryValues).toContain(category);
    }
    for (const mode of futureUiBoundary.futureDisplayModes) {
      expect(advisoryFutureDisplayModeValues).toContain(mode);
    }
    for (const artifact of futureUiBoundary.allowedFutureDisplayedArtifacts) {
      expect(advisoryFutureInterfaceArtifactValues).toContain(artifact);
    }
    expect(futureUiBoundary.prohibitedFutureDisplayedContent).toEqual(
      expectedProhibitedContent
    );
    expect(futureUiBoundary.prohibitedFutureDisplayedContent).toEqual([
      ...advisoryProhibitedFutureContentValues
    ]);
    expect(futureUiBoundary.uiImplemented).toBe(false);
    expect(futureUiBoundary.dashboardPanelAdded).toBe(false);
    expect(futureUiBoundary.mayChangeDecisionFromUi).toBe(false);
  });

  it("defines future API boundary categories without adding an endpoint", async () => {
    const { futureApiBoundary } = await loadBoundaryFromFile();

    for (const category of futureApiBoundary.futureEndpointCategories) {
      expect(advisoryFutureEndpointCategoryValues).toContain(category);
    }
    for (const shape of futureApiBoundary.futureResponseShapes) {
      expect(advisoryFutureResponseShapeValues).toContain(shape);
    }
    for (const artifact of futureApiBoundary.allowedFutureResponseArtifacts) {
      expect(advisoryFutureInterfaceArtifactValues).toContain(artifact);
    }
    expect(futureApiBoundary.prohibitedFutureResponseContent).toEqual(
      expectedProhibitedContent
    );
    expect(futureApiBoundary.apiImplemented).toBe(false);
    expect(futureApiBoundary.endpointAdded).toBe(false);
    expect(futureApiBoundary.mayChangeDecisionFromApi).toBe(false);
  });

  it("defines future CLI boundary categories without adding a command", async () => {
    const { futureCliBoundary } = await loadBoundaryFromFile();

    for (const category of futureCliBoundary.futureCommandCategories) {
      expect(advisoryFutureCommandCategoryValues).toContain(category);
    }
    for (const shape of futureCliBoundary.futureOutputShapes) {
      expect(advisoryFutureOutputShapeValues).toContain(shape);
    }
    for (const artifact of futureCliBoundary.allowedFutureOutputArtifacts) {
      expect(advisoryFutureInterfaceArtifactValues).toContain(artifact);
    }
    expect(futureCliBoundary.prohibitedFutureOutputContent).toEqual(
      expectedProhibitedContent
    );
    expect(futureCliBoundary.cliImplemented).toBe(false);
    expect(futureCliBoundary.commandAdded).toBe(false);
    expect(futureCliBoundary.mayChangeDecisionFromCli).toBe(false);
  });

  it("enforces display authority and privacy/redaction boundaries", async () => {
    const boundary = await loadBoundaryFromFile();

    expect(boundary.displayAuthorityBoundary).toEqual({
      deterministicDecisionAuthoritative: true,
      advisoryDisplayNonAuthoritative: true,
      displayCanOverrideDecision: false,
      displayCanTriggerRuntimeAction: false,
      displayCanChangeRouting: false,
      requiresFutureExplicitIntegration: true,
      requiresHumanApprovalBeforeImplementation: true
    });
    expect(boundary.privacyRedactionBoundary).toEqual({
      categoryOnlyByDefault: true,
      rawPromptsProhibited: true,
      rawAgentOutputsProhibited: true,
      rawCommandsProhibited: true,
      rawDiffsProhibited: true,
      rawSourceCodeProhibited: true,
      rawTracesProhibited: true,
      rawReviewsProhibited: true,
      rawScoresProhibited: true,
      rawThresholdsProhibited: true,
      privateDataProhibited: true,
      futureRedactionRequiredBeforeAnySurface: true
    });
    expect(() =>
      advisoryDisplayAuthorityBoundarySchema.parse({
        ...boundary.displayAuthorityBoundary,
        displayCanOverrideDecision: true
      })
    ).toThrow();
    expect(() =>
      advisoryPrivacyRedactionBoundarySchema.parse({
        ...boundary.privacyRedactionBoundary,
        rawPromptsProhibited: false
      })
    ).toThrow();

    validateAdvisoryInterfaceAuthorityBoundary(boundary);
    validateAdvisoryInterfacePrivacyBoundary(boundary);
    validateAdvisoryInterfaceClaimBoundaries(boundary);
    validateAdvisoryInterfaceBoundaryBoundaries(boundary);
  });

  it("keeps future implementation requirements unmet and future", async () => {
    const boundary = await loadBoundaryFromFile();

    expect(
      boundary.futureImplementationRequirements.requiredCategories
    ).toEqual([...advisoryInterfaceFutureImplementationRequirementValues]);
    expect(boundary.futureImplementationRequirements.requirementStatus).toBe(
      "future_unmet"
    );
    expect(
      boundary.futureImplementationRequirements.allRequirementsFuture
    ).toBe(true);
  });

  it("keeps helpers pure, deterministic, and limited to interface summaries", async () => {
    const input = {
      sidecarIds: loadExampleAdvisoryRoutingSidecars().map(
        (sidecar) => sidecar.sidecarId
      ),
      mockRoutingOutputIds: loadExampleMockAdvisoryRoutingOutputs().map(
        (output) => output.mockRoutingOutputId
      ),
      sideBySideComparisonReportId:
        loadExampleAdvisorySideBySideComparisonReport().comparisonReportId
    };
    const before = JSON.stringify(input);
    const first = buildAdvisoryInterfaceBoundary(input);
    const second = buildAdvisoryInterfaceBoundary(input);
    const summary = summarizeAdvisoryInterfaceBoundary(first);
    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "advisory-routing",
        "advisoryInterfaceBoundarySchema.ts"
      ),
      "utf8"
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(summary).toEqual({
      interfaceBoundaryId: "phase-15-advisory-interface-boundary-001",
      linkedSidecarCount: 5,
      linkedMockRoutingOutputCount: 5,
      sideBySideComparisonReportId: "phase-15-side-by-side-comparison-001",
      uiImplemented: false,
      apiImplemented: false,
      cliImplemented: false,
      deterministicDecisionAuthoritative: true,
      advisoryDisplayNonAuthoritative: true,
      displayCanOverrideDecision: false,
      categoryOnlyByDefault: true,
      productionRoutingChanged: false
    });
    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/from ["']node:child_process/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bexec(?:File)?\s*\(/);
    expect(source).not.toMatch(/\bspawn\s*\(/);
    expect(source).not.toMatch(/runtimeRouter|decisionEngine/);
  });

  it("does not add actual UI, API, or CLI advisory surfaces", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const cli = await readFile(
      path.join(process.cwd(), "src", "cli", "cli.ts"),
      "utf8"
    );

    expect(Object.keys(packageJson.scripts ?? {})).not.toContain("advisory");
    expect(cli).not.toMatch(/stepharbor advisory\b/);
    expect(cli).not.toMatch(/case ["']advisory["']/);
    expect(cli).not.toMatch(/runAdvisory/i);
  });
});
