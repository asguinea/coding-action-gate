import type { PlaceholderDashboardData } from "./types.js";
import {
  loadRuntimeDashboardData,
  runtimeDashboardToPlaceholderData
} from "./dataSource.js";

export const getDashboardData = async (): Promise<PlaceholderDashboardData> =>
  runtimeDashboardToPlaceholderData(
    await loadRuntimeDashboardData({
      source: "mock"
    }),
    "dec_mock_defer"
  );
