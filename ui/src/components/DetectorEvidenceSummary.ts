import { getDetectorIds } from "../api/auditTimelineFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

export const createDetectorEvidenceSummary = (
  record: UiAuditRecord
): HTMLElement => {
  const detectorIds = getDetectorIds(record);
  const wrapper = document.createElement("div");
  wrapper.className = "detector-summary";

  if (detectorIds.length === 0) {
    wrapper.textContent = "No detector evidence";
    return wrapper;
  }

  for (const detectorId of detectorIds) {
    const chip = document.createElement("span");
    chip.className = "detector-chip";
    chip.textContent = detectorId;
    wrapper.append(chip);
  }

  return wrapper;
};
