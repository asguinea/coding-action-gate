import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { PolicyRule, PolicyTraceEntry } from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";

export type DecisionSignals = CodingActionGateSignals & Record<string, unknown>;

export type EvaluationContext = Record<string, unknown>;

export interface RuleEvaluationResult {
  rule: PolicyRule;
  matched: boolean;
  trace: PolicyTraceEntry;
}

const signalKeyMap: Record<string, string> = {
  pathSensitivity: "path_sensitivity",
  pathSensitivityReason: "path_sensitivity_reason",
  matchedSensitivePath: "matched_sensitive_path",
  matchedSensitivePathLevel: "matched_sensitive_path_level",
  sensitivePathMatches: "sensitive_path_matches",
  commandRiskScore: "command_risk_score",
  commandCategory: "command_category",
  commandRiskReason: "command_risk_reason",
  pipeToShell: "pipe_to_shell",
  downloadsRemoteCode: "downloads_remote_code",
  usesSudo: "uses_sudo",
  usesEval: "uses_eval",
  forcePush: "force_push",
  hookBypass: "hook_bypass",
  destructiveOperation: "destructive_operation",
  destructiveSubtype: "destructive_subtype",
  destructiveSeverity: "destructive_severity",
  destructiveReason: "destructive_reason",
  destructiveScore: "destructive_score",
  mutatesFilesystem: "mutates_filesystem",
  mutatesGit: "mutates_git",
  mutatesDatabase: "mutates_database",
  mutatesCloud: "mutates_cloud",
  networkExposure: "network_exposure",
  externalUrlSource: "external_url_source",
  workspaceBoundaryViolation: "workspace_boundary_violation",
  workspaceBoundaryStatus: "workspace_boundary_status",
  workspaceBoundaryReason: "workspace_boundary_reason",
  secretTouch: "secret_touch",
  secretPathMatch: "secret_path_match",
  secretPatternMatch: "secret_pattern_match",
  entropyAnomaly: "entropy_anomaly",
  credentialFileType: "credential_file_type",
  outputRedactionRequired: "output_redaction_required",
  commandContainsSecret: "command_contains_secret",
  diffContainsSecret: "diff_contains_secret",
  promptContextContainsSecret: "prompt_context_contains_secret",
  secretDetectionReason: "secret_detection_reason",
  matchedSecretPatterns: "matched_secret_patterns",
  targetFileReadRecently: "target_file_read_recently",
  fileChangedSinceRead: "file_changed_since_read",
  lastReadTimestamp: "last_read_timestamp",
  lastReadHash: "last_read_hash",
  currentFileHash: "current_file_hash",
  readBeforeWriteReason: "read_before_write_reason",
  targetFileFreshness: "target_file_freshness",
  contextCompletenessScore: "context_completeness_score",
  dependencyClosureScore: "dependency_closure_score",
  relatedTestsFound: "related_tests_found",
  relatedTestsRead: "related_tests_read",
  relatedTestPaths: "related_test_paths",
  callersFound: "callers_found",
  callersRead: "callers_read",
  configRead: "config_read",
  relatedContextReason: "related_context_reason",
  validationRequired: "validation_required",
  validationStatus: "validation_status",
  validationAge: "validation_age",
  validationScope: "validation_scope",
  requiredValidationCommands: "required_validation_commands",
  latestValidationCommand: "latest_validation_command",
  latestValidationKind: "latest_validation_kind",
  latestValidationExitCode: "latest_validation_exit_code",
  validationPolicyMatch: "validation_policy_match",
  validationReason: "validation_reason",
  currentBranch: "current_branch",
  protectedBranch: "protected_branch",
  upstreamBranch: "upstream_branch",
  remoteTarget: "remote_target",
  branchRisk: "branch_risk",
  isDetachedHead: "is_detached_head",
  isDirtyWorktree: "is_dirty_worktree",
  hasUncommittedChanges: "has_uncommitted_changes",
  hasUntrackedFiles: "has_untracked_files",
  repoIntegrityStatus: "repo_integrity_status",
  gitCommandCategory: "git_command_category",
  directMainlineCommit: "direct_mainline_commit",
  directMainlinePush: "direct_mainline_push",
  requiredPrWorkflow: "required_pr_workflow",
  gitWorkflowReason: "git_workflow_reason",
  landingAction: "landing_action",
  landingActionType: "landing_action_type",
  landingRisk: "landing_risk",
  landingReason: "landing_reason",
  requiresValidation: "requires_validation",
  requiresCleanWorktree: "requires_clean_worktree",
  requiresHumanApproval: "requires_human_approval",
  deploymentRisk: "deployment_risk",
  releaseRisk: "release_risk",
  environmentClassification: "environment_classification",
  autonomyBudgetStatus: "autonomy_budget_status",
  delegationProvenance: "delegation_provenance"
};

const maybeSet = (
  context: EvaluationContext,
  key: string,
  value: unknown
): void => {
  if (value !== undefined) {
    context[key] = value;
  }
};

const actionTargetPath = (
  action: NormalizedCodingActionGateAction
): string | undefined =>
  "targetPath" in action && typeof action.targetPath === "string"
    ? action.targetPath
    : undefined;

const actionCommand = (
  action: NormalizedCodingActionGateAction
): string | undefined =>
  "command" in action && typeof action.command === "string"
    ? action.command
    : undefined;

const actionMutatesFilesystem = (
  action: NormalizedCodingActionGateAction
): boolean | undefined => {
  if (
    action.type === "write_file" ||
    action.type === "edit_file" ||
    action.type === "delete_file"
  ) {
    return true;
  }

  if (action.type === "read_file") {
    return false;
  }

  return undefined;
};

export const buildEvaluationContext = (
  action: NormalizedCodingActionGateAction,
  signals: DecisionSignals = {}
): EvaluationContext => {
  const context: EvaluationContext = { ...signals };

  for (const [camelKey, snakeKey] of Object.entries(signalKeyMap)) {
    maybeSet(context, snakeKey, signals[camelKey]);
  }

  maybeSet(context, "action_type", action.type);
  maybeSet(context, "target_path", actionTargetPath(action));
  maybeSet(context, "target_paths", action.normalized.targetPaths);
  maybeSet(context, "command", actionCommand(action));
  maybeSet(context, "normalized_action_type", action.normalized.actionType);
  maybeSet(context, "normalized_target_path", action.normalized.targetPath);
  maybeSet(
    context,
    "normalized_relative_target_path",
    action.normalized.relativeTargetPath
  );
  maybeSet(context, "command_executable", action.normalized.commandExecutable);
  maybeSet(context, "is_git_like_command", action.normalized.isGitLikeCommand);
  maybeSet(
    context,
    "is_validation_like_command",
    action.normalized.isValidationLikeCommand
  );

  maybeSet(
    context,
    "mutates_filesystem",
    signals["mutates_filesystem"] ?? actionMutatesFilesystem(action)
  );
  maybeSet(context, "force_push", signals["force_push"]);
  maybeSet(context, "hook_bypass", signals["hook_bypass"]);

  return context;
};

const numericThresholdPattern = /^(<|<=|>|>=|==)\s*(-?\d+(?:\.\d+)?)$/;

const matchesNumericThreshold = (
  actual: unknown,
  expected: string
): boolean | undefined => {
  if (typeof actual !== "number") {
    return undefined;
  }

  const match = numericThresholdPattern.exec(expected);

  if (match === null) {
    return undefined;
  }

  const [, operator, rawThreshold] = match;
  const threshold = Number(rawThreshold);

  switch (operator) {
    case "<":
      return actual < threshold;
    case "<=":
      return actual <= threshold;
    case ">":
      return actual > threshold;
    case ">=":
      return actual >= threshold;
    case "==":
      return actual === threshold;
    default:
      return undefined;
  }
};

export const ruleConditionMatches = (
  actual: unknown,
  expected: unknown
): boolean => {
  if (actual === undefined) {
    return false;
  }

  if (typeof expected === "string") {
    const thresholdResult = matchesNumericThreshold(actual, expected);

    if (thresholdResult !== undefined) {
      return thresholdResult;
    }
  }

  if (Array.isArray(expected)) {
    if (Array.isArray(actual)) {
      return actual.some((actualValue) => expected.includes(actualValue));
    }

    return expected.includes(actual);
  }

  return actual === expected;
};

export const evaluateRule = (
  rule: PolicyRule,
  context: EvaluationContext
): RuleEvaluationResult => {
  const matched = Object.entries(rule.when).every(([key, expected]) =>
    ruleConditionMatches(context[key], expected)
  );

  return {
    rule,
    matched,
    trace: {
      ruleId: rule.id,
      matched,
      ...(matched
        ? {
            effect: rule.decision,
            reason: rule.reason
          }
        : {})
    }
  };
};

export const evaluateRules = (
  rules: PolicyRule[] = [],
  context: EvaluationContext
): RuleEvaluationResult[] => rules.map((rule) => evaluateRule(rule, context));
