import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExampleSafetyOverrideFallbackRules,
  buildSafetyOverrideFallbackRules,
  loadExampleDefaultOffRoutingConfig,
  loadExampleProductionRoutingEligibility,
  loadExampleSafetyOverrideFallbackRules,
  safetyFallbackCategoryValues,
  safetyFallbackTargetCategoryValues,
  safetyOverrideCategoryValues,
  safetyOverrideFallbackBlockerCategoryValues,
  safetyOverrideFallbackBoundaryStatementValues,
  safetyOverrideFallbackRulesClaimBoundariesSchema,
  safetyOverrideFallbackRulesContainsForbiddenRawString,
  safetyOverrideFallbackRulesPrivacySchema,
  safetyOverrideFallbackRulesSafetySchema,
  safetyOverrideFallbackRulesSchema,
  safetyRulePrecedenceCategoryValues,
  summarizeSafetyOverrideFallbackRules,
  validateSafetyOverrideFallbackRules,
  validateSafetyOverrideFallbackRulesBoundaries,
  validateSafetyOverrideFallbackRulesRecords,
  type SafetyOverrideFallbackRules
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  gateDesignOnly: true,
  safetyOverrideDesignOnly: true,
  fallbackDesignOnly: true,
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
  safetyOverrideDesignOnly: true,
  fallbackDesignOnly: true,
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
  "rulesRecordId",
  "source",
  "phase",
  "ruleStatus",
  "linkedProductionEligibility",
  "linkedDefaultOffRoutingConfig",
  "deterministicSafetyOverrides",
  "fallbackRules",
  "rulePrecedence",
  "phase17EvidenceDependency",
  "blockers",
  "safety",
  "privacy",
  "claimBoundaries",
  "boundaryStatements",
  "notes"
] as const;

const withMutation = (
  record: SafetyOverrideFallbackRules,
  mutate: (copy: SafetyOverrideFallbackRules) => void
): SafetyOverrideFallbackRules => {
  const copy = JSON.parse(
    JSON.stringify(record)
  ) as SafetyOverrideFallbackRules;
  mutate(copy);
  return copy;
};

describe("agent safety override and fallback rules schema", () => {
  it("validates the example rules and stable Batch 16.3 metadata", () => {
    const record = loadExampleSafetyOverrideFallbackRules();
    const built = buildExampleSafetyOverrideFallbackRules();

    expect(record).toEqual(built);
    expect(validateSafetyOverrideFallbackRulesRecords([record])).toEqual([
      record
    ]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe(
      "agent-safety-override-fallback-rules.v1"
    );
    expect(record.rulesRecordId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(record.rulesRecordId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(record.phase).toEqual({
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1", "16.2"],
      currentBatch: "16.3",
      futureBatches: ["16.4", "16.5"],
      phaseStatus:
        "safety_override_fallback_rules_design_without_runtime_routing_implementation"
    });
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(record.boundaryStatements).toEqual([
      ...safetyOverrideFallbackBoundaryStatementValues
    ]);
    expect(safetyOverrideFallbackRulesContainsForbiddenRawString(record)).toBe(
      false
    );
    expect(() =>
      validateSafetyOverrideFallbackRulesBoundaries(record)
    ).not.toThrow();
  });

  it("keeps current enablement impossible and deterministic authority required", () => {
    const status = loadExampleSafetyOverrideFallbackRules().ruleStatus;

    expect(status.designOnly).toBe(true);
    expect(status.productionRoutingEnabledNow).toBe(false);
    expect(status.advisoryRoutingEnabledNow).toBe(false);
    expect(status.calibratedRoutingEnabledNow).toBe(false);
    expect(status.productionRoutingEligibleNow).toBe(false);
    expect(status.defaultOffRequired).toBe(true);
    expect(status.deterministicOverridesAuthoritative).toBe(true);
    expect(status.fallbackToDeterministicRequired).toBe(true);
    expect(status.humanReviewRequiredForSensitiveCases).toBe(true);
    expect(status.phase17EvidenceRequired).toBe(true);
  });

  it("links to Batch 16.1 eligibility without embedding raw eligibility", () => {
    const record = loadExampleSafetyOverrideFallbackRules();
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

  it("links to Batch 16.2 default-off config without embedding raw config", () => {
    const record = loadExampleSafetyOverrideFallbackRules();
    const config = loadExampleDefaultOffRoutingConfig();

    expect(record.linkedDefaultOffRoutingConfig).toEqual({
      configRecordId: config.configRecordId,
      schemaVersion: config.schemaVersion,
      source: config.source,
      productionRoutingEnabledNow:
        config.configStatus.productionRoutingEnabledNow,
      advisoryRoutingEnabledNow: config.configStatus.advisoryRoutingEnabledNow,
      calibratedRoutingEnabledNow:
        config.configStatus.calibratedRoutingEnabledNow,
      defaultOffRequired: config.configStatus.defaultOffRequired,
      rawDefaultOffConfigIncluded: false
    });
  });

  it("defines required deterministic safety overrides that advisory and calibrated layers may not override", () => {
    const overrides =
      loadExampleSafetyOverrideFallbackRules().deterministicSafetyOverrides;

    expect(overrides.map((override) => override.overrideCategory)).toEqual([
      ...safetyOverrideCategoryValues
    ]);
    for (const override of overrides) {
      expect(override.currentAuthority).toBe("deterministic_codingactiongate");
      expect(override.calibratedLayerMayOverride).toBe(false);
      expect(override.advisoryLayerMayOverride).toBe(false);
      expect(override.fallbackDecisionCategory).toMatch(
        /^(deterministic_decision_engine|defer_for_evidence|escalate_for_human_review|block_by_policy)$/
      );
    }
  });

  it("defines required fallback rules with category-only targets and no routing execution authority", () => {
    const rules = loadExampleSafetyOverrideFallbackRules().fallbackRules;

    expect(rules.map((rule) => rule.fallbackCategory)).toEqual([
      ...safetyFallbackCategoryValues
    ]);
    for (const rule of rules) {
      expect(rule.triggerCategory).toBe(rule.fallbackCategory);
      expect(safetyFallbackTargetCategoryValues).toContain(
        rule.fallbackTargetCategory
      );
      expect(rule.fallbackTargetCategory).not.toMatch(
        /execute|dispatch|route_now|runtime|network|telemetry/i
      );
      expect(rule.calibratedLayerMayProceed).toBe(false);
    }
  });

  it("keeps future calibrated/advisory signals lower than deterministic gates and fallback rules", () => {
    const precedence =
      loadExampleSafetyOverrideFallbackRules().rulePrecedence.precedence;
    const ranks = new Map(
      precedence.map((rule) => [rule.ruleCategory, rule.precedenceRank])
    );

    expect(precedence.map((rule) => rule.ruleCategory)).toEqual([
      ...safetyRulePrecedenceCategoryValues
    ]);
    expect(ranks.get("deterministic_hard_block_or_policy_prohibition")).toBe(1);
    expect(ranks.get("deterministic_safety_override")).toBeLessThan(
      ranks.get("future_calibrated_advisory_signal_if_ever_approved") ?? 0
    );
    expect(ranks.get("eligibility_gate")).toBeLessThan(
      ranks.get("future_calibrated_advisory_signal_if_ever_approved") ?? 0
    );
    expect(ranks.get("default_off_config_gate")).toBeLessThan(
      ranks.get("future_calibrated_advisory_signal_if_ever_approved") ?? 0
    );
    expect(ranks.get("fallback_conditions")).toBeLessThan(
      ranks.get("future_calibrated_advisory_signal_if_ever_approved") ?? 0
    );
    for (const rule of precedence) {
      expect(rule.futureCalibratedAdvisoryMayOverride).toBe(false);
    }
  });

  it("requires Phase 17 evidence before production routing can be enabled", () => {
    const dependency =
      loadExampleSafetyOverrideFallbackRules().phase17EvidenceDependency;

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

  it("lists current blockers for any production, advisory, or calibrated routing enablement", () => {
    expect(loadExampleSafetyOverrideFallbackRules().blockers).toEqual({
      blockerCategories: [...safetyOverrideFallbackBlockerCategoryValues]
    });
  });

  it("rejects enabled statuses, weakened deterministic authority, and linked gate contradictions", () => {
    const record = loadExampleSafetyOverrideFallbackRules();

    expect(() =>
      safetyOverrideFallbackRulesSchema.parse({
        ...record,
        source: "runtime_safety_override_rules"
      })
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.ruleStatus.productionRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.ruleStatus.advisoryRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.ruleStatus.calibratedRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.ruleStatus.deterministicOverridesAuthoritative = false as true;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.ruleStatus.fallbackToDeterministicRequired = false as true;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.linkedProductionEligibility.productionRoutingEligibleNow =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow =
            true as false;
        })
      )
    ).toThrow();
  });

  it("rejects override, fallback, precedence, Phase 17, and exact boundary drift", () => {
    const record = loadExampleSafetyOverrideFallbackRules();

    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.deterministicSafetyOverrides[0]!.calibratedLayerMayOverride =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.deterministicSafetyOverrides[0]!.advisoryLayerMayOverride =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.deterministicSafetyOverrides[0]!.overrideCategory =
            "workspace_escape";
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.fallbackRules[0]!.fallbackCategory = "failed_eligibility";
          copy.fallbackRules[0]!.triggerCategory = "failed_eligibility";
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.rulePrecedence.precedence[1]!.precedenceRank = 8;
          copy.rulePrecedence.precedence[7]!.precedenceRank = 1;
        })
      )
    ).toThrow();
    expect(() =>
      validateSafetyOverrideFallbackRules(
        withMutation(record, (copy) => {
          copy.phase17EvidenceDependency.realAgentEvidenceRequired =
            false as true;
        })
      )
    ).toThrow();
    expect(() =>
      safetyOverrideFallbackRulesSafetySchema.parse({
        ...record.safety,
        implementsProductionRouting: true
      })
    ).toThrow();
    expect(() =>
      safetyOverrideFallbackRulesPrivacySchema.parse({
        ...record.privacy,
        rawRoutingDataIncluded: true
      })
    ).toThrow();
    expect(() =>
      safetyOverrideFallbackRulesClaimBoundariesSchema.parse({
        ...record.claimBoundaries,
        statisticalGuarantee: true
      })
    ).toThrow();
  });

  it("provides deterministic pure summaries without runtime integration", async () => {
    const record = loadExampleSafetyOverrideFallbackRules();
    const first = summarizeSafetyOverrideFallbackRules(record);
    const second = summarizeSafetyOverrideFallbackRules(
      JSON.parse(JSON.stringify(record)) as SafetyOverrideFallbackRules
    );
    const before = JSON.stringify(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
    expect(first).toMatchObject({
      schemaVersion: "agent-safety-override-fallback-rules.v1",
      rulesRecordId: "phase-16-safety-override-fallback-rules-001",
      linkedEligibilityRecordId: "phase-16-production-eligibility-001",
      linkedProductionRoutingEligibleNow: false,
      linkedDefaultOffConfigRecordId: "phase-16-default-off-routing-config-001",
      linkedProductionRoutingEnabledNow: false,
      linkedAdvisoryRoutingEnabledNow: false,
      linkedCalibratedRoutingEnabledNow: false,
      defaultOffRequired: true,
      deterministicSafetyOverrideCount: safetyOverrideCategoryValues.length,
      fallbackRuleCount: safetyFallbackCategoryValues.length,
      phase17EvidenceRequired: true,
      productionRoutingCannotBeEnabledWithoutPhase17Evidence: true,
      conclusion: "design_only_not_enabled_deterministic_authority_preserved"
    });
    expect(first.deterministicSafetyOverrides).toEqual([
      ...safetyOverrideCategoryValues
    ]);
    expect(first.fallbackRules).toEqual([...safetyFallbackCategoryValues]);
    expect(first.rulePrecedence).toEqual([
      ...safetyRulePrecedenceCategoryValues
    ]);
    expect(buildSafetyOverrideFallbackRules()).toEqual(record);

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "safetyOverrideFallbackRulesSchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(
      /runtimeRouter|decisionEngine|router\.route|policyLoader|apiServer|dashboard/i
    );
  });

  it("keeps the JSON example category-only and free of raw private or executable artifacts", async () => {
    const raw = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "example-safety-override-fallback-rules.json"
      ),
      "utf8"
    );
    const record = JSON.parse(raw) as SafetyOverrideFallbackRules;

    expect(validateSafetyOverrideFallbackRules(record)).toEqual(record);
    expect(safetyOverrideFallbackRulesContainsForbiddenRawString(record)).toBe(
      false
    );
    for (const forbidden of [
      /diff --git/,
      /\/Users\//,
      /\/private\/tmp\//,
      /C:\\/,
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /PRIVATE KEY/,
      /(?:^|["'\s=])sk-[A-Za-z0-9_-]{24,}/,
      /raw prompt|raw command|raw diff|raw source code/i,
      /raw validation log|raw review|raw trace|raw agent output/i,
      /human name|reviewer identity|branch name|repo name|package name/i,
      /\bnpm\s|\bgit\s|\brm\s+-/
    ]) {
      expect(raw).not.toMatch(forbidden);
    }
  });
});
