import type { UiStatusRow } from "../api/types.js";

export const createStatusRows = (
  rows: UiStatusRow[],
  emptyMessage: string
): HTMLElement => {
  const list = document.createElement("div");
  list.className = "status-row-list";

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    list.append(empty);

    return list;
  }

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = `status-row status-${row.severity ?? "neutral"}`;

    const label = document.createElement("span");
    label.className = "status-label";
    label.textContent = row.label;

    const value = document.createElement("span");
    value.className = "status-value";
    value.textContent = row.value;

    item.append(label, value);
    list.append(item);
  }

  return list;
};
