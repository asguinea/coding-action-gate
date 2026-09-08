import type { RuntimeDataSource } from "../api/runtimeDataTypes.js";

export interface DataSourceSelectorOptions {
  source: RuntimeDataSource;
  apiBaseUrl: string;
  loading: boolean;
  onSourceChange(source: RuntimeDataSource): void;
  onApiBaseUrlChange(value: string): void;
  onReload(): void;
}

export const createDataSourceSelector = (
  options: DataSourceSelectorOptions
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "data-source-selector";

  const sourceField = document.createElement("label");
  sourceField.className = "data-source-field";
  const sourceLabel = document.createElement("span");
  sourceLabel.textContent = "Data source";
  const sourceSelect = document.createElement("select");
  sourceSelect.disabled = options.loading;

  const mockOption = document.createElement("option");
  mockOption.value = "mock";
  mockOption.textContent = "Mock Demo";
  const liveOption = document.createElement("option");
  liveOption.value = "live";
  liveOption.textContent = "Live Local";
  sourceSelect.append(mockOption, liveOption);
  sourceSelect.value = options.source;
  sourceSelect.addEventListener("change", () => {
    options.onSourceChange(sourceSelect.value === "live" ? "live" : "mock");
  });
  sourceField.append(sourceLabel, sourceSelect);

  const apiField = document.createElement("label");
  apiField.className = "data-source-field data-source-url";
  const apiLabel = document.createElement("span");
  apiLabel.textContent = "API URL";
  const apiInput = document.createElement("input");
  apiInput.type = "url";
  apiInput.value = options.apiBaseUrl;
  apiInput.disabled = options.loading;
  apiInput.addEventListener("change", () => {
    options.onApiBaseUrlChange(apiInput.value);
  });
  apiField.append(apiLabel, apiInput);

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "reload-button";
  reload.disabled = options.loading;
  reload.textContent = options.loading ? "Loading..." : "Reload";
  reload.addEventListener("click", () => options.onReload());

  section.append(sourceField, apiField, reload);

  return section;
};
