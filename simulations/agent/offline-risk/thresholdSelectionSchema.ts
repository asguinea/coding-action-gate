import { z } from "zod";
import {
  agentOfflineScoreFamilyValues,
  agentOfflineScoreInputSetSchemaVersion,
  type OfflineScoreInputSet
} from "./offlineScoreSchema.js";
import { agentOfflineRiskDimensionValues } from "./riskLossDesignSchema.js";
import {
  agentOfflineMockSplitCategoryValues,
  agentOfflineSplitSimulationSchemaVersion,
  type OfflineSplitSimulation
} from "./splitSimulationSchema.js";

export const agentOfflineThresholdSelectionSchemaVersion =
  "agent-offline-threshold-selection.v1" as const;

export const agentOfflineThresholdSelectionSourceValues = [
  "synthetic_mock_threshold_selection",
  "future_offline_experiment_threshold_selection",
  "future_real_calibration_dataset_threshold_selection"
] as const;

export const agentOfflineThresholdPolicyKindValues = [
  "mock_mechanics_only",
  "future_offline_experiment",
  "future_real_calibration_procedure"
] as const;

export const agentOfflineMockThresholdCategoryValues = [
  "mock_very_conservative",
  "mock_conservative",
  "mock_balanced",
  "mock_permissive",
  "mock_not_selected",
  "mock_not_applicable"
] as const;

export const agentOfflineMockRiskBudgetCategoryValues = [
  "mock_low_risk_tolerance",
  "mock_medium_risk_tolerance",
  "mock_high_risk_tolerance",
  "mock_not_applicable"
] as const;

export const agentOfflineThresholdSelectionCriterionValues = [
  "mock_minimize_safety_boundary_risk",
  "mock_balance_friction_and_safety",
  "mock_preserve_escalation_coverage",
  "mock_exercise_not_eligible_path",
  "mock_no_real_selection"
] as const;

export const agentOfflineThresholdSelectionStatusValues = [
  "mock_selected_for_mechanics",
  "mock_candidate_only",
  "mock_rejected_for_mechanics",
  "not_applicable"
] as const;

export const agentOfflineThresholdFutureRequirementValues = [
  "real_calibration_dataset_required",
  "approved_calibration_split_required",
  "approved_test_split_required",
  "real_nonconformity_scores_required",
  "numeric_threshold_procedure_required",
  "alpha_definition_required",
  "conformal_assumptions_required",
  "crc_objective_required",
  "empirical_evaluation_required",
  "distribution_shift_review_required",
  "claim_boundary_review_required",
  "production_routing_review_required"
] as const;

const safeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const offlineThresholdSelectionSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
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
  createsCalibrationDataset: z.literal(false),
  createsCalibrationManifest: z.literal(false),
  createsSplitManifest: z.literal(false),
  assignsRealDatasetSplits: z.literal(false),
  appliesCalibration: z.literal(false),
  computesNumericLosses: z.literal(false),
  computesRiskScores: z.literal(false),
  computesNonconformityScores: z.literal(false),
  computesRealThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false),
  performsRealThresholdSelection: z.literal(false)
});

export const offlineThresholdSelectionPrivacySchema = z.object({
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
  rawManifestDataIncluded: z.literal(false),
  rawAdjudicationDataIncluded: z.literal(false),
  rawSplitDataIncluded: z.literal(false),
  rawScoreDataIncluded: z.literal(false),
  rawThresholdDataIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const offlineThresholdSelectionClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  realDatasetSplitsAssigned: z.literal(false),
  splitManifestCreated: z.literal(false),
  numericLossesComputed: z.literal(false),
  riskScoresComputed: z.literal(false),
  nonconformityScoresComputed: z.literal(false),
  realThresholdsComputed: z.literal(false),
  thresholdValuesIncluded: z.literal(false),
  alphaIntroduced: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const phaseSchema = z.object({
  phaseId: z.literal("phase-14"),
  phaseName: z.literal("Offline Conformal / CRC Prototype"),
  completedPreviousPhase: z.literal(
    "phase-13-complete-readiness-infrastructure-only"
  ),
  completedBatches: z.array(z.enum(["14.1", "14.2", "14.3"])),
  currentBatch: z.literal("14.4"),
  futureBatches: z.array(z.enum(["14.5", "14.6"])),
  phaseStatus: z.literal(
    "offline_threshold_selection_mechanics_without_real_thresholds_or_guarantees"
  )
});

const linkedScoreInputSetSchema = z.object({
  inputSetId: z.literal("offline-score-input-set-synthetic-v1"),
  schemaVersion: z.literal(agentOfflineScoreInputSetSchemaVersion),
  source: z.literal("synthetic_mock_score_input"),
  scoreInputIds: z.array(safeIdSchema).min(1),
  rawScoreInputsIncluded: z.literal(false)
});

const linkedSplitSimulationSchema = z.object({
  simulationId: z.literal("offline-split-simulation-synthetic-v1"),
  schemaVersion: z.literal(agentOfflineSplitSimulationSchemaVersion),
  source: z.literal("synthetic_mock_split_simulation"),
  mockSplitCategories: z.array(z.enum(agentOfflineMockSplitCategoryValues)),
  rawSplitSimulationIncluded: z.literal(false)
});

const thresholdPolicySchema = z.object({
  policyId: safeIdSchema,
  thresholdPolicyKind: z.literal("mock_mechanics_only"),
  allowedMockThresholdCategories: z.array(
    z.enum(agentOfflineMockThresholdCategoryValues)
  ),
  mockRiskBudgetCategories: z.array(
    z.enum(agentOfflineMockRiskBudgetCategoryValues)
  ),
  selectionCriterionCategories: z.array(
    z.enum(agentOfflineThresholdSelectionCriterionValues)
  ),
  thresholdSelectionAllowedForMockMechanics: z.literal(true),
  realThresholdSelectionAllowed: z.literal(false),
  alphaControlAllowed: z.literal(false),
  realCalibrationDataRequiredForRealThreshold: z.literal(true),
  approvedSplitRequiredForRealThreshold: z.literal(true),
  conformalProcedureRequiredForGuaranteeClaims: z.literal(true)
});

const mockThresholdCandidateSchema = z.object({
  candidateId: safeIdSchema,
  mockThresholdCategory: z.enum(agentOfflineMockThresholdCategoryValues),
  relatedScoreFamilies: z.array(z.enum(agentOfflineScoreFamilyValues)).min(1),
  relatedRiskDimensions: z
    .array(z.enum(agentOfflineRiskDimensionValues))
    .min(1),
  mockRiskBudgetCategory: z.enum(agentOfflineMockRiskBudgetCategoryValues),
  selectionStatus: z.enum(agentOfflineThresholdSelectionStatusValues),
  realThresholdComputed: z.literal(false),
  numericThresholdValueIncluded: z.literal(false),
  alphaValueIncluded: z.literal(false),
  conformalGuaranteeClaimed: z.literal(false)
});

const mockBucketSummarySchema = z.object({
  mockSplitCategory: z.enum(agentOfflineMockSplitCategoryValues),
  mockInputCount: z.number().int().nonnegative(),
  coveredScoreFamilies: z.array(z.enum(agentOfflineScoreFamilyValues)),
  coveredRiskDimensions: z.array(z.enum(agentOfflineRiskDimensionValues)),
  mockOnly: z.literal(true),
  realBucket: z.literal(false)
});

const futureRealThresholdRequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.enum(agentOfflineThresholdFutureRequirementValues),
      status: z.literal("future_unmet"),
      requiredBeforeRealThresholdSelection: z.literal(true)
    })
  ),
  allRequirementsFutureOrUnmet: z.literal(true)
});

const boundarySummarySchema = z.object({
  safetyBoundaryViolationCount: z.literal(0),
  privacyBoundaryViolationCount: z.literal(0),
  claimBoundaryViolationCount: z.literal(0),
  rawDataBoundaryViolationCount: z.literal(0),
  splitBoundaryViolationCount: z.literal(0),
  scoringBoundaryViolationCount: z.literal(0),
  thresholdBoundaryViolationCount: z.literal(0),
  alphaBoundaryViolationCount: z.literal(0),
  calibrationBoundaryViolationCount: z.literal(0),
  conformalBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0)
});

export const offlineThresholdSelectionSchema = z.object({
  schemaVersion: z.literal(agentOfflineThresholdSelectionSchemaVersion),
  thresholdSelectionId: safeIdSchema,
  source: z.enum(agentOfflineThresholdSelectionSourceValues),
  phase: phaseSchema,
  linkedScoreInputSet: linkedScoreInputSetSchema,
  linkedSplitSimulation: linkedSplitSimulationSchema,
  thresholdPolicy: thresholdPolicySchema,
  mockThresholdCandidates: z.array(mockThresholdCandidateSchema).min(1),
  mockBucketSummaries: z.object({
    mockTrainSummary: mockBucketSummarySchema,
    mockCalibrationSummary: mockBucketSummarySchema,
    mockTestSummary: mockBucketSummarySchema,
    mockHoldoutSummary: mockBucketSummarySchema,
    mockNotEligibleSummary: mockBucketSummarySchema,
    realCalibrationBucketExists: z.literal(false),
    realTestBucketExists: z.literal(false)
  }),
  mockSelectionSummary: z.object({
    candidateCount: z.number().int().nonnegative(),
    mockSelectedCandidateCount: z.number().int().nonnegative(),
    mockRejectedCandidateCount: z.number().int().nonnegative(),
    realThresholdComputedCount: z.literal(0),
    numericThresholdValueCount: z.literal(0),
    alphaValueCount: z.literal(0),
    conformalGuaranteeClaimCount: z.literal(0),
    statisticalGuaranteeClaimCount: z.literal(0),
    selectionMechanicsExercised: z.literal(true),
    realSelectionPerformed: z.literal(false)
  }),
  futureRealThresholdRequirements: futureRealThresholdRequirementsSchema,
  boundarySummary: boundarySummarySchema,
  safety: offlineThresholdSelectionSafetySchema,
  privacy: offlineThresholdSelectionPrivacySchema,
  claimBoundaries: offlineThresholdSelectionClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type OfflineThresholdSelection = z.infer<
  typeof offlineThresholdSelectionSchema
>;
export type OfflineThresholdCandidate =
  OfflineThresholdSelection["mockThresholdCandidates"][number];

export const validateOfflineThresholdSelection = (
  selection: unknown
): OfflineThresholdSelection =>
  offlineThresholdSelectionSchema.parse(selection);

export const validateOfflineThresholdSelections = (
  selections: unknown[]
): OfflineThresholdSelection[] =>
  selections
    .map(validateOfflineThresholdSelection)
    .sort((left, right) =>
      left.thresholdSelectionId.localeCompare(right.thresholdSelectionId)
    );

export const computeMockThresholdCandidateSummary = (
  candidates: OfflineThresholdCandidate[]
): OfflineThresholdSelection["mockSelectionSummary"] => ({
  candidateCount: candidates.length,
  mockSelectedCandidateCount: candidates.filter(
    (candidate) => candidate.selectionStatus === "mock_selected_for_mechanics"
  ).length,
  mockRejectedCandidateCount: candidates.filter(
    (candidate) => candidate.selectionStatus === "mock_rejected_for_mechanics"
  ).length,
  realThresholdComputedCount: 0,
  numericThresholdValueCount: 0,
  alphaValueCount: 0,
  conformalGuaranteeClaimCount: 0,
  statisticalGuaranteeClaimCount: 0,
  selectionMechanicsExercised: true,
  realSelectionPerformed: false
});

export const summarizeOfflineThresholdSelection = (
  selection: OfflineThresholdSelection
): {
  thresholdSelectionId: string;
  candidateCount: number;
  mockSelectedCandidateCount: number;
  realThresholdComputedCount: 0;
  alphaValueCount: 0;
  realSelectionPerformed: false;
} => ({
  thresholdSelectionId: selection.thresholdSelectionId,
  candidateCount: selection.mockSelectionSummary.candidateCount,
  mockSelectedCandidateCount:
    selection.mockSelectionSummary.mockSelectedCandidateCount,
  realThresholdComputedCount:
    selection.mockSelectionSummary.realThresholdComputedCount,
  alphaValueCount: selection.mockSelectionSummary.alphaValueCount,
  realSelectionPerformed: selection.mockSelectionSummary.realSelectionPerformed
});

export const validateOfflineThresholdSelectionBoundaries = (
  selection: OfflineThresholdSelection
): void => {
  if (
    selection.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    selection.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    selection.boundarySummary.claimBoundaryViolationCount !== 0 ||
    selection.boundarySummary.thresholdBoundaryViolationCount !== 0 ||
    selection.boundarySummary.alphaBoundaryViolationCount !== 0 ||
    selection.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    selection.boundarySummary.conformalBoundaryViolationCount !== 0
  ) {
    throw new Error("Offline threshold selection crosses a declared boundary");
  }
};

export const validateOfflineThresholdSelectionLinkage = (
  selection: OfflineThresholdSelection,
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation
): void => {
  if (selection.linkedScoreInputSet.inputSetId !== inputSet.inputSetId) {
    throw new Error(
      "Offline threshold selection references an unknown input set"
    );
  }
  if (
    selection.linkedSplitSimulation.simulationId !==
    splitSimulation.simulationId
  ) {
    throw new Error(
      "Offline threshold selection references an unknown split simulation"
    );
  }

  const scoreInputIds = new Set(
    inputSet.scoreInputs.map((input) => input.scoreInputId)
  );
  for (const scoreInputId of selection.linkedScoreInputSet.scoreInputIds) {
    if (!scoreInputIds.has(scoreInputId)) {
      throw new Error(`Unknown linked score input: ${scoreInputId}`);
    }
  }

  const splitCategories = new Set(agentOfflineMockSplitCategoryValues);
  for (const category of selection.linkedSplitSimulation.mockSplitCategories) {
    if (!splitCategories.has(category)) {
      throw new Error(`Unknown linked mock split category: ${category}`);
    }
  }
};

const scoreFamiliesForIds = (
  inputSet: OfflineScoreInputSet,
  scoreInputIds: string[]
): (typeof agentOfflineScoreFamilyValues)[number][] => {
  const families = new Set<(typeof agentOfflineScoreFamilyValues)[number]>();
  for (const input of inputSet.scoreInputs) {
    if (scoreInputIds.includes(input.scoreInputId)) {
      for (const family of input.candidateScoreFamilies) {
        families.add(family.scoreFamilyId);
      }
    }
  }

  return [...families].sort();
};

const riskDimensionsForIds = (
  inputSet: OfflineScoreInputSet,
  scoreInputIds: string[]
): (typeof agentOfflineRiskDimensionValues)[number][] => {
  const dimensions = new Set<
    (typeof agentOfflineRiskDimensionValues)[number]
  >();
  for (const input of inputSet.scoreInputs) {
    if (scoreInputIds.includes(input.scoreInputId)) {
      for (const family of input.candidateScoreFamilies) {
        dimensions.add(family.relatedRiskDimension);
      }
    }
  }

  return [...dimensions].sort();
};

export const buildSyntheticOfflineThresholdSelection = (
  inputSet: OfflineScoreInputSet,
  splitSimulation: OfflineSplitSimulation
): OfflineThresholdSelection => {
  const bucketSummary = (
    mockSplitCategory: (typeof agentOfflineMockSplitCategoryValues)[number],
    scoreInputIds: string[]
  ) => ({
    mockSplitCategory,
    mockInputCount: scoreInputIds.length,
    coveredScoreFamilies: scoreFamiliesForIds(inputSet, scoreInputIds),
    coveredRiskDimensions: riskDimensionsForIds(inputSet, scoreInputIds),
    mockOnly: true as const,
    realBucket: false as const
  });

  const mockThresholdCandidates: OfflineThresholdCandidate[] = [
    {
      candidateId: "offline-threshold-candidate-conservative-001",
      mockThresholdCategory: "mock_conservative",
      relatedScoreFamilies: [
        "unsafe_action_score_input",
        "missing_context_score_input",
        "sensitivity_score_input"
      ],
      relatedRiskDimensions: [
        "unsafe_action_risk",
        "missing_context_risk",
        "sensitive_area_risk"
      ],
      mockRiskBudgetCategory: "mock_low_risk_tolerance",
      selectionStatus: "mock_selected_for_mechanics",
      realThresholdComputed: false,
      numericThresholdValueIncluded: false,
      alphaValueIncluded: false,
      conformalGuaranteeClaimed: false
    },
    {
      candidateId: "offline-threshold-candidate-balanced-001",
      mockThresholdCategory: "mock_balanced",
      relatedScoreFamilies: [
        "recovery_uncertainty_score_input",
        "friction_score_input",
        "coverage_gap_score_input"
      ],
      relatedRiskDimensions: [
        "recovery_uncertainty_risk",
        "friction_risk",
        "coverage_gap_risk"
      ],
      mockRiskBudgetCategory: "mock_medium_risk_tolerance",
      selectionStatus: "mock_candidate_only",
      realThresholdComputed: false,
      numericThresholdValueIncluded: false,
      alphaValueIncluded: false,
      conformalGuaranteeClaimed: false
    },
    {
      candidateId: "offline-threshold-candidate-permissive-001",
      mockThresholdCategory: "mock_permissive",
      relatedScoreFamilies: [
        "premature_action_score_input",
        "validation_failure_score_input",
        "autonomy_retry_score_input"
      ],
      relatedRiskDimensions: [
        "premature_action_risk",
        "validation_failure_risk",
        "autonomy_retry_risk"
      ],
      mockRiskBudgetCategory: "mock_high_risk_tolerance",
      selectionStatus: "mock_rejected_for_mechanics",
      realThresholdComputed: false,
      numericThresholdValueIncluded: false,
      alphaValueIncluded: false,
      conformalGuaranteeClaimed: false
    }
  ];

  const selection = {
    schemaVersion: agentOfflineThresholdSelectionSchemaVersion,
    thresholdSelectionId: "offline-threshold-selection-synthetic-v1",
    source: "synthetic_mock_threshold_selection",
    phase: {
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2", "14.3"],
      currentBatch: "14.4",
      futureBatches: ["14.5", "14.6"],
      phaseStatus:
        "offline_threshold_selection_mechanics_without_real_thresholds_or_guarantees"
    },
    linkedScoreInputSet: {
      inputSetId: inputSet.inputSetId,
      schemaVersion: inputSet.schemaVersion,
      source: inputSet.source,
      scoreInputIds: inputSet.scoreInputs.map((input) => input.scoreInputId),
      rawScoreInputsIncluded: false
    },
    linkedSplitSimulation: {
      simulationId: splitSimulation.simulationId,
      schemaVersion: splitSimulation.schemaVersion,
      source: splitSimulation.source,
      mockSplitCategories: [...agentOfflineMockSplitCategoryValues],
      rawSplitSimulationIncluded: false
    },
    thresholdPolicy: {
      policyId: "offline-mock-threshold-policy-v1",
      thresholdPolicyKind: "mock_mechanics_only",
      allowedMockThresholdCategories: [
        ...agentOfflineMockThresholdCategoryValues
      ],
      mockRiskBudgetCategories: [...agentOfflineMockRiskBudgetCategoryValues],
      selectionCriterionCategories: [
        ...agentOfflineThresholdSelectionCriterionValues
      ],
      thresholdSelectionAllowedForMockMechanics: true,
      realThresholdSelectionAllowed: false,
      alphaControlAllowed: false,
      realCalibrationDataRequiredForRealThreshold: true,
      approvedSplitRequiredForRealThreshold: true,
      conformalProcedureRequiredForGuaranteeClaims: true
    },
    mockThresholdCandidates,
    mockBucketSummaries: {
      mockTrainSummary: bucketSummary(
        "mock_train",
        splitSimulation.mockSplitBuckets.mock_train.scoreInputIds
      ),
      mockCalibrationSummary: bucketSummary(
        "mock_calibration",
        splitSimulation.mockSplitBuckets.mock_calibration.scoreInputIds
      ),
      mockTestSummary: bucketSummary(
        "mock_test",
        splitSimulation.mockSplitBuckets.mock_test.scoreInputIds
      ),
      mockHoldoutSummary: bucketSummary(
        "mock_holdout",
        splitSimulation.mockSplitBuckets.mock_holdout.scoreInputIds
      ),
      mockNotEligibleSummary: bucketSummary(
        "mock_not_eligible",
        splitSimulation.mockSplitBuckets.mock_not_eligible.scoreInputIds
      ),
      realCalibrationBucketExists: false,
      realTestBucketExists: false
    },
    mockSelectionSummary: computeMockThresholdCandidateSummary(
      mockThresholdCandidates
    ),
    futureRealThresholdRequirements: {
      requirements: agentOfflineThresholdFutureRequirementValues.map(
        (requirementId) => ({
          requirementId,
          status: "future_unmet" as const,
          requiredBeforeRealThresholdSelection: true as const
        })
      ),
      allRequirementsFutureOrUnmet: true
    },
    boundarySummary: {
      safetyBoundaryViolationCount: 0,
      privacyBoundaryViolationCount: 0,
      claimBoundaryViolationCount: 0,
      rawDataBoundaryViolationCount: 0,
      splitBoundaryViolationCount: 0,
      scoringBoundaryViolationCount: 0,
      thresholdBoundaryViolationCount: 0,
      alphaBoundaryViolationCount: 0,
      calibrationBoundaryViolationCount: 0,
      conformalBoundaryViolationCount: 0,
      runtimeBoundaryViolationCount: 0
    },
    safety: {
      inert: true,
      syntheticOnly: true,
      mockOnly: true,
      designOnly: true,
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
      createsCalibrationDataset: false,
      createsCalibrationManifest: false,
      createsSplitManifest: false,
      assignsRealDatasetSplits: false,
      appliesCalibration: false,
      computesNumericLosses: false,
      computesRiskScores: false,
      computesNonconformityScores: false,
      computesRealThresholds: false,
      introducesAlpha: false,
      implementsConformalRiskControl: false,
      performsRealThresholdSelection: false
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
      rawManifestDataIncluded: false,
      rawAdjudicationDataIncluded: false,
      rawSplitDataIncluded: false,
      rawScoreDataIncluded: false,
      rawThresholdDataIncluded: false,
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
      designOnly: true,
      realCalibrationDataset: false,
      realCalibrationRecord: false,
      realReviewedTrace: false,
      realAgentExecution: false,
      realCodingActionGateExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      realDatasetSplitsAssigned: false,
      splitManifestCreated: false,
      numericLossesComputed: false,
      riskScoresComputed: false,
      nonconformityScoresComputed: false,
      realThresholdsComputed: false,
      thresholdValuesIncluded: false,
      alphaIntroduced: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "synthetic_mock_threshold_selection",
      "mock_selection_only",
      "no_real_thresholds",
      "no_threshold_values",
      "no_alpha"
    ]
  };

  return validateOfflineThresholdSelection(selection);
};

const forbiddenOfflineThresholdPatterns = [
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
  /\b(?:1|5|10)%\b/
] as const;

export const offlineThresholdSelectionContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenOfflineThresholdPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
