import {
  formatTimestamp,
  getDeferSummary,
  summarizeAction
} from "../api/decisionFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createDecisionBadge } from "./DecisionBadge.js";
import { createPolicyTraceList } from "./PolicyTraceList.js";
import { createSignalSummary } from "./SignalSummary.js";

const createMetaItem = (label: string, value: string): HTMLElement => {
  const item = document.createElement("div");
  item.className = "meta-item";

  const term = document.createElement("span");
  term.className = "meta-label";
  term.textContent = label;

  const detail = document.createElement("span");
  detail.className = "meta-value";
  detail.textContent = value;

  item.append(term, detail);

  return item;
};

const createActionSummary = (record: UiAuditRecord): HTMLElement => {
  const summary = summarizeAction(record);
  const section = document.createElement("section");
  section.className = "panel-section";

  const heading = document.createElement("h3");
  heading.textContent = "Action";
  section.append(heading);

  const list = document.createElement("div");
  list.className = "meta-grid";

  list.append(createMetaItem("Type", summary.actionType));

  if (summary.command !== undefined) {
    list.append(createMetaItem("Command", summary.command));
  }

  if (summary.targetPaths.length > 0) {
    list.append(createMetaItem("Target paths", summary.targetPaths.join(", ")));
  }

  if (summary.validationKind !== undefined) {
    list.append(createMetaItem("Validation kind", summary.validationKind));
  }

  section.append(list);

  return section;
};

const createDeferSummary = (record: UiAuditRecord): HTMLElement | null => {
  const summary = getDeferSummary(record);

  if (summary === null) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "panel-section defer-summary";

  const heading = document.createElement("h3");
  heading.textContent = "DEFER summary";
  section.append(heading);

  const grid = document.createElement("div");
  grid.className = "meta-grid";

  if (summary.deferReasonCategory !== undefined) {
    grid.append(createMetaItem("Category", summary.deferReasonCategory));
  }

  grid.append(
    createMetaItem("Missing context", String(summary.missingContextCount)),
    createMetaItem("Fetch plan", String(summary.fetchPlanCount))
  );

  if (summary.expectedNextDecision !== undefined) {
    grid.append(createMetaItem("Expected next", summary.expectedNextDecision));
  }

  if (summary.reanalysisRequired !== undefined) {
    grid.append(
      createMetaItem(
        "Reanalysis required",
        summary.reanalysisRequired ? "true" : "false"
      )
    );
  }

  section.append(grid);

  return section;
};

export const createDecisionPanel = (record: UiAuditRecord): HTMLElement => {
  const panel = document.createElement("article");
  panel.className = `decision-panel decision-panel-${record.decision.toLowerCase()}`;

  const header = document.createElement("header");
  header.className = "decision-panel-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "Decision Panel";
  const reason = document.createElement("p");
  reason.className = "decision-reason";
  reason.textContent = record.reason;
  titleGroup.append(title, reason);

  header.append(titleGroup, createDecisionBadge(record.decision));
  panel.append(header);

  const metadata = document.createElement("section");
  metadata.className = "panel-section";
  const metadataGrid = document.createElement("div");
  metadataGrid.className = "meta-grid";

  metadataGrid.append(
    createMetaItem("Decision ID", record.decisionId),
    createMetaItem("Timestamp", formatTimestamp(record.timestamp))
  );

  if (record.sessionId !== undefined) {
    metadataGrid.append(createMetaItem("Session", record.sessionId));
  }

  metadata.append(metadataGrid);
  panel.append(
    metadata,
    createActionSummary(record),
    createSignalSummary(record)
  );

  const deferSummary = createDeferSummary(record);

  if (deferSummary !== null) {
    panel.append(deferSummary);
  }

  panel.append(createPolicyTraceList(record));

  return panel;
};
