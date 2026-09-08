import {
  buildLiveDataSummary,
  type LiveDataSummary as LiveDataSummaryModel
} from "../api/liveDataFormatters.js";
import type { RuntimeDashboardData } from "../api/runtimeDataTypes.js";

const createSummaryItem = (
  label: string,
  value: string | number
): HTMLElement => {
  const item = document.createElement("div");
  item.className = "live-summary-item";

  const labelElement = document.createElement("span");
  labelElement.className = "live-summary-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = "live-summary-value";
  valueElement.textContent = String(value);

  item.append(labelElement, valueElement);

  return item;
};

export const createLiveDataSummary = (
  data: RuntimeDashboardData
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "live-data-summary";

  const heading = document.createElement("h2");
  heading.textContent =
    data.source === "live" ? "Live Local Data" : "Mock Demo Data";

  const summary: LiveDataSummaryModel = buildLiveDataSummary(data);
  const grid = document.createElement("div");
  grid.className = "live-summary-grid";

  grid.append(
    createSummaryItem("Audit records", summary.auditRecords),
    createSummaryItem("Deferred actions", summary.deferredActions),
    createSummaryItem("Observations", summary.observations),
    createSummaryItem("Validation records", summary.validationRecords),
    createSummaryItem("Git", summary.git)
  );

  section.append(heading, grid);

  return section;
};
