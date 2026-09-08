import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDefaultOffRoutingConfig,
  buildExampleDefaultOffRoutingConfig,
  candidateFutureScopeCategoryValues,
  defaultOffApprovalCategoryValues,
  defaultOffBlockerCategoryValues,
  defaultOffBoundaryStatementValues,
  defaultOffFallbackCategoryValues,
  defaultOffFallbackTargetCategoryValues,
  defaultOffRequiredFutureEvidenceCategoryValues,
  defaultOffRoutingConfigClaimBoundariesSchema,
  defaultOffRoutingConfigContainsForbiddenRawString,
  defaultOffRoutingConfigSafetySchema,
  defaultOffRoutingConfigSchema,
  defaultOffRoutingConfigSourceValues,
  defaultOffRoutingConfigPrivacySchema,
  disallowedCurrentScopeCategoryValues,
  loadExampleDefaultOffRoutingConfig,
  loadExampleProductionRoutingEligibility,
  summarizeDefaultOffRoutingConfig,
  validateDefaultOffRoutingConfig,
  validateDefaultOffRoutingConfigBoundaries,
  validateDefaultOffRoutingConfigs,
  type DefaultOffRoutingConfig
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  gateDesignOnly: true,
  defaultOffDesignOnly: true,
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
  addsRuntimeConfigFlag: false,
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
  rawCalibrationDataIncluded: false,
  rawScoreDataIncluded: false,
  rawThresholdDataIncluded: false,
  rawRoutingDataIncluded: false,
  rawConfigDataIncluded: false,
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
  defaultOffDesignOnly: true,
  productionRoutingEnabled: false,
  advisoryRoutingEnabled: false,
  calibratedRoutingEnabled: false,
  productionRoutingEligible: false,
  runtimeConfigFlagAdded: false,
  policyFlagAdded: false,
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

const requiredTopLevelFields = [
  "schemaVersion",
  "configRecordId",
  "source",
  "phase",
  "configStatus",
  "linkedProductionEligibility",
  "candidateFutureScopes",
  "disallowedCurrentScopes",
  "requiredFutureEvidence",
  "routingAuthorityConstraints",
  "fallbackConstraints",
  "approvalConstraints",
  "phase17EvidenceDependency",
  "blockers",
  "safety",
  "privacy",
  "claimBoundaries",
  "boundaryStatements",
  "notes"
] as const;

const withMutation = (
  record: DefaultOffRoutingConfig,
  mutate: (copy: DefaultOffRoutingConfig) => void
): DefaultOffRoutingConfig => {
  const copy = JSON.parse(JSON.stringify(record)) as DefaultOffRoutingConfig;
  mutate(copy);
  return copy;
};

describe("agent default-off routing config schema", () => {
  it("validates the example config and stable Batch 16.2 metadata", () => {
    const record = loadExampleDefaultOffRoutingConfig();
    const built = buildExampleDefaultOffRoutingConfig();

    expect(record).toEqual(built);
    expect(validateDefaultOffRoutingConfigs([record])).toEqual([record]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe("agent-default-off-routing-config.v1");
    expect(record.configRecordId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(record.configRecordId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(defaultOffRoutingConfigSourceValues).toContain(record.source);
    expect(record.source).toBe("synthetic_default_off_routing_config_design");
    expect(record.phase).toEqual({
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1"],
      currentBatch: "16.2",
      futureBatches: ["16.3", "16.4", "16.5"],
      phaseStatus:
        "default_off_routing_configuration_design_without_runtime_configuration_or_routing_implementation"
    });
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(record.boundaryStatements).toEqual([
      ...defaultOffBoundaryStatementValues
    ]);
    expect(defaultOffRoutingConfigContainsForbiddenRawString(record)).toBe(
      false
    );
    expect(() =>
      validateDefaultOffRoutingConfigBoundaries(record)
    ).not.toThrow();
  });

  it("keeps current enablement impossible and default-off required", () => {
    const status = loadExampleDefaultOffRoutingConfig().configStatus;

    expect(status.productionRoutingEnabledNow).toBe(false);
    expect(status.advisoryRoutingEnabledNow).toBe(false);
    expect(status.calibratedRoutingEnabledNow).toBe(false);
    expect(status.productionRoutingEligibleNow).toBe(false);
    expect(status.defaultOffRequired).toBe(true);
    expect(status.explicitFutureScopeRequired).toBe(true);
    expect(status.humanApprovalRequired).toBe(true);
    expect(status.policyConfigRequired).toBe(true);
    expect(status.fallbackToDeterministicRequired).toBe(true);
    expect(status.deterministicSafetyOverridesRequired).toBe(true);
  });

  it("links to Batch 16.1 eligibility without embedding raw eligibility", () => {
    const record = loadExampleDefaultOffRoutingConfig();
    const eligibility = loadExampleProductionRoutingEligibility();

    expect(record.linkedProductionEligibility).toEqual({
      eligibilityRecordId: eligibility.eligibilityRecordId,
      schemaVersion: eligibility.schemaVersion,
      source: eligibility.source,
      productionRoutingEligibleNow:
        eligibility.eligibilityStatus.productionRoutingEligibleNow,
      rawEligibilityRecordIncluded: false
    });
  });

  it("keeps candidate future scopes as future-only categories", () => {
    const scopes = loadExampleDefaultOffRoutingConfig().candidateFutureScopes;

    expect(scopes.map((scope) => scope.scopeCategory)).toEqual([
      ...candidateFutureScopeCategoryValues
    ]);
    for (const scope of scopes) {
      expect(scope.currentlyEnabled).toBe(false);
      expect(scope.requiresFutureEligibilityPass).toBe(true);
      expect(scope.requiresHumanApproval).toBe(true);
      expect(scope.requiresPolicyConfig).toBe(true);
      expect(scope.requiresFallbackToDeterministic).toBe(true);
      expect(scope.requiresDeterministicSafetyOverrides).toBe(true);
    }
  });

  it("lists disallowed current scopes, future evidence, and blockers", () => {
    const record = loadExampleDefaultOffRoutingConfig();

    expect(record.disallowedCurrentScopes.scopeCategories).toEqual([
      ...disallowedCurrentScopeCategoryValues
    ]);
    expect(record.requiredFutureEvidence.evidenceCategories).toEqual([
      ...defaultOffRequiredFutureEvidenceCategoryValues
    ]);
    expect(record.blockers.blockerCategories).toEqual([
      ...defaultOffBlockerCategoryValues
    ]);
  });

  it("keeps deterministic authority and safety overrides authoritative", () => {
    const constraints =
      loadExampleDefaultOffRoutingConfig().routingAuthorityConstraints;

    expect(constraints.deterministicDecisionsAuthoritativeNow).toBe(true);
    expect(constraints.calibratedAdvisoryRoutingHasProductionAuthorityNow).toBe(
      false
    );
    expect(
      constraints.futureAuthorityMustBeNarrowerThanDeterministicSafetyPolicy
    ).toBe(true);
    expect(constraints.calibratedAdvisoryMayOverrideDeterministicBlock).toBe(
      false
    );
    expect(
      constraints.calibratedAdvisoryMayBypassDeferEvidenceWithoutFutureApproval
    ).toBe(false);
    expect(
      constraints.calibratedAdvisoryMayDowngradeEscalateWhenHumanReviewRequired
    ).toBe(false);
    expect(constraints.deterministicSafetyOverridesRemainMandatory).toBe(true);
  });

  it("requires fallback and approval constraints without current approval", () => {
    const record = loadExampleDefaultOffRoutingConfig();

    expect(
      record.fallbackConstraints.fallbacks.map(
        (fallback) => fallback.fallbackCategory
      )
    ).toEqual([...defaultOffFallbackCategoryValues]);
    for (const fallback of record.fallbackConstraints.fallbacks) {
      expect(fallback.fallbackRequired).toBe(true);
      expect(defaultOffFallbackTargetCategoryValues).toContain(
        fallback.fallbackTargetCategory
      );
    }
    expect(
      record.approvalConstraints.approvals.map(
        (approval) => approval.approvalCategory
      )
    ).toEqual([...defaultOffApprovalCategoryValues]);
    for (const approval of record.approvalConstraints.approvals) {
      expect(approval.currentStatus).toBe("future_unmet");
      expect(approval.approvalGranted).toBe(false);
    }
  });

  it("requires Phase 17 evidence before production routing can be enabled", () => {
    const dependency =
      loadExampleDefaultOffRoutingConfig().phase17EvidenceDependency;

    expect(dependency.realAgentEvidenceRequired).toBe(true);
    expect(dependency.controlledTraceCollectionRequired).toBe(true);
    expect(dependency.reviewedTraceLabelsRequired).toBe(true);
    expect(dependency.baselineComparisonOnRealControlledTracesRequired).toBe(
      true
    );
    expect(
      dependency.calibrationDatasetConstructionAfterTraceReviewRequired
    ).toBe(true);
    expect(
      dependency.productionRoutingCannotBeEnabledWithoutPhase17Evidence
    ).toBe(true);
  });

  it("rejects boundary violations and contradictory enabled statuses", () => {
    const record = loadExampleDefaultOffRoutingConfig();

    expect(() =>
      defaultOffRoutingConfigSchema.parse({
        ...record,
        source: "runtime_default_off_config"
      })
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.configStatus.productionRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.configStatus.advisoryRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.configStatus.calibratedRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.configStatus.defaultOffRequired = false as true;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.linkedProductionEligibility.productionRoutingEligibleNow =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.linkedProductionEligibility.rawEligibilityRecordIncluded =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.candidateFutureScopes[0]!.currentlyEnabled = true as false;
        })
      )
    ).toThrow();
  });

  it("rejects missing blockers, fallback constraints, Phase 17 dependency, or exact boundary drift", () => {
    const record = loadExampleDefaultOffRoutingConfig();

    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.blockers.blockerCategories = [];
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.fallbackConstraints.fallbacks = [];
        })
      )
    ).toThrow();
    expect(() =>
      validateDefaultOffRoutingConfig(
        withMutation(record, (copy) => {
          copy.phase17EvidenceDependency.realAgentEvidenceRequired =
            false as true;
        })
      )
    ).toThrow();
    expect(() =>
      defaultOffRoutingConfigSafetySchema.parse({
        ...record.safety,
        addsRuntimeConfigFlag: true
      })
    ).toThrow();
    expect(() =>
      defaultOffRoutingConfigPrivacySchema.parse({
        ...record.privacy,
        rawConfigDataIncluded: true
      })
    ).toThrow();
    expect(() =>
      defaultOffRoutingConfigClaimBoundariesSchema.parse({
        ...record.claimBoundaries,
        productionRoutingEnabled: true
      })
    ).toThrow();
  });

  it("provides deterministic pure summaries without runtime integration", async () => {
    const record = loadExampleDefaultOffRoutingConfig();
    const first = summarizeDefaultOffRoutingConfig(record);
    const second = summarizeDefaultOffRoutingConfig(
      JSON.parse(JSON.stringify(record)) as DefaultOffRoutingConfig
    );
    const before = JSON.stringify(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
    expect(first).toMatchObject({
      schemaVersion: "agent-default-off-routing-config.v1",
      configRecordId: "phase-16-default-off-routing-config-001",
      linkedEligibilityRecordId: "phase-16-production-eligibility-001",
      linkedProductionRoutingEligibleNow: false,
      productionRoutingEnabledNow: false,
      advisoryRoutingEnabledNow: false,
      calibratedRoutingEnabledNow: false,
      defaultOffRequired: true,
      candidateFutureScopeCount: candidateFutureScopeCategoryValues.length,
      futureEvidenceCount:
        defaultOffRequiredFutureEvidenceCategoryValues.length,
      blockerCount: defaultOffBlockerCategoryValues.length,
      fallbackConstraintCount: defaultOffFallbackCategoryValues.length,
      approvalConstraintCount: defaultOffApprovalCategoryValues.length,
      deterministicSafetyOverridesRequired: true,
      phase17EvidenceRequired: true,
      conclusion: "not_enabled_not_eligible"
    });

    expect(buildDefaultOffRoutingConfig()).toEqual(record);

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "defaultOffRoutingConfigSchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(/runtimeRouter|decisionEngine|router\.route/);
  });
});
