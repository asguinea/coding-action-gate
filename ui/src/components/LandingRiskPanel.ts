import {
  buildLandingRiskRows,
  hasLandingSignals
} from "../api/statusPanelFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createStatusRows } from "./StatusRow.js";

export const createLandingRiskPanel = (record: UiAuditRecord): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "status-panel landing-risk-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Landing Risk";

  panel.append(
    heading,
    createStatusRows(
      hasLandingSignals(record) ? buildLandingRiskRows(record) : [],
      "No landing-action signals for this decision."
    )
  );

  return panel;
};
