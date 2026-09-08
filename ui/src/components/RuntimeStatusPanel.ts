import {
  buildRuntimeStatusBadges,
  buildRuntimeStatusRows,
  type RuntimeStatusOptions
} from "../api/runtimeStatusFormatters.js";
import type { RuntimeDashboardData } from "../api/runtimeDataTypes.js";

export const createRuntimeStatusPanel = (
  data: RuntimeDashboardData,
  options: RuntimeStatusOptions = {}
): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "runtime-status-panel";

  const header = document.createElement("header");
  header.className = "runtime-status-header";

  const title = document.createElement("h2");
  title.textContent = "Runtime Status";

  const badges = document.createElement("div");
  badges.className = "runtime-status-badges";

  for (const badge of buildRuntimeStatusBadges(data, options)) {
    const element = document.createElement("span");
    element.className = `runtime-badge runtime-badge-${badge.tone}`;
    element.textContent = badge.label;
    badges.append(element);
  }

  header.append(title, badges);

  const rows = document.createElement("dl");
  rows.className = "runtime-status-rows";

  for (const row of buildRuntimeStatusRows(data, options)) {
    const wrapper = document.createElement("div");
    wrapper.className = "runtime-status-row";

    const label = document.createElement("dt");
    label.textContent = row.label;

    const value = document.createElement("dd");
    value.className =
      row.severity === undefined
        ? "runtime-status-value"
        : `runtime-status-value status-severity-${row.severity}`;
    value.textContent = row.value;

    wrapper.append(label, value);
    rows.append(wrapper);
  }

  const note = document.createElement("p");
  note.className = "runtime-status-note";
  note.textContent =
    data.source === "mock"
      ? "Mock Demo mode uses built-in sample records. Switch to Live Local to read the localhost API."
      : "Live Local reads localhost API data only. The dashboard has no mutation controls.";

  panel.append(header, rows, note);

  return panel;
};
