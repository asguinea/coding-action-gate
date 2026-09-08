import type { DeferredActionMatch } from "../api/liveDataFormatters.js";

const fact = (label: string, value: string): HTMLElement => {
  const item = document.createElement("div");
  item.className = "meta-item";

  const labelElement = document.createElement("span");
  labelElement.className = "meta-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "meta-value";
  valueElement.textContent = value;

  item.append(labelElement, valueElement);

  return item;
};

export const createDeferredActionSummary = (
  match: DeferredActionMatch | null
): HTMLElement => {
  const container = document.createElement("div");

  if (match === null) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No deferred action registry match for this decision.";
    container.append(empty);

    return container;
  }

  container.className = "meta-grid";
  container.append(
    fact("Deferred action ID", match.id),
    fact("Status", match.status ?? "unknown"),
    fact("Created", match.createdAt ?? "unknown"),
    fact("Required evidence", String(match.requiredEvidenceCount)),
    fact("Satisfied evidence", String(match.satisfiedEvidenceCount ?? 0))
  );

  return container;
};
