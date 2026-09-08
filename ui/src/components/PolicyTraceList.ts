import {
  formatPolicyTraceEffect,
  getMatchedPolicyTrace
} from "../api/decisionFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

export const createPolicyTraceList = (record: UiAuditRecord): HTMLElement => {
  const section = document.createElement("section");
  section.className = "panel-section";

  const heading = document.createElement("h3");
  heading.textContent = "Matched policy trace";
  section.append(heading);

  const matched = getMatchedPolicyTrace(record);

  if (matched.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No matched policy rules.";
    section.append(empty);

    return section;
  }

  const list = document.createElement("ul");
  list.className = "policy-trace-list";

  for (const entry of matched) {
    const item = document.createElement("li");

    const title = document.createElement("div");
    title.className = "policy-rule";
    title.textContent = `${entry.ruleId} · ${formatPolicyTraceEffect(
      entry.effect
    )}`;

    item.append(title);

    if (entry.reason !== undefined) {
      const reason = document.createElement("p");
      reason.className = "card-secondary";
      reason.textContent = entry.reason;
      item.append(reason);
    }

    list.append(item);
  }

  section.append(list);

  return section;
};
