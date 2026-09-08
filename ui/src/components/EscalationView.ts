import {
  formatValidationStatusForEscalation,
  hasEscalationReview
} from "../api/escalationFormatters.js";
import { formatTimestamp, summarizeAction } from "../api/decisionFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createAffectedResources } from "./AffectedResources.js";
import { createApprovalPlaceholder } from "./ApprovalPlaceholder.js";
import { createEscalationPolicyList } from "./EscalationPolicyList.js";
import { createRiskSummary } from "./RiskSummary.js";

const createSection = (title: string, body: HTMLElement): HTMLElement => {
  const section = document.createElement("section");
  section.className = "escalation-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading, body);

  return section;
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

export const createNoEscalationView = (): HTMLElement => {
  const card = document.createElement("section");
  card.className = "escalation-view escalation-view-empty";
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "No escalation review required for this decision.";
  card.append(empty);

  return card;
};

export const createEscalationView = (record: UiAuditRecord): HTMLElement => {
  if (!hasEscalationReview(record)) {
    return createNoEscalationView();
  }

  const view = document.createElement("article");
  view.className = "escalation-view";

  const header = document.createElement("header");
  header.className = "escalation-view-header";
  const title = document.createElement("h2");
  title.textContent = "Human review required";
  const reason = document.createElement("p");
  reason.className = "escalation-reason";
  reason.textContent = record.reason;
  header.append(title, reason);
  view.append(header);

  const action = summarizeAction(record);
  view.append(
    createSection(
      "Action summary",
      createFactGrid([
        ["Action type", action.actionType],
        ["Action", action.label],
        ...(action.command !== undefined
          ? [["Command", action.command] as [string, string]]
          : []),
        ...(action.validationKind !== undefined
          ? [["Validation kind", action.validationKind] as [string, string]]
          : [])
      ])
    ),
    createSection("Affected resources", createAffectedResources(record)),
    createSection("Risk summary", createRiskSummary(record))
  );

  const validation = formatValidationStatusForEscalation(record);

  if (validation.present) {
    view.append(
      createSection(
        "Validation status",
        createFactGrid([
          [
            "Required",
            validation.required === undefined
              ? "unknown"
              : String(validation.required)
          ],
          ["Status", validation.status ?? "unknown"],
          ["Latest command", validation.latestCommand ?? "unknown"],
          ["Latest exit code", validation.latestExitCode ?? "unknown"]
        ])
      )
    );
  }

  view.append(
    createSection(
      "Matched escalation policies",
      createEscalationPolicyList(record)
    ),
    createSection(
      "Audit metadata",
      createFactGrid([
        ["Decision ID", record.decisionId],
        ["Timestamp", formatTimestamp(record.timestamp)],
        ["Session", record.sessionId ?? "default"]
      ])
    ),
    createSection("Approval placeholder", createApprovalPlaceholder())
  );

  return view;
};
