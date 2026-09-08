import { summarizePolicyRules } from "../api/policyFormatters.js";
import type { UiPolicy } from "../api/types.js";

export const createPolicyRuleList = (
  policy: UiPolicy | undefined
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "policy-viewer-section";

  const heading = document.createElement("h3");
  heading.textContent = "Rules";
  section.append(heading);

  const rules = summarizePolicyRules(policy);

  if (rules.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No policy rules configured.";
    section.append(empty);

    return section;
  }

  const list = document.createElement("ul");
  list.className = "policy-rule-list";

  for (const rule of rules) {
    const item = document.createElement("li");

    const title = document.createElement("div");
    title.className = "policy-rule";
    title.textContent = `${rule.id} · ${rule.decision}`;

    const condition = document.createElement("p");
    condition.className = "card-secondary";
    condition.textContent = rule.condition;

    item.append(title, condition);

    if (rule.reason !== undefined) {
      const reason = document.createElement("p");
      reason.className = "card-secondary";
      reason.textContent = rule.reason;
      item.append(reason);
    }

    list.append(item);
  }

  section.append(list);

  return section;
};
