import { z } from "zod";
import {
  advisoryDecisionCategoryValues,
  advisoryPhase14ArtifactKindValues,
  advisoryRoutingSourceValues,
  agentAdvisoryRoutingSidecarSchemaVersion
} from "./advisoryRoutingSchema.js";
import {
  agentMockAdvisoryRoutingOutputSchemaVersion,
  mockAdvisoryAgreementCategoryValues,
  mockAdvisoryDifferenceCategoryValues,
  mockAdvisoryOutputCategoryValues,
  mockAdvisoryRoutingSourceValues,
  type MockAdvisoryRoutingOutput
} from "./mockAdvisoryRoutingSchema.js";

export const agentAdvisorySideBySideComparisonReportSchemaVersion =
  "agent-advisory-side-by-side-comparison-report.v1" as const;

export const advisorySideBySideComparisonSourceValues = [
  "synthetic_mock_side_by_side_comparison",
  "future_advisory_routing_comparison",
  "future_calibrated_advisory_comparison"
] as const;

export const advisoryComparisonScopeKindValues = [
  "synthetic_mock_comparison_report",
  "future_advisory_comparison_report",
  "future_calibrated_comparison_report"
] as const;

export const advisoryComparisonPurposeCategoryValues = [
  "side_by_side_design_review",
  "future_advisory_comparison_planning",
  "future_calibrated_comparison_planning"
] as const;

export const advisoryComparisonValueCategoryValues = [
  "explanation_value",
  "context_reduction_value",
  "human_review_value",
  "hard_stop_value",
  "friction_reduction_value",
  "insufficient_evidence_value",
  "no_added_value",
  "not_applicable"
] as const;

export const advisoryComparisonFutureEvidenceRequirementValues = [
  "real_reviewed_traces_required",
  "real_calibration_dataset_required",
  "approved_split_required",
  "real_scores_required",
  "nonconformity_scores_required",
  "threshold_or_policy_procedure_required",
  "empirical_evaluation_required",
  "advisory_routing_evaluation_required",
  "claim_boundary_review_required",
  "human_approval_required"
] as const;

const safeComparisonReportIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/)
  .refine(
    (value) =>
      !/@|\/|\\|uuid|timestamp|reviewer|email|user|machine|repo|branch|package/i.test(
        value
      ),
    "comparisonReportId must not include unsafe or private identifiers"
  );

const safeComparedItemIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const advisorySideBySideSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  advisoryOnly: z.literal(true),
  executesAgent: z.literal(false),
  executesCommands: z.literal(false),
  executesPackageScripts: z.literal(false),
  requiresNetwork: z.literal(false),
  mutatesRepository: z.literal(false),
  touchesRealSecrets: z.literal(false),
  usesRealRepo: z.literal(false),
  containsPrivateData: z.literal(false),
  containsExecutableAction: z.literal(false),
  changesRuntimeBehavior: z.literal(false),
  implementsAdvisoryRouting: z.literal(false),
  implementsCalibratedRouting: z.literal(false),
  implementsProductionRouting: z.literal(false),
  appliesCalibration: z.literal(false),
  computesScores: z.literal(false),
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  computesMetrics: z.literal(false),
  performsEmpiricalEvaluation: z.literal(false)
});

export const advisorySideBySidePrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawBaselineIncluded: z.literal(false),
  rawCalibrationDataIncluded: z.literal(false),
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  rawEvaluationDataIncluded: z.literal(false),
  rawRoutingDataIncluded: z.literal(false),
  rawComparisonDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const advisorySideBySideClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  advisoryOnly: z.literal(true),
  advisoryRoutingImplemented: z.literal(false),
  calibratedRoutingImplemented: z.literal(false),
  productionRoutingChanged: z.literal(false),
  realCalibrationDataset: z.literal(false),
  realReviewedTrace: z.literal(false),
  realScores: z.literal(false),
  nonconformityScores: z.literal(false),
  thresholds: z.literal(false),
  alphaIntroduced: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  realEvaluationResults: z.literal(false),
  performanceMetricsComputed: z.literal(false),
  empiricalEvaluationPerformed: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

export const advisoryComparisonAuthorityBoundarySummarySchema = z.object({
  deterministicDecisionAuthoritative: z.literal(true),
  advisoryOutputsNonAuthoritative: z.literal(true),
  advisoryCanOverrideDecision: z.literal(false),
  advisoryCanChangeRuntimeBehavior: z.literal(false),
  advisoryCanTriggerRuntimeAction: z.literal(false),
  routingBehaviorChanged: z.literal(false),
  productionRoutingChanged: z.literal(false)
});

export const advisorySideBySideComparisonReportSchema = z.object({
  schemaVersion: z.literal(
    agentAdvisorySideBySideComparisonReportSchemaVersion
  ),
  comparisonReportId: safeComparisonReportIdSchema,
  source: z.enum(advisorySideBySideComparisonSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-15"),
    phaseName: z.literal("Advisory Calibrated Routing Design"),
    completedPreviousPhase: z.literal(
      "phase-14-complete-offline-synthetic-mock-groundwork-only"
    ),
    completedBatches: z.array(z.enum(["15.1", "15.2"])).length(2),
    currentBatch: z.literal("15.3"),
    futureBatches: z.array(z.enum(["15.4", "15.5"])),
    phaseStatus: z.literal(
      "side_by_side_comparison_over_mock_advisory_outputs_without_runtime_integration"
    )
  }),
  linkedMockAdvisoryOutputs: z.object({
    outputIds: z.array(z.string().min(1)).min(1),
    schemaVersion: z.literal(agentMockAdvisoryRoutingOutputSchemaVersion),
    source: z.enum(mockAdvisoryRoutingSourceValues),
    rawMockOutputsIncluded: z.literal(false)
  }),
  linkedAdvisorySidecars: z.object({
    sidecarIds: z.array(z.string().min(1)).min(1),
    schemaVersion: z.literal(agentAdvisoryRoutingSidecarSchemaVersion),
    source: z.enum(advisoryRoutingSourceValues),
    rawSidecarsIncluded: z.literal(false)
  }),
  linkedPhase14Readiness: z.object({
    readinessSummaryId: z.literal("phase-14-offline-readiness-summary-001"),
    linkedArtifactKinds: z
      .array(z.enum(advisoryPhase14ArtifactKindValues))
      .min(1),
    rawReadinessArtifactIncluded: z.literal(false)
  }),
  comparisonScope: z.object({
    scopeKind: z.literal("synthetic_mock_comparison_report"),
    comparisonPurposeCategory: z.enum(advisoryComparisonPurposeCategoryValues),
    usesMockOutputsOnly: z.literal(true),
    comparesRuntimeBehavior: z.literal(false),
    changesRuntimeBehavior: z.literal(false),
    empiricalEvaluation: z.literal(false),
    calibratedEvaluation: z.literal(false),
    productionEvaluation: z.literal(false)
  }),
  comparedItems: z.array(
    z.object({
      itemId: safeComparedItemIdSchema,
      mockRoutingOutputId: z.string().min(1),
      sidecarId: z.string().min(1),
      deterministicDecisionCategory: z.enum(advisoryDecisionCategoryValues),
      mockAdvisorySuggestionCategory: z.enum(mockAdvisoryOutputCategoryValues),
      agreementCategory: z.enum(mockAdvisoryAgreementCategoryValues),
      differenceCategory: z.enum(mockAdvisoryDifferenceCategoryValues),
      advisoryValueCategories: z
        .array(z.enum(advisoryComparisonValueCategoryValues))
        .min(1),
      authorityStatus: z.literal("deterministic_decision_authoritative"),
      deterministicDecisionChanged: z.literal(false),
      advisoryOverrideAttempted: z.literal(false),
      runtimeDecisionChanged: z.literal(false),
      rawItemIncluded: z.literal(false)
    })
  ),
  agreementSummary: z.object({
    totalComparedItems: z.number().int().nonnegative(),
    agreesCount: z.number().int().nonnegative(),
    partiallyAgreesCount: z.number().int().nonnegative(),
    differsCount: z.number().int().nonnegative(),
    insufficientEvidenceCount: z.number().int().nonnegative(),
    notApplicableCount: z.number().int().nonnegative(),
    deterministicDecisionChangedCount: z.literal(0),
    advisoryOverrideAttemptedCount: z.literal(0),
    runtimeDecisionChangedCount: z.literal(0)
  }),
  advisoryValueSummary: z.object({
    totalComparedItems: z.number().int().nonnegative(),
    explanationValueCount: z.number().int().nonnegative(),
    contextReductionValueCount: z.number().int().nonnegative(),
    humanReviewValueCount: z.number().int().nonnegative(),
    hardStopValueCount: z.number().int().nonnegative(),
    frictionReductionValueCount: z.number().int().nonnegative(),
    insufficientEvidenceValueCount: z.number().int().nonnegative(),
    noAddedValueCount: z.number().int().nonnegative(),
    empiricalValueMeasured: z.literal(false),
    productivityImpactMeasured: z.literal(false)
  }),
  authorityBoundarySummary: advisoryComparisonAuthorityBoundarySummarySchema,
  futureEvidenceRequirements: z.object({
    requiredCategories: z
      .array(z.enum(advisoryComparisonFutureEvidenceRequirementValues))
      .length(advisoryComparisonFutureEvidenceRequirementValues.length),
    evidenceStatus: z.literal("future_unmet"),
    allRequirementsFuture: z.literal(true)
  }),
  safety: advisorySideBySideSafetySchema,
  privacy: advisorySideBySidePrivacySchema,
  claimBoundaries: advisorySideBySideClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type AdvisorySideBySideComparisonReport = z.infer<
  typeof advisorySideBySideComparisonReportSchema
>;

export type AdvisoryComparedItem =
  AdvisorySideBySideComparisonReport["comparedItems"][number];

export const mapMockOutputToAdvisoryValueCategories = (
  output: MockAdvisoryRoutingOutput
): AdvisoryComparedItem["advisoryValueCategories"] => {
  switch (output.mockAdvisoryOutput.mockOutputCategory) {
    case "mock_align":
      return ["explanation_value"];
    case "mock_suggest_defer":
      return ["explanation_value", "context_reduction_value"];
    case "mock_suggest_escalate":
      return ["explanation_value", "human_review_value"];
    case "mock_suggest_block":
      return ["explanation_value", "hard_stop_value"];
    case "mock_suggest_reduce_friction":
      return [
        "explanation_value",
        "friction_reduction_value",
        "insufficient_evidence_value"
      ];
    case "mock_insufficient_evidence":
      return ["insufficient_evidence_value"];
    case "mock_no_advisory_output":
      return ["not_applicable"];
  }
};

export const buildAdvisoryComparedItems = (
  outputs: MockAdvisoryRoutingOutput[]
): AdvisoryComparedItem[] =>
  outputs.map((output, index) => ({
    itemId: `advisory-comparison-item-${String(index + 1).padStart(3, "0")}`,
    mockRoutingOutputId: output.mockRoutingOutputId,
    sidecarId: output.linkedAdvisorySidecar.sidecarId,
    deterministicDecisionCategory:
      output.sideBySideComparison.deterministicDecisionCategory,
    mockAdvisorySuggestionCategory:
      output.sideBySideComparison.mockAdvisorySuggestionCategory,
    agreementCategory: output.sideBySideComparison.agreementCategory,
    differenceCategory: output.sideBySideComparison.differenceCategory,
    advisoryValueCategories: mapMockOutputToAdvisoryValueCategories(output),
    authorityStatus: "deterministic_decision_authoritative",
    deterministicDecisionChanged: false,
    advisoryOverrideAttempted: false,
    runtimeDecisionChanged: false,
    rawItemIncluded: false
  }));

export const computeAdvisoryAgreementSummary = (
  comparedItems: AdvisoryComparedItem[]
): AdvisorySideBySideComparisonReport["agreementSummary"] => ({
  totalComparedItems: comparedItems.length,
  agreesCount: comparedItems.filter(
    (item) => item.agreementCategory === "agrees"
  ).length,
  partiallyAgreesCount: comparedItems.filter(
    (item) => item.agreementCategory === "partially_agrees"
  ).length,
  differsCount: comparedItems.filter(
    (item) => item.agreementCategory === "differs"
  ).length,
  insufficientEvidenceCount: comparedItems.filter(
    (item) => item.agreementCategory === "insufficient_evidence"
  ).length,
  notApplicableCount: comparedItems.filter(
    (item) => item.agreementCategory === "not_applicable"
  ).length,
  deterministicDecisionChangedCount: 0,
  advisoryOverrideAttemptedCount: 0,
  runtimeDecisionChangedCount: 0
});

const countValueCategory = (
  comparedItems: AdvisoryComparedItem[],
  category: (typeof advisoryComparisonValueCategoryValues)[number]
): number =>
  comparedItems.filter((item) =>
    item.advisoryValueCategories.includes(category)
  ).length;

export const computeAdvisoryValueSummary = (
  comparedItems: AdvisoryComparedItem[]
): AdvisorySideBySideComparisonReport["advisoryValueSummary"] => ({
  totalComparedItems: comparedItems.length,
  explanationValueCount: countValueCategory(comparedItems, "explanation_value"),
  contextReductionValueCount: countValueCategory(
    comparedItems,
    "context_reduction_value"
  ),
  humanReviewValueCount: countValueCategory(
    comparedItems,
    "human_review_value"
  ),
  hardStopValueCount: countValueCategory(comparedItems, "hard_stop_value"),
  frictionReductionValueCount: countValueCategory(
    comparedItems,
    "friction_reduction_value"
  ),
  insufficientEvidenceValueCount: countValueCategory(
    comparedItems,
    "insufficient_evidence_value"
  ),
  noAddedValueCount: countValueCategory(comparedItems, "no_added_value"),
  empiricalValueMeasured: false,
  productivityImpactMeasured: false
});

const phase14ArtifactKinds = [
  "risk_loss_design",
  "offline_score_input_schema",
  "mock_nonconformity_input_structure",
  "mock_split_simulation",
  "mock_threshold_selection_mechanics",
  "offline_evaluation_report_schema",
  "phase_14_readiness_summary",
  "phase_15_handoff_boundary"
] as const;

export const buildAdvisorySideBySideComparisonReport = (
  outputs: MockAdvisoryRoutingOutput[]
): AdvisorySideBySideComparisonReport => {
  const sortedOutputs = [...outputs].sort((left, right) =>
    left.mockRoutingOutputId.localeCompare(right.mockRoutingOutputId)
  );
  const comparedItems = buildAdvisoryComparedItems(sortedOutputs);

  return validateAdvisorySideBySideComparisonReport({
    schemaVersion: agentAdvisorySideBySideComparisonReportSchemaVersion,
    comparisonReportId: "phase-15-side-by-side-comparison-001",
    source: "synthetic_mock_side_by_side_comparison",
    phase: {
      phaseId: "phase-15",
      phaseName: "Advisory Calibrated Routing Design",
      completedPreviousPhase:
        "phase-14-complete-offline-synthetic-mock-groundwork-only",
      completedBatches: ["15.1", "15.2"],
      currentBatch: "15.3",
      futureBatches: ["15.4", "15.5"],
      phaseStatus:
        "side_by_side_comparison_over_mock_advisory_outputs_without_runtime_integration"
    },
    linkedMockAdvisoryOutputs: {
      outputIds: sortedOutputs.map((output) => output.mockRoutingOutputId),
      schemaVersion: agentMockAdvisoryRoutingOutputSchemaVersion,
      source: "synthetic_mock_advisory_routing",
      rawMockOutputsIncluded: false
    },
    linkedAdvisorySidecars: {
      sidecarIds: sortedOutputs
        .map((output) => output.linkedAdvisorySidecar.sidecarId)
        .sort((left, right) => left.localeCompare(right)),
      schemaVersion: agentAdvisoryRoutingSidecarSchemaVersion,
      source: "synthetic_advisory_sidecar_design",
      rawSidecarsIncluded: false
    },
    linkedPhase14Readiness: {
      readinessSummaryId: "phase-14-offline-readiness-summary-001",
      linkedArtifactKinds: [...phase14ArtifactKinds],
      rawReadinessArtifactIncluded: false
    },
    comparisonScope: {
      scopeKind: "synthetic_mock_comparison_report",
      comparisonPurposeCategory: "side_by_side_design_review",
      usesMockOutputsOnly: true,
      comparesRuntimeBehavior: false,
      changesRuntimeBehavior: false,
      empiricalEvaluation: false,
      calibratedEvaluation: false,
      productionEvaluation: false
    },
    comparedItems,
    agreementSummary: computeAdvisoryAgreementSummary(comparedItems),
    advisoryValueSummary: computeAdvisoryValueSummary(comparedItems),
    authorityBoundarySummary: {
      deterministicDecisionAuthoritative: true,
      advisoryOutputsNonAuthoritative: true,
      advisoryCanOverrideDecision: false,
      advisoryCanChangeRuntimeBehavior: false,
      advisoryCanTriggerRuntimeAction: false,
      routingBehaviorChanged: false,
      productionRoutingChanged: false
    },
    futureEvidenceRequirements: {
      requiredCategories: [
        ...advisoryComparisonFutureEvidenceRequirementValues
      ],
      evidenceStatus: "future_unmet",
      allRequirementsFuture: true
    },
    safety: {
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
      implementsConformalRiskControl: false,
      computesMetrics: false,
      performsEmpiricalEvaluation: false
    },
    privacy: {
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
      realRepoNameIncluded: false,
      realPathIncluded: false,
      realUserIncluded: false,
      realEmailIncluded: false,
      secretIncluded: false,
      rawAgentOutputIncluded: false,
      reviewerIdentityIncluded: false,
      categoryOnly: true
    },
    claimBoundaries: {
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
      performanceMetricsComputed: false,
      empiricalEvaluationPerformed: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "side_by_side_comparison_report_only",
      "mock_outputs_only",
      "deterministic_decisions_authoritative",
      "no_empirical_metrics"
    ]
  });
};

export const validateAdvisorySideBySideComparisonReport = (
  report: unknown
): AdvisorySideBySideComparisonReport =>
  advisorySideBySideComparisonReportSchema.parse(report);

export const validateAdvisorySideBySideComparisonReports = (
  reports: unknown[]
): AdvisorySideBySideComparisonReport[] =>
  reports
    .map(validateAdvisorySideBySideComparisonReport)
    .sort((left, right) =>
      left.comparisonReportId.localeCompare(right.comparisonReportId)
    );

export const validateAdvisoryComparisonAuthorityBoundary = (
  report: AdvisorySideBySideComparisonReport
): void => {
  advisoryComparisonAuthorityBoundarySummarySchema.parse(
    report.authorityBoundarySummary
  );
};

export const validateAdvisoryComparisonClaimBoundaries = (
  report: AdvisorySideBySideComparisonReport
): void => {
  advisorySideBySideClaimBoundariesSchema.parse(report.claimBoundaries);
};

export const summarizeAdvisorySideBySideComparisonReport = (
  report: AdvisorySideBySideComparisonReport
): {
  comparisonReportId: string;
  totalComparedItems: number;
  linkedMockOutputCount: number;
  linkedSidecarCount: number;
  agreesCount: number;
  partiallyAgreesCount: number;
  differsCount: number;
  explanationValueCount: number;
  deterministicDecisionAuthoritative: true;
  advisoryCanOverrideDecision: false;
  empiricalValueMeasured: false;
  productionRoutingChanged: false;
} => ({
  comparisonReportId: report.comparisonReportId,
  totalComparedItems: report.agreementSummary.totalComparedItems,
  linkedMockOutputCount: report.linkedMockAdvisoryOutputs.outputIds.length,
  linkedSidecarCount: report.linkedAdvisorySidecars.sidecarIds.length,
  agreesCount: report.agreementSummary.agreesCount,
  partiallyAgreesCount: report.agreementSummary.partiallyAgreesCount,
  differsCount: report.agreementSummary.differsCount,
  explanationValueCount: report.advisoryValueSummary.explanationValueCount,
  deterministicDecisionAuthoritative:
    report.authorityBoundarySummary.deterministicDecisionAuthoritative,
  advisoryCanOverrideDecision:
    report.authorityBoundarySummary.advisoryCanOverrideDecision,
  empiricalValueMeasured: report.advisoryValueSummary.empiricalValueMeasured,
  productionRoutingChanged:
    report.authorityBoundarySummary.productionRoutingChanged
});

export const validateAdvisorySideBySideComparisonReportBoundaries = (
  report: AdvisorySideBySideComparisonReport
): void => {
  if (
    report.source !== "synthetic_mock_side_by_side_comparison" ||
    !report.comparisonScope.usesMockOutputsOnly ||
    report.comparisonScope.comparesRuntimeBehavior ||
    report.comparisonScope.changesRuntimeBehavior ||
    report.comparisonScope.empiricalEvaluation ||
    report.comparisonScope.calibratedEvaluation ||
    report.comparisonScope.productionEvaluation ||
    report.comparedItems.some(
      (item) =>
        item.deterministicDecisionChanged ||
        item.advisoryOverrideAttempted ||
        item.runtimeDecisionChanged ||
        item.rawItemIncluded
    ) ||
    report.agreementSummary.deterministicDecisionChangedCount !== 0 ||
    report.agreementSummary.advisoryOverrideAttemptedCount !== 0 ||
    report.agreementSummary.runtimeDecisionChangedCount !== 0 ||
    report.advisoryValueSummary.empiricalValueMeasured ||
    report.advisoryValueSummary.productivityImpactMeasured ||
    report.authorityBoundarySummary.advisoryCanOverrideDecision ||
    report.authorityBoundarySummary.advisoryCanChangeRuntimeBehavior ||
    report.authorityBoundarySummary.advisoryCanTriggerRuntimeAction ||
    report.authorityBoundarySummary.routingBehaviorChanged ||
    report.authorityBoundarySummary.productionRoutingChanged ||
    report.safety.implementsAdvisoryRouting ||
    report.safety.implementsCalibratedRouting ||
    report.safety.implementsProductionRouting ||
    report.safety.computesScores ||
    report.safety.computesThresholds ||
    report.safety.introducesAlpha ||
    report.safety.computesMetrics ||
    report.safety.performsEmpiricalEvaluation ||
    report.claimBoundaries.advisoryRoutingImplemented ||
    report.claimBoundaries.calibratedRoutingImplemented ||
    report.claimBoundaries.productionRoutingChanged ||
    report.claimBoundaries.performanceMetricsComputed ||
    report.claimBoundaries.empiricalEvaluationPerformed
  ) {
    throw new Error(
      "Advisory side-by-side comparison report crosses a declared boundary"
    );
  }
};

const forbiddenAdvisoryComparisonPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /\/private\/tmp\//,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=/,
  /PRIVATE KEY/,
  /(?:^|["'\s=])sk-[A-Za-z0-9_-]{24,}/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /diff --git/,
  /https?:\/\//,
  /api\.internal/i,
  /customer[-_ ]?(?:prod|production|data)/i,
  /\/prod(?:uction)?\b/i,
  /rm\s+-rf/i,
  /sudo\b/i,
  /eval\s*(?:\(|\b)/i,
  /curl\b.*\|/i,
  /npm\s+run/i,
  /yarn\s+/i,
  /pnpm\s+/i,
  /bun\s+run/i,
  /\b0\.(?:0?1|05|1)\b/,
  /\b(?:1|5|10)%\b/,
  /result table/i,
  /metric value/i,
  /routing output/i
] as const;

export const advisorySideBySideComparisonContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenAdvisoryComparisonPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
