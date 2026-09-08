import { createLiveRuntimeClient } from "./liveRuntimeClient.js";
import {
  chooseInitialSelectedRecord,
  includeLatestAuditRecord
} from "./liveDataFormatters.js";
import { mockAuditRecords } from "./mockAuditRecords.js";
import { mockPolicy, mockPolicySource } from "./mockPolicy.js";
import { mockValidationRecords } from "./mockValidationRecords.js";
import type {
  RuntimeDashboardData,
  RuntimeDashboardLoadOptions,
  RuntimeDataSource
} from "./runtimeDataTypes.js";
import type {
  PlaceholderDashboardData,
  UiAuditRecord,
  UiGitStateSummary
} from "./types.js";

export const defaultRuntimeDataSource: RuntimeDataSource = "mock";

export const getInitialRuntimeDataSource = (
  search = (globalThis as { location?: { search?: string } }).location
    ?.search ?? ""
): RuntimeDataSource => {
  const params = new URLSearchParams(search);

  return params.get("source") === "live" ? "live" : "mock";
};

export const selectInitialDecisionId = (data: RuntimeDashboardData): string => {
  return chooseInitialSelectedRecord(data)?.decisionId ?? "";
};

export const emptyRuntimeDashboardData = (
  source: RuntimeDataSource
): RuntimeDashboardData => ({
  auditRecords: [],
  latestAuditRecord: null,
  validationRecords: [],
  deferredActions: [],
  observations: [],
  source
});

export const loadRuntimeDashboardData = async (
  options: RuntimeDashboardLoadOptions
): Promise<RuntimeDashboardData> => {
  if (options.source === "mock") {
    return {
      auditRecords: mockAuditRecords,
      latestAuditRecord: mockAuditRecords[0] ?? null,
      validationRecords: mockValidationRecords,
      deferredActions: [
        {
          id: "def_mock_service_edit",
          status: "pending"
        }
      ],
      observations: [
        {
          id: "obs_mock_readme",
          relativePath: "README.md"
        },
        {
          id: "obs_mock_auth",
          relativePath: "auth/service.ts"
        },
        {
          id: "obs_mock_service_test",
          relativePath: "src/service.test.ts"
        }
      ],
      gitState: {
        isGitRepo: true,
        currentBranch: "feature/ui-runtime-client",
        repoIntegrityStatus: "clean"
      },
      status: {
        ok: true,
        readOnly: true,
        sessionId: options.sessionId ?? "demo"
      },
      policy: mockPolicy,
      policySource: mockPolicySource,
      source: "mock"
    };
  }

  const client = createLiveRuntimeClient({
    ...(options.apiBaseUrl !== undefined ? { baseUrl: options.apiBaseUrl } : {})
  });

  const [
    auditRecords,
    latestAuditRecord,
    validationRecords,
    deferredActions,
    observations,
    gitState,
    status,
    policyResult
  ] = await Promise.all([
    client.getAuditRecords(options.limit),
    client.getLatestAuditRecord(),
    client.getValidationRecords(options.sessionId, options.limit),
    client.getDeferredActions(options.sessionId, options.limit),
    client.getObservations(options.sessionId, options.limit),
    client.getGitState(),
    client.getStatus(),
    client.getPolicy()
  ]);

  return {
    auditRecords: includeLatestAuditRecord(auditRecords, latestAuditRecord),
    latestAuditRecord,
    validationRecords,
    deferredActions,
    observations,
    gitState,
    status,
    ...(policyResult.policy !== undefined
      ? { policy: policyResult.policy }
      : {}),
    ...(policyResult.source !== undefined
      ? { policySource: policyResult.source }
      : {}),
    source: "live"
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const countLabel = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const gitSummaryFromRuntimeData = (
  data: RuntimeDashboardData
): UiGitStateSummary => {
  const state = isRecord(data.gitState) ? data.gitState : {};
  const isGitRepo = state["isGitRepo"] === true;
  const branch =
    typeof state["currentBranch"] === "string"
      ? state["currentBranch"]
      : isGitRepo
        ? "Unknown branch"
        : "Not a Git repo";
  const repoIntegrityStatus =
    state["repoIntegrityStatus"] === "clean" ||
    state["repoIntegrityStatus"] === "dirty" ||
    state["repoIntegrityStatus"] === "not_git_repo" ||
    state["repoIntegrityStatus"] === "unknown"
      ? state["repoIntegrityStatus"]
      : "unknown";

  return {
    isGitRepo,
    branch,
    repoIntegrityStatus
  };
};

export const runtimeDashboardToPlaceholderData = (
  data: RuntimeDashboardData,
  selectedDecisionId?: string
): PlaceholderDashboardData => {
  const decisionId =
    selectedDecisionId !== undefined &&
    data.auditRecords.some(
      (record: UiAuditRecord) => record.decisionId === selectedDecisionId
    )
      ? selectedDecisionId
      : selectInitialDecisionId(data);

  return {
    auditRecords: data.auditRecords,
    validationRecordItems: data.validationRecords,
    selectedDecisionId: decisionId,
    source: data.source,
    ...(data.latestAuditRecord !== undefined
      ? { latestAuditRecord: data.latestAuditRecord }
      : {}),
    ...(data.deferredActions !== undefined
      ? { deferredActionItems: data.deferredActions }
      : {}),
    ...(data.observations !== undefined
      ? { observationItems: data.observations }
      : {}),
    ...(data.gitState !== undefined ? { liveGitState: data.gitState } : {}),
    ...(data.policy !== undefined ? { policy: data.policy } : {}),
    ...(data.policySource !== undefined
      ? { policySource: data.policySource }
      : {}),
    deferredActions: {
      label: "Deferred actions",
      count: data.deferredActions?.length ?? 0,
      detail: countLabel(
        data.deferredActions?.length ?? 0,
        "registry row",
        "registry rows"
      )
    },
    validationRecords: {
      label: "Validation records",
      count: data.validationRecords.length,
      detail: countLabel(
        data.validationRecords.length,
        "validation record",
        "validation records"
      )
    },
    observations: {
      label: "File observations",
      count: data.observations?.length ?? 0,
      detail: countLabel(
        data.observations?.length ?? 0,
        "observation",
        "observations"
      )
    },
    gitState: gitSummaryFromRuntimeData(data),
    auditTimeline: {
      label: "Audit timeline",
      count: data.auditRecords.length,
      detail: countLabel(
        data.auditRecords.length,
        "audit event",
        "audit events"
      )
    }
  };
};
