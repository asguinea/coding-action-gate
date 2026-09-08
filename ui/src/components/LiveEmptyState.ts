import {
  buildLiveEmptyStateHints,
  type LiveEmptyStateResource
} from "../api/liveDataFormatters.js";

const titleForResource = (resourceType: LiveEmptyStateResource): string => {
  switch (resourceType) {
    case "audit":
      return "No CodingActionGate decisions found yet.";
    case "deferred":
      return "No deferred actions found yet.";
    case "observations":
      return "No observations found yet.";
    case "validation":
      return "No validation records found yet.";
  }
};

export const createLiveEmptyState = (
  resourceType: LiveEmptyStateResource,
  options: {
    defaultPolicy?: boolean;
  } = {}
): HTMLElement => {
  const container = document.createElement("div");
  container.className = "live-empty-state";

  const title = document.createElement("p");
  title.className = "empty-state";
  title.textContent = titleForResource(resourceType);

  const hintLabel = document.createElement("p");
  hintLabel.className = "live-empty-hint-label";
  hintLabel.textContent = "Try:";

  const list = document.createElement("ul");
  list.className = "live-empty-hints";

  for (const command of buildLiveEmptyStateHints(resourceType, options)) {
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = command;
    item.append(code);
    list.append(item);
  }

  container.append(title, hintLabel, list);

  return container;
};
