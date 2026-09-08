import { getAffectedResources } from "../api/escalationFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

const appendResource = (
  list: HTMLElement,
  label: string,
  value: string
): void => {
  const item = document.createElement("li");
  const title = document.createElement("strong");
  title.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = value;
  item.append(title, detail);
  list.append(item);
};

export const createAffectedResources = (record: UiAuditRecord): HTMLElement => {
  const resources = getAffectedResources(record);
  const list = document.createElement("ul");
  list.className = "affected-resource-list";

  for (const targetPath of resources.targetPaths) {
    appendResource(list, "Target path", targetPath);
  }

  if (resources.command !== undefined) {
    appendResource(list, "Command", resources.command);
  }

  if (resources.currentBranch !== undefined) {
    appendResource(list, "Branch", resources.currentBranch);
  }

  if (resources.remoteTarget !== undefined) {
    appendResource(list, "Remote target", resources.remoteTarget);
  }

  if (list.children.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No affected resources recorded.";
    list.append(empty);
  }

  return list;
};
