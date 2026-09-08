import { summarizeFetchStep } from "../api/deferFormatters.js";
import type { UiFetchPlanStep } from "../api/types.js";

export const createFetchPlanList = (steps: UiFetchPlanStep[]): HTMLElement => {
  const list = document.createElement("ul");
  list.className = "defer-detail-list fetch-plan-list";

  for (const step of steps) {
    const item = document.createElement("li");

    const title = document.createElement("strong");
    title.textContent = step.type;
    item.append(title);

    const summary = document.createElement("p");
    summary.textContent = summarizeFetchStep(step);
    item.append(summary);

    list.append(item);
  }

  return list;
};
