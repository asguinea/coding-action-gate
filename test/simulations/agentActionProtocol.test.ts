import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionProtocolBlockerCategoryValues,
  actionProtocolBoundaryStatementValues,
  actionProtocolExclusionCategoryValues,
  actionProtocolInclusionCategoryValues,
  agentActionProtocolClaimBoundariesSchema,
  agentActionProtocolContainsForbiddenRawString,
  agentActionProtocolPrivacySchema,
  agentActionProtocolSafetySchema,
  authorizationDecisionCategoryValues,
  buildAgentActionProtocol,
  buildExampleAgentActionProtocol,
  controlledEnvironmentRequirementCategoryValues,
  loadAgentActionProtocolExample,
  loadExamplePhase16GateSummary,
  requiredAgentActionNormalizedFieldValues,
  summarizeAgentActionProtocol,
  supportedAgentActionCategoryValues,
  validateAgentActionProtocol,
  validateAgentActionProtocolBoundaries,
  validateAgentActionProtocols,
  type AgentActionProtocol
} from "../../simulations/agent/index.js";

const exactSafety = {
  inert: true,
  protocolOnly: true,
  designOnly: true,
  executesAgent: false,
  executesActions: false,
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
  implementsAgentIntegration: false,
  capturesRealProposedActions: false,
  createsRealTrace: false,
  createsCalibrationData: false,
  computesScores: false,
  computesThresholds: false,
  appliesCalibration: false,
  implementsAdvisoryRouting: false,
  implementsCalibratedRouting: false,
  implementsProductionRouting: false,
  implementsConformalRiskControl: false
} as const;

const exactPrivacy = {
  categoryOnly: true,
  rawPromptIncluded: false,
  rawActionIncluded: false,
  rawCommandIncluded: false,
  rawDiffIncluded: false,
  rawSourceCodeIncluded: false,
  rawValidationLogIncluded: false,
  rawTraceIncluded: false,
  rawCalibrationDataIncluded: false,
  rawScoreDataIncluded: false,
  rawThresholdDataIncluded: false,
  rawRoutingDataIncluded: false,
  rawConfigDataIncluded: false,
  rawGateDataIncluded: false,
  realRepoNameIncluded: false,
  realBranchNameIncluded: false,
  realPathIncluded: false,
  realUserIncluded: false,
  realEmailIncluded: false,
  secretIncluded: false,
  rawAgentOutputIncluded: false,
  customerDataIncluded: false,
  reviewerIdentityIncluded: false
} as const;

const exactClaimBoundaries = {
  protocolOnly: true,
  designOnly: true,
  productionRoutingEnabled: false,
  advisoryRoutingEnabled: false,
  calibratedRoutingEnabled: false,
  productionRoutingEligible: false,
  realAgentIntegrationImplemented: false,
  realAgentEvidenceStarted: false,
  realAgentTraceCaptured: false,
  realReviewedTrace: false,
  realCalibrationStarted: false,
  realCalibrationDataset: false,
  realScores: false,
  nonconformityScores: false,
  thresholds: false,
  alphaIntroduced: false,
  calibrationApplied: false,
  conformalRiskControlImplemented: false,
  conformalGuarantee: false,
  statisticalGuarantee: false,
  realEvaluationResults: false,
  productionAuthorityGranted: false
} as const;

const requiredTopLevelFields = [
  "schemaVersion",
  "protocolRecordId",
  "source",
  "protocolStatus",
  "linkedPhase16GateSummary",
  "proposedActionEnvelope",
  "supportedActionCategories",
  "requiredNormalizedFields",
  "rawPayloadPolicy",
  "privacyInclusionRules",
  "authorizationContract",
  "controlledEnvironmentRequirements",
  "phase17EvidencePlanLink",
  "blockers",
  "safety",
  "privacy",
  "claimBoundaries",
  "boundaryStatements",
  "notes"
] as const;

const withMutation = (
  record: AgentActionProtocol,
  mutate: (copy: AgentActionProtocol) => void
): AgentActionProtocol => {
  const copy = JSON.parse(JSON.stringify(record)) as AgentActionProtocol;
  mutate(copy);
  return copy;
};

describe("agent action protocol schema", () => {
  it("validates the example protocol and required Batch 17.1 shape", () => {
    const record = loadAgentActionProtocolExample();
    const built = buildExampleAgentActionProtocol();

    expect(record).toEqual(built);
    expect(validateAgentActionProtocols([record])).toEqual([record]);
    for (const key of requiredTopLevelFields) {
      expect(record).toHaveProperty(key);
    }
    expect(record.schemaVersion).toBe("agent-action-protocol.v1");
    expect(record.protocolRecordId).toBe("phase-17-agent-action-protocol-001");
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(record.boundaryStatements).toEqual([
      ...actionProtocolBoundaryStatementValues
    ]);
    expect(agentActionProtocolContainsForbiddenRawString(record)).toBe(false);
    expect(() => validateAgentActionProtocolBoundaries(record)).not.toThrow();
  });

  it("keeps the protocol status protocol-only with no capture or execution", () => {
    const status = loadAgentActionProtocolExample().protocolStatus;

    expect(status.protocolOnly).toBe(true);
    expect(status.designOnly).toBe(true);
    expect(status.captureEnabledNow).toBe(false);
    expect(status.realAgentIntegrationEnabledNow).toBe(false);
    expect(status.executesAgent).toBe(false);
    expect(status.executesActions).toBe(false);
    expect(status.executesCommands).toBe(false);
    expect(status.mutatesRepository).toBe(false);
    expect(status.requiresNetwork).toBe(false);
    expect(status.createsRealTrace).toBe(false);
    expect(status.createsCalibrationData).toBe(false);
    expect(status.productionRoutingEnabledNow).toBe(false);
    expect(status.calibratedRoutingEnabledNow).toBe(false);
    expect(status.advisoryRoutingAuthoritativeNow).toBe(false);
    expect(status.phase16GateStillRequired).toBe(true);
  });

  it("links to the Phase 16 gate summary without embedding the raw gate payload", () => {
    const record = loadAgentActionProtocolExample();
    const phase16GateSummary = loadExamplePhase16GateSummary();

    expect(record.linkedPhase16GateSummary.phase16GateSummaryRecordId).toBe(
      phase16GateSummary.gateSummaryRecordId
    );
    expect(record.linkedPhase16GateSummary.schemaVersion).toBe(
      "agent-phase-16-gate-summary.v1"
    );
    expect(record.linkedPhase16GateSummary.phase16GatePassesNow).toBe(false);
    expect(record.linkedPhase16GateSummary.productionRoutingEligibleNow).toBe(
      false
    );
    expect(record.linkedPhase16GateSummary.productionRoutingEnabledNow).toBe(
      false
    );
    expect(record.linkedPhase16GateSummary.rawGateSummaryIncluded).toBe(false);
  });

  it("defines a proposed action envelope that requires authorization before execution", () => {
    const envelope = loadAgentActionProtocolExample().proposedActionEnvelope;

    expect(envelope.requiresAuthorizationBeforeExecution).toBe(true);
    expect(envelope.proposedOnlyNotExecuted).toBe(true);
    expect(envelope.rawActionPayloadIncludedByDefault).toBe(false);
    expect(envelope.privacyRedactionRequired).toBe(true);
    expect(envelope.categoryOnlyByDefault).toBe(true);
  });

  it("covers every supported action category as proposal-only and non-executing", () => {
    const categories =
      loadAgentActionProtocolExample().supportedActionCategories;

    expect(categories.map((category) => category.actionCategory)).toEqual([
      ...supportedAgentActionCategoryValues
    ]);
    for (const category of categories) {
      expect(category.requiresPreExecutionAuthorization).toBe(true);
      expect(category.canBeCapturedAsProposal).toBe(true);
      expect(category.executesDuringCapture).toBe(false);
    }
  });

  it("defines required normalized fields and strict raw payload/privacy rules", () => {
    const record = loadAgentActionProtocolExample();

    expect(record.requiredNormalizedFields).toEqual([
      ...requiredAgentActionNormalizedFieldValues
    ]);
    expect(record.rawPayloadPolicy.rawCommandsAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawDiffsAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawSourceCodeAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawPathsAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawRepoNamesAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawPromptsAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawModelOutputsAllowedByDefault).toBe(false);
    expect(record.rawPayloadPolicy.rawValidationLogsAllowedByDefault).toBe(
      false
    );
    expect(record.rawPayloadPolicy.rawSecretsAllowed).toBe(false);
    expect(record.rawPayloadPolicy.sanitizedCategoryOnlyDefault).toBe(true);
    expect(record.rawPayloadPolicy.futureSanitizedExcerptRequiresApproval).toBe(
      true
    );
    expect(record.privacyInclusionRules.inclusionCategories).toEqual([
      ...actionProtocolInclusionCategoryValues
    ]);
    expect(record.privacyInclusionRules.exclusionCategories).toEqual([
      ...actionProtocolExclusionCategoryValues
    ]);
  });

  it("defines authorization semantics for PROCEED, DEFER, ESCALATE, and BLOCK", () => {
    const contract = loadAgentActionProtocolExample().authorizationContract;

    expect(contract.decisionCategories).toEqual([
      ...authorizationDecisionCategoryValues
    ]);
    expect(contract.decisionCategories).toEqual([
      "PROCEED",
      "DEFER",
      "ESCALATE",
      "BLOCK"
    ]);
    expect(contract.proposedActionsMustBeAuthorizedBeforeExecution).toBe(true);
    expect(contract.proposedActionCaptureDoesNotImplyExecution).toBe(true);
    expect(contract.blockStopsExecution).toBe(true);
    expect(contract.deferRequiresEvidenceGatheringBeforeRetry).toBe(true);
    expect(contract.escalateRequiresHumanReviewBeforeExecution).toBe(true);
    expect(
      contract.proceedOnlyAllowsExecutionInsideCurrentDeterministicPolicy
    ).toBe(true);
    expect(contract.futureCalibratedAdvisorySignalsAuthoritativeNow).toBe(
      false
    );
  });

  it("defines controlled environment and Phase 17 evidence plan requirements", () => {
    const record = loadAgentActionProtocolExample();

    expect(record.controlledEnvironmentRequirements).toEqual([
      ...controlledEnvironmentRequirementCategoryValues
    ]);
    expect(record.phase17EvidencePlanLink.realAgentEvidenceRequired).toBe(true);
    expect(record.phase17EvidencePlanLink.thisBatchCreatesRealEvidence).toBe(
      false
    );
    expect(
      record.phase17EvidencePlanLink.futureControlledTraceCollectionRequired
    ).toBe(true);
    expect(record.phase17EvidencePlanLink.futureTraceReviewRequired).toBe(true);
    expect(
      record.phase17EvidencePlanLink.futureBaselineComparisonRequired
    ).toBe(true);
    expect(
      record.phase17EvidencePlanLink.futureCalibrationDatasetHandoffRequired
    ).toBe(true);
    expect(
      record.phase17EvidencePlanLink
        .phase16GateReconsiderationRequiresFutureEvidence
    ).toBe(true);
  });

  it("keeps blockers, safety, privacy, and claim boundaries machine-testable", () => {
    const record = loadAgentActionProtocolExample();

    expect(record.blockers).toEqual([...actionProtocolBlockerCategoryValues]);
    expect(record.safety).toEqual(exactSafety);
    expect(record.privacy).toEqual(exactPrivacy);
    expect(record.claimBoundaries).toEqual(exactClaimBoundaries);
    expect(agentActionProtocolSafetySchema.parse(record.safety)).toEqual(
      exactSafety
    );
    expect(agentActionProtocolPrivacySchema.parse(record.privacy)).toEqual(
      exactPrivacy
    );
    expect(
      agentActionProtocolClaimBoundariesSchema.parse(record.claimBoundaries)
    ).toEqual(exactClaimBoundaries);
  });

  it("builds, validates, loads, and summarizes deterministically", () => {
    const built = buildAgentActionProtocol();
    const loaded = loadAgentActionProtocolExample();
    const summary = summarizeAgentActionProtocol(loaded);

    expect(built).toEqual(loaded);
    expect(validateAgentActionProtocol(loaded)).toEqual(loaded);
    expect(summary).toEqual(summarizeAgentActionProtocol(loaded));
    expect(summary.schemaVersion).toBe("agent-action-protocol.v1");
    expect(summary.supportedActionCategoryCount).toBe(
      supportedAgentActionCategoryValues.length
    );
    expect(summary.rawPayloadPolicy).toBe(
      "raw_payloads_forbidden_by_default_category_only"
    );
    expect(summary.conclusion).toBe(
      "protocol_defined_no_real_capture_phase_16_gate_still_does_not_pass"
    );
  });

  it("rejects enablement, execution, mutation, capture, integration, and evidence contradictions", () => {
    const record = loadAgentActionProtocolExample();

    for (const mutation of [
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.captureEnabledNow = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.realAgentIntegrationEnabledNow = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.executesAgent = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.executesCommands = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.mutatesRepository = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.createsRealTrace = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.protocolStatus.createsCalibrationData = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.linkedPhase16GateSummary.phase16GatePassesNow = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.phase17EvidencePlanLink.thisBatchCreatesRealEvidence =
          true as false;
      }
    ]) {
      expect(() =>
        validateAgentActionProtocol(withMutation(record, mutation))
      ).toThrow();
    }
  });

  it("rejects missing categories and unsafe protocol contract changes", () => {
    const record = loadAgentActionProtocolExample();

    for (const mutation of [
      (copy: AgentActionProtocol) => {
        copy.supportedActionCategories = copy.supportedActionCategories.filter(
          (category) => category.actionCategory !== "run_command"
        ) as AgentActionProtocol["supportedActionCategories"];
      },
      (copy: AgentActionProtocol) => {
        copy.supportedActionCategories[0]!.executesDuringCapture =
          true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.rawPayloadPolicy.rawCommandsAllowedByDefault = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.rawPayloadPolicy.rawDiffsAllowedByDefault = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.rawPayloadPolicy.rawSourceCodeAllowedByDefault = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.rawPayloadPolicy.rawSecretsAllowed = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.authorizationContract.decisionCategories =
          copy.authorizationContract.decisionCategories.filter(
            (category) => category !== "BLOCK"
          ) as AgentActionProtocol["authorizationContract"]["decisionCategories"];
      },
      (copy: AgentActionProtocol) => {
        copy.authorizationContract.blockStopsExecution = false as true;
      },
      (copy: AgentActionProtocol) => {
        copy.controlledEnvironmentRequirements =
          copy.controlledEnvironmentRequirements.filter(
            (category) => category !== "disposable_workspace_required"
          ) as AgentActionProtocol["controlledEnvironmentRequirements"];
      }
    ]) {
      expect(() =>
        validateAgentActionProtocol(withMutation(record, mutation))
      ).toThrow();
    }
  });

  it("rejects safety, privacy, and claim-boundary contradictions", () => {
    const record = loadAgentActionProtocolExample();

    for (const mutation of [
      (copy: AgentActionProtocol) => {
        copy.safety.implementsAgentIntegration = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.safety.capturesRealProposedActions = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.safety.createsRealTrace = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.privacy.rawCommandIncluded = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.privacy.realPathIncluded = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.claimBoundaries.realAgentIntegrationImplemented = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.claimBoundaries.realAgentTraceCaptured = true as false;
      },
      (copy: AgentActionProtocol) => {
        copy.claimBoundaries.statisticalGuarantee = true as false;
      }
    ]) {
      expect(() =>
        validateAgentActionProtocol(withMutation(record, mutation))
      ).toThrow();
    }
  });

  it("keeps example JSON category-only without private payloads or trace data", async () => {
    const raw = await readFile(
      path.join(
        process.cwd(),
        "simulations",
        "agent",
        "real-agent",
        "example-agent-action-protocol.json"
      ),
      "utf8"
    );
    const record = JSON.parse(raw) as AgentActionProtocol;

    expect(validateAgentActionProtocol(record)).toEqual(record);
    expect(agentActionProtocolContainsForbiddenRawString(record)).toBe(false);
    for (const forbidden of [
      /diff --git/,
      /\/Users\//,
      /\/private\/tmp\//,
      /C:\\/,
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /PRIVATE KEY/,
      /(?:^|["'\s=])sk-[A-Za-z0-9_-]{24,}/,
      /rawPromptValue|rawCommandValue|rawDiffValue|rawSourceCodeValue/i,
      /rawAgentOutputValue|rawTraceValue|reviewerIdentityValue/i,
      /customerDataValue|humanNameValue|humanEmailValue/i
    ]) {
      expect(raw).not.toMatch(forbidden);
    }
  });
});
