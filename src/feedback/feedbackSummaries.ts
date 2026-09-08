import path from "node:path";

import type { AuditRecord } from "../domain/audit.js";
import type { CodingActionGateAction } from "../domain/actions.js";
import type {
  CodingActionGatePolicy,
  PolicyTraceEntry
} from "../domain/policies.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import type { DeferredActionRecord } from "../defer/deferredActionTypes.js";
import type { ValidationResultRecord } from "../validation/validationTypes.js";
import type { GitStateSummary } from "../uiAdapter/uiAdapterTypes.js";
import type { LoadedPolicySource } from "../policy/policyErrors.js";
import {
  sanitizeCommandSummary,
  summarizePathForFeedback
} from "./feedbackSanitizer.js";
import type {
  FeedbackDecisionSummary,
  FeedbackDeferredSummary,
  FeedbackPathSummary,
  FeedbackPolicySummary,
  FeedbackValidationSummary
} from "./feedbackTypes.js";

const safeSignalKeys: Array<keyof CodingActionGateSignals> = [
  "pathSensitivity",
  "commandRiskScore",
  "commandCategory",
  "destructiveOperation",
  "destructiveSubtype",
  "destructiveSeverity",
  "workspaceBoundaryViolation",
  "workspaceBoundaryStatus",
  "secretTouch",
  "secretPathMatch",
  "secretPatternMatch",
  "targetFileFreshness",
  "contextCompletenessScore",
  "relatedTestsFound",
  "relatedTestsRead",
  "validationRequired",
  "validationStatus",
  "validationAge",
  "validationScope",
  "latestValidationKind",
  "latestValidationExitCode",
  "currentBranch",
  "protectedBranch",
  "branchRisk",
  "isDetachedHead",
  "isDirtyWorktree",
  "hasUncommittedChanges",
  "hasUntrackedFiles",
  "repoIntegrityStatus",
  "gitCommandCategory",
  "mutatesGit",
  "forcePush",
  "hookBypass",
  "directMainlineCommit",
  "directMainlinePush",
  "landingAction",
  "landingActionType",
  "landingRisk",
  "deploymentRisk",
  "releaseRisk",
  "environmentClassification"
];

const commandForAction = (
  action: CodingActionGateAction
): string | undefined => ("command" in action ? action.command : undefined);

const validationKindForAction = (
  action: CodingActionGateAction
): string | undefined =>
  action.type === "validation_command" ? action.validationKind : undefined;

const targetPathsForAction = (action: CodingActionGateAction): string[] =>
  "targetPath" in action ? [action.targetPath] : [];

const pathSummaries = (paths: string[]): FeedbackPathSummary[] =>
  paths.map((targetPath) => summarizePathForFeedback(targetPath));

const policyRuleIds = (trace: PolicyTraceEntry[] | undefined): string[] =>
  (trace ?? []).filter((entry) => entry.matched).map((entry) => entry.ruleId);

const evidenceRecord = (record: AuditRecord): Record<string, unknown> =>
  record.evidence !== undefined ? record.evidence : {};

export const getDetectorIds = (record: AuditRecord): string[] => {
  const evidence = evidenceRecord(record);
  const ids = new Set<string>();

  const fromDetectorResults = evidence.detectorResults;

  if (Array.isArray(fromDetectorResults)) {
    for (const item of fromDetectorResults) {
      if (item && typeof item === "object" && "detectorId" in item) {
        ids.add(String((item as { detectorId: unknown }).detectorId));
      }
      if (item && typeof item === "object" && "id" in item) {
        ids.add(String((item as { id: unknown }).id));
      }
    }
  }

  for (const key of Object.keys(evidence)) {
    if (key.endsWith("Detector") || key.includes("detector")) {
      ids.add(key);
    }
  }

  return Array.from(ids).filter((id) => id.length > 0);
};

export const summarizeSignals = (
  signals: CodingActionGateSignals | undefined
): Record<string, unknown> => {
  const summary: Record<string, unknown> = {};

  for (const key of safeSignalKeys) {
    const value = signals?.[key];

    if (value !== undefined) {
      summary[key] = value;
    }
  }

  if (signals?.requiredValidationCommands !== undefined) {
    summary.requiredValidationCommandCount =
      signals.requiredValidationCommands.length;
  }

  if (signals?.relatedTestPaths !== undefined) {
    summary.relatedTestPathCount = signals.relatedTestPaths.length;
  }

  if (signals?.latestValidationCommand !== undefined) {
    summary.latestValidationCommandSummary = sanitizeCommandSummary(
      signals.latestValidationCommand
    );
  }

  return summary;
};

export const summarizeAuditRecord = (
  record: AuditRecord
): FeedbackDecisionSummary => {
  const targetPaths = record.targetPaths ?? targetPathsForAction(record.action);
  const summarizedPaths = pathSummaries(targetPaths);
  const command = commandForAction(record.action);
  const validationKind = validationKindForAction(record.action);
  const deferReasonCategory =
    record.evidence !== undefined &&
    typeof record.evidence.deferReasonCategory === "string"
      ? record.evidence.deferReasonCategory
      : undefined;

  return {
    decisionId: record.decisionId,
    timestamp: record.timestamp,
    ...(record.sessionId !== undefined ? { sessionId: record.sessionId } : {}),
    actionType: record.action.type,
    targetPaths: summarizedPaths,
    targetPathHashes: summarizedPaths.map((item) => item.hash),
    ...(command !== undefined
      ? { commandSummary: sanitizeCommandSummary(command) }
      : {}),
    ...(validationKind !== undefined ? { validationKind } : {}),
    ...("diffStats" in record.action && record.action.diffStats !== undefined
      ? { diffStats: record.action.diffStats }
      : {}),
    decision: record.decision,
    reason: record.reason,
    ...(deferReasonCategory !== undefined ? { deferReasonCategory } : {}),
    policyRuleIds: policyRuleIds(record.policyTrace),
    detectorIds: getDetectorIds(record),
    signalSummary: summarizeSignals(record.signals)
  };
};

export const countDecisions = (
  records: AuditRecord[]
): Record<AuditRecord["decision"], number> => ({
  PROCEED: records.filter((record) => record.decision === "PROCEED").length,
  DEFER: records.filter((record) => record.decision === "DEFER").length,
  ESCALATE: records.filter((record) => record.decision === "ESCALATE").length,
  BLOCK: records.filter((record) => record.decision === "BLOCK").length
});

export const summarizeDeferredAction = (
  record: DeferredActionRecord
): FeedbackDeferredSummary => {
  const targetPaths =
    record.actionSummary.targetPaths ??
    record.actionSummary.normalizedRelativeTargetPaths ??
    [];

  return {
    id: record.id,
    ...(record.decisionId !== undefined
      ? { decisionId: record.decisionId }
      : {}),
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    actionType: record.actionSummary.actionType,
    targetPaths: pathSummaries(targetPaths),
    ...(record.actionSummary.command !== undefined
      ? { commandSummary: sanitizeCommandSummary(record.actionSummary.command) }
      : {}),
    missingContextTypes: record.missingContext.map((entry) => entry.type),
    fetchPlanTypes: record.fetchPlan.map((step) => step.type),
    requiredEvidenceTypes: record.requiredEvidence.map((entry) => entry.type),
    requiredEvidenceCount: record.requiredEvidence.length,
    satisfiedEvidenceCount: record.satisfiedEvidence?.length ?? 0
  };
};

export const summarizeValidationRecord = (
  record: ValidationResultRecord
): FeedbackValidationSummary => ({
  id: record.id,
  sessionId: record.sessionId,
  kind: record.kind,
  commandSummary: sanitizeCommandSummary(record.command),
  status: record.status,
  exitCode: record.exitCode,
  ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
  completedAt: record.completedAt,
  ...(record.outputHash !== undefined ? { outputHash: record.outputHash } : {}),
  ...(record.policyVersion !== undefined
    ? { policyVersion: record.policyVersion }
    : {}),
  source: record.source
});

export const summarizePolicy = (
  policy: CodingActionGatePolicy,
  source: LoadedPolicySource
): FeedbackPolicySummary => ({
  source:
    source.type === "default"
      ? source
      : {
          type: source.type,
          path: path.basename(source.path)
        },
  summary: {
    version: policy.version,
    protectedBranchCount: policy.protectedBranches?.length ?? 0,
    protectedBranches: policy.protectedBranches ?? [],
    sensitivePathCounts: {
      critical: policy.sensitivePaths?.critical?.length ?? 0,
      high: policy.sensitivePaths?.high?.length ?? 0,
      medium: policy.sensitivePaths?.medium?.length ?? 0
    },
    validation: {
      beforeCommitRequired: policy.validation?.beforeCommit?.required === true,
      beforeCommitCommandCount:
        policy.validation?.beforeCommit?.commands?.length ?? 0,
      beforePushRequired: policy.validation?.beforePush?.required === true,
      beforePushCommandCount:
        policy.validation?.beforePush?.commands?.length ?? 0
    },
    thresholds: policy.thresholds ?? {},
    rules: (policy.rules ?? []).map((rule) => ({
      id: rule.id,
      decision: rule.decision,
      conditionKeys: Object.keys(rule.when)
    }))
  }
});

export const summarizeGitState = (
  git: GitStateSummary
): {
  isGitRepo: boolean;
  currentBranch?: string;
  isDetachedHead?: boolean;
  isDirty?: boolean;
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
  repoIntegrityStatus: string;
} => ({
  isGitRepo: git.isGitRepo,
  ...(git.currentBranch !== undefined
    ? { currentBranch: git.currentBranch }
    : {}),
  ...(git.isDetachedHead !== undefined
    ? { isDetachedHead: git.isDetachedHead }
    : {}),
  ...(git.isDirty !== undefined ? { isDirty: git.isDirty } : {}),
  ...(git.hasUncommittedChanges !== undefined
    ? { hasUncommittedChanges: git.hasUncommittedChanges }
    : {}),
  ...(git.hasUntrackedFiles !== undefined
    ? { hasUntrackedFiles: git.hasUntrackedFiles }
    : {}),
  repoIntegrityStatus: git.repoIntegrityStatus
});
