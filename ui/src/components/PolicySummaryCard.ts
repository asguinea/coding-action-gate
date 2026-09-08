const createList = (items: string[]): HTMLElement => {
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No entries configured.";

    return empty;
  }

  const list = document.createElement("ul");
  list.className = "policy-summary-list";

  for (const item of items) {
    const entry = document.createElement("li");
    entry.textContent = item;
    list.append(entry);
  }

  return list;
};

export const createPolicySummaryCard = (
  title: string,
  items: string[]
): HTMLElement => {
  const card = document.createElement("section");
  card.className = "policy-summary-card";

  const heading = document.createElement("h3");
  heading.textContent = title;

  card.append(heading, createList(items));

  return card;
};
