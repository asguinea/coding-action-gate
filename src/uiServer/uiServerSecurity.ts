import { UiServerError } from "./uiServerErrors.js";

export const defaultUiServerHost = "127.0.0.1";
export const defaultUiServerPort = 0;
export const defaultUiServerLimit = 100;
export const maxUiServerLimit = 500;

const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export const validateUiServerHost = (host?: string): string => {
  const resolvedHost = host ?? defaultUiServerHost;

  if (!allowedHosts.has(resolvedHost)) {
    throw new UiServerError(
      "UI_SERVER_UNSAFE_HOST",
      "UI server host must be localhost-only.",
      400
    );
  }

  return resolvedHost;
};

export const normalizeUiServerLimit = (limit?: number): number => {
  const resolvedLimit = limit ?? defaultUiServerLimit;

  if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1) {
    throw new UiServerError(
      "UI_INVALID_QUERY",
      "Limit must be a positive integer.",
      400
    );
  }

  return Math.min(resolvedLimit, maxUiServerLimit);
};

export const parseLimitQuery = (
  value: string | null,
  fallbackLimit?: number
): number => {
  if (value === null) {
    return normalizeUiServerLimit(fallbackLimit);
  }

  if (!/^\d+$/.test(value)) {
    throw new UiServerError(
      "UI_INVALID_QUERY",
      "Limit must be a positive integer.",
      400
    );
  }

  return normalizeUiServerLimit(Number(value));
};

export const resolveSessionId = (
  querySessionId: string | null,
  defaultSessionId?: string
): string => {
  const rawSessionId =
    querySessionId !== null && querySessionId.trim().length > 0
      ? querySessionId
      : (defaultSessionId ?? "default");

  if (!/^[0-9A-Za-z._-]+$/.test(rawSessionId)) {
    throw new UiServerError(
      "UI_INVALID_QUERY",
      "Session id may only contain letters, numbers, underscore, dash, and dot.",
      400
    );
  }

  return rawSessionId;
};

export const formatServerUrl = (host: string, port: number): string => {
  const displayHost = host === "::1" ? "[::1]" : host;

  return `http://${displayHost}:${port}`;
};
