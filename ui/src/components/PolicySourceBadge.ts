import { summarizePolicySource } from "../api/policyFormatters.js";
import type { UiPolicySource } from "../api/types.js";

export const createPolicySourceBadge = (
  source: UiPolicySource | undefined
): HTMLElement => {
  const badge = document.createElement("span");
  badge.className = "policy-source-badge";
  badge.textContent = summarizePolicySource(source);

  return badge;
};
