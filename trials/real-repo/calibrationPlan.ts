import type { RealRepoTrialFindingsSummary } from "./summary.js";
import type { RealRepoTrialIntakePacket } from "./intakePacketSchema.js";
import type {
  RealVsBenchmarkCalibrationCandidate,
  RealVsBenchmarkGapAnalysis
} from "./gapAnalysisTypes.js";
import {
  realRepoCalibrationPlanSchema,
  realRepoCalibrationPlanSchemaVersion,
  type RealRepoCalibrationCategory,
  type RealRepoCalibrationPlan,
  type RealRepoCalibrationPlanItem,
  type RealRepoCalibrationPriority
} from "./calibrationPlanTypes.js";
import { validateRealRepoTrialIntakePacket } from "./intakePacketSchema.js";

export type BuildRealRepoCalibrationPlanInput = {
  findingsSummaries?: RealRepoTrialFindingsSummary[];
  intakePackets?: RealRepoTrialIntakePacket[];
  gapAnalyses?: RealVsBenchmarkGapAnalysis[];
};

const planLimitations = [
  "calibration_plan_only",
  "no_automatic_policy_changes",
  "no_production_behavior_change",
  "category_only_inputs",
  "requires_human_review",
  "not_real_world_accuracy_claim"
] as const;

const sortedKeys = (counts: Record<string, number>): string[] =>
  Object.keys(counts).sort();

const increment = (
  counts: Record<string, number>,
  key: string,
  amount = 1
): void => {
  counts[key] = (counts[key] ?? 0) + amount;
};

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const priorityFor = (
  category: RealRepoCalibrationCategory,
  evidenceCount: number,
  families: string[]
): RealRepoCalibrationPriority => {
  const highImpactFamilies = new Set([
    "dangerous_commands_boundary_escapes",
    "secrets_exfiltration",
    "environment_deploy_uncertainty"
  ]);

  if (
    category === "detector_gap" &&
    evidenceCount >= 2 &&
    families.some((family) => highImpactFamilies.has(family))
  ) {
    return "critical";
  }

  if (
    category === "detector_gap" ||
    (category === "benchmark_expansion" && evidenceCount >= 2)
  ) {
    return "high";
  }

  if (
    category === "policy_tuning" ||
    category === "ux_clarity" ||
    category === "documentation" ||
    category === "benchmark_expansion"
  ) {
    return "medium";
  }

  return evidenceCount >= 2 ? "medium" : "low";
};

const actionFor = (category: RealRepoCalibrationCategory): string => {
  switch (category) {
    case "policy_tuning":
      return "policy_tuning_review";
    case "detector_gap":
      return "investigate_detector_or_policy_gap";
    case "benchmark_expansion":
      return "add_benchmark_scenario_or_driver_expectation";
    case "ux_clarity":
      return "improve_explanation_or_docs";
    case "documentation":
      return "update_trial_docs_or_defer_guidance";
    case "needs_more_evidence":
      return "collect_more_reviewed_cases";
  }
};

type ItemSeed = {
  category: RealRepoCalibrationCategory;
  sourceSignals: string[];
  opportunityFamilies: string[];
  driverCategories: string[];
  outcomeCategories: string[];
  evidenceCount: number;
};

const emptySeed = (category: RealRepoCalibrationCategory): ItemSeed => ({
  category,
  sourceSignals: [],
  opportunityFamilies: [],
  driverCategories: [],
  outcomeCategories: [],
  evidenceCount: 0
});

const addSeedEvidence = (
  seeds: Map<RealRepoCalibrationCategory, ItemSeed>,
  category: RealRepoCalibrationCategory,
  sourceSignal: string,
  evidenceCount: number,
  opportunityFamilies: string[],
  driverCategories: string[],
  outcomeCategories: string[]
): void => {
  const seed = seeds.get(category) ?? emptySeed(category);

  seed.sourceSignals.push(sourceSignal);
  seed.opportunityFamilies.push(...opportunityFamilies);
  seed.driverCategories.push(...driverCategories);
  seed.outcomeCategories.push(...outcomeCategories);
  seed.evidenceCount += evidenceCount;
  seeds.set(category, seed);
};

const categoryFromCandidate = (
  candidate: RealVsBenchmarkCalibrationCandidate
): RealRepoCalibrationCategory => {
  if (candidate.category === "needs_human_review") {
    return "needs_more_evidence";
  }

  return candidate.category;
};

const addOutcomeCountSeeds = (
  seeds: Map<RealRepoCalibrationCategory, ItemSeed>,
  outcomeCounts: Record<string, number>,
  opportunityFamilyCounts: Record<string, number>,
  topDriverCounts: Record<string, number>
): void => {
  const families = sortedKeys(opportunityFamilyCounts);
  const drivers = sortedKeys(topDriverCounts);

  if ((outcomeCounts.false_positive ?? 0) > 0) {
    addSeedEvidence(
      seeds,
      "policy_tuning",
      "summary_false_positive",
      outcomeCounts.false_positive ?? 0,
      families,
      drivers,
      ["false_positive"]
    );
  }

  if ((outcomeCounts.false_negative ?? 0) > 0) {
    addSeedEvidence(
      seeds,
      "detector_gap",
      "summary_false_negative",
      outcomeCounts.false_negative ?? 0,
      families,
      drivers,
      ["false_negative"]
    );
  }

  if ((outcomeCounts.confusing ?? 0) > 0) {
    addSeedEvidence(
      seeds,
      "ux_clarity",
      "summary_confusing",
      outcomeCounts.confusing ?? 0,
      families,
      drivers,
      ["confusing"]
    );
    addSeedEvidence(
      seeds,
      "documentation",
      "summary_confusing",
      outcomeCounts.confusing ?? 0,
      families,
      drivers,
      ["confusing"]
    );
  }

  if ((outcomeCounts.missing_coverage ?? 0) > 0) {
    addSeedEvidence(
      seeds,
      "benchmark_expansion",
      "summary_missing_coverage",
      outcomeCounts.missing_coverage ?? 0,
      families,
      drivers,
      ["missing_coverage"]
    );
  }

  if ((outcomeCounts.needs_review ?? 0) > 0) {
    addSeedEvidence(
      seeds,
      "needs_more_evidence",
      "summary_needs_review",
      outcomeCounts.needs_review ?? 0,
      families,
      drivers,
      ["needs_review"]
    );
  }
};

const itemFromSeed = (
  seed: ItemSeed,
  index: number
): RealRepoCalibrationPlanItem => {
  const opportunityFamilies = uniqueSorted(seed.opportunityFamilies);

  return {
    id: `calibration_${seed.category}_${String(index + 1).padStart(3, "0")}`,
    category: seed.category,
    priority: priorityFor(
      seed.category,
      seed.evidenceCount,
      opportunityFamilies
    ),
    sourceSignals: uniqueSorted(seed.sourceSignals),
    opportunityFamilies,
    driverCategories: uniqueSorted(seed.driverCategories),
    outcomeCategories: uniqueSorted(seed.outcomeCategories),
    recommendedAction: actionFor(seed.category),
    evidenceCount: seed.evidenceCount,
    safeForImplementation: false
  };
};

export const buildRealRepoCalibrationPlan = (
  input: BuildRealRepoCalibrationPlanInput = {}
): RealRepoCalibrationPlan => {
  const findingsSummaries = input.findingsSummaries ?? [];
  const intakePackets = (input.intakePackets ?? []).map((packet) =>
    validateRealRepoTrialIntakePacket(packet)
  );
  const gapAnalyses = input.gapAnalyses ?? [];
  const acceptedIntakePackets = intakePackets.filter(
    (packet) => packet.intakeStatus === "accepted_for_summary"
  );
  const summaryTrialCount = findingsSummaries.reduce(
    (total, summary) => total + summary.trialCount,
    0
  );
  const acceptedTrialCount = Math.max(
    summaryTrialCount,
    acceptedIntakePackets.length
  );
  const caseCount = gapAnalyses.reduce(
    (total, analysis) => total + analysis.inputSummary.caseCount,
    0
  );
  const blockers: string[] = [];
  const requiredNextSteps: string[] = [];
  const seeds = new Map<RealRepoCalibrationCategory, ItemSeed>();

  if (acceptedTrialCount === 0) {
    blockers.push("no_accepted_trial_evidence");
    requiredNextSteps.push(
      "run_supervised_trials",
      "accept_sanitized_findings"
    );
  }

  if (
    intakePackets.some(
      (packet) => packet.intakeStatus !== "accepted_for_summary"
    )
  ) {
    blockers.push("intake_not_accepted");
  }

  if (
    acceptedIntakePackets.some(
      (packet) =>
        !packet.privacyReview.reviewed || !packet.privacyReview.safeToSummarize
    )
  ) {
    blockers.push("intake_privacy_not_safe");
  }

  if (
    findingsSummaries.some(
      (summary) => summary.privacyReview.unsafeFindingCount > 0
    )
  ) {
    blockers.push("unsafe_findings_summary");
  }

  if (gapAnalyses.length === 0) {
    requiredNextSteps.push("complete_gap_analysis");
  }

  if (
    gapAnalyses.some(
      (analysis) =>
        analysis.safety.containsRawPrivateData ||
        analysis.safety.remoteTelemetryUsed ||
        analysis.safety.networkRequired
    )
  ) {
    blockers.push("unsafe_gap_analysis");
  }

  for (const summary of findingsSummaries) {
    addOutcomeCountSeeds(
      seeds,
      summary.outcomeCounts,
      summary.opportunityFamilyCounts,
      summary.topDriverCounts
    );
  }

  for (const packet of acceptedIntakePackets) {
    addOutcomeCountSeeds(
      seeds,
      packet.summary.outcomeCounts,
      Object.fromEntries(
        packet.summary.observedFamilies.map((family) => [family, 1])
      ),
      Object.fromEntries(
        packet.summary.topDriverCategories.map((driver) => [driver, 1])
      )
    );
  }

  for (const analysis of gapAnalyses) {
    for (const candidate of analysis.calibrationCandidates) {
      addSeedEvidence(
        seeds,
        categoryFromCandidate(candidate),
        candidate.reason,
        1,
        candidate.opportunityFamily === undefined
          ? []
          : [candidate.opportunityFamily],
        candidate.driverCategories,
        candidate.outcomeCategories
      );
    }

    if (
      analysis.familyCoverage.observedFamiliesWithoutBenchmarkCoverage.length >
      0
    ) {
      addSeedEvidence(
        seeds,
        "benchmark_expansion",
        "observed_family_without_benchmark_coverage",
        analysis.familyCoverage.observedFamiliesWithoutBenchmarkCoverage.length,
        analysis.familyCoverage.observedFamiliesWithoutBenchmarkCoverage,
        [],
        ["missing_coverage"]
      );
    }

    if (analysis.driverAnalysis.observedDriversNotInBenchmark.length > 0) {
      addSeedEvidence(
        seeds,
        "benchmark_expansion",
        "observed_driver_not_in_benchmark",
        analysis.driverAnalysis.observedDriversNotInBenchmark.length,
        analysis.familyCoverage.observedFamilies,
        analysis.driverAnalysis.observedDriversNotInBenchmark,
        ["missing_coverage"]
      );
    }
  }

  const calibrationItems = [...seeds.values()]
    .sort((left, right) => left.category.localeCompare(right.category))
    .map((seed, index) => itemFromSeed(seed, index));

  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const topOpportunityFamilies: Record<string, number> = {};
  const topDriverCategories: Record<string, number> = {};

  for (const item of calibrationItems) {
    increment(byCategory, item.category);
    increment(byPriority, item.priority);

    for (const family of item.opportunityFamilies) {
      increment(topOpportunityFamilies, family, item.evidenceCount);
    }

    for (const driver of item.driverCategories) {
      increment(topDriverCategories, driver, item.evidenceCount);
    }
  }

  return realRepoCalibrationPlanSchema.parse({
    schemaVersion: realRepoCalibrationPlanSchemaVersion,
    inputSummary: {
      acceptedTrialCount,
      intakePacketCount: intakePackets.length,
      gapAnalysisCount: gapAnalyses.length,
      caseCount
    },
    readiness: {
      readyForCalibration: blockers.length === 0 && gapAnalyses.length > 0,
      blockers: uniqueSorted(blockers),
      requiredNextSteps: uniqueSorted(requiredNextSteps)
    },
    calibrationItems,
    summary: {
      byCategory,
      byPriority,
      topOpportunityFamilies,
      topDriverCategories
    },
    safety: {
      categoryOnly: true,
      containsRawPrivateData: false,
      remoteTelemetryUsed: false,
      productionBehaviorChanged: false
    },
    limitations: [...planLimitations]
  });
};
