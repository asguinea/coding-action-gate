import type {
  RuntimeConnectionState,
  RuntimeDataSource
} from "../api/runtimeDataTypes.js";

export interface RuntimeConnectionStatusOptions {
  source: RuntimeDataSource;
  state: RuntimeConnectionState;
  apiBaseUrl: string;
  errorMessage?: string;
}

const messageForState = (options: RuntimeConnectionStatusOptions): string => {
  if (options.source === "mock") {
    return "Mock Demo mode active. Browser data is realistic fixture data.";
  }

  switch (options.state) {
    case "loading":
      return `Connecting to ${options.apiBaseUrl}...`;
    case "connected":
      return `Connected to ${options.apiBaseUrl}.`;
    case "error":
      return `Error: ${options.errorMessage ?? "Live API not connected."}`;
    case "idle":
      return "Live Local selected. Reload to connect.";
  }
};

export const createRuntimeConnectionStatus = (
  options: RuntimeConnectionStatusOptions
): HTMLElement => {
  const status = document.createElement("aside");
  status.className = `runtime-connection-status runtime-connection-${options.state}`;
  status.textContent = messageForState(options);

  return status;
};
