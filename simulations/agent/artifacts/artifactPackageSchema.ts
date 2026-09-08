import { z } from "zod";
import { agentBaselineComparisonStrategyValues } from "../baselines/baselineComparisonSchema.js";
import { agentTraceReviewTopLevelLabelValues } from "../review/traceReviewSchema.js";

export const agentResearchArtifactPackageSchemaVersion =
  "agent-research-artifact-package.v1" as const;

export const agentResearchArtifactPackageSourceValues = [
  "synthetic_phase_12_artifact_package",
  "future_controlled_simulation_artifact_package",
  "future_real_trial_artifact_package"
] as const;

export const artifactIncludedAssetKindValues = [
  "personaScenarioMatrix",
  "traceExamples",
  "controlledFixtures",
  "adapterInputs",
  "syntheticRuns",
  "syntheticReviewRecords",
  "syntheticBaselineComparisons"
] as const;

export const artifactGraphRelationKindValues = [
  "persona_to_scenario",
  "scenario_to_fixture",
  "adapter_input_to_normalized_action",
  "run_to_persona",
  "run_to_scenario",
  "run_to_fixture",
  "run_to_adapter_input",
  "review_to_run",
  "review_to_trace",
  "baseline_comparison_to_run",
  "baseline_comparison_to_review"
] as const;

export const artifactDatasetCardIntendedUseValues = [
  "inspect_phase_12_synthetic_assets",
  "reproduce_synthetic_asset_checks",
  "support_future_baseline_planning",
  "support_future_calibration_dataset_design",
  "support_future_report_artifact_planning",
  "support_future_real_agent_pilot_design"
] as const;

export const artifactDatasetCardNotIntendedUseValues = [
  "real_world_validation",
  "production_performance_claims",
  "real_agent_benchmark_claims",
  "calibration_training_data",
  "conformal_risk_control_claims",
  "safety_guarantee_claims",
  "enterprise_readiness_claims"
] as const;

export const artifactDatasetCardFutureUseValues = [
  "batch_12_9_report_positioning",
  "phase_13_calibration_dataset_design",
  "phase_14_offline_conformal_crc_experiments",
  "future_controlled_agent_pilot_design"
] as const;

export const artifactLimitationCategoryValues = [
  "synthetic_scenario_limited",
  "no_real_agent_behavior_observed",
  "no_distribution_shift_assessment",
  "no_calibrated_thresholds",
  "no_real_developer_friction_measurement",
  "no_external_reproducibility_yet"
] as const;

export const artifactPackageTestSuiteValues = [
  "agentResearchArtifactPackage",
  "agentResearchArtifactPackageDocs",
  "agentBaselineComparisons",
  "agentTraceReviewProtocol",
  "agentSimulationRunner",
  "codexActionAdapter",
  "agentSimulationFixtures",
  "agentTraceSchema",
  "agentPersonaScenarioMatrix"
] as const;

export const artifactPackageBuildCheckValues = [
  "typecheck",
  "npm_test",
  "build",
  "lint",
  "ui_build",
  "smoke_install"
] as const;

const categoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const artifactPackageIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]v?\d+$/);

const personaIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

const scenarioIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const fixtureRefSchema = z
  .string()
  .min(1)
  .regex(/^fixture[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$/);

const traceIdSchema = z
  .string()
  .min(1)
  .regex(/^trace[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const runIdSchema = z
  .string()
  .min(1)
  .regex(/^run[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const reviewIdSchema = z
  .string()
  .min(1)
  .regex(/^review[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const comparisonIdSchema = z
  .string()
  .min(1)
  .regex(/^baseline[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const adapterInputIdSchema = z
  .string()
  .min(1)
  .regex(/^adapter[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const normalizedActionIdSchema = z
  .string()
  .min(1)
  .regex(/^normalized[-_][a-z0-9]+(?:[-_][a-z0-9]+)*[-_]\d{3}$/);

const includedAssetSchema = z.object({
  assetKind: z.enum(artifactIncludedAssetKindValues),
  schemaVersion: z.string().min(1),
  assetCount: z.number().int().min(1),
  sourceBatch: z.string().regex(/^12\.[1-7]$/),
  relativePathCategory: categoryIdSchema,
  exportedModuleRef: categoryIdSchema.optional(),
  containsRawCode: z.literal(false),
  containsRawCommands: z.literal(false),
  containsRawPrompts: z.literal(false),
  containsRawAgentOutput: z.literal(false),
  containsPrivateData: z.literal(false),
  syntheticOnly: z.literal(true)
});

const graphNodeRefSchema = z.object({
  personaId: personaIdSchema.optional(),
  scenarioId: scenarioIdSchema.optional(),
  fixtureRef: fixtureRefSchema.optional(),
  traceId: traceIdSchema.optional(),
  runId: runIdSchema.optional(),
  reviewId: reviewIdSchema.optional(),
  comparisonId: comparisonIdSchema.optional(),
  adapterInputId: adapterInputIdSchema.optional(),
  normalizedActionId: normalizedActionIdSchema.optional()
});

const graphEdgeSchema = z.object({
  relationKind: z.enum(artifactGraphRelationKindValues),
  from: graphNodeRefSchema,
  to: graphNodeRefSchema,
  rawContentIncluded: z.literal(false)
});

const traceLinkageExampleSchema = z.object({
  linkageId: categoryIdSchema,
  source: z.literal("synthetic_category_only"),
  artifactKind: z.literal("synthetic_trace_example"),
  traceId: traceIdSchema,
  reviewId: reviewIdSchema,
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  fixtureRef: fixtureRefSchema,
  linkedViaRunId: runIdSchema.optional(),
  directTraceReviewLink: z.literal(true),
  artifactReviewedRaw: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  realReviewCompleted: z.literal(false),
  realReviewedTrace: z.literal(false),
  realAgentExecution: z.literal(false),
  realValidationResult: z.literal(false)
});

const runLinkageExampleSchema = z.object({
  linkageId: categoryIdSchema,
  runId: runIdSchema,
  personaId: personaIdSchema,
  scenarioId: scenarioIdSchema,
  fixtureRefs: z.array(fixtureRefSchema).min(1),
  adapterInputId: adapterInputIdSchema.optional(),
  normalizedActionId: normalizedActionIdSchema.optional(),
  rawRunIncluded: z.literal(false)
});

const reviewLinkageExampleSchema = z.object({
  linkageId: categoryIdSchema,
  reviewId: reviewIdSchema,
  labels: z.array(z.enum(agentTraceReviewTopLevelLabelValues)).min(1),
  rawReviewIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  realReviewCompleted: z.literal(false)
});

const baselineLinkageExampleSchema = z.object({
  linkageId: categoryIdSchema,
  comparisonId: comparisonIdSchema,
  strategiesRepresented: z.array(z.enum(agentBaselineComparisonStrategyValues)),
  syntheticMetricsOnly: z.literal(true),
  rawBaselineIncluded: z.literal(false),
  realBaselineEvaluation: z.literal(false)
});

export const agentResearchArtifactPackageSafetySchema = z.object({
  inert: z.literal(true),
  syntheticOnly: z.literal(true),
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
  runsBaselineEvaluation: z.literal(false)
});

export const agentResearchArtifactPackagePrivacySchema = z.object({
  rawPromptIncluded: z.literal(false),
  rawActionIncluded: z.literal(false),
  rawCommandIncluded: z.literal(false),
  rawDiffIncluded: z.literal(false),
  rawSourceCodeIncluded: z.literal(false),
  rawValidationLogIncluded: z.literal(false),
  rawReviewIncluded: z.literal(false),
  rawTraceIncluded: z.literal(false),
  rawBaselineIncluded: z.literal(false),
  realRepoNameIncluded: z.literal(false),
  realPathIncluded: z.literal(false),
  realUserIncluded: z.literal(false),
  realEmailIncluded: z.literal(false),
  secretIncluded: z.literal(false),
  rawAgentOutputIncluded: z.literal(false),
  reviewerIdentityIncluded: z.literal(false),
  categoryOnly: z.literal(true)
});

export const agentResearchArtifactPackageClaimBoundariesSchema = z.object({
  syntheticOnly: z.literal(true),
  realArtifactDataset: z.literal(false),
  realBaselineEvaluation: z.literal(false),
  realReviewCompleted: z.literal(false),
  realReviewedTrace: z.literal(false),
  actualRuntimeDecision: z.literal(false),
  realAgentExecution: z.literal(false),
  realCodingActionGateExecution: z.literal(false),
  realValidationResult: z.literal(false),
  realWorldResult: z.literal(false),
  calibrationDatasetCreated: z.literal(false),
  calibrationApplied: z.literal(false),
  conformalRiskControlImplemented: z.literal(false),
  conformalGuarantee: z.literal(false),
  statisticalGuarantee: z.literal(false),
  publicDisclosureApproved: z.literal(false),
  legalConclusion: z.literal(false)
});

export const researchArtifactPackageSchema = z.object({
  schemaVersion: z.literal(agentResearchArtifactPackageSchemaVersion),
  artifactPackageId: artifactPackageIdSchema,
  source: z.enum(agentResearchArtifactPackageSourceValues),
  phase: z.object({
    phaseId: z.literal("phase-12"),
    phaseName: z.literal("Agent-in-the-Loop Simulation and Research Dataset"),
    completedBatches: z.array(z.string().regex(/^12\.[1-7]$/)),
    currentBatch: z.literal("12.8"),
    futureBatches: z.array(z.string().regex(/^12\.(?:9|10|11|12)$/))
  }),
  includedAssets: z.record(
    z.enum(artifactIncludedAssetKindValues),
    includedAssetSchema
  ),
  assetGraph: z.object({
    graphVersion: z.literal("phase-12-asset-graph.v1"),
    nodesCategoryOnly: z.literal(true),
    rawContentIncluded: z.literal(false),
    edges: z.array(graphEdgeSchema).min(1)
  }),
  traceLinkageExamples: z.array(traceLinkageExampleSchema).min(1),
  runLinkageExamples: z.array(runLinkageExampleSchema).min(1),
  reviewLinkageExamples: z.array(reviewLinkageExampleSchema).min(1),
  baselineLinkageExamples: z.array(baselineLinkageExampleSchema).min(1),
  datasetCard: z.object({
    name: categoryIdSchema,
    version: z.literal("v1"),
    artifactType: z.literal("synthetic_phase_12_research_artifact_package"),
    intendedUse: z.array(z.enum(artifactDatasetCardIntendedUseValues)).min(1),
    notIntendedUse: z
      .array(z.enum(artifactDatasetCardNotIntendedUseValues))
      .min(1),
    assetSummary: z.array(categoryIdSchema).min(1),
    syntheticDataStatement: z.literal("synthetic_category_only"),
    privacyStatement: z.literal("no_private_or_raw_values"),
    safetyStatement: z.literal("inert_non_executing"),
    claimBoundaryStatement: z.literal("not_real_validation_or_calibration"),
    knownLimitations: z.array(z.enum(artifactLimitationCategoryValues)).min(1),
    futureUseCategories: z
      .array(z.enum(artifactDatasetCardFutureUseValues))
      .min(1),
    notRealCalibrationDataset: z.literal(true)
  }),
  reproducibility: z.object({
    localOnly: z.literal(true),
    deterministic: z.literal(true),
    requiresNetwork: z.literal(false),
    requiresAgentExecution: z.literal(false),
    requiresCommandExecution: z.literal(false),
    requiresRealRepo: z.literal(false),
    requiresSecrets: z.literal(false),
    requiredTestSuites: z.array(z.enum(artifactPackageTestSuiteValues)).min(1),
    requiredBuildChecks: z
      .array(z.enum(artifactPackageBuildCheckValues))
      .min(1),
    packageSafe: z.literal(true)
  }),
  limitations: z.object({
    syntheticOnly: z.literal(true),
    noRealAgentExecution: z.literal(true),
    noRealUserStudy: z.literal(true),
    noRealBaselineEvaluation: z.literal(true),
    noRealReviews: z.literal(true),
    noRealReviewedTraces: z.literal(true),
    noCalibrationDataset: z.literal(true),
    noCalibrationApplied: z.literal(true),
    noConformalRiskControl: z.literal(true),
    noStatisticalGuarantee: z.literal(true),
    noProductionRoutingChange: z.literal(true),
    noRealWorldValidation: z.literal(true),
    limitationCategories: z
      .array(z.enum(artifactLimitationCategoryValues))
      .min(1)
  }),
  safety: agentResearchArtifactPackageSafetySchema,
  privacy: agentResearchArtifactPackagePrivacySchema,
  claimBoundaries: agentResearchArtifactPackageClaimBoundariesSchema,
  metrics: z.object({
    personaCount: z.number().int().min(1),
    scenarioCount: z.number().int().min(1),
    traceExampleCount: z.number().int().min(1),
    fixtureCount: z.number().int().min(1),
    adapterInputCount: z.number().int().min(1),
    syntheticRunCount: z.number().int().min(1),
    syntheticReviewRecordCount: z.number().int().min(1),
    syntheticBaselineComparisonCount: z.number().int().min(1),
    directTraceLinkageExampleCount: z.number().int().min(1),
    runLinkageExampleCount: z.number().int().min(1),
    reviewLinkageExampleCount: z.number().int().min(1),
    baselineLinkageExampleCount: z.number().int().min(1),
    safetyBoundaryViolationCount: z.literal(0),
    privacyBoundaryViolationCount: z.literal(0),
    claimBoundaryViolationCount: z.literal(0),
    localSyntheticCountsOnly: z.literal(true),
    realWorldPerformanceMetric: z.literal(false),
    calibratedRiskMetric: z.literal(false),
    statisticalEstimate: z.literal(false),
    measuredProductivityMetric: z.literal(false)
  }),
  notes: z.array(categoryIdSchema).min(1)
});

export type ResearchArtifactPackage = z.infer<
  typeof researchArtifactPackageSchema
>;

export interface ResearchArtifactPackageMetrics {
  personaCount: number;
  scenarioCount: number;
  traceExampleCount: number;
  fixtureCount: number;
  adapterInputCount: number;
  syntheticRunCount: number;
  syntheticReviewRecordCount: number;
  syntheticBaselineComparisonCount: number;
  directTraceLinkageExampleCount: number;
  runLinkageExampleCount: number;
  reviewLinkageExampleCount: number;
  baselineLinkageExampleCount: number;
  safetyBoundaryViolationCount: 0;
  privacyBoundaryViolationCount: 0;
  claimBoundaryViolationCount: 0;
  localSyntheticCountsOnly: true;
  realWorldPerformanceMetric: false;
  calibratedRiskMetric: false;
  statisticalEstimate: false;
  measuredProductivityMetric: false;
}

export const validateResearchArtifactPackage = (
  artifactPackage: unknown
): ResearchArtifactPackage =>
  researchArtifactPackageSchema.parse(artifactPackage);

export const validateResearchArtifactPackages = (
  packages: unknown[]
): ResearchArtifactPackage[] =>
  packages
    .map(validateResearchArtifactPackage)
    .sort((left, right) =>
      left.artifactPackageId.localeCompare(right.artifactPackageId)
    );

export const computeResearchArtifactPackageMetrics = (
  artifactPackage: ResearchArtifactPackage
): ResearchArtifactPackageMetrics => ({
  personaCount: artifactPackage.metrics.personaCount,
  scenarioCount: artifactPackage.metrics.scenarioCount,
  traceExampleCount: artifactPackage.metrics.traceExampleCount,
  fixtureCount: artifactPackage.metrics.fixtureCount,
  adapterInputCount: artifactPackage.metrics.adapterInputCount,
  syntheticRunCount: artifactPackage.metrics.syntheticRunCount,
  syntheticReviewRecordCount:
    artifactPackage.metrics.syntheticReviewRecordCount,
  syntheticBaselineComparisonCount:
    artifactPackage.metrics.syntheticBaselineComparisonCount,
  directTraceLinkageExampleCount: artifactPackage.traceLinkageExamples.filter(
    (linkage) => linkage.directTraceReviewLink
  ).length,
  runLinkageExampleCount: artifactPackage.runLinkageExamples.length,
  reviewLinkageExampleCount: artifactPackage.reviewLinkageExamples.length,
  baselineLinkageExampleCount: artifactPackage.baselineLinkageExamples.length,
  safetyBoundaryViolationCount: 0,
  privacyBoundaryViolationCount: 0,
  claimBoundaryViolationCount: 0,
  localSyntheticCountsOnly: true,
  realWorldPerformanceMetric: false,
  calibratedRiskMetric: false,
  statisticalEstimate: false,
  measuredProductivityMetric: false
});

export const validateArtifactAssetGraph = (
  artifactPackage: ResearchArtifactPackage
): void => {
  if (artifactPackage.assetGraph.rawContentIncluded) {
    throw new Error("Artifact graph includes raw content");
  }

  if (artifactPackage.assetGraph.edges.length === 0) {
    throw new Error("Artifact graph has no edges");
  }
};

export const validateTraceLinkageExamples = (
  artifactPackage: ResearchArtifactPackage
): void => {
  const hasDirectTraceReviewLink = artifactPackage.traceLinkageExamples.some(
    (linkage) =>
      linkage.directTraceReviewLink &&
      linkage.rawTraceIncluded === false &&
      linkage.rawReviewIncluded === false &&
      linkage.realReviewCompleted === false &&
      linkage.realReviewedTrace === false
  );

  if (!hasDirectTraceReviewLink) {
    throw new Error("Missing direct synthetic trace/review linkage example");
  }
};

const forbiddenArtifactPatterns = [
  /\/Users\//,
  /C:\\/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /\/private\/tmp\//,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=/,
  /PRIVATE KEY/,
  /sk-[A-Za-z0-9_-]{12,}/,
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

export const researchArtifactPackageContainsForbiddenRawString = (
  value: unknown
): boolean => {
  const serialized = JSON.stringify(value);

  return forbiddenArtifactPatterns.some((pattern) => pattern.test(serialized));
};

export const validateResearchArtifactPackageSafety = (
  artifactPackage: ResearchArtifactPackage
): void => {
  if (researchArtifactPackageContainsForbiddenRawString(artifactPackage)) {
    throw new Error(
      `Artifact package contains forbidden raw-looking value: ${artifactPackage.artifactPackageId}`
    );
  }
};
