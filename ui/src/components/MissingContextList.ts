import { summarizeMissingContext } from "../api/deferFormatters.js";
import type { UiMissingContextEntry } from "../api/types.js";

export const createMissingContextList = (
  entries: UiMissingContextEntry[]
): HTMLElement => {
  const list = document.createElement("ul");
  list.className = "defer-detail-list missing-context-list";

  for (const entry of entries) {
    const item = document.createElement("li");

    const title = document.createElement("strong");
    title.textContent = entry.type;
    item.append(title);

    const summary = document.createElement("p");
    summary.textContent = summarizeMissingContext(entry);
    item.append(summary);

    list.append(item);
  }

  return list;
};
