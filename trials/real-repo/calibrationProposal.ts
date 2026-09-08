import {
  realRepoCalibrationPlanSchema,
  realRepoCalibrationPlanSchemaVersion,
  type RealRepoCalibrationCategory,
  type RealRepoCalibrationPlan,
  type RealRepoCalibrationPlanItem
} from "./calibrationPlanTypes.js";
import {
  realRepoCalibrationProposalSetSchema,
  realRepoCalibrationProposalSetSchemaVersion,
  type RealRepoCalibrationProposal,
  type RealRepoCalibrationProposalReadinessState,
  type RealRepoCalibrationProposalReviewStatus,
  type RealRepoCalibrationProposalSet,
  type RealRepoCalibrationProposalTarget
} from "./calibrationProposalTypes.js";

const proposalLimitations = [
  "proposals_only",
  "requires_human_review",
  "no_automatic_tuning",
  "no_production_behavior_change",
  "category_only_inputs",
  "not_real_world_accuracy_claim"
] as const;

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const targetFor = (
  category: RealRepoCalibrationCategory
): RealRepoCalibrationProposalTarget => {
  switch (category) {
    case "policy_tuning":
      return "policy";
    case "detector_gap":
      return "detector";
    case "benchmark_expansion":
      return "benchmark";
    case "ux_clarity":
      return "ux";
    case "documentation":
      return "docs";
    case "needs_more_evidence":
      return "analysis_only";
  }
};

const proposedActionFor = (category: RealRepoCalibrationCategory): string => {
  switch (category) {
    case "policy_tuning":
      return "review_policy_threshold";
    case "detector_gap":
      return "investigate_detector_gap";
    case "benchmark_expansion":
      return "add_benchmark_scenario";
    case "ux_clarity":
      return "clarify_defer_explanation";
    case "documentation":
      return "update_documentation";
    case "needs_more_evidence":
      return "collect_more_evidence";
  }
};

const readinessFor = (
  category: RealRepoCalibrationCategory
): RealRepoCalibrationProposalReadinessState => {
  switch (category) {
    case "benchmark_expansion":
    case "ux_clarity":
    case "documentation":
      return "ready_for_design";
    case "needs_more_evidence":
      return "blocked";
    case "policy_tuning":
    case "detector_gap":
      return "not_ready";
  }
};

const reviewStatusFor = (
  category: RealRepoCalibrationCategory
): RealRepoCalibrationProposalReviewStatus =>
  category === "needs_more_evidence" ? "needs_more_evidence" : "pending_review";

const targetSafeguardFor = (
  target: RealRepoCalibrationProposalTarget
): string => {
  switch (target) {
    case "policy":
      return "requires_policy_regression_tests";
    case "detector":
      return "requires_detector_regression_tests";
    case "benchmark":
      return "requires_benchmark_fixture_review";
    case "docs":
      return "requires_claim_boundary_review";
    case "ux":
      return "requires_copy_review";
    case "analysis_only":
      return "requires_additional_evidence";
  }
};

const proposalFromItem = (
  item: RealRepoCalibrationPlanItem,
  index: number
): RealRepoCalibrationProposal => {
  const implementationTarget = targetFor(item.category);

  return {
    id: `proposal_${item.category}_${String(index + 1).padStart(3, "0")}`,
    sourceCalibrationItemId: item.id,
    category: item.category,
    priority: item.priority,
    proposedAction: proposedActionFor(item.category),
    implementationTarget,
    reviewStatus: reviewStatusFor(item.category),
    implementationReadiness: readinessFor(item.category),
    sourceSignals: [...item.sourceSignals],
    opportunityFamilies: [...item.opportunityFamilies],
    driverCategories: [...item.driverCategories],
    outcomeCategories: [...item.outcomeCategories],
    evidenceCount: item.evidenceCount,
    safeguards: uniqueSorted([
      "requires_human_review",
      "no_automatic_application",
      "category_only_evidence",
      "requires_test_plan_before_implementation",
      targetSafeguardFor(implementationTarget)
    ])
  };
};

export const buildRealRepoCalibrationProposals = (
  plan: RealRepoCalibrationPlan
): RealRepoCalibrationProposalSet => {
  const parsedPlan = realRepoCalibrationPlanSchema.parse(plan);
  const proposals = parsedPlan.calibrationItems.map((item, index) =>
    proposalFromItem(item, index)
  );

  const reviewSummary = {
    pendingReview: proposals.filter(
      (proposal) => proposal.reviewStatus === "pending_review"
    ).length,
    approvedForImplementation: proposals.filter(
      (proposal) => proposal.reviewStatus === "approved_for_implementation"
    ).length,
    rejected: proposals.filter(
      (proposal) => proposal.reviewStatus === "rejected"
    ).length,
    needsMoreEvidence: proposals.filter(
      (proposal) => proposal.reviewStatus === "needs_more_evidence"
    ).length
  };

  return realRepoCalibrationProposalSetSchema.parse({
    schemaVersion: realRepoCalibrationProposalSetSchemaVersion,
    sourcePlanSchemaVersion: realRepoCalibrationPlanSchemaVersion,
    proposalCount: proposals.length,
    proposals,
    reviewSummary,
    safety: {
      categoryOnly: true,
      containsRawPrivateData: false,
      productionBehaviorChanged: false,
      automaticTuningApplied: false,
      remoteTelemetryUsed: false
    },
    limitations: [...proposalLimitations]
  });
};
