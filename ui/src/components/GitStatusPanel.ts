import {
  buildGitStatusRows,
  hasGitSignals
} from "../api/statusPanelFormatters.js";
import { buildGitRowsWithFallback } from "../api/liveDataFormatters.js";
import type { UiAuditRecord } from "../api/types.js";
import { createStatusRows } from "./StatusRow.js";

export const createGitStatusPanel = (
  record: UiAuditRecord,
  gitState?: unknown
): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "status-panel git-status-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Git Status";

  panel.append(
    heading,
    createStatusRows(
      hasGitSignals(record)
        ? buildGitStatusRows(record)
        : buildGitRowsWithFallback(record, gitState),
      "No Git workflow signals for this decision."
    )
  );

  return panel;
};
