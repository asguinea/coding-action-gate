import {
  buildSuggestedCommands,
  getDeferredActionId,
  getDeferReasonCategory,
  getExpectedNextDecision,
  getReanalysisRequired
} from "../api/deferFormatters.js";
import {
  buildObservationHints,
  findDeferredActionForRecord
} from "../api/liveDataFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createCopyableCommand } from "./CopyableCommand.js";
import { createFetchPlanList } from "./FetchPlanList.js";
import { createMissingContextList } from "./MissingContextList.js";
import { createDeferredActionSummary } from "./DeferredActionSummary.js";
import { createObservationSummary } from "./ObservationSummary.js";
import { createRiskList } from "./RiskList.js";

const createSection = (title: string, content: HTMLElement): HTMLElement => {
  const section = document.createElement("section");
  section.className = "defer-section";

  const heading = document.createElement("h3");
  heading.textContent = title;

  section.append(heading, content);

  return section;
};

const createEmpty = (message: string): HTMLParagraphElement => {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;

  return empty;
};

const createFactGrid = (facts: Array<[string, string]>): HTMLElement => {
  const grid = document.createElement("div");
  grid.className = "meta-grid";

  for (const [label, value] of facts) {
    const item = document.createElement("div");
    item.className = "meta-item";

    const labelElement = document.createElement("span");
    labelElement.className = "meta-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "meta-value";
    valueElement.textContent = value;

    item.append(labelElement, valueElement);
    grid.append(item);
  }

  return grid;
};

export const createNoDeferView = (): HTMLElement => {
  const card = document.createElement("section");
  card.className = "defer-view defer-view-empty";
  card.append(createEmpty("No DEFER repair steps for this decision."));

  return card;
};

export const createDeferView = (
  record: UiAuditRecord,
  options: {
    deferredActions?: unknown[];
    observations?: unknown[];
  } = {}
): HTMLElement => {
  if (record.decision !== "DEFER") {
    return createNoDeferView();
  }

  const view = document.createElement("article");
  view.className = "defer-view";

  const header = document.createElement("header");
  header.className = "defer-view-header";

  const title = document.createElement("h2");
  title.textContent = "More context needed before this action is safe";

  const category = getDeferReasonCategory(record);

  header.append(title);

  if (category !== undefined) {
    const badge = document.createElement("span");
    badge.className = "defer-category";
    badge.textContent = category;
    header.append(badge);
  }

  const explanation = document.createElement("p");
  explanation.className = "defer-explanation";
  explanation.textContent = record.reason;

  view.append(header, explanation);

  const deferredActionId = getDeferredActionId(record);
  const expectedNextDecision = getExpectedNextDecision(record);
  const reanalysisRequired = getReanalysisRequired(record);

  view.append(
    createSection(
      "Decision context",
      createFactGrid([
        ["Expected next decision", expectedNextDecision ?? "UNKNOWN"],
        [
          "Reanalysis required",
          reanalysisRequired === undefined
            ? "unknown"
            : reanalysisRequired
              ? "true"
              : "false"
        ],
        ["Deferred action", deferredActionId ?? record.decisionId]
      ])
    ),
    createSection(
      "Deferred action",
      createDeferredActionSummary(
        findDeferredActionForRecord(record, options.deferredActions)
      )
    ),
    createSection(
      "Observation hints",
      createObservationSummary(
        buildObservationHints(record, options.observations)
      )
    ),
    createSection(
      "Missing context",
      record.missingContext !== undefined && record.missingContext.length > 0
        ? createMissingContextList(record.missingContext)
        : createEmpty("No missing context entries recorded.")
    ),
    createSection(
      "Fetch plan",
      record.fetchPlan !== undefined && record.fetchPlan.length > 0
        ? createFetchPlanList(record.fetchPlan)
        : createEmpty("No fetch plan steps recorded.")
    ),
    createSection(
      "Risk if proceeding",
      record.riskIfProceeding !== undefined &&
        record.riskIfProceeding.length > 0
        ? createRiskList(record.riskIfProceeding)
        : createEmpty("No risk entries recorded.")
    )
  );

  const commands = buildSuggestedCommands(record);
  const commandContainer = document.createElement("div");
  commandContainer.className = "command-list";

  if (commands.length > 0) {
    for (const command of commands) {
      commandContainer.append(createCopyableCommand(command));
    }
  } else {
    commandContainer.append(
      createEmpty(
        "Retry command unavailable until this DEFER decision is recorded."
      )
    );
  }

  if (deferredActionId === undefined) {
    commandContainer.append(
      createEmpty(
        "Retry command unavailable until this DEFER decision is recorded."
      )
    );
  }

  view.append(createSection("Suggested CLI commands", commandContainer));

  return view;
};
