import type {
  RuntimeConnectionState,
  RuntimeDashboardData
} from "./runtimeDataTypes.js";
import type { UiPolicySource, UiStatusRow } from "./types.js";

type StatusSeverity = NonNullable<UiStatusRow["severity"]>;

export interface RuntimeStatusBadge {
  label: string;
  tone: "neutral" | "low" | "medium" | "high" | "critical";
}

export interface RuntimeStatusOptions {
  connectionState?: RuntimeConnectionState;
  apiBaseUrl?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const boolValue = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const statusRecord = (data: RuntimeDashboardData): Record<string, unknown> =>
  isRecord(data.status) ? data.status : {};

const storesRecord = (data: RuntimeDashboardData): Record<string, unknown> =>
  isRecord(statusRecord(data)["stores"])
    ? (statusRecord(data)["stores"] as Record<string, unknown>)
    : {};

const storeAvailability = (
  stores: Record<string, unknown>,
  key: string
): string => {
  const entry = stores[key];

  if (!isRecord(entry)) {
    return "unknown";
  }

  return boolValue(entry["available"]) === true ? "available" : "missing";
};

const severityForAvailability = (value: string): StatusSeverity =>
  value === "available" ? "low" : value === "missing" ? "medium" : "unknown";

const policySourceValue = (source: UiPolicySource | undefined): string => {
  if (source === undefined) {
    return "unavailable";
  }

  if (source.type === "default") {
    return "default";
  }

  if (source.path !== undefined) {
    return `${source.type}: ${source.path}`;
  }

  return source.type;
};

const sessionIdFromData = (data: RuntimeDashboardData): string =>
  stringValue(statusRecord(data)["sessionId"]) ??
  data.auditRecords.find((record) => record.sessionId !== undefined)
    ?.sessionId ??
  "default";

const gitSummary = (data: RuntimeDashboardData): string => {
  if (!isRecord(data.gitState)) {
    return "unknown";
  }

  if (data.gitState["isGitRepo"] === false) {
    return "not a git repo";
  }

  return stringValue(data.gitState["currentBranch"]) ?? "git repo";
};

export const isBetaDemoRuntimeData = (data: RuntimeDashboardData): boolean => {
  const cwd = stringValue(statusRecord(data)["cwd"]);

  return (
    cwd?.includes("examples/beta-demo/workdir") === true ||
    sessionIdFromData(data) === "beta-demo" ||
    data.auditRecords.some((record) => record.sessionId === "beta-demo")
  );
};

export const buildRuntimeStatusBadges = (
  data: RuntimeDashboardData,
  options: RuntimeStatusOptions = {}
): RuntimeStatusBadge[] => {
  const badges: RuntimeStatusBadge[] = [
    {
      label: data.source === "live" ? "Live Local" : "Mock Demo",
      tone: data.source === "live" ? "low" : "neutral"
    }
  ];
  const readOnly = boolValue(statusRecord(data)["readOnly"]);

  if (data.source === "mock" || readOnly === true) {
    badges.push({ label: "Read-only", tone: "low" });
  }

  if (data.source === "live" && options.connectionState === "error") {
    badges.push({ label: "API error", tone: "high" });
  }

  if (data.policySource?.type === "default") {
    badges.push({ label: "Default policy", tone: "medium" });
  } else if (data.policySource !== undefined) {
    badges.push({ label: "Project policy", tone: "low" });
  }

  if (isBetaDemoRuntimeData(data)) {
    badges.push({ label: "Beta demo data", tone: "neutral" });
  }

  return badges;
};

export const buildRuntimeStatusRows = (
  data: RuntimeDashboardData,
  options: RuntimeStatusOptions = {}
): UiStatusRow[] => {
  const status = statusRecord(data);
  const stores = storesRecord(data);
  const rows: UiStatusRow[] = [
    {
      label: "Data source",
      value: data.source === "live" ? "Live Local" : "Mock Demo",
      severity: data.source === "live" ? "low" : "neutral"
    },
    {
      label: "API status",
      value:
        data.source === "mock"
          ? "mock mode"
          : (options.connectionState ?? "unknown"),
      severity:
        options.connectionState === "connected"
          ? "low"
          : options.connectionState === "error"
            ? "high"
            : "neutral"
    }
  ];

  if (options.apiBaseUrl !== undefined) {
    rows.push({
      label: "API URL",
      value: options.apiBaseUrl
    });
  }

  rows.push(
    {
      label: "Project cwd",
      value: stringValue(status["cwd"]) ?? "unavailable"
    },
    {
      label: "Session",
      value: sessionIdFromData(data)
    },
    {
      label: "Read-only",
      value:
        boolValue(status["readOnly"]) === true || data.source === "mock"
          ? "true"
          : "unknown",
      severity:
        boolValue(status["readOnly"]) === true || data.source === "mock"
          ? "low"
          : "unknown"
    }
  );

  for (const [label, key] of [
    ["Audit store", "audit"],
    ["Deferred store", "deferred"],
    ["Observations store", "observations"],
    ["Validation store", "validation"]
  ] as const) {
    const value =
      data.source === "mock" ? "mock data" : storeAvailability(stores, key);
    rows.push({
      label,
      value,
      severity:
        data.source === "mock" ? "neutral" : severityForAvailability(value)
    });
  }

  rows.push(
    {
      label: "Policy source",
      value: policySourceValue(data.policySource),
      severity: data.policySource?.type === "default" ? "medium" : "low"
    },
    {
      label: "Policy version",
      value: data.policySource?.version ?? data.policy?.version ?? "unknown"
    },
    {
      label: "Git",
      value: gitSummary(data)
    }
  );

  return rows;
};

export const defaultPolicyEmptyStateHint = (
  source: UiPolicySource | undefined
): string[] =>
  source?.type === "default" ? ["stepharbor init --template node"] : [];
