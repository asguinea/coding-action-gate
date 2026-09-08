import type { ObservationHint } from "../api/liveDataFormatters.js";

export const createObservationSummary = (
  hints: ObservationHint[]
): HTMLElement => {
  const list = document.createElement("ul");
  list.className = "defer-detail-list observation-summary-list";

  if (hints.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No file observation hints for this decision.";

    return empty;
  }

  for (const hint of hints) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = hint.target;

    const detail = document.createElement("p");
    detail.textContent = hint.observed
      ? `Observed at ${hint.observedAt ?? "unknown time"} · metadata-only: ${
          hint.metadataOnly === undefined
            ? "unknown"
            : String(hint.metadataOnly)
        }`
      : "No matching observation found.";

    item.append(title, detail);
    list.append(item);
  }

  return list;
};
