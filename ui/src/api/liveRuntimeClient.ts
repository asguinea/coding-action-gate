import type {
  UiAuditRecord,
  UiPolicy,
  UiPolicySource,
  UiValidationRecord
} from "./types.js";
import {
  normalizeUiPolicy,
  normalizeUiPolicySource
} from "./policyFormatters.js";
import { RuntimeDataError } from "./runtimeDataTypes.js";

export interface LiveRuntimeClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface LiveRuntimeClient {
  getHealth(): Promise<unknown>;
  getStatus(): Promise<unknown>;
  getAuditRecords(limit?: number): Promise<UiAuditRecord[]>;
  getLatestAuditRecord(): Promise<UiAuditRecord | null>;
  getDeferredActions(sessionId?: string, limit?: number): Promise<unknown[]>;
  getObservations(sessionId?: string, limit?: number): Promise<unknown[]>;
  getValidationRecords(
    sessionId?: string,
    limit?: number
  ): Promise<UiValidationRecord[]>;
  getGitState(): Promise<unknown>;
  getPolicy(): Promise<{ policy?: UiPolicy; source?: UiPolicySource }>;
}

const importMetaEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

export const defaultLiveRuntimeApiUrl =
  importMetaEnv?.["VITE_STEPHARBOR_API_URL"] ?? "http://127.0.0.1:17373";

export const defaultLiveRuntimeTimeoutMs = 5000;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const withQuery = (
  path: string,
  query: Record<string, string | number | undefined>
): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();

  return serialized.length > 0 ? `${path}?${serialized}` : path;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const safeString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

export const safeArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const safeRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const localHostnames = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export const validateLiveRuntimeBaseUrl = (value: string): string => {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new RuntimeDataError(
      "Live API URL must be a valid localhost HTTP URL."
    );
  }

  if (parsed.protocol !== "http:" || !localHostnames.has(parsed.hostname)) {
    throw new RuntimeDataError(
      "Live API URL must use http://127.0.0.1, http://localhost, or http://[::1]."
    );
  }

  return trimTrailingSlash(parsed.toString());
};

const isDecision = (value: unknown): value is UiAuditRecord["decision"] =>
  value === "PROCEED" ||
  value === "DEFER" ||
  value === "ESCALATE" ||
  value === "BLOCK";

export const normalizeUiAuditRecord = (
  value: unknown
): UiAuditRecord | null => {
  if (!isRecord(value) || !isRecord(value["action"])) {
    return null;
  }

  const decisionId = safeString(value["decisionId"], "");
  const timestamp = safeString(value["timestamp"], "");
  const actionType = safeString(value["action"]["type"], "");

  if (
    decisionId.length === 0 ||
    timestamp.length === 0 ||
    actionType.length === 0 ||
    !isDecision(value["decision"])
  ) {
    return null;
  }

  const actionTargetPaths = Array.isArray(value["action"]["targetPaths"])
    ? value["action"]["targetPaths"].filter(
        (entry) => typeof entry === "string"
      )
    : undefined;
  const targetPaths = Array.isArray(value["targetPaths"])
    ? value["targetPaths"].filter((entry) => typeof entry === "string")
    : undefined;
  const policyTrace = Array.isArray(value["policyTrace"])
    ? (value["policyTrace"] as NonNullable<UiAuditRecord["policyTrace"]>)
    : undefined;
  const missingContext = Array.isArray(value["missingContext"])
    ? (value["missingContext"] as NonNullable<UiAuditRecord["missingContext"]>)
    : undefined;
  const fetchPlan = Array.isArray(value["fetchPlan"])
    ? (value["fetchPlan"] as NonNullable<UiAuditRecord["fetchPlan"]>)
    : undefined;
  const riskIfProceeding = Array.isArray(value["riskIfProceeding"])
    ? value["riskIfProceeding"].filter((entry) => typeof entry === "string")
    : undefined;
  const expectedNextDecision =
    value["expectedNextDecision"] === "PROCEED" ||
    value["expectedNextDecision"] === "DEFER" ||
    value["expectedNextDecision"] === "ESCALATE" ||
    value["expectedNextDecision"] === "BLOCK" ||
    value["expectedNextDecision"] === "UNKNOWN"
      ? value["expectedNextDecision"]
      : undefined;

  return {
    decisionId,
    timestamp,
    ...(typeof value["sessionId"] === "string"
      ? { sessionId: value["sessionId"] }
      : {}),
    action: {
      id: safeString(value["action"]["id"], "unknown-action"),
      type: actionType,
      ...(typeof value["action"]["targetPath"] === "string"
        ? { targetPath: value["action"]["targetPath"] }
        : {}),
      ...(actionTargetPaths !== undefined
        ? { targetPaths: actionTargetPaths }
        : {}),
      ...(typeof value["action"]["command"] === "string"
        ? { command: value["action"]["command"] }
        : {}),
      ...(typeof value["action"]["validationKind"] === "string"
        ? { validationKind: value["action"]["validationKind"] }
        : {})
    },
    ...(targetPaths !== undefined ? { targetPaths } : {}),
    decision: value["decision"],
    reason: safeString(value["reason"], "No reason provided."),
    ...(isRecord(value["signals"]) ? { signals: value["signals"] } : {}),
    ...(policyTrace !== undefined ? { policyTrace } : {}),
    ...(isRecord(value["evidence"]) ? { evidence: value["evidence"] } : {}),
    ...(typeof value["deferReasonCategory"] === "string"
      ? { deferReasonCategory: value["deferReasonCategory"] }
      : {}),
    ...(missingContext !== undefined ? { missingContext } : {}),
    ...(fetchPlan !== undefined ? { fetchPlan } : {}),
    ...(riskIfProceeding !== undefined ? { riskIfProceeding } : {}),
    ...(expectedNextDecision !== undefined ? { expectedNextDecision } : {}),
    ...(typeof value["reanalysisRequired"] === "boolean"
      ? { reanalysisRequired: value["reanalysisRequired"] }
      : {}),
    ...(typeof value["validationStatus"] === "string"
      ? { validationStatus: value["validationStatus"] }
      : {})
  };
};

export const normalizeUiValidationRecord = (
  value: unknown
): UiValidationRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ...(typeof value["id"] === "string" ? { id: value["id"] } : {}),
    ...(typeof value["kind"] === "string" ? { kind: value["kind"] } : {}),
    ...(typeof value["command"] === "string"
      ? { command: value["command"] }
      : {}),
    ...(typeof value["status"] === "string" ? { status: value["status"] } : {}),
    ...(typeof value["exitCode"] === "number"
      ? { exitCode: value["exitCode"] }
      : {}),
    ...(typeof value["completedAt"] === "string"
      ? { completedAt: value["completedAt"] }
      : {})
  };
};

const getArrayProperty = (body: unknown, key: string): unknown[] => {
  if (!isRecord(body)) {
    return [];
  }

  const value = body[key];

  return Array.isArray(value) ? value : [];
};

const getProperty = (body: unknown, key: string): unknown =>
  isRecord(body) ? body[key] : undefined;

const requestJson = async (
  baseUrl: string,
  path: string,
  timeoutMs: number
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let body: unknown;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal
    });
    body = (await response.json()) as unknown;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));

    throw new RuntimeDataError(
      aborted ? "Live API request timed out." : "Live API request failed."
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message =
      isRecord(body) &&
      isRecord(body["error"]) &&
      typeof body["error"]["message"] === "string"
        ? body["error"]["message"]
        : `StepHarbor UI API request failed with HTTP ${response.status}.`;

    throw new RuntimeDataError(message, response.status);
  }

  if (!isRecord(body) || typeof body["ok"] !== "boolean") {
    throw new RuntimeDataError("Live API returned a malformed response.");
  }

  return body;
};

export const createLiveRuntimeClient = (
  options: LiveRuntimeClientOptions = {}
): LiveRuntimeClient => {
  const baseUrl = validateLiveRuntimeBaseUrl(
    options.baseUrl ?? defaultLiveRuntimeApiUrl
  );
  const timeoutMs = options.timeoutMs ?? defaultLiveRuntimeTimeoutMs;

  return {
    getHealth: async (): Promise<unknown> =>
      requestJson(baseUrl, "/api/health", timeoutMs),

    getStatus: async (): Promise<unknown> =>
      requestJson(baseUrl, "/api/status", timeoutMs),

    getAuditRecords: async (limit?: number): Promise<UiAuditRecord[]> =>
      getArrayProperty(
        await requestJson(
          baseUrl,
          withQuery("/api/audit", { limit }),
          timeoutMs
        ),
        "records"
      ).flatMap((record) => {
        const normalized = normalizeUiAuditRecord(record);

        return normalized === null ? [] : [normalized];
      }),

    getLatestAuditRecord: async (): Promise<UiAuditRecord | null> => {
      const body = await requestJson(baseUrl, "/api/audit/latest", timeoutMs);
      const record = getProperty(body, "record");

      return record === null || record === undefined
        ? null
        : normalizeUiAuditRecord(record);
    },

    getDeferredActions: async (
      sessionId?: string,
      limit?: number
    ): Promise<unknown[]> =>
      getArrayProperty(
        await requestJson(
          baseUrl,
          withQuery("/api/deferred", { sessionId, limit }),
          timeoutMs
        ),
        "records"
      ),

    getObservations: async (
      sessionId?: string,
      limit?: number
    ): Promise<unknown[]> =>
      getArrayProperty(
        await requestJson(
          baseUrl,
          withQuery("/api/observations", { sessionId, limit }),
          timeoutMs
        ),
        "records"
      ),

    getValidationRecords: async (
      sessionId?: string,
      limit?: number
    ): Promise<UiValidationRecord[]> =>
      getArrayProperty(
        await requestJson(
          baseUrl,
          withQuery("/api/validation", { sessionId, limit }),
          timeoutMs
        ),
        "records"
      ).flatMap((record) => {
        const normalized = normalizeUiValidationRecord(record);

        return normalized === null ? [] : [normalized];
      }),

    getGitState: async (): Promise<unknown> =>
      getProperty(
        await requestJson(baseUrl, "/api/git-state", timeoutMs),
        "state"
      ),

    getPolicy: async (): Promise<{
      policy?: UiPolicy;
      source?: UiPolicySource;
    }> => {
      const body = await requestJson(baseUrl, "/api/policy", timeoutMs);
      const policy = normalizeUiPolicy(getProperty(body, "policy"));
      const source = normalizeUiPolicySource(getProperty(body, "source"));

      return {
        ...(policy !== undefined ? { policy } : {}),
        ...(source !== undefined ? { source } : {})
      };
    }
  };
};
