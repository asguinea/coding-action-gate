import { z } from "zod";
import {
  agentOfflineScoreInputSetSchemaVersion,
  type OfflineScoreInputSet
} from "./offlineScoreSchema.js";

export const agentOfflineSplitSimulationSchemaVersion =
  "agent-offline-split-simulation.v1" as const;

export const agentOfflineSplitSimulationSourceValues = [
  "synthetic_mock_split_simulation",
  "future_offline_experiment_split_simulation",
  "future_real_calibration_dataset_split_simulation"
] as const;

export const agentOfflineMockSplitCategoryValues = [
  "mock_train",
  "mock_calibration",
  "mock_test",
  "mock_holdout",
  "mock_not_eligible"
] as const;

export const agentOfflineFutureSplitCategoryValues = [
  "future_train",
  "future_calibration",
  "future_test",
  "future_holdout",
  "not_eligible"
] as const;

export const agentOfflineSplitGroupingKeyValues = [
  "scenario_family",
  "fixture_family",
  "trace_source",
  "score_family",
  "risk_dimension",
  "action_category",
  "decision_category",
  "source_artifact_family",
  "synthetic_mock_family"
] as const;

export const agentOfflineSplitLeakageRiskValues = [
  "same_scenario_family",
  "same_fixture_family",
  "same_trace_source",
  "same_agent_session_future",
  "same_reviewer_batch_future",
  "same_score_family",
  "same_risk_dimension",
  "same_normalized_action_category",
  "duplicated_or_near_duplicate_mock_input",
  "synthetic_example_only",
  "unresolved_source_linkage",
  "no_leakage_risk_detected"
] as const;

export const agentOfflineSplitExclusionReasonValues = [
  "mock_input_only",
  "synthetic_example_only_not_real_data",
  "real_review_required",
  "approved_dataset_required",
  "boundary_violation",
  "unresolved_source_linkage",
  "no_exclusion"
] as const;

export const agentOfflineSplitFutureRequirementValues = [
  "real_reviewed_traces_required",
  "eligible_calibration_dataset_required",
  "real_human_review_required",
  "adjudication_required",
  "approved_split_policy_required",
  "leakage_review_required",
  "raw_data_exclusion_required",
  "privacy_boundary_clearance_required",
  "safety_boundary_clearance_required",
  "claim_boundary_review_required"
] as const;

const safeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_](?:v\d+|\d{3})$/);

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const offlineSplitSimulationSafetySchema = z.object({
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
  computesThresholds: z.literal(false),
  introducesAlpha: z.literal(false),
  implementsConformalRiskControl: z.literal(false)
});

export const offlineSplitSimulationPrivacySchema = z.object({
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
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const offlineSplitSimulationClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  mockOnly: z.literal(true),
  designOnly: z.literal(true),
  realCalibrationDataset: z.literal(false),
  realCalibrationRecord: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realStepHarborExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  realDatasetSplitsAssigned: z.literal(false),
  splitManifestCreated: z.literal(false),
  numericLossesComputed: z.literal(false),
  riskScoresComputed: z.literal(false),
  nonconformityScoresComputed: z.literal(false),
  thresholdsComputed: z.literal(false),
  alphaIntroduced: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  productionRoutingChanged: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

const boundarySummarySchema = z.object({
  safetyBoundaryViolationCount: z.literal(0),
  privacyBoundaryViolationCount: z.literal(0),
  claimBoundaryViolationCount: z.literal(0),
  rawDataBoundaryViolationCount: z.literal(0),
  splitBoundaryViolationCount: z.literal(0),
  calibrationBoundaryViolationCount: z.literal(0),
  scoringBoundaryViolationCount: z.literal(0),
  conformalBoundaryViolationCount: z.literal(0),
  runtimeBoundaryViolationCount: z.literal(0)
});

const phaseSchema = z.object({
  phaseId: z.literal("phase-14"),
  phaseName: z.literal("Offline Conformal / CRC Prototype"),
  completedPreviousPhase: z.literal(
    "phase-13-complete-readiness-infrastructure-only"
  ),
  completedBatches: z.array(z.enum(["14.1", "14.2"])),
  currentBatch: z.literal("14.3"),
  futureBatches: z.array(z.enum(["14.4", "14.5", "14.6"])),
  phaseStatus: z.literal(
    "offline_split_mechanics_simulation_without_real_splits_or_calibration"
  )
});

const linkedScoreInputSetSchema = z.object({
  inputSetId: z.literal("offline-score-input-set-synthetic-v1"),
  schemaVersion: z.literal(agentOfflineScoreInputSetSchemaVersion),
  source: z.literal("synthetic_mock_score_input"),
  scoreInputIds: z.array(safeIdSchema).min(1),
  rawScoreInputsIncluded: z.literal(false)
});

const splitPolicySchema = z.object({
  policyId: safeIdSchema,
  allowedMockSplitCategories: z.array(
    z.enum(agentOfflineMockSplitCategoryValues)
  ),
  futureRealSplitCategories: z.array(
    z.enum(agentOfflineFutureSplitCategoryValues)
  ),
  groupingKeys: z.array(z.enum(agentOfflineSplitGroupingKeyValues)),
  leakageRiskCategories: z.array(z.enum(agentOfflineSplitLeakageRiskValues)),
  mockSplitAssignmentAllowed: z.literal(true),
  realSplitAssignmentAllowed: z.literal(false),
  realReviewedTracesRequiredForRealSplit: z.literal(true),
  approvedCalibrationDatasetRequiredForRealSplit: z.literal(true),
  syntheticExamplesCanBeAssignedToRealSplit: z.literal(false)
});

const mockSplitBucketSchema = z.object({
  bucketId: safeIdSchema,
  mockSplitCategory: z.enum(agentOfflineMockSplitCategoryValues),
  scoreInputIds: z.array(safeIdSchema),
  bucketPurposeCategory: categoryIdSchema,
  realSplitEquivalentCategory: z.enum(agentOfflineFutureSplitCategoryValues),
  realSplitAssigned: z.literal(false)
});

const evaluatedMockInputSchema = z.object({
  scoreInputId: safeIdSchema,
  mockSplitCategory: z.enum(agentOfflineMockSplitCategoryValues),
  futureRealSplitCategory: z.enum(agentOfflineFutureSplitCategoryValues),
  realSplitAssigned: z.literal(false),
  leakageRiskCategories: z.array(z.enum(agentOfflineSplitLeakageRiskValues)),
  groupingKeyCategories: z.array(z.enum(agentOfflineSplitGroupingKeyValues)),
  exclusionReasonCategories: z.array(
    z.enum(agentOfflineSplitExclusionReasonValues)
  ),
  boundaryStatus: z.literal("boundary_clear_for_mock_only"),
  rawInputIncluded: z.literal(false)
});

const futureRealSplitRequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.enum(agentOfflineSplitFutureRequirementValues),
      status: z.literal("future_unmet"),
      requiredBeforeRealSplit: z.literal(true)
    })
  ),
  allRequirementsFutureOrUnmet: z.literal(true)
});

export const offlineSplitSimulationSchema = z.object({
  schemaVersion: z.literal(agentOfflineSplitSimulationSchemaVersion),
  simulationId: safeIdSchema,
  source: z.enum(agentOfflineSplitSimulationSourceValues),
  phase: phaseSchema,
  linkedScoreInputSet: linkedScoreInputSetSchema,
  splitPolicy: splitPolicySchema,
  mockSplitBuckets: z.object({
    mock_train: mockSplitBucketSchema,
    mock_calibration: mockSplitBucketSchema,
    mock_test: mockSplitBucketSchema,
    mock_holdout: mockSplitBucketSchema,
    mock_not_eligible: mockSplitBucketSchema
  }),
  evaluatedMockInputs: z.array(evaluatedMockInputSchema).min(1),
  leakageCheckSummary: z.object({
    totalEvaluatedInputs: z.number().int().nonnegative(),
    totalInputsWithLeakageRisk: z.number().int().nonnegative(),
    sameScenarioFamilyCount: z.number().int().nonnegative(),
    sameFixtureFamilyCount: z.number().int().nonnegative(),
    sameTraceSourceCount: z.number().int().nonnegative(),
    sameScoreFamilyCount: z.number().int().nonnegative(),
    sameRiskDimensionCount: z.number().int().nonnegative(),
    sameNormalizedActionCategoryCount: z.number().int().nonnegative(),
    duplicatedOrNearDuplicateMockInputCount: z.number().int().nonnegative(),
    syntheticExampleOnlyCount: z.number().int().nonnegative(),
    unresolvedSourceLinkageCount: z.number().int().nonnegative(),
    noLeakageRiskDetectedCount: z.number().int().nonnegative(),
    realLeakageAnalysisPerformed: z.literal(false)
  }),
  splitBalanceSummary: z.object({
    totalMockInputs: z.number().int().nonnegative(),
    mockTrainCount: z.number().int().nonnegative(),
    mockCalibrationCount: z.number().int().nonnegative(),
    mockTestCount: z.number().int().nonnegative(),
    mockHoldoutCount: z.number().int().nonnegative(),
    mockNotEligibleCount: z.number().int().nonnegative(),
    realTrainCount: z.literal(0),
    realCalibrationCount: z.literal(0),
    realTestCount: z.literal(0),
    realHoldoutCount: z.literal(0),
    realSplitAssignedCount: z.literal(0)
  }),
  futureRealSplitRequirements: futureRealSplitRequirementsSchema,
  boundarySummary: boundarySummarySchema,
  safety: offlineSplitSimulationSafetySchema,
  privacy: offlineSplitSimulationPrivacySchema,
  claimBoundaries: offlineSplitSimulationClaimBoundariesSchema,
  notes: z.array(categoryIdSchema).min(1)
});

export type OfflineSplitSimulation = z.infer<
  typeof offlineSplitSimulationSchema
>;
export type OfflineSplitEvaluatedMockInput =
  OfflineSplitSimulation["evaluatedMockInputs"][number];

export const validateOfflineSplitSimulation = (
  simulation: unknown
): OfflineSplitSimulation => offlineSplitSimulationSchema.parse(simulation);

export const validateOfflineSplitSimulations = (
  simulations: unknown[]
): OfflineSplitSimulation[] =>
  simulations
    .map(validateOfflineSplitSimulation)
    .sort((left, right) => left.simulationId.localeCompare(right.simulationId));

export const computeMockSplitBalance = (
  evaluatedInputs: OfflineSplitEvaluatedMockInput[]
): OfflineSplitSimulation["splitBalanceSummary"] => ({
  totalMockInputs: evaluatedInputs.length,
  mockTrainCount: evaluatedInputs.filter(
    (input) => input.mockSplitCategory === "mock_train"
  ).length,
  mockCalibrationCount: evaluatedInputs.filter(
    (input) => input.mockSplitCategory === "mock_calibration"
  ).length,
  mockTestCount: evaluatedInputs.filter(
    (input) => input.mockSplitCategory === "mock_test"
  ).length,
  mockHoldoutCount: evaluatedInputs.filter(
    (input) => input.mockSplitCategory === "mock_holdout"
  ).length,
  mockNotEligibleCount: evaluatedInputs.filter(
    (input) => input.mockSplitCategory === "mock_not_eligible"
  ).length,
  realTrainCount: 0,
  realCalibrationCount: 0,
  realTestCount: 0,
  realHoldoutCount: 0,
  realSplitAssignedCount: 0
});

const countRisk = (
  evaluatedInputs: OfflineSplitEvaluatedMockInput[],
  risk: (typeof agentOfflineSplitLeakageRiskValues)[number]
): number =>
  evaluatedInputs.filter((input) => input.leakageRiskCategories.includes(risk))
    .length;

export const computeMockLeakageSummary = (
  evaluatedInputs: OfflineSplitEvaluatedMockInput[]
): OfflineSplitSimulation["leakageCheckSummary"] => ({
  totalEvaluatedInputs: evaluatedInputs.length,
  totalInputsWithLeakageRisk: evaluatedInputs.filter(
    (input) =>
      !(
        input.leakageRiskCategories.length === 1 &&
        input.leakageRiskCategories[0] === "no_leakage_risk_detected"
      )
  ).length,
  sameScenarioFamilyCount: countRisk(evaluatedInputs, "same_scenario_family"),
  sameFixtureFamilyCount: countRisk(evaluatedInputs, "same_fixture_family"),
  sameTraceSourceCount: countRisk(evaluatedInputs, "same_trace_source"),
  sameScoreFamilyCount: countRisk(evaluatedInputs, "same_score_family"),
  sameRiskDimensionCount: countRisk(evaluatedInputs, "same_risk_dimension"),
  sameNormalizedActionCategoryCount: countRisk(
    evaluatedInputs,
    "same_normalized_action_category"
  ),
  duplicatedOrNearDuplicateMockInputCount: countRisk(
    evaluatedInputs,
    "duplicated_or_near_duplicate_mock_input"
  ),
  syntheticExampleOnlyCount: countRisk(
    evaluatedInputs,
    "synthetic_example_only"
  ),
  unresolvedSourceLinkageCount: countRisk(
    evaluatedInputs,
    "unresolved_source_linkage"
  ),
  noLeakageRiskDetectedCount: countRisk(
    evaluatedInputs,
    "no_leakage_risk_detected"
  ),
  realLeakageAnalysisPerformed: false
});

export const summarizeOfflineSplitSimulation = (
  simulation: OfflineSplitSimulation
): {
  simulationId: string;
  totalMockInputs: number;
  mockCalibrationCount: number;
  mockTestCount: number;
  realSplitAssignedCount: 0;
  realLeakageAnalysisPerformed: false;
} => ({
  simulationId: simulation.simulationId,
  totalMockInputs: simulation.splitBalanceSummary.totalMockInputs,
  mockCalibrationCount: simulation.splitBalanceSummary.mockCalibrationCount,
  mockTestCount: simulation.splitBalanceSummary.mockTestCount,
  realSplitAssignedCount: simulation.splitBalanceSummary.realSplitAssignedCount,
  realLeakageAnalysisPerformed:
    simulation.leakageCheckSummary.realLeakageAnalysisPerformed
});

export const validateOfflineSplitSimulationBoundaries = (
  simulation: OfflineSplitSimulation
): void => {
  if (
    simulation.boundarySummary.safetyBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.privacyBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.claimBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.splitBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.calibrationBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.scoringBoundaryViolationCount !== 0 ||
    simulation.boundarySummary.conformalBoundaryViolationCount !== 0
  ) {
    throw new Error("Offline split simulation crosses a declared boundary");
  }
};

export const validateOfflineSplitSimulationScoreInputLinkage = (
  simulation: OfflineSplitSimulation,
  inputSet: OfflineScoreInputSet
): void => {
  if (simulation.linkedScoreInputSet.inputSetId !== inputSet.inputSetId) {
    throw new Error("Offline split simulation references an unknown input set");
  }

  const scoreInputIds = new Set(
    inputSet.scoreInputs.map((input) => input.scoreInputId)
  );
  for (const scoreInputId of simulation.linkedScoreInputSet.scoreInputIds) {
    if (!scoreInputIds.has(scoreInputId)) {
      throw new Error(`Unknown linked score input: ${scoreInputId}`);
    }
  }

  for (const evaluatedInput of simulation.evaluatedMockInputs) {
    if (!scoreInputIds.has(evaluatedInput.scoreInputId)) {
      throw new Error(
        `Unknown evaluated score input: ${evaluatedInput.scoreInputId}`
      );
    }
  }
};

export const buildSyntheticOfflineSplitSimulation = (
  inputSet: OfflineScoreInputSet
): OfflineSplitSimulation => {
  const knownIds = inputSet.scoreInputs.map((input) => input.scoreInputId);
  const plannedEvaluatedMockInputs: OfflineSplitEvaluatedMockInput[] = [
    {
      scoreInputId: "offline-score-input-synthetic-block-001",
      mockSplitCategory: "mock_train",
      futureRealSplitCategory: "future_train",
      realSplitAssigned: false,
      leakageRiskCategories: [
        "same_score_family",
        "same_risk_dimension",
        "synthetic_example_only"
      ],
      groupingKeyCategories: [
        "score_family",
        "risk_dimension",
        "action_category"
      ],
      exclusionReasonCategories: ["mock_input_only"],
      boundaryStatus: "boundary_clear_for_mock_only",
      rawInputIncluded: false
    },
    {
      scoreInputId: "offline-score-input-synthetic-defer-001",
      mockSplitCategory: "mock_train",
      futureRealSplitCategory: "future_train",
      realSplitAssigned: false,
      leakageRiskCategories: [
        "same_scenario_family",
        "same_score_family",
        "synthetic_example_only"
      ],
      groupingKeyCategories: [
        "scenario_family",
        "score_family",
        "decision_category"
      ],
      exclusionReasonCategories: ["mock_input_only"],
      boundaryStatus: "boundary_clear_for_mock_only",
      rawInputIncluded: false
    },
    {
      scoreInputId: "offline-score-input-synthetic-escalate-001",
      mockSplitCategory: "mock_calibration",
      futureRealSplitCategory: "future_calibration",
      realSplitAssigned: false,
      leakageRiskCategories: [
        "same_risk_dimension",
        "same_normalized_action_category",
        "synthetic_example_only"
      ],
      groupingKeyCategories: ["risk_dimension", "action_category"],
      exclusionReasonCategories: ["mock_input_only"],
      boundaryStatus: "boundary_clear_for_mock_only",
      rawInputIncluded: false
    },
    {
      scoreInputId: "offline-score-input-synthetic-recovery-001",
      mockSplitCategory: "mock_test",
      futureRealSplitCategory: "future_test",
      realSplitAssigned: false,
      leakageRiskCategories: ["no_leakage_risk_detected"],
      groupingKeyCategories: ["synthetic_mock_family"],
      exclusionReasonCategories: ["mock_input_only"],
      boundaryStatus: "boundary_clear_for_mock_only",
      rawInputIncluded: false
    },
    {
      scoreInputId: "offline-score-input-synthetic-friction-coverage-001",
      mockSplitCategory: "mock_not_eligible",
      futureRealSplitCategory: "not_eligible",
      realSplitAssigned: false,
      leakageRiskCategories: [
        "same_score_family",
        "synthetic_example_only",
        "duplicated_or_near_duplicate_mock_input"
      ],
      groupingKeyCategories: ["score_family", "source_artifact_family"],
      exclusionReasonCategories: [
        "synthetic_example_only_not_real_data",
        "approved_dataset_required"
      ],
      boundaryStatus: "boundary_clear_for_mock_only",
      rawInputIncluded: false
    }
  ];
  const evaluatedMockInputs = plannedEvaluatedMockInputs.filter((input) =>
    knownIds.includes(input.scoreInputId)
  );

  const bucketFor = (
    category: (typeof agentOfflineMockSplitCategoryValues)[number],
    realCategory: (typeof agentOfflineFutureSplitCategoryValues)[number],
    purpose: string
  ) => ({
    bucketId: `offline-split-bucket-${category.replace("mock_", "")}-001`,
    mockSplitCategory: category,
    scoreInputIds: evaluatedMockInputs
      .filter((input) => input.mockSplitCategory === category)
      .map((input) => input.scoreInputId),
    bucketPurposeCategory: purpose,
    realSplitEquivalentCategory: realCategory,
    realSplitAssigned: false as const
  });

  const simulation = {
    schemaVersion: agentOfflineSplitSimulationSchemaVersion,
    simulationId: "offline-split-simulation-synthetic-v1",
    source: "synthetic_mock_split_simulation",
    phase: {
      phaseId: "phase-14",
      phaseName: "Offline Conformal / CRC Prototype",
      completedPreviousPhase: "phase-13-complete-readiness-infrastructure-only",
      completedBatches: ["14.1", "14.2"],
      currentBatch: "14.3",
      futureBatches: ["14.4", "14.5", "14.6"],
      phaseStatus:
        "offline_split_mechanics_simulation_without_real_splits_or_calibration"
    },
    linkedScoreInputSet: {
      inputSetId: inputSet.inputSetId,
      schemaVersion: inputSet.schemaVersion,
      source: inputSet.source,
      scoreInputIds: knownIds,
      rawScoreInputsIncluded: false
    },
    splitPolicy: {
      policyId: "offline-mock-split-policy-v1",
      allowedMockSplitCategories: [...agentOfflineMockSplitCategoryValues],
      futureRealSplitCategories: [...agentOfflineFutureSplitCategoryValues],
      groupingKeys: [...agentOfflineSplitGroupingKeyValues],
      leakageRiskCategories: [...agentOfflineSplitLeakageRiskValues],
      mockSplitAssignmentAllowed: true,
      realSplitAssignmentAllowed: false,
      realReviewedTracesRequiredForRealSplit: true,
      approvedCalibrationDatasetRequiredForRealSplit: true,
      syntheticExamplesCanBeAssignedToRealSplit: false
    },
    mockSplitBuckets: {
      mock_train: bucketFor(
        "mock_train",
        "future_train",
        "synthetic_training_mechanics"
      ),
      mock_calibration: bucketFor(
        "mock_calibration",
        "future_calibration",
        "synthetic_calibration_mechanics"
      ),
      mock_test: bucketFor(
        "mock_test",
        "future_test",
        "synthetic_test_mechanics"
      ),
      mock_holdout: bucketFor(
        "mock_holdout",
        "future_holdout",
        "synthetic_holdout_mechanics"
      ),
      mock_not_eligible: bucketFor(
        "mock_not_eligible",
        "not_eligible",
        "synthetic_exclusion_mechanics"
      )
    },
    evaluatedMockInputs,
    leakageCheckSummary: computeMockLeakageSummary(evaluatedMockInputs),
    splitBalanceSummary: computeMockSplitBalance(evaluatedMockInputs),
    futureRealSplitRequirements: {
      requirements: agentOfflineSplitFutureRequirementValues.map(
        (requirementId) => ({
          requirementId,
          status: "future_unmet" as const,
          requiredBeforeRealSplit: true as const
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
      calibrationBoundaryViolationCount: 0,
      scoringBoundaryViolationCount: 0,
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
      computesThresholds: false,
      introducesAlpha: false,
      implementsConformalRiskControl: false
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
      realStepHarborExecution: false,
      realValidationResult: false,
      realWorldResult: false,
      calibrationDatasetCreated: false,
      calibrationApplied: false,
      realDatasetSplitsAssigned: false,
      splitManifestCreated: false,
      numericLossesComputed: false,
      riskScoresComputed: false,
      nonconformityScoresComputed: false,
      thresholdsComputed: false,
      alphaIntroduced: false,
      conformalRiskControlImplemented: false,
      conformalGuarantee: false,
      statisticalGuarantee: false,
      productionRoutingChanged: false,
      publicDisclosureApproved: false,
      legalConclusion: false
    },
    notes: [
      "synthetic_mock_split_simulation",
      "not_real_split",
      "no_split_manifest",
      "no_thresholds",
      "no_alpha"
    ]
  };

  return validateOfflineSplitSimulation(simulation);
};

const forbiddenOfflineSplitPatterns = [
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
  /bun\s+run/i
] as const;

export const offlineSplitSimulationContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenOfflineSplitPatterns.some((pattern) =>
    pattern.test(serialized)
  );
};
