export const createRiskList = (risks: string[]): HTMLElement => {
  const list = document.createElement("ul");
  list.className = "defer-detail-list risk-list";

  for (const risk of risks) {
    const item = document.createElement("li");
    item.textContent = risk;
    list.append(item);
  }

  return list;
};
