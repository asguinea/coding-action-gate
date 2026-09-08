import {
  formatTimestamp,
  getMatchedPolicyTrace,
  summarizeAction
} from "./decisionFormatters.js";
import type {
  UiAuditRecord,
  UiAuditTimelineFilters,
  UiAuditTimelineSummary,
  UiDecisionPosture
} from "./types.js";

export const sortAuditRecordsDescending = (
  records: UiAuditRecord[]
): UiAuditRecord[] =>
  [...records].sort((left, right) => {
    const rightTime = new Date(right.timestamp).getTime();
    const leftTime = new Date(left.timestamp).getTime();

    if (Number.isNaN(rightTime) || Number.isNaN(leftTime)) {
      return right.timestamp.localeCompare(left.timestamp);
    }

    return rightTime - leftTime;
  });

export const getActionSearchText = (record: UiAuditRecord): string => {
  const summary = summarizeAction(record);

  return [
    summary.actionType,
    summary.command,
    ...summary.targetPaths,
    record.reason
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(" ")
    .toLowerCase();
};

export const filterAuditRecords = (
  records: UiAuditRecord[],
  filters: UiAuditTimelineFilters = {}
): UiAuditRecord[] => {
  const decision = filters.decision ?? "all";
  const actionType = filters.actionType ?? "all";
  const search = filters.search?.trim().toLowerCase() ?? "";

  return records.filter((record) => {
    if (decision !== "all" && record.decision !== decision) {
      return false;
    }

    if (actionType !== "all" && record.action.type !== actionType) {
      return false;
    }

    if (search.length > 0 && !getActionSearchText(record).includes(search)) {
      return false;
    }

    return true;
  });
};

export const getDetectorIds = (record: UiAuditRecord): string[] => {
  const detectorResults = record.evidence?.detectorResults ?? [];

  return Array.from(
    new Set(
      detectorResults.flatMap((entry) =>
        entry.detectorId !== undefined ? [entry.detectorId] : []
      )
    )
  );
};

export const getMatchedPolicyIds = (record: UiAuditRecord): string[] =>
  getMatchedPolicyTrace(record).map((entry) => entry.ruleId);

export const getAuditTimelineSummary = (
  record: UiAuditRecord
): UiAuditTimelineSummary => ({
  decisionId: record.decisionId,
  decision: record.decision,
  timestamp: formatTimestamp(record.timestamp),
  actionSummary: summarizeAction(record).label,
  reason: record.reason,
  matchedPolicyIds: getMatchedPolicyIds(record),
  detectorIds: getDetectorIds(record),
  ...(record.sessionId !== undefined ? { sessionId: record.sessionId } : {})
});

export const actionTypesForTimeline = (
  records: UiAuditRecord[]
): Array<string | "all"> => [
  "all",
  ...Array.from(new Set(records.map((record) => record.action.type))).sort()
];

export const decisionsForTimeline = (): Array<UiDecisionPosture | "all"> => [
  "all",
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK"
];
