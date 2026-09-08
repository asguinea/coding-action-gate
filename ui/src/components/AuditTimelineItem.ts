import {
  getAuditTimelineSummary,
  getMatchedPolicyIds
} from "../api/auditTimelineFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createDecisionBadge } from "./DecisionBadge.js";
import { createDetectorEvidenceSummary } from "./DetectorEvidenceSummary.js";

export const createAuditTimelineItem = (
  record: UiAuditRecord,
  selectedDecisionId: string,
  onSelect?: (decisionId: string) => void
): HTMLElement => {
  const summary = getAuditTimelineSummary(record);
  const item = document.createElement("article");
  item.className =
    record.decisionId === selectedDecisionId
      ? "timeline-item timeline-item-active"
      : "timeline-item";

  if (onSelect !== undefined) {
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.addEventListener("click", () => onSelect(record.decisionId));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(record.decisionId);
      }
    });
  }

  const header = document.createElement("header");
  header.className = "timeline-item-header";
  header.append(createDecisionBadge(record.decision));

  const timestamp = document.createElement("span");
  timestamp.className = "timeline-timestamp";
  timestamp.textContent = summary.timestamp;
  header.append(timestamp);

  const title = document.createElement("h3");
  title.textContent = summary.actionSummary;

  const reason = document.createElement("p");
  reason.className = "timeline-reason";
  reason.textContent = summary.reason;

  const policyIds = getMatchedPolicyIds(record);
  const policySummary = document.createElement("p");
  policySummary.className = "timeline-meta";
  policySummary.textContent =
    policyIds.length > 0
      ? `Matched policies (${policyIds.length}): ${policyIds.join(", ")}`
      : "Matched policies: none";

  const metadata = document.createElement("p");
  metadata.className = "timeline-meta";
  metadata.textContent = `Decision ${summary.decisionId}${
    summary.sessionId !== undefined ? ` · Session ${summary.sessionId}` : ""
  }`;

  item.append(
    header,
    title,
    reason,
    policySummary,
    createDetectorEvidenceSummary(record),
    metadata
  );

  return item;
};
