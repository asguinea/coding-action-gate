import type {
  UiActionSummary,
  UiAuditRecord,
  UiDeferSummary,
  UiKeySignal,
  UiPolicyTraceEntry,
  UiSignalSummary
} from "./types.js";
import {
  getDeferReasonCategory,
  getExpectedNextDecision,
  getReanalysisRequired
} from "./deferFormatters.js";

const signalLabels: Record<string, string> = {
  pathSensitivity: "Path sensitivity",
  commandRiskScore: "Command risk",
  destructiveOperation: "Destructive operation",
  workspaceBoundaryViolation: "Workspace boundary violation",
  secretTouch: "Secret touch",
  targetFileFreshness: "Target freshness",
  contextCompletenessScore: "Context completeness",
  validationRequired: "Validation required",
  validationStatus: "Validation status",
  currentBranch: "Current branch",
  protectedBranch: "Protected branch",
  branchRisk: "Branch risk",
  landingAction: "Landing action",
  landingActionType: "Landing type",
  landingRisk: "Landing risk"
};

const keySignalOrder = Object.keys(signalLabels);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringifySignalValue = (value: unknown): string => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value === null) {
    return "null";
  }

  return String(value);
};

export const formatDecisionLabel = (decision: string): string => decision;

export const formatTimestamp = (value: string | undefined): string => {
  if (value === undefined) {
    return "Unknown time";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export const signalSummaryForRecord = (
  record: UiAuditRecord
): UiSignalSummary => {
  if (isRecord(record.evidence?.signalSummary)) {
    return record.evidence.signalSummary;
  }

  return record.signals ?? {};
};

export const summarizeAction = (record: UiAuditRecord): UiActionSummary => {
  const action = record.action;
  const targetPaths = [
    ...(record.targetPaths ?? []),
    ...(action.targetPaths ?? []),
    ...(action.targetPath !== undefined ? [action.targetPath] : [])
  ];
  const uniqueTargetPaths = Array.from(new Set(targetPaths));
  const targetDetail = uniqueTargetPaths.join(", ");
  const detail =
    action.command ??
    (targetDetail.length > 0 ? targetDetail : undefined) ??
    action.validationKind ??
    "";

  return {
    actionType: action.type,
    label: `${action.type}${detail.length > 0 ? `: ${detail}` : ""}`,
    targetPaths: uniqueTargetPaths,
    ...(action.command !== undefined ? { command: action.command } : {}),
    ...(action.validationKind !== undefined
      ? { validationKind: action.validationKind }
      : {})
  };
};

export const pickKeySignals = (record: UiAuditRecord): UiKeySignal[] => {
  const signals = signalSummaryForRecord(record);

  return keySignalOrder.flatMap((key) => {
    const value = signals[key];

    if (value === undefined) {
      return [];
    }

    return [
      {
        key,
        label: signalLabels[key] ?? key,
        value: stringifySignalValue(value)
      }
    ];
  });
};

export const getMatchedPolicyTrace = (
  record: UiAuditRecord
): UiPolicyTraceEntry[] =>
  (record.policyTrace ?? [])
    .filter((entry) => entry.matched)
    .sort((left, right) => {
      if (left.effect !== undefined && right.effect === undefined) {
        return -1;
      }

      if (left.effect === undefined && right.effect !== undefined) {
        return 1;
      }

      return 0;
    });

export const formatPolicyTraceEffect = (
  effect: UiPolicyTraceEntry["effect"] | undefined
): string => {
  if (effect === undefined) {
    return "matched";
  }

  if (effect === "PENDING_AFTER_DEFER") {
    return "pending after DEFER";
  }

  if (effect === "PENDING_RECHECK_AFTER_DEFER") {
    return "pending recheck after DEFER";
  }

  return effect;
};

export const getDeferSummary = (
  record: UiAuditRecord
): UiDeferSummary | null => {
  if (record.decision !== "DEFER") {
    return null;
  }

  const deferReasonCategory = getDeferReasonCategory(record);
  const expectedNextDecision = getExpectedNextDecision(record);
  const reanalysisRequired = getReanalysisRequired(record);

  return {
    ...(deferReasonCategory !== undefined ? { deferReasonCategory } : {}),
    missingContextCount: record.missingContext?.length ?? 0,
    fetchPlanCount: record.fetchPlan?.length ?? 0,
    ...(expectedNextDecision !== undefined ? { expectedNextDecision } : {}),
    ...(reanalysisRequired !== undefined ? { reanalysisRequired } : {})
  };
};
