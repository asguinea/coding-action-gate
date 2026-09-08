import type { UiDecisionPosture } from "../api/types.js";

export const createDecisionBadge = (
  decision: UiDecisionPosture
): HTMLSpanElement => {
  const badge = document.createElement("span");
  badge.className = `decision-badge decision-${decision.toLowerCase()}`;
  badge.textContent = decision;

  return badge;
};
