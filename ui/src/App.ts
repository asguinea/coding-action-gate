import { defaultLiveRuntimeApiUrl } from "./api/liveRuntimeClient.js";
import {
  emptyRuntimeDashboardData,
  getInitialRuntimeDataSource,
  loadRuntimeDashboardData,
  runtimeDashboardToPlaceholderData,
  selectInitialDecisionId
} from "./api/dataSource.js";
import type {
  RuntimeConnectionState,
  RuntimeDashboardData,
  RuntimeDataSource
} from "./api/runtimeDataTypes.js";
import type { UiAuditTimelineFilters } from "./api/types.js";
import { createDataSourceSelector } from "./components/DataSourceSelector.js";
import { createLayout } from "./components/Layout.js";
import { createLiveDataSummary } from "./components/LiveDataSummary.js";
import { createPlaceholderDashboard } from "./components/PlaceholderDashboard.js";
import { createRuntimeConnectionStatus } from "./components/RuntimeConnectionStatus.js";
import { createRuntimeStatusPanel } from "./components/RuntimeStatusPanel.js";

const errorMessageFor = (error: unknown): string =>
  error instanceof Error ? error.message : "Live API request failed.";

export const renderApp = async (mount: HTMLElement): Promise<void> => {
  const loading = document.createElement("p");
  loading.className = "loading";
  loading.textContent = "Loading CodingActionGate runtime summary...";
  mount.replaceChildren(loading);

  let source: RuntimeDataSource = getInitialRuntimeDataSource();
  let apiBaseUrl = defaultLiveRuntimeApiUrl;
  let connectionState: RuntimeConnectionState = "idle";
  let errorMessage: string | undefined;
  let runtimeData: RuntimeDashboardData = emptyRuntimeDashboardData(source);
  let selectedDecisionId = "";
  let auditFilters: UiAuditTimelineFilters = {};

  const renderDashboard = (): void => {
    const shell = document.createElement("div");
    shell.className = "app-content";
    const placeholderData = runtimeDashboardToPlaceholderData(
      runtimeData,
      selectedDecisionId
    );

    shell.append(
      createDataSourceSelector({
        source,
        apiBaseUrl,
        loading: connectionState === "loading",
        onSourceChange: (nextSource) => {
          source = nextSource;
          void loadData(true);
        },
        onApiBaseUrlChange: (nextApiBaseUrl) => {
          apiBaseUrl = nextApiBaseUrl;
          renderDashboard();
        },
        onReload: () => {
          void loadData(false);
        }
      }),
      createRuntimeConnectionStatus({
        source,
        state: connectionState,
        apiBaseUrl,
        ...(errorMessage !== undefined ? { errorMessage } : {})
      }),
      createRuntimeStatusPanel(runtimeData, {
        connectionState,
        apiBaseUrl
      }),
      createLiveDataSummary(runtimeData),
      createPlaceholderDashboard(
        placeholderData,
        (decisionId) => {
          selectedDecisionId = decisionId;
          renderDashboard();
        },
        auditFilters,
        (filters) => {
          auditFilters = filters;
          renderDashboard();
        }
      )
    );

    mount.replaceChildren(createLayout(shell));
  };

  const loadData = async (resetSelection: boolean): Promise<void> => {
    connectionState = source === "live" ? "loading" : "idle";
    errorMessage = undefined;
    renderDashboard();

    try {
      const nextData = await loadRuntimeDashboardData({
        source,
        apiBaseUrl,
        sessionId: "default",
        limit: 100
      });

      runtimeData = nextData;
      connectionState = source === "live" ? "connected" : "idle";

      if (resetSelection) {
        selectedDecisionId = selectInitialDecisionId(nextData);
        auditFilters = {};
      } else if (
        selectedDecisionId.length === 0 ||
        !nextData.auditRecords.some(
          (record) => record.decisionId === selectedDecisionId
        )
      ) {
        selectedDecisionId = selectInitialDecisionId(nextData);
      }
    } catch (error) {
      connectionState = "error";
      errorMessage = errorMessageFor(error);

      if (runtimeData.auditRecords.length === 0) {
        runtimeData = emptyRuntimeDashboardData(source);
        selectedDecisionId = "";
      }
    }

    renderDashboard();
  };

  await loadData(true);
};
