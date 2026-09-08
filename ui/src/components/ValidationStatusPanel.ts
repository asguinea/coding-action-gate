import {
  buildValidationStatusRows,
  hasValidationSignals,
  summarizeValidationRecords
} from "../api/statusPanelFormatters.js";
import { sortValidationRecordsNewestFirst } from "../api/liveDataFormatters.js";
import type { UiAuditRecord, UiValidationRecord } from "../api/types.js";
import { createStatusRows } from "./StatusRow.js";

export const createValidationStatusPanel = (
  record: UiAuditRecord,
  validationRecords: UiValidationRecord[]
): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "status-panel validation-status-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Validation Status";

  const recordsHeading = document.createElement("h3");
  recordsHeading.textContent = "Latest validation records";

  panel.append(
    heading,
    createStatusRows(
      hasValidationSignals(record) ? buildValidationStatusRows(record) : [],
      "No validation signals for this decision."
    ),
    recordsHeading,
    createStatusRows(
      summarizeValidationRecords(
        sortValidationRecordsNewestFirst(validationRecords).slice(0, 5)
      ),
      "No validation records available."
    )
  );

  return panel;
};
