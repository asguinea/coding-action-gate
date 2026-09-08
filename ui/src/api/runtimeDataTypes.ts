import type {
  UiAuditRecord,
  UiPolicy,
  UiPolicySource,
  UiValidationRecord
} from "./types.js";

export type RuntimeDataSource = "mock" | "live";

export type RuntimeConnectionState = "idle" | "loading" | "connected" | "error";

export interface RuntimeDashboardData {
  auditRecords: UiAuditRecord[];
  latestAuditRecord?: UiAuditRecord | null;
  validationRecords: UiValidationRecord[];
  deferredActions?: unknown[];
  observations?: unknown[];
  gitState?: unknown;
  status?: unknown;
  policy?: UiPolicy;
  policySource?: UiPolicySource;
  source: RuntimeDataSource;
}

export interface RuntimeDashboardLoadOptions {
  source: RuntimeDataSource;
  apiBaseUrl?: string;
  sessionId?: string;
  limit?: number;
}

export class RuntimeDataError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RuntimeDataError";
    if (status !== undefined) {
      this.status = status;
    }
  }
}
