import { pickKeySignals } from "../api/decisionFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

export const createSignalSummary = (record: UiAuditRecord): HTMLElement => {
  const section = document.createElement("section");
  section.className = "panel-section";

  const heading = document.createElement("h3");
  heading.textContent = "Key signals";
  section.append(heading);

  const signals = pickKeySignals(record);

  if (signals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No key signals recorded.";
    section.append(empty);

    return section;
  }

  const list = document.createElement("dl");
  list.className = "signal-grid";

  for (const signal of signals) {
    const term = document.createElement("dt");
    term.textContent = signal.label;

    const detail = document.createElement("dd");
    detail.textContent = signal.value;

    list.append(term, detail);
  }

  section.append(list);

  return section;
};
