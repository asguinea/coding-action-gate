import { getEscalationPolicies } from "../api/escalationFormatters.js";
import type { UiAuditRecord } from "../api/types.js";

export const createEscalationPolicyList = (
  record: UiAuditRecord
): HTMLElement => {
  const policies = getEscalationPolicies(record);
  const list = document.createElement("ul");
  list.className = "policy-trace-list escalation-policy-list";

  if (policies.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No matched escalation policies.";
    list.append(empty);

    return list;
  }

  for (const policy of policies) {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.className = "policy-rule";
    title.textContent = policy.ruleId;
    item.append(title);

    if (policy.reason !== undefined) {
      const reason = document.createElement("p");
      reason.className = "card-secondary";
      reason.textContent = policy.reason;
      item.append(reason);
    }

    list.append(item);
  }

  return list;
};
