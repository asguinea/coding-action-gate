import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExampleProductionRoutingReviewChecklist,
  buildProductionRoutingReviewChecklist,
  loadExampleDefaultOffRoutingConfig,
  loadExampleProductionRoutingEligibility,
  loadExampleProductionRoutingReviewChecklist,
  loadExampleSafetyOverrideFallbackRules,
  productionRoutingApprovalRequirementCategoryValues,
  productionRoutingReviewBlockerCategoryValues,
  productionRoutingReviewBoundaryStatementValues,
  productionRoutingReviewCategoryValues,
  productionRoutingReviewChecklistClaimBoundariesSchema,
  productionRoutingReviewChecklistContainsForbiddenRawString,
  productionRoutingReviewChecklistNonApprovalStatementSchema,
  productionRoutingReviewChecklistPrivacySchema,
  productionRoutingReviewChecklistSafetySchema,
  productionRoutingReviewChecklistSchema,
  summarizeProductionRoutingReviewChecklist,
  validateProductionRoutingReviewChecklist,
  validateProductionRoutingReviewChecklistBoundaries,
  validateProductionRoutingReviewChecklists,
  type ProductionRoutingReviewChecklist
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  gateDesignOnly: true,
  checklistDesignOnly: true,
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
  implementsConformalRiskControl: false,
  grantsApproval: false,
  approvesRelease: false
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
  rawApprovalDataIncluded: false,
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
  checklistDesignOnly: true,
  productionRoutingEnabled: false,
  advisoryRoutingEnabled: false,
  calibratedRoutingEnabled: false,
  productionRoutingEligible: false,
  approvalGranted: false,
  releaseApproved: false,
  runtimeIntegrationApproved: false,
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

const exactNonApprovalStatement = {
  thisChecklistGrantsApproval: false,
  thisChecklistEnablesProductionRouting: false,
  thisChecklistEnablesAdvisoryRouting: false,
  thisChecklistEnablesCalibratedRouting: false,
  approvalRecordCreatedNow: false,
  releaseApprovedNow: false,
  runtimeIntegrationApprovedNow: false,
  productionUseApprovedNow: false
} as const;

const requiredTopLevelFields = [
  "schemaVersion",
  "checklistRecordId",
  "source",
  "phase",
  "checklistStatus",
  "linkedProductionEligibility",
  "linkedDefaultOffRoutingConfig",
  "linkedSafetyOverrideFallbackRules",
  "reviewChecklist",
  "approvalRequirements",
  "enablementBlockers",
  "nonApprovalStatement",
  "phase17EvidenceDependency",
  "safety",
  "privacy",
  "claimBoundaries",
  "boundaryStatements",
  "notes"
] as const;

const withMutation = (
  record: ProductionRoutingReviewChecklist,
  mutate: (copy: ProductionRoutingReviewChecklist) => void
): ProductionRoutingReviewChecklist => {
  const copy = JSON.parse(
    JSON.stringify(record)
  ) as ProductionRoutingReviewChecklist;
  mutate(copy);
  return copy;
};

describe("agent production routing review checklist schema", () => {
  it("validates the example checklist and stable Batch 16.4 metadata", () => {
    const record = loadExampleProductionRoutingReviewChecklist();
    const built = buildExampleProductionRoutingReviewChecklist();

    expect(record).toEqual(built);
    expect(validateProductionRoutingReviewChecklists([record])).toEqual([
      record
    ]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe(
      "agent-production-routing-review-checklist.v1"
    );
    expect(record.checklistRecordId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(record.checklistRecordId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(record.phase).toEqual({
      phaseId: "phase-16",
      phaseName: "Production-Authoritative Calibrated Routing Gate",
      completedPreviousPhase:
        "phase-15-complete-advisory-design-readiness-groundwork-only",
      completedBatches: ["16.1", "16.2", "16.3"],
      currentBatch: "16.4",
      futureBatches: ["16.5"],
      phaseStatus:
        "production_routing_review_checklist_design_without_approval_or_runtime_routing_implementation"
    });
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(record.nonApprovalStatement).toEqual(exactNonApprovalStatement);
    expect(record.boundaryStatements).toEqual([
      ...productionRoutingReviewBoundaryStatementValues
    ]);
    expect(
      productionRoutingReviewChecklistContainsForbiddenRawString(record)
    ).toBe(false);
    expect(() =>
      validateProductionRoutingReviewChecklistBoundaries(record)
    ).not.toThrow();
  });

  it("keeps current approval and enablement impossible", () => {
    const status =
      loadExampleProductionRoutingReviewChecklist().checklistStatus;

    expect(status.designOnly).toBe(true);
    expect(status.checklistOnly).toBe(true);
    expect(status.approvalGrantedNow).toBe(false);
    expect(status.productionRoutingApprovedNow).toBe(false);
    expect(status.productionRoutingEnabledNow).toBe(false);
    expect(status.advisoryRoutingEnabledNow).toBe(false);
    expect(status.calibratedRoutingEnabledNow).toBe(false);
    expect(status.productionRoutingEligibleNow).toBe(false);
    expect(status.defaultOffRequired).toBe(true);
    expect(status.deterministicOverridesAuthoritative).toBe(true);
    expect(status.fallbackToDeterministicRequired).toBe(true);
  });

  it("links to Batch 16.1 eligibility without embedding raw eligibility", () => {
    const record = loadExampleProductionRoutingReviewChecklist();
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
    const record = loadExampleProductionRoutingReviewChecklist();
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

  it("links to Batch 16.3 safety/fallback rules without embedding raw rules", () => {
    const record = loadExampleProductionRoutingReviewChecklist();
    const rules = loadExampleSafetyOverrideFallbackRules();

    expect(record.linkedSafetyOverrideFallbackRules).toEqual({
      rulesRecordId: rules.rulesRecordId,
      schemaVersion: rules.schemaVersion,
      source: rules.source,
      deterministicOverridesAuthoritative:
        rules.ruleStatus.deterministicOverridesAuthoritative,
      fallbackToDeterministicRequired:
        rules.ruleStatus.fallbackToDeterministicRequired,
      rawRulesRecordIncluded: false
    });
  });

  it("defines required review checklist categories with no current completion or approval", () => {
    const items = loadExampleProductionRoutingReviewChecklist().reviewChecklist;

    expect(items.map((item) => item.reviewCategory)).toEqual([
      ...productionRoutingReviewCategoryValues
    ]);
    for (const item of items) {
      expect(item.requiredBeforeEnablement).toBe(true);
      expect(item.completedNow).toBe(false);
      expect(item.approvalGrantedNow).toBe(false);
      expect(item.reviewerIdentityIncluded).toBe(false);
      expect(item.failureBlocksEnablement).toBe(true);
    }
  });

  it("defines future approval requirements that remain unmet", () => {
    const requirements =
      loadExampleProductionRoutingReviewChecklist().approvalRequirements
        .requirements;

    expect(
      requirements.map((requirement) => requirement.requirementCategory)
    ).toEqual([...productionRoutingApprovalRequirementCategoryValues]);
    for (const requirement of requirements) {
      expect(requirement.requiredBeforeEnablement).toBe(true);
      expect(requirement.metNow).toBe(false);
      expect(requirement.approvalGrantedNow).toBe(false);
    }
  });

  it("keeps the non-approval statement exact and false", () => {
    const statement =
      loadExampleProductionRoutingReviewChecklist().nonApprovalStatement;

    expect(statement).toEqual(exactNonApprovalStatement);
    expect(() =>
      productionRoutingReviewChecklistNonApprovalStatementSchema.parse(
        statement
      )
    ).not.toThrow();
  });

  it("requires Phase 17 evidence before production routing can be enabled", () => {
    const dependency =
      loadExampleProductionRoutingReviewChecklist().phase17EvidenceDependency;

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

  it("lists current enablement blockers", () => {
    expect(
      loadExampleProductionRoutingReviewChecklist().enablementBlockers
    ).toEqual({
      blockerCategories: [...productionRoutingReviewBlockerCategoryValues]
    });
  });

  it("rejects approval, enablement, and linked gate contradictions", () => {
    const record = loadExampleProductionRoutingReviewChecklist();

    expect(() =>
      productionRoutingReviewChecklistSchema.parse({
        ...record,
        source: "runtime_production_routing_review_checklist"
      })
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.checklistStatus.approvalGrantedNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.checklistStatus.productionRoutingApprovedNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.checklistStatus.productionRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.checklistStatus.advisoryRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.checklistStatus.calibratedRoutingEnabledNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.linkedProductionEligibility.productionRoutingEligibleNow =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.linkedDefaultOffRoutingConfig.productionRoutingEnabledNow =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.linkedSafetyOverrideFallbackRules.deterministicOverridesAuthoritative =
            false as true;
        })
      )
    ).toThrow();
  });

  it("rejects checklist completion, approval, reviewer identity, and category drift", () => {
    const record = loadExampleProductionRoutingReviewChecklist();

    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.reviewChecklist[0]!.reviewCategory = "security_review";
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.reviewChecklist[0]!.completedNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.reviewChecklist[0]!.approvalGrantedNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.reviewChecklist[0]!.reviewerIdentityIncluded = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.approvalRequirements.requirements = [];
        })
      )
    ).toThrow();
  });

  it("rejects non-approval, Phase 17, safety, privacy, and claim-boundary drift", () => {
    const record = loadExampleProductionRoutingReviewChecklist();

    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          delete (copy as Partial<ProductionRoutingReviewChecklist>)
            .nonApprovalStatement;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.nonApprovalStatement.thisChecklistGrantsApproval = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.nonApprovalStatement.thisChecklistEnablesProductionRouting =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validateProductionRoutingReviewChecklist(
        withMutation(record, (copy) => {
          copy.phase17EvidenceDependency.realAgentEvidenceRequired =
            false as true;
        })
      )
    ).toThrow();
    expect(() =>
      productionRoutingReviewChecklistSafetySchema.parse({
        ...record.safety,
        grantsApproval: true
      })
    ).toThrow();
    expect(() =>
      productionRoutingReviewChecklistPrivacySchema.parse({
        ...record.privacy,
        rawApprovalDataIncluded: true
      })
    ).toThrow();
    expect(() =>
      productionRoutingReviewChecklistClaimBoundariesSchema.parse({
        ...record.claimBoundaries,
        approvalGranted: true
      })
    ).toThrow();
  });

  it("provides deterministic pure summaries without runtime integration", async () => {
    const record = loadExampleProductionRoutingReviewChecklist();
    const first = summarizeProductionRoutingReviewChecklist(record);
    const second = summarizeProductionRoutingReviewChecklist(
      JSON.parse(JSON.stringify(record)) as ProductionRoutingReviewChecklist
    );
    const before = JSON.stringify(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
    expect(first).toMatchObject({
      schemaVersion: "agent-production-routing-review-checklist.v1",
      checklistRecordId: "phase-16-production-routing-review-checklist-001",
      linkedEligibilityRecordId: "phase-16-production-eligibility-001",
      linkedProductionRoutingEligibleNow: false,
      linkedDefaultOffConfigRecordId: "phase-16-default-off-routing-config-001",
      linkedProductionRoutingEnabledNow: false,
      linkedAdvisoryRoutingEnabledNow: false,
      linkedCalibratedRoutingEnabledNow: false,
      linkedSafetyFallbackRulesRecordId:
        "phase-16-safety-override-fallback-rules-001",
      linkedDeterministicOverridesAuthoritative: true,
      linkedFallbackToDeterministicRequired: true,
      reviewChecklistItemCount: productionRoutingReviewCategoryValues.length,
      approvalRequirementCount:
        productionRoutingApprovalRequirementCategoryValues.length,
      blockerCount: productionRoutingReviewBlockerCategoryValues.length,
      nonApprovalSummary: "no_approval_no_release_no_runtime_integration",
      phase17EvidenceRequired: true,
      productionRoutingCannotBeEnabledWithoutPhase17Evidence: true,
      conclusion: "checklist_only_no_approval_not_enabled"
    });
    expect(first.reviewChecklistItems).toEqual([
      ...productionRoutingReviewCategoryValues
    ]);
    expect(first.approvalRequirements).toEqual([
      ...productionRoutingApprovalRequirementCategoryValues
    ]);
    expect(first.blockers).toEqual([
      ...productionRoutingReviewBlockerCategoryValues
    ]);
    expect(buildProductionRoutingReviewChecklist()).toEqual(record);

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "productionRoutingReviewChecklistSchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(
      /runtimeRouter|decisionEngine|router\.route|policyLoader|apiServer|dashboard/i
    );
  });

  it("keeps the JSON example category-only and free of raw private or approval artifacts", async () => {
    const raw = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "example-production-routing-review-checklist.json"
      ),
      "utf8"
    );
    const record = JSON.parse(raw) as ProductionRoutingReviewChecklist;

    expect(validateProductionRoutingReviewChecklist(record)).toEqual(record);
    expect(
      productionRoutingReviewChecklistContainsForbiddenRawString(record)
    ).toBe(false);
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
      /raw approval record|human name|reviewer identity/i,
      /branch name|repo name|package name/i,
      /\bnpm\s|\bgit\s|\brm\s+-/
    ]) {
      expect(raw).not.toMatch(forbidden);
    }
  });
});
