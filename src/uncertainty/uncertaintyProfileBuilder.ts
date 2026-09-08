import type { DecisionPosture } from "../domain/decisions.js";
import type { StepHarborSignals } from "../domain/signals.js";
import {
  clampScore,
  combineDimensionScores,
  deriveOverallImpact,
  deriveOverallLevel,
  deriveOverallReducibility,
  scoreToLevel,
  topDriversFromDimensions
} from "./uncertaintyScoring.js";
import {
  createDefaultUncertaintyDimensions,
  uncertaintyProfileSchema,
  uncertaintyProfileSchemaVersion,
  type ImpactLevel,
  type Reducibility,
  type UncertaintyDimension,
  type UncertaintyDimensionProfile,
  type UncertaintyDimensionsRecord,
  type UncertaintyProfile
} from "./uncertaintyTypes.js";
import { buildUncertaintyReductionPlan } from "./uncertaintyReductionPlan.js";

export interface BuildUncertaintyProfileInput {
  signals?: StepHarborSignals;
  decision?: {
    decision: DecisionPosture;
  };
  autonomyBudget?: AutonomyBudgetProfileInput;
}

export interface AutonomyBudgetProfileInput {
  relevant?: boolean;
  autonomyBudgetStatus?: "ok" | "warning" | "exceeded" | "unknown";
  retryCount?: number;
  retryBudgetStatus?: "ok" | "warning" | "exceeded" | "unknown";
  repeatedDeferCount?: number;
  repeatedDeferLimitReached?: boolean;
  noNetProgress?: boolean;
  progressState?: "progress" | "no_progress" | "unknown";
  actionScope?: "narrow" | "broad" | "unknown";
  diffChurn?: "low" | "high" | "unknown";
  contextBudgetStatus?: "ok" | "warning" | "exceeded" | "unknown";
}

interface DimensionUpdate {
  score?: number;
  impact?: ImpactLevel;
  reducibility?: Reducibility;
  drivers?: string[];
  evidence?: string[];
  missingEvidence?: string[];
}

const impactRank: Record<ImpactLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

const reducibilityRank: Record<Reducibility, number> = {
  reducible: 0,
  partially_reducible: 1,
  irreducible: 2
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

const strongerImpact = (
  current: ImpactLevel,
  next: ImpactLevel | undefined
): ImpactLevel =>
  next !== undefined && impactRank[next] > impactRank[current] ? next : current;

const strongerReducibility = (
  current: Reducibility,
  next: Reducibility | undefined
): Reducibility =>
  next !== undefined && reducibilityRank[next] > reducibilityRank[current]
    ? next
    : current;

const updateDimension = (
  dimensions: UncertaintyDimensionsRecord,
  dimension: UncertaintyDimension,
  update: DimensionUpdate
): void => {
  const current = dimensions[dimension];
  const score = Math.max(current.score, clampScore(update.score ?? 0));
  const next: UncertaintyDimensionProfile = {
    ...current,
    score,
    level: scoreToLevel(score),
    impact: strongerImpact(current.impact, update.impact),
    reducibility: strongerReducibility(
      current.reducibility,
      update.reducibility
    ),
    drivers: unique([...current.drivers, ...(update.drivers ?? [])]),
    evidence: unique([...current.evidence, ...(update.evidence ?? [])]),
    missingEvidence: unique([
      ...current.missingEvidence,
      ...(update.missingEvidence ?? [])
    ])
  };

  dimensions[dimension] = next;
};

const hasReviewableSensitiveSurface = (signals: StepHarborSignals): boolean =>
  signals.pathSensitivity === "high" ||
  signals.pathSensitivity === "critical" ||
  signals.matchedSensitivePathLevel === "high" ||
  signals.matchedSensitivePathLevel === "critical";

const hasSecretSurface = (signals: StepHarborSignals): boolean =>
  signals.secretPathMatch === true ||
  signals.secretPatternMatch === true ||
  signals.entropyAnomaly === true ||
  signals.commandContainsSecret === true ||
  signals.diffContainsSecret === true ||
  signals.promptContextContainsSecret === true ||
  signals.secretTouch === "probable" ||
  signals.secretTouch === "confirmed";

const hasMissingSensitiveContext = (signals: StepHarborSignals): boolean =>
  signals.targetFileReadRecently === false ||
  (signals.relatedTestsFound === true && signals.relatedTestsRead === false) ||
  (signals.contextCompletenessScore !== undefined &&
    signals.contextCompletenessScore < 0.7) ||
  signals.targetFileFreshness === "unknown" ||
  signals.targetFileFreshness === "stale" ||
  signals.targetFileFreshness === "missing";

const hasAvailableSensitiveContext = (signals: StepHarborSignals): boolean =>
  signals.targetFileReadRecently === true ||
  signals.relatedTestsRead === true ||
  (signals.contextCompletenessScore !== undefined &&
    signals.contextCompletenessScore >= 0.7);

const hasMissingSensitiveValidation = (signals: StepHarborSignals): boolean =>
  (signals.validationRequired === true ||
    signals.requiresValidation === true) &&
  (signals.validationStatus === undefined ||
    signals.validationStatus === "not_run" ||
    signals.validationStatus === "stale" ||
    signals.validationStatus === "running" ||
    signals.validationStatus === "unknown");

const hasGitStateEvidence = (signals: StepHarborSignals): boolean =>
  signals.repoIntegrityStatus !== undefined ||
  signals.branchRisk !== undefined ||
  signals.currentBranch !== undefined ||
  signals.isDirtyWorktree !== undefined ||
  signals.hasUncommittedChanges !== undefined ||
  signals.hasUntrackedFiles !== undefined;

const hasWorkspaceBoundaryEvidence = (signals: StepHarborSignals): boolean =>
  signals.workspaceBoundaryViolation === true ||
  signals.workspaceBoundaryStatus === "inside" ||
  signals.workspaceBoundaryStatus === "outside" ||
  signals.workspaceBoundaryStatus === "not_applicable";

const hasRecoveryEvidence = (signals: StepHarborSignals): boolean =>
  hasGitStateEvidence(signals) ||
  hasWorkspaceBoundaryEvidence(signals) ||
  signals.validationStatus === "passed" ||
  signals.targetFileFreshness === "fresh" ||
  signals.currentFileHash !== undefined ||
  signals.lastReadHash !== undefined;

const isCriticalRecoveryRisk = (signals: StepHarborSignals): boolean =>
  signals.destructiveSeverity === "critical" ||
  (signals.destructiveScore !== undefined && signals.destructiveScore >= 0.8) ||
  signals.commandRiskScore === "critical" ||
  signals.workspaceBoundaryViolation === true;

const isDeleteOperation = (signals: StepHarborSignals): boolean =>
  signals.destructiveSubtype?.toLowerCase().includes("delete") === true ||
  signals.destructiveSubtype?.toLowerCase().includes("clean") === true;

const isOverwriteOperation = (signals: StepHarborSignals): boolean =>
  signals.destructiveSubtype?.toLowerCase().includes("overwrite") === true ||
  signals.destructiveSubtype?.toLowerCase().includes("reset") === true;

const mapContextSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (signals.targetFileReadRecently === false) {
    updateDimension(dimensions, "context", {
      score: 0.65,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["target_file_not_observed"],
      missingEvidence: ["target_file_observed"]
    });
  } else if (signals.targetFileReadRecently === true) {
    updateDimension(dimensions, "context", {
      evidence: ["target_file_observed"]
    });
  }

  if (
    signals.relatedTestsFound === true &&
    signals.relatedTestsRead === false
  ) {
    updateDimension(dimensions, "context", {
      score: 0.55,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["related_tests_not_observed"],
      evidence: ["related_tests_missing"],
      missingEvidence: ["related_tests_observed"]
    });
  } else if (signals.relatedTestsRead === true) {
    updateDimension(dimensions, "context", {
      evidence: ["related_tests_observed"]
    });
  }

  if (
    signals.contextCompletenessScore !== undefined &&
    signals.contextCompletenessScore < 0.5
  ) {
    updateDimension(dimensions, "context", {
      score: 0.7,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["context_completeness_low"],
      missingEvidence: ["related_context_missing"]
    });
  } else if (
    signals.contextCompletenessScore !== undefined &&
    signals.contextCompletenessScore < 0.7
  ) {
    updateDimension(dimensions, "context", {
      score: 0.45,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["context_completeness_medium"],
      missingEvidence: ["related_context_missing"]
    });
  } else if (signals.contextCompletenessScore !== undefined) {
    updateDimension(dimensions, "context", {
      evidence: ["related_context_observed"]
    });
  }
};

const mapFreshnessSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  switch (signals.targetFileFreshness) {
    case "fresh":
      updateDimension(dimensions, "freshness", {
        evidence: ["target_file_hash_available"]
      });
      break;
    case "stale":
      updateDimension(dimensions, "freshness", {
        score: 0.7,
        impact: "high",
        reducibility: "reducible",
        drivers: [
          "target_file_stale",
          ...(signals.fileChangedSinceRead === true
            ? ["target_file_hash_changed"]
            : [])
        ],
        evidence:
          signals.lastReadHash !== undefined ||
          signals.currentFileHash !== undefined
            ? ["target_file_hash_available"]
            : [],
        missingEvidence: ["target_file_current_hash_refresh_required"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "freshness", {
        score: 0.6,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["target_file_freshness_unknown"],
        missingEvidence: ["target_file_hash_missing"]
      });
      break;
    case "missing":
      updateDimension(dimensions, "freshness", {
        score: 0.6,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["target_file_missing"],
        missingEvidence: ["target_file_hash_missing"]
      });
      break;
    case undefined:
      break;
  }
};

const mapValidationSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (signals.validationRequired === false) {
    updateDimension(dimensions, "validation", {
      evidence: ["validation_not_required"]
    });
    return;
  }

  switch (signals.validationStatus) {
    case "passed":
      updateDimension(dimensions, "validation", {
        evidence: ["validation_result_available"]
      });
      break;
    case "failed":
      updateDimension(dimensions, "validation", {
        score: 0.85,
        impact: "critical",
        reducibility: "reducible",
        drivers: ["validation_failed"],
        evidence: ["validation_result_available", "validation_result_failed"]
      });
      break;
    case "not_run":
      updateDimension(dimensions, "validation", {
        score: 0.65,
        impact: "high",
        reducibility: "reducible",
        drivers: ["validation_missing"],
        missingEvidence: ["validation_result_missing"]
      });
      break;
    case "stale":
      updateDimension(dimensions, "validation", {
        score: 0.6,
        impact: "high",
        reducibility: "reducible",
        drivers: ["validation_stale"],
        missingEvidence: ["validation_result_freshness_missing"]
      });
      break;
    case "running":
      updateDimension(dimensions, "validation", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["validation_running"],
        missingEvidence: ["validation_result_missing"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "validation", {
        score: 0.5,
        impact: "medium",
        reducibility: "reducible",
        drivers: [
          signals.validationScope === "unknown"
            ? "validation_target_unclear"
            : "validation_unknown"
        ],
        missingEvidence: ["validation_result_missing"]
      });
      break;
    case undefined:
      break;
  }

  if (
    signals.requiresValidation === true &&
    signals.validationStatus === undefined
  ) {
    updateDimension(dimensions, "validation", {
      score: 0.5,
      impact: "high",
      reducibility: "reducible",
      drivers: ["validation_target_unclear"],
      missingEvidence: ["validation_result_missing"]
    });
  }
};

const mapCommandSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  switch (signals.commandRiskScore) {
    case "critical":
      updateDimension(dimensions, "command", {
        score: 0.85,
        impact: "critical",
        reducibility: "partially_reducible",
        drivers: ["command_risk_critical"],
        evidence: ["command_classified"]
      });
      break;
    case "high":
      updateDimension(dimensions, "command", {
        score: 0.65,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["command_risk_high"],
        evidence: ["command_classified"]
      });
      break;
    case "medium":
      updateDimension(dimensions, "command", {
        evidence: ["command_classified", "command_risk_medium"]
      });
      break;
    case "low":
      updateDimension(dimensions, "command", {
        evidence: ["command_classified", "command_risk_low"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "command", {
        score: 0.45,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["command_classification_unknown"],
        missingEvidence: ["command_classification_missing"]
      });
      break;
    case undefined:
      break;
  }

  if (signals.pipeToShell === true) {
    updateDimension(dimensions, "command", {
      score: 0.85,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["pipe_to_shell_detected"],
      evidence: ["command_classified"]
    });
  }

  if (signals.usesSudo === true) {
    updateDimension(dimensions, "command", {
      score: 0.65,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["privileged_command_detected"],
      evidence: ["command_classified"]
    });
  }

  if (signals.destructiveOperation === true) {
    const critical =
      signals.destructiveSeverity === "critical" ||
      signals.commandRiskScore === "critical";

    updateDimension(dimensions, "command", {
      score: critical ? 0.85 : 0.65,
      impact: critical ? "critical" : "high",
      reducibility: "partially_reducible",
      drivers: ["destructive_command_detected"],
      evidence: ["command_classified"]
    });
  }

  if (signals.networkExposure === true) {
    updateDimension(dimensions, "command", {
      evidence: ["network_command_detected"]
    });
  }

  if (signals.gitCommandCategory !== undefined) {
    updateDimension(dimensions, "command", {
      evidence: ["git_command_detected"]
    });
  }

  if (
    signals.commandCategory === "validation" ||
    signals.latestValidationKind !== undefined
  ) {
    updateDimension(dimensions, "command", {
      evidence: ["validation_command_detected"]
    });
  }

  if (
    signals.landingActionType === "deploy" ||
    signals.deploymentRisk !== undefined ||
    signals.mutatesCloud === true
  ) {
    updateDimension(dimensions, "command", {
      score:
        signals.deploymentRisk === "critical"
          ? 0.8
          : signals.deploymentRisk === "high"
            ? 0.65
            : 0.55,
      impact:
        signals.deploymentRisk === "critical"
          ? "critical"
          : signals.deploymentRisk === "high"
            ? "high"
            : "medium",
      reducibility: "reducible",
      drivers: ["deployment_command_detected"],
      evidence: ["command_classified"]
    });
  }

  if (
    signals.commandCategory === "local_write" &&
    signals.networkExposure === true
  ) {
    updateDimension(dimensions, "command", {
      score: 0.55,
      impact: "high",
      reducibility: "reducible",
      drivers: [
        "package_script_unknown",
        "package_script_classification_missing"
      ],
      evidence: ["command_classified"],
      missingEvidence: ["package_script_classified"]
    });
  }
};

const mapSensitivitySignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (signals.pathSensitivity === "critical") {
    updateDimension(dimensions, "sensitivity", {
      score: 0.75,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["sensitive_path_detected", "sensitive_surface_detected"],
      evidence: ["path_sensitivity_available", "sensitive_surface_classified"]
    });
  } else if (signals.pathSensitivity === "high") {
    updateDimension(dimensions, "sensitivity", {
      score: 0.6,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["sensitive_path_detected", "sensitive_surface_detected"],
      evidence: ["path_sensitivity_available", "sensitive_surface_classified"]
    });
  } else if (
    signals.pathSensitivity === "medium" ||
    signals.pathSensitivity === "low"
  ) {
    updateDimension(dimensions, "sensitivity", {
      evidence: ["path_sensitivity_available", "sensitive_surface_classified"]
    });
  }

  if (signals.secretPathMatch === true) {
    updateDimension(dimensions, "sensitivity", {
      score: 0.85,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["secret_path_detected"],
      evidence: ["secret_scan_available"]
    });
  }

  if (
    signals.secretPatternMatch === true ||
    signals.entropyAnomaly === true ||
    signals.commandContainsSecret === true ||
    signals.diffContainsSecret === true ||
    signals.promptContextContainsSecret === true
  ) {
    updateDimension(dimensions, "sensitivity", {
      score: 0.85,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["secret_pattern_detected"],
      evidence: ["secret_scan_available"]
    });
  }

  if (
    signals.secretTouch === "probable" ||
    signals.secretTouch === "confirmed"
  ) {
    updateDimension(dimensions, "sensitivity", {
      score: signals.secretTouch === "confirmed" ? 0.85 : 0.75,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["secret_material_detected"],
      evidence: ["secret_scan_available"]
    });
  } else if (signals.secretTouch === "possible") {
    updateDimension(dimensions, "sensitivity", {
      score: 0.45,
      impact: "high",
      reducibility: "reducible",
      drivers: ["secret_material_possible"],
      evidence: ["secret_scan_available"]
    });
  }

  if (!hasReviewableSensitiveSurface(signals) || hasSecretSurface(signals)) {
    return;
  }

  if (hasMissingSensitiveContext(signals)) {
    updateDimension(dimensions, "sensitivity", {
      score: 0.7,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: [
        "sensitive_context_missing",
        "sensitive_surface_context_incomplete"
      ],
      missingEvidence: ["sensitive_context_available"]
    });
  } else if (hasAvailableSensitiveContext(signals)) {
    updateDimension(dimensions, "sensitivity", {
      score: 0.65,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["sensitive_change_review_required"],
      evidence: ["sensitive_context_available"]
    });
  }

  if (hasMissingSensitiveValidation(signals)) {
    updateDimension(dimensions, "sensitivity", {
      score: 0.7,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["sensitive_validation_missing"],
      missingEvidence: ["validation_result_missing"]
    });
  } else if (signals.validationStatus === "passed") {
    updateDimension(dimensions, "sensitivity", {
      evidence: ["sensitive_validation_available"]
    });
  }
};

const mapWorkspaceBoundarySignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (signals.workspaceBoundaryViolation === true) {
    updateDimension(dimensions, "workspace_boundary", {
      score: 0.9,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["workspace_boundary_violation"],
      evidence: ["workspace_boundary_checked"]
    });
    return;
  }

  switch (signals.workspaceBoundaryStatus) {
    case "inside":
    case "not_applicable":
      updateDimension(dimensions, "workspace_boundary", {
        evidence: ["workspace_boundary_checked"]
      });
      break;
    case "outside":
      updateDimension(dimensions, "workspace_boundary", {
        score: 0.9,
        impact: "critical",
        reducibility: "partially_reducible",
        drivers: ["workspace_boundary_violation"],
        evidence: ["workspace_boundary_checked"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "workspace_boundary", {
        score: 0.55,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["workspace_boundary_unknown"],
        missingEvidence: ["workspace_boundary_check_missing"]
      });
      break;
    case undefined:
      break;
  }
};

const mapGitWorkflowSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (signals.forcePush === true) {
    updateDimension(dimensions, "git_workflow", {
      score: 0.85,
      impact: "critical",
      reducibility: "partially_reducible",
      drivers: ["force_push_detected"],
      evidence: ["git_state_available"]
    });
  }

  if (signals.hookBypass === true) {
    updateDimension(dimensions, "git_workflow", {
      score: 0.75,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["hook_bypass_detected"],
      evidence: ["git_state_available"]
    });
  }

  if (
    signals.protectedBranch === true ||
    signals.directMainlineCommit === true ||
    signals.directMainlinePush === true
  ) {
    updateDimension(dimensions, "git_workflow", {
      score: signals.directMainlinePush === true ? 0.85 : 0.65,
      impact: signals.directMainlinePush === true ? "critical" : "high",
      reducibility: "partially_reducible",
      drivers: [
        "protected_branch_risk",
        ...(signals.directMainlineCommit === true ||
        signals.directMainlinePush === true
          ? ["direct_mainline_risk"]
          : [])
      ],
      evidence: ["git_state_available"]
    });
  }

  if (signals.landingAction === true) {
    updateDimension(dimensions, "git_workflow", {
      score:
        signals.landingRisk === "critical"
          ? 0.85
          : signals.landingRisk === "high"
            ? 0.65
            : 0.35,
      impact:
        signals.landingRisk === "critical"
          ? "critical"
          : signals.landingRisk === "high"
            ? "high"
            : "medium",
      reducibility: "partially_reducible",
      drivers: ["landing_action_detected"],
      evidence: ["git_state_available"]
    });
  }

  if (signals.isDirtyWorktree === true) {
    updateDimension(dimensions, "git_workflow", {
      score: 0.35,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["dirty_worktree_detected"],
      evidence: ["git_state_available"]
    });
  }

  switch (signals.branchRisk) {
    case "critical":
      updateDimension(dimensions, "git_workflow", {
        score: 0.85,
        impact: "critical",
        reducibility: "partially_reducible",
        drivers: ["git_workflow_risk_critical"],
        evidence: ["git_state_available"]
      });
      break;
    case "high":
      updateDimension(dimensions, "git_workflow", {
        score: 0.65,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["git_workflow_risk_high"],
        evidence: ["git_state_available"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "git_workflow", {
        score: 0.55,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["git_state_unknown"],
        missingEvidence: ["git_state_missing"]
      });
      break;
    case "medium":
    case "low":
      updateDimension(dimensions, "git_workflow", {
        evidence: ["git_state_available"]
      });
      break;
    case undefined:
      break;
  }
};

const mapEnvironmentSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  switch (signals.environmentClassification) {
    case "production":
      updateDimension(dimensions, "environment", {
        score: 0.8,
        impact: "critical",
        reducibility: "partially_reducible",
        drivers: [
          "production_environment_detected",
          "environment_risk_critical"
        ],
        evidence: ["environment_classified"]
      });
      break;
    case "staging":
      updateDimension(dimensions, "environment", {
        score: 0.2,
        impact: "medium",
        reducibility: "partially_reducible",
        evidence: ["environment_classified", "staging_environment_detected"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "environment", {
        score: 0.65,
        impact: "high",
        reducibility: "reducible",
        drivers: [
          "environment_unknown",
          ...(signals.landingActionType === "deploy"
            ? ["deploy_target_ambiguous"]
            : [])
        ],
        missingEvidence: [
          "environment_classified",
          "environment_classification_missing",
          ...(signals.landingActionType === "deploy"
            ? ["deploy_target_classified"]
            : [])
        ]
      });
      break;
    case "dev":
      updateDimension(dimensions, "environment", {
        evidence: ["environment_classified", "local_environment_detected"]
      });
      break;
    case undefined:
      break;
  }

  if (
    signals.landingAction === true &&
    signals.environmentClassification === undefined
  ) {
    updateDimension(dimensions, "environment", {
      score: 0.45,
      impact: "medium",
      reducibility: "reducible",
      drivers: [
        "environment_unknown",
        ...(signals.landingActionType === "deploy"
          ? ["deploy_target_ambiguous"]
          : [])
      ],
      missingEvidence: [
        "environment_classified",
        "environment_classification_missing",
        ...(signals.landingActionType === "deploy"
          ? ["deploy_target_classified"]
          : [])
      ]
    });
  }

  if (signals.landingActionType === "deploy") {
    updateDimension(dimensions, "environment", {
      score:
        signals.deploymentRisk === "critical"
          ? 0.8
          : signals.deploymentRisk === "high"
            ? 0.65
            : 0.45,
      impact:
        signals.deploymentRisk === "critical"
          ? "critical"
          : signals.deploymentRisk === "high"
            ? "high"
            : "medium",
      reducibility: "partially_reducible",
      drivers: [
        "landing_action_detected",
        "deployment_command_detected",
        ...(signals.environmentClassification === undefined ||
        signals.environmentClassification === "unknown"
          ? ["deploy_target_ambiguous"]
          : []),
        ...(signals.deploymentRisk === "critical"
          ? ["environment_risk_critical"]
          : signals.deploymentRisk === "high"
            ? ["environment_risk_high"]
            : [])
      ],
      evidence:
        signals.environmentClassification !== undefined &&
        signals.environmentClassification !== "unknown"
          ? ["environment_classified"]
          : [],
      missingEvidence:
        signals.environmentClassification === undefined ||
        signals.environmentClassification === "unknown"
          ? ["deploy_target_classified"]
          : []
    });
  }

  if (signals.landingActionType === "release") {
    updateDimension(dimensions, "environment", {
      score: signals.releaseRisk === "critical" ? 0.8 : 0.65,
      impact: signals.releaseRisk === "critical" ? "critical" : "high",
      reducibility: "partially_reducible",
      drivers: [
        "release_surface_detected",
        ...(signals.releaseRisk === "critical"
          ? ["environment_risk_critical"]
          : ["environment_risk_high"])
      ],
      evidence: ["environment_classified"]
    });
  }

  if (signals.landingActionType === "publish") {
    updateDimension(dimensions, "environment", {
      score: signals.releaseRisk === "critical" ? 0.8 : 0.65,
      impact: signals.releaseRisk === "critical" ? "critical" : "high",
      reducibility: "partially_reducible",
      drivers: [
        "publish_surface_detected",
        "package_publish_detected",
        ...(signals.releaseRisk === "critical"
          ? ["environment_risk_critical"]
          : ["environment_risk_high"])
      ],
      evidence: ["environment_classified"]
    });
  }
};

const mapRecoverySignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  if (hasGitStateEvidence(signals)) {
    updateDimension(dimensions, "recovery", {
      evidence: [
        "git_state_available",
        "git_tracking_available",
        ...(signals.isDirtyWorktree === false ||
        signals.repoIntegrityStatus === "clean"
          ? ["git_worktree_clean"]
          : []),
        ...(signals.isDirtyWorktree === true ||
        signals.repoIntegrityStatus === "dirty"
          ? ["git_worktree_dirty"]
          : [])
      ]
    });
  }

  if (hasWorkspaceBoundaryEvidence(signals)) {
    updateDimension(dimensions, "recovery", {
      evidence: ["workspace_boundary_checked"]
    });
  } else if (
    signals.destructiveOperation === true &&
    signals.workspaceBoundaryStatus === "unknown"
  ) {
    updateDimension(dimensions, "recovery", {
      score: 0.65,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["workspace_recovery_boundary_unknown"],
      missingEvidence: ["workspace_boundary_checked"]
    });
  }

  if (signals.validationStatus === "passed") {
    updateDimension(dimensions, "recovery", {
      evidence: [
        "validation_result_available",
        "validation_recovery_evidence_available"
      ]
    });
  } else if (
    signals.destructiveOperation === true &&
    (signals.validationRequired === true || signals.requiresValidation === true)
  ) {
    updateDimension(dimensions, "recovery", {
      score: 0.55,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["validation_recovery_evidence_missing"],
      missingEvidence: ["validation_result_available"]
    });
  }

  if (
    signals.targetFileFreshness === "fresh" ||
    signals.currentFileHash !== undefined ||
    signals.lastReadHash !== undefined
  ) {
    updateDimension(dimensions, "recovery", {
      evidence: ["target_file_hash_available"]
    });
  }

  if (signals.destructiveOperation === true) {
    const recoveryEvidenceAvailable = hasRecoveryEvidence(signals);
    const criticalRecoveryRisk = isCriticalRecoveryRisk(signals);

    updateDimension(dimensions, "recovery", {
      score: criticalRecoveryRisk
        ? 0.85
        : recoveryEvidenceAvailable
          ? 0.45
          : 0.65,
      impact: criticalRecoveryRisk ? "critical" : "high",
      reducibility: "partially_reducible",
      drivers: [
        "destructive_file_change_detected",
        ...(isDeleteOperation(signals) ? ["delete_operation_detected"] : []),
        ...(isOverwriteOperation(signals)
          ? ["overwrite_operation_detected"]
          : []),
        ...(criticalRecoveryRisk ? ["irreversible_operation_risk"] : []),
        ...(recoveryEvidenceAvailable
          ? ["rollback_confidence_medium"]
          : [
              "recovery_state_unknown",
              "rollback_confidence_unknown",
              "destructive_operation_recovery_unknown",
              "recovery_checkpoint_missing",
              "git_tracking_unknown"
            ])
      ],
      evidence: recoveryEvidenceAvailable
        ? ["recovery_state_classified", "rollback_confidence_medium"]
        : [],
      missingEvidence: recoveryEvidenceAvailable
        ? []
        : ["recovery_checkpoint_available", "recovery_state_classified"]
    });
  }
};

const hasAutonomyBudgetInput = (
  input: AutonomyBudgetProfileInput | undefined
): boolean =>
  input !== undefined &&
  Object.values(input).some((value) => value !== undefined);

const mapAutonomyBudgetSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals,
  autonomyBudget: AutonomyBudgetProfileInput | undefined
): void => {
  const status =
    autonomyBudget?.autonomyBudgetStatus ?? signals.autonomyBudgetStatus;
  const relevant =
    autonomyBudget?.relevant === true ||
    status !== undefined ||
    hasAutonomyBudgetInput(autonomyBudget);

  if (!relevant) {
    return;
  }

  switch (status) {
    case "exceeded":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.85,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["autonomy_budget_exceeded"],
        evidence: ["autonomy_budget_available"],
        missingEvidence: ["progress_state_missing"]
      });
      break;
    case "warning":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.65,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["autonomy_budget_warning"],
        evidence: ["autonomy_budget_available"],
        missingEvidence: ["progress_state_missing", "action_scope_missing"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["autonomy_budget_unknown", "autonomy_budget_not_tracked"],
        missingEvidence: [
          "autonomy_budget_missing",
          "autonomy_budget_not_tracked"
        ]
      });
      break;
    case "ok":
      updateDimension(dimensions, "autonomy_budget", {
        evidence: ["autonomy_budget_available"]
      });
      break;
    case undefined:
      if (autonomyBudget?.relevant === true) {
        updateDimension(dimensions, "autonomy_budget", {
          score: 0.35,
          impact: "medium",
          reducibility: "reducible",
          drivers: ["autonomy_budget_unknown", "autonomy_budget_not_tracked"],
          missingEvidence: ["autonomy_budget_missing"]
        });
      }
      break;
  }

  switch (autonomyBudget?.retryBudgetStatus) {
    case "exceeded":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.85,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["retry_budget_exceeded"],
        evidence: ["retry_count_available"],
        missingEvidence: ["progress_state_missing"]
      });
      break;
    case "warning":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.65,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["retry_budget_warning"],
        evidence: ["retry_count_available"],
        missingEvidence: ["progress_state_missing", "action_scope_missing"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["retry_count_unknown"],
        missingEvidence: ["retry_count_missing"]
      });
      break;
    case "ok":
      updateDimension(dimensions, "autonomy_budget", {
        evidence: ["retry_count_available"]
      });
      break;
    case undefined:
      break;
  }

  if (autonomyBudget?.retryCount !== undefined) {
    updateDimension(dimensions, "autonomy_budget", {
      evidence: ["retry_count_available"],
      ...(autonomyBudget.retryCount >= 3
        ? {
            score: 0.65,
            impact: "medium" as const,
            reducibility: "reducible" as const,
            drivers: ["retry_count_high"],
            missingEvidence: ["progress_state_missing"]
          }
        : {})
    });
  }

  if (autonomyBudget?.repeatedDeferCount !== undefined) {
    updateDimension(dimensions, "autonomy_budget", {
      evidence: ["repeated_defer_count_available"],
      ...(autonomyBudget.repeatedDeferCount >= 2
        ? {
            score: 0.7,
            impact: "high" as const,
            reducibility: "partially_reducible" as const,
            drivers: ["repeated_defer_detected"],
            missingEvidence: ["progress_state_missing"]
          }
        : {})
    });
  }

  if (autonomyBudget?.repeatedDeferLimitReached === true) {
    updateDimension(dimensions, "autonomy_budget", {
      score: 0.85,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["repeated_defer_limit_reached"],
      evidence: ["repeated_defer_count_available"],
      missingEvidence: ["progress_state_missing"]
    });
  }

  if (
    autonomyBudget?.noNetProgress === true ||
    autonomyBudget?.progressState === "no_progress"
  ) {
    updateDimension(dimensions, "autonomy_budget", {
      score: 0.75,
      impact: "high",
      reducibility: "partially_reducible",
      drivers: ["no_net_progress_detected"],
      evidence: ["progress_state_available"],
      missingEvidence: ["action_scope_missing"]
    });
  } else if (autonomyBudget?.progressState === "progress") {
    updateDimension(dimensions, "autonomy_budget", {
      evidence: ["progress_state_available"]
    });
  } else if (autonomyBudget?.progressState === "unknown") {
    updateDimension(dimensions, "autonomy_budget", {
      score: 0.45,
      impact: "medium",
      reducibility: "reducible",
      drivers: ["no_progress_evidence_missing"],
      missingEvidence: ["progress_state_missing"]
    });
  }

  switch (autonomyBudget?.actionScope) {
    case "broad":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.55,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["action_scope_too_broad"],
        evidence: ["action_scope_classified"]
      });
      break;
    case "narrow":
      updateDimension(dimensions, "autonomy_budget", {
        evidence: ["action_scope_classified"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        missingEvidence: ["action_scope_missing"]
      });
      break;
    case undefined:
      break;
  }

  switch (autonomyBudget?.diffChurn) {
    case "high":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.65,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["diff_churn_high"],
        evidence: ["diff_churn_classified"]
      });
      break;
    case "low":
      updateDimension(dimensions, "autonomy_budget", {
        evidence: ["diff_churn_classified"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["diff_churn_unknown"],
        missingEvidence: ["diff_churn_missing"]
      });
      break;
    case undefined:
      break;
  }

  switch (autonomyBudget?.contextBudgetStatus) {
    case "exceeded":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.85,
        impact: "high",
        reducibility: "partially_reducible",
        drivers: ["context_budget_exceeded"],
        evidence: ["context_budget_available"],
        missingEvidence: ["progress_state_missing"]
      });
      break;
    case "warning":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.65,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["context_budget_warning"],
        evidence: ["context_budget_available"],
        missingEvidence: ["action_scope_missing"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "autonomy_budget", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["context_budget_unknown"],
        missingEvidence: ["context_budget_missing"]
      });
      break;
    case "ok":
      updateDimension(dimensions, "autonomy_budget", {
        evidence: ["context_budget_available"]
      });
      break;
    case undefined:
      break;
  }
};

const mapProvenanceSignals = (
  dimensions: UncertaintyDimensionsRecord,
  signals: StepHarborSignals
): void => {
  switch (signals.delegationProvenance) {
    case "untrusted":
      updateDimension(dimensions, "provenance", {
        score: 0.75,
        impact: "high",
        reducibility: "reducible",
        drivers: [
          "provenance_untrusted",
          "delegated_action_provenance_unknown"
        ],
        missingEvidence: ["provenance_trust_missing"]
      });
      break;
    case "partial":
      updateDimension(dimensions, "provenance", {
        score: 0.35,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["provenance_partial"],
        evidence: ["provenance_available"],
        missingEvidence: ["provenance_trust_missing"]
      });
      break;
    case "unknown":
      updateDimension(dimensions, "provenance", {
        score: 0.45,
        impact: "medium",
        reducibility: "reducible",
        drivers: ["provenance_unknown", "delegated_action_provenance_unknown"],
        missingEvidence: ["provenance_not_tracked"]
      });
      break;
    case "trusted":
      updateDimension(dimensions, "provenance", {
        evidence: ["provenance_available"]
      });
      break;
    case undefined:
      break;
  }
};

export const buildUncertaintyProfile = (
  input: BuildUncertaintyProfileInput = {}
): UncertaintyProfile => {
  const dimensions = createDefaultUncertaintyDimensions();
  const signals = input.signals ?? {};

  mapContextSignals(dimensions, signals);
  mapFreshnessSignals(dimensions, signals);
  mapValidationSignals(dimensions, signals);
  mapCommandSignals(dimensions, signals);
  mapSensitivitySignals(dimensions, signals);
  mapWorkspaceBoundarySignals(dimensions, signals);
  mapGitWorkflowSignals(dimensions, signals);
  mapEnvironmentSignals(dimensions, signals);
  mapRecoverySignals(dimensions, signals);
  mapAutonomyBudgetSignals(dimensions, signals, input.autonomyBudget);
  mapProvenanceSignals(dimensions, signals);

  const overallScore = combineDimensionScores(dimensions);
  const uncertaintyReductionPlan = buildUncertaintyReductionPlan(dimensions);

  return uncertaintyProfileSchema.parse({
    schemaVersion: uncertaintyProfileSchemaVersion,
    overallScore,
    overallLevel: deriveOverallLevel(overallScore),
    impact: deriveOverallImpact(dimensions),
    reducibility: deriveOverallReducibility(dimensions),
    topDrivers: topDriversFromDimensions(dimensions),
    dimensions,
    ...(uncertaintyReductionPlan !== undefined
      ? { uncertaintyReductionPlan }
      : {})
  });
};
