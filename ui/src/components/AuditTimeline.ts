import {
  filterAuditRecords,
  sortAuditRecordsDescending
} from "../api/auditTimelineFormatters.js";
import type { UiAuditRecord, UiAuditTimelineFilters } from "../api/types.js";
import { createAuditFilters } from "./AuditFilters.js";
import { createAuditTimelineItem } from "./AuditTimelineItem.js";

export const createAuditTimeline = (
  records: UiAuditRecord[],
  selectedDecisionId: string,
  filters: UiAuditTimelineFilters,
  onFilterChange: (filters: UiAuditTimelineFilters) => void,
  onSelect?: (decisionId: string) => void
): HTMLElement => {
  const timeline = document.createElement("section");
  timeline.className = "audit-timeline";

  const header = document.createElement("header");
  header.className = "audit-timeline-header";
  const title = document.createElement("h2");
  title.textContent = "Audit Timeline";
  const subtitle = document.createElement("p");
  subtitle.textContent =
    "Chronological StepHarbor decisions from audit records.";
  header.append(title, subtitle);

  const sortedRecords = sortAuditRecordsDescending(records);
  const filteredRecords = filterAuditRecords(sortedRecords, filters);
  const list = document.createElement("div");
  list.className = "timeline-list";

  if (filteredRecords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No audit records match the current filters.";
    list.append(empty);
  } else {
    for (const record of filteredRecords) {
      list.append(
        createAuditTimelineItem(record, selectedDecisionId, onSelect)
      );
    }
  }

  timeline.append(
    header,
    createAuditFilters(records, filters, onFilterChange),
    list
  );

  return timeline;
};
