import { buildEscalationRiskSummary } from "../api/escalationFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

export const createRiskSummary = (record: UiAuditRecord): HTMLElement => {
  const risks = buildEscalationRiskSummary(record);
  const list = document.createElement("div");
  list.className = "escalation-risk-list";

  if (risks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No escalation risk signals recorded.";
    list.append(empty);

    return list;
  }

  for (const risk of risks) {
    const row = document.createElement("div");
    row.className = `risk-row risk-${risk.severity}`;

    const label = document.createElement("strong");
    label.textContent = risk.label;

    const value = document.createElement("span");
    value.className = "risk-value";
    value.textContent = risk.value;

    row.append(label, value);

    if (risk.detail !== undefined && risk.detail.length > 0) {
      const detail = document.createElement("p");
      detail.textContent = risk.detail;
      row.append(detail);
    }

    list.append(row);
  }

  return list;
};
