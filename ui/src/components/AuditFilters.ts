import {
  actionTypesForTimeline,
  decisionsForTimeline
} from "../api/auditTimelineFormatters.js";
import type { UiAuditRecord, UiAuditTimelineFilters } from "../api/types.js";

const createSelect = (
  labelText: string,
  values: string[],
  selectedValue: string,
  onChange: (value: string) => void
): HTMLElement => {
  const label = document.createElement("label");
  label.className = "filter-field";

  const text = document.createElement("span");
  text.textContent = labelText;

  const select = document.createElement("select");

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selectedValue;
    select.append(option);
  }

  select.addEventListener("change", () => onChange(select.value));
  label.append(text, select);

  return label;
};

export const createAuditFilters = (
  records: UiAuditRecord[],
  filters: UiAuditTimelineFilters,
  onChange: (filters: UiAuditTimelineFilters) => void
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "audit-filters";

  wrapper.append(
    createSelect(
      "Decision",
      decisionsForTimeline(),
      filters.decision ?? "all",
      (decision) =>
        onChange({
          ...filters,
          decision: decision as NonNullable<UiAuditTimelineFilters["decision"]>
        })
    ),
    createSelect(
      "Action type",
      actionTypesForTimeline(records),
      filters.actionType ?? "all",
      (actionType) =>
        onChange({
          ...filters,
          actionType
        })
    )
  );

  const searchLabel = document.createElement("label");
  searchLabel.className = "filter-field filter-search";
  const searchText = document.createElement("span");
  searchText.textContent = "Search";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "path or command";
  search.value = filters.search ?? "";
  search.addEventListener("input", () =>
    onChange({
      ...filters,
      search: search.value
    })
  );
  searchLabel.append(searchText, search);
  wrapper.append(searchLabel);

  return wrapper;
};
