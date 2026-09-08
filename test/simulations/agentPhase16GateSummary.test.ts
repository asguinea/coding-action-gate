import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedPhase16ArtifactCategoryValues,
  buildExamplePhase16GateSummary,
  buildProductionPhase16GateSummary,
  loadExampleDefaultOffRoutingConfig,
  loadExamplePhase16GateSummary,
  loadExampleProductionRoutingEligibility,
  loadExampleProductionRoutingReviewChecklist,
  loadExampleSafetyOverrideFallbackRules,
  phase16GateReasonCategoryValues,
  phase16GateSummaryBoundaryStatementValues,
  phase16GateSummaryClaimBoundariesSchema,
  phase16GateSummaryContainsForbiddenRawString,
  phase16GateSummaryPrivacySchema,
  phase16GateSummarySafetySchema,
  phase16RemainingBlockerCategoryValues,
  phase17ExpectedOutputCategoryValues,
  realCalibrationPathStepCategoryValues,
  summarizePhase16GateSummary,
  validatePhase16GateSummaries,
  validatePhase16GateSummary,
  validatePhase16GateSummaryBoundaries,
  type Phase16GateSummary
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  syntheticOnly: true,
  designOnly: true,
  gateDesignOnly: true,
  gateSummaryOnly: true,
  handoffOnly: true,
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
  approvesRelease: false,
  startsRealAgentIntegration: false,
  startsRealCalibration: false
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
  gateSummaryOnly: true,
  handoffOnly: true,
  productionRoutingEnabled: false,
  advisoryRoutingEnabled: false,
  calibratedRoutingEnabled: false,
  productionRoutingEligible: false,
  productionRoutingGatePasses: false,
  approvalGranted: false,
  releaseApproved: false,
  runtimeIntegrationApproved: false,
  runtimeConfigFlagAdded: false,
  policyFlagAdded: false,
  advisoryRoutingImplemented: false,
  calibratedRoutingImplemented: false,
  productionRoutingChanged: false,
  realAgentEvidenceStarted: false,
  realCalibrationStarted: false,
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
  "gateSummaryRecordId",
  "source",
  "phaseStatus",
  "acceptedPhase16Artifacts",
  "linkedProductionEligibility",
  "linkedDefaultOffRoutingConfig",
  "linkedSafetyOverrideFallbackRules",
  "linkedProductionRoutingReviewChecklist",
  "gateDecision",
  "phase17EvidenceHandoff",
  "realCalibrationPath",
  "remainingBlockers",
  "stopCondition",
  "safety",
  "privacy",
  "claimBoundaries",
  "boundaryStatements",
  "notes"
] as const;

const withMutation = (
  record: Phase16GateSummary,
  mutate: (copy: Phase16GateSummary) => void
): Phase16GateSummary => {
  const copy = JSON.parse(JSON.stringify(record)) as Phase16GateSummary;
  mutate(copy);
  return copy;
};

describe("agent Phase 16 gate summary schema", () => {
  it("validates the example summary and stable Batch 16.5 metadata", () => {
    const record = loadExamplePhase16GateSummary();
    const built = buildExamplePhase16GateSummary();

    expect(record).toEqual(built);
    expect(validatePhase16GateSummaries([record])).toEqual([record]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe("agent-phase-16-gate-summary.v1");
    expect(record.gateSummaryRecordId).toMatch(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/
    );
    expect(record.gateSummaryRecordId).not.toMatch(
      /@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i
    );
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(record.boundaryStatements).toEqual([
      ...phase16GateSummaryBoundaryStatementValues
    ]);
    expect(phase16GateSummaryContainsForbiddenRawString(record)).toBe(false);
    expect(() => validatePhase16GateSummaryBoundaries(record)).not.toThrow();
  });

  it("closes Phase 16 as gate design only with no enablement, approval, or real evidence started", () => {
    const status = loadExamplePhase16GateSummary().phaseStatus;

    expect(status.phase).toBe("phase_16");
    expect(status.phaseCompleteAsGateDesign).toBe(true);
    expect(status.designOnly).toBe(true);
    expect(status.gateSummaryOnly).toBe(true);
    expect(status.productionRoutingGatePassesNow).toBe(false);
    expect(status.productionRoutingEligibleNow).toBe(false);
    expect(status.productionRoutingEnabledNow).toBe(false);
    expect(status.advisoryRoutingEnabledNow).toBe(false);
    expect(status.calibratedRoutingEnabledNow).toBe(false);
    expect(status.approvalGrantedNow).toBe(false);
    expect(status.releaseApprovedNow).toBe(false);
    expect(status.runtimeIntegrationApprovedNow).toBe(false);
    expect(status.realCalibrationStarted).toBe(false);
    expect(status.realAgentEvidenceStarted).toBe(false);
  });

  it("summarizes all accepted Phase 16 artifacts without production authority", () => {
    const artifacts = loadExamplePhase16GateSummary().acceptedPhase16Artifacts;

    expect(artifacts.map((artifact) => artifact.artifactCategory)).toEqual([
      ...acceptedPhase16ArtifactCategoryValues
    ]);
    for (const artifact of artifacts) {
      expect(artifact.accepted).toBe(true);
      expect(artifact.designOnly).toBe(true);
      expect(artifact.grantsProductionAuthority).toBe(false);
      expect(artifact.changesRuntimeBehavior).toBe(false);
      expect(artifact.rawRecordIncluded).toBe(false);
    }
  });

  it("links to prior Phase 16 records with blocked current status", () => {
    const record = loadExamplePhase16GateSummary();
    const eligibility = loadExampleProductionRoutingEligibility();
    const config = loadExampleDefaultOffRoutingConfig();
    const rules = loadExampleSafetyOverrideFallbackRules();
    const checklist = loadExampleProductionRoutingReviewChecklist();

    expect(record.linkedProductionEligibility).toEqual({
      eligibilityRecordId: eligibility.eligibilityRecordId,
      schemaVersion: eligibility.schemaVersion,
      productionRoutingEligibleNow:
        eligibility.eligibilityStatus.productionRoutingEligibleNow,
      rawEligibilityRecordIncluded: false
    });
    expect(record.linkedDefaultOffRoutingConfig).toEqual({
      configRecordId: config.configRecordId,
      schemaVersion: config.schemaVersion,
      productionRoutingEnabledNow:
        config.configStatus.productionRoutingEnabledNow,
      advisoryRoutingEnabledNow: config.configStatus.advisoryRoutingEnabledNow,
      calibratedRoutingEnabledNow:
        config.configStatus.calibratedRoutingEnabledNow,
      defaultOffRequired: config.configStatus.defaultOffRequired,
      rawDefaultOffConfigIncluded: false
    });
    expect(record.linkedSafetyOverrideFallbackRules).toEqual({
      rulesRecordId: rules.rulesRecordId,
      schemaVersion: rules.schemaVersion,
      deterministicOverridesAuthoritative:
        rules.ruleStatus.deterministicOverridesAuthoritative,
      fallbackToDeterministicRequired:
        rules.ruleStatus.fallbackToDeterministicRequired,
      rawRulesRecordIncluded: false
    });
    expect(record.linkedProductionRoutingReviewChecklist).toEqual({
      checklistRecordId: checklist.checklistRecordId,
      schemaVersion: checklist.schemaVersion,
      approvalGrantedNow: checklist.checklistStatus.approvalGrantedNow,
      productionRoutingApprovedNow:
        checklist.checklistStatus.productionRoutingApprovedNow,
      productionRoutingEnabledNow:
        checklist.checklistStatus.productionRoutingEnabledNow,
      rawChecklistRecordIncluded: false
    });
  });

  it("records that the production routing gate does not pass", () => {
    const decision = loadExamplePhase16GateSummary().gateDecision;

    expect(decision.gatePassesNow).toBe(false);
    expect(decision.gateDecisionCategory).toBe("does_not_pass");
    expect(decision.productionRoutingMayBeEnabledNow).toBe(false);
    expect(decision.advisoryRoutingMayBeAuthoritativeNow).toBe(false);
    expect(decision.calibratedRoutingMayBeAuthoritativeNow).toBe(false);
    expect(decision.reasonCategories).toEqual([
      ...phase16GateReasonCategoryValues
    ]);
    expect(decision.requiredNextPhase).toBe("phase_17_real_agent_evidence");
  });

  it("defines the required Phase 17 evidence handoff outputs", () => {
    const handoff = loadExamplePhase16GateSummary().phase17EvidenceHandoff;

    expect(handoff.realAgentEvidenceRequired).toBe(true);
    expect(handoff.controlledTraceCollectionRequired).toBe(true);
    expect(handoff.realProposedActionCaptureRequired).toBe(true);
    expect(handoff.reviewedTraceLabelsRequired).toBe(true);
    expect(handoff.adjudicationRequiredWhereLabelsConflict).toBe(true);
    expect(handoff.baselineComparisonOnRealControlledTracesRequired).toBe(true);
    expect(handoff.evidenceQualityReviewRequired).toBe(true);
    expect(handoff.privacySafeInclusionExclusionRequired).toBe(true);
    expect(
      handoff.realCalibrationDatasetConstructionAfterTraceReviewRequired
    ).toBe(true);
    expect(handoff.productionRoutingCannotBeEnabledWithoutPhase17Evidence).toBe(
      true
    );
    expect(handoff.stopExpandingMockRoutingInfrastructureAfterPhase16).toBe(
      true
    );
    expect(handoff.expectedPhase17Outputs).toEqual([
      ...phase17ExpectedOutputCategoryValues
    ]);
  });

  it("defines the real calibration path after Phase 17 while current real-calibration flags remain false", () => {
    const path = loadExamplePhase16GateSummary().realCalibrationPath;

    expect(path.pathSteps).toEqual([...realCalibrationPathStepCategoryValues]);
    expect(path.realCalibrationStartedNow).toBe(false);
    expect(path.realCalibrationDatasetExistsNow).toBe(false);
    expect(path.realScoresExistNow).toBe(false);
    expect(path.realThresholdsExistNow).toBe(false);
    expect(path.conformalOrCRCImplementedNow).toBe(false);
    expect(path.productionAuthorityGrantedNow).toBe(false);
  });

  it("lists remaining blockers and the Phase 17 stop condition", () => {
    const record = loadExamplePhase16GateSummary();

    expect(record.remainingBlockers.blockerCategories).toEqual([
      ...phase16RemainingBlockerCategoryValues
    ]);
    expect(record.remainingBlockers.blockerCategories).toContain(
      "phase_17_evidence_missing"
    );
    expect(record.stopCondition).toEqual({
      phase16GateDesignComplete: true,
      continueMockRoutingInfrastructureExpansion: false,
      nextStrategicWorkCategory: "phase_17_real_controlled_agent_evidence",
      reason:
        "real_evidence_required_before_further_calibration_or_production_authority",
      productionRoutingCannotProgressWithoutRealEvidence: true
    });
  });

  it("rejects gate, routing, approval, release, runtime integration, and real-evidence contradictions", () => {
    const record = loadExamplePhase16GateSummary();

    for (const mutate of [
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.productionRoutingGatePassesNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.productionRoutingEnabledNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.advisoryRoutingEnabledNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.calibratedRoutingEnabledNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.approvalGrantedNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.releaseApprovedNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.runtimeIntegrationApprovedNow = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.realCalibrationStarted = true as false;
      },
      (copy: Phase16GateSummary) => {
        copy.phaseStatus.realAgentEvidenceStarted = true as false;
      }
    ]) {
      expect(() =>
        validatePhase16GateSummary(withMutation(record, mutate))
      ).toThrow();
    }
  });

  it("rejects artifact, gate-decision, Phase 17 handoff, calibration path, and stop-condition drift", () => {
    const record = loadExamplePhase16GateSummary();

    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          copy.acceptedPhase16Artifacts[0]!.artifactCategory =
            "default_off_routing_configuration_design";
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          copy.acceptedPhase16Artifacts[0]!.grantsProductionAuthority =
            true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          copy.gateDecision.gatePassesNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          delete (copy as Partial<Phase16GateSummary>).phase17EvidenceHandoff;
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          copy.phase17EvidenceHandoff.stopExpandingMockRoutingInfrastructureAfterPhase16 =
            false as true;
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          copy.realCalibrationPath.realScoresExistNow = true as false;
        })
      )
    ).toThrow();
    expect(() =>
      validatePhase16GateSummary(
        withMutation(record, (copy) => {
          delete (copy as Partial<Phase16GateSummary>).stopCondition;
        })
      )
    ).toThrow();
  });

  it("rejects exact safety, privacy, and claim-boundary drift", () => {
    const record = loadExamplePhase16GateSummary();

    expect(() =>
      phase16GateSummarySafetySchema.parse({
        ...record.safety,
        startsRealAgentIntegration: true
      })
    ).toThrow();
    expect(() =>
      phase16GateSummaryPrivacySchema.parse({
        ...record.privacy,
        rawTraceIncluded: true
      })
    ).toThrow();
    expect(() =>
      phase16GateSummaryClaimBoundariesSchema.parse({
        ...record.claimBoundaries,
        productionRoutingGatePasses: true
      })
    ).toThrow();
  });

  it("provides deterministic pure summaries without runtime integration", async () => {
    const record = loadExamplePhase16GateSummary();
    const first = summarizePhase16GateSummary(record);
    const second = summarizePhase16GateSummary(
      JSON.parse(JSON.stringify(record)) as Phase16GateSummary
    );
    const before = JSON.stringify(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
    expect(first).toMatchObject({
      schemaVersion: "agent-phase-16-gate-summary.v1",
      gateSummaryRecordId: "phase-16-gate-summary-001",
      phaseCompleteAsGateDesign: true,
      linkedEligibilityRecordId: "phase-16-production-eligibility-001",
      linkedProductionRoutingEligibleNow: false,
      linkedDefaultOffConfigRecordId: "phase-16-default-off-routing-config-001",
      linkedProductionRoutingEnabledNow: false,
      linkedSafetyFallbackRulesRecordId:
        "phase-16-safety-override-fallback-rules-001",
      linkedDeterministicOverridesAuthoritative: true,
      linkedReviewChecklistRecordId:
        "phase-16-production-routing-review-checklist-001",
      linkedApprovalGrantedNow: false,
      acceptedArtifactCount: acceptedPhase16ArtifactCategoryValues.length,
      gateDecision: "does_not_pass",
      productionRoutingMayBeEnabledNow: false,
      blockerCount: phase16RemainingBlockerCategoryValues.length,
      phase17EvidenceRequired: true,
      stopCondition: "phase_17_real_controlled_agent_evidence",
      conclusion:
        "phase_16_gate_design_complete_production_routing_not_eligible_phase_17_evidence_required_next"
    });
    expect(first.acceptedArtifacts).toEqual([
      ...acceptedPhase16ArtifactCategoryValues
    ]);
    expect(first.expectedPhase17Outputs).toEqual([
      ...phase17ExpectedOutputCategoryValues
    ]);
    expect(first.realCalibrationPath).toEqual([
      ...realCalibrationPathStepCategoryValues
    ]);
    expect(buildProductionPhase16GateSummary()).toEqual(record);

    const source = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "phase16GateSummarySchema.ts"
      ),
      "utf8"
    );
    expect(source).not.toMatch(/node:fs|child_process|fetch\(|exec\(|spawn\(/);
    expect(source).not.toMatch(
      /runtimeRouter|decisionEngine|router\.route|policyLoader|apiServer|dashboard/i
    );
  });

  it("keeps the JSON example category-only and free of raw private, approval, trace, or calibration artifacts", async () => {
    const raw = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "production-routing",
        "example-phase-16-gate-summary.json"
      ),
      "utf8"
    );
    const record = JSON.parse(raw) as Phase16GateSummary;

    expect(validatePhase16GateSummary(record)).toEqual(record);
    expect(phase16GateSummaryContainsForbiddenRawString(record)).toBe(false);
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
      /raw approval record|raw calibration record|human name/i,
      /reviewer identity|branch name|repo name|package name/i,
      /\bnpm\s|\bgit\s|\brm\s+-/
    ]) {
      expect(raw).not.toMatch(forbidden);
    }
  });
});
