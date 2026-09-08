import { signalSummaryForRecord } from "./decisionFormatters.js";
import type { RuntimeDashboardData } from "./runtimeDataTypes.js";
import type {
  UiAuditRecord,
  UiStatusRow,
  UiValidationRecord
} from "./types.js";

export interface LiveDataSummary {
  auditRecords: number;
  deferredActions: number;
  observations: number;
  validationRecords: number;
  git: string;
}

export interface DeferredActionMatch {
  id: string;
  status?: string;
  createdAt?: string;
  requiredEvidenceCount: number;
  satisfiedEvidenceCount?: number;
}

export interface ObservationHint {
  target: string;
  observed: boolean;
  observedAt?: string;
  metadataOnly?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const boolValue = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const arrayValue = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const gitSummary = (gitState: unknown): string => {
  if (!isRecord(gitState)) {
    return "unknown";
  }

  if (gitState["isGitRepo"] === false) {
    return "not a git repo";
  }

  const branch = stringValue(gitState["currentBranch"]) ?? "unknown branch";
  const dirty =
    boolValue(gitState["isDirty"]) ??
    (gitState["repoIntegrityStatus"] === "dirty"
      ? true
      : gitState["repoIntegrityStatus"] === "clean"
        ? false
        : undefined);

  if (dirty === undefined) {
    return branch;
  }

  return `${branch} · ${dirty ? "dirty" : "clean"}`;
};

export const buildLiveDataSummary = (
  data: RuntimeDashboardData
): LiveDataSummary => ({
  auditRecords: data.auditRecords.length,
  deferredActions: data.deferredActions?.length ?? 0,
  observations: data.observations?.length ?? 0,
  validationRecords: data.validationRecords.length,
  git: gitSummary(data.gitState)
});

const timestampMs = (value: string | undefined): number => {
  if (value === undefined) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

export const chooseInitialSelectedRecord = (
  data: RuntimeDashboardData
): UiAuditRecord | null => {
  const latest = data.latestAuditRecord;

  if (latest !== null && latest !== undefined) {
    return latest;
  }

  return (
    [...data.auditRecords].sort(
      (left, right) =>
        timestampMs(right.timestamp) - timestampMs(left.timestamp)
    )[0] ?? null
  );
};

export const includeLatestAuditRecord = (
  records: UiAuditRecord[],
  latest: UiAuditRecord | null | undefined
): UiAuditRecord[] => {
  if (latest === null || latest === undefined) {
    return records;
  }

  if (records.some((record) => record.decisionId === latest.decisionId)) {
    return records;
  }

  return [latest, ...records];
};

export const getDeferredActionIdForRecord = (
  record: UiAuditRecord
): string | undefined => {
  const evidence = record.evidence;

  if (typeof evidence?.deferredActionId === "string") {
    return evidence.deferredActionId;
  }

  if (typeof evidence?.deferredAction?.id === "string") {
    return evidence.deferredAction.id;
  }

  const topLevel = (record as unknown as Record<string, unknown>)[
    "deferredActionId"
  ];

  return stringValue(topLevel);
};

export const findDeferredActionForRecord = (
  record: UiAuditRecord,
  deferredActions: unknown[] = []
): DeferredActionMatch | null => {
  const deferredActionId = getDeferredActionIdForRecord(record);

  if (deferredActionId === undefined) {
    return null;
  }

  const match = deferredActions.find(
    (entry) => isRecord(entry) && entry["id"] === deferredActionId
  );

  if (!isRecord(match)) {
    return {
      id: deferredActionId,
      requiredEvidenceCount: 0
    };
  }

  const requiredEvidence = arrayValue(match["requiredEvidence"]);
  const satisfiedEvidence = arrayValue(match["satisfiedEvidence"]);
  const status = stringValue(match["status"]);
  const createdAt = stringValue(match["createdAt"]);

  return {
    id: deferredActionId,
    ...(status !== undefined ? { status } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    requiredEvidenceCount: requiredEvidence.length,
    ...(satisfiedEvidence.length > 0
      ? { satisfiedEvidenceCount: satisfiedEvidence.length }
      : {})
  };
};

const observationTarget = (entry: unknown): string | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }

  return (
    stringValue(entry["relativePath"]) ??
    stringValue(entry["path"]) ??
    stringValue(entry["target"])
  );
};

export const buildObservationHints = (
  record: UiAuditRecord,
  observations: unknown[] = []
): ObservationHint[] => {
  const targets = (record.fetchPlan ?? [])
    .filter(
      (step) => step.type === "read_file" || step.type === "read_related_tests"
    )
    .flatMap((step) => (step.target !== undefined ? [step.target] : []));
  const uniqueTargets = Array.from(new Set(targets));

  return uniqueTargets.map((target) => {
    const matchingObservations = observations
      .filter((entry) => observationTarget(entry) === target)
      .filter(isRecord)
      .sort(
        (left, right) =>
          timestampMs(stringValue(right["observedAt"])) -
          timestampMs(stringValue(left["observedAt"]))
      );
    const latest = matchingObservations[0];
    const observedAt = stringValue(latest?.["observedAt"]);
    const metadataOnly = boolValue(latest?.["metadataOnly"]);

    return {
      target,
      observed: latest !== undefined,
      ...(observedAt !== undefined ? { observedAt } : {}),
      ...(metadataOnly !== undefined ? { metadataOnly } : {})
    };
  });
};

export const sortValidationRecordsNewestFirst = (
  records: UiValidationRecord[]
): UiValidationRecord[] =>
  [...records].sort(
    (left, right) =>
      timestampMs(right.completedAt) - timestampMs(left.completedAt)
  );

export type LiveEmptyStateResource =
  | "audit"
  | "deferred"
  | "observations"
  | "validation";

export const buildLiveEmptyStateHints = (
  resourceType: LiveEmptyStateResource,
  options: {
    defaultPolicy?: boolean;
  } = {}
): string[] => {
  switch (resourceType) {
    case "audit":
      return options.defaultPolicy === true
        ? [
            'coding-action-gate exec "git status" --cwd .',
            "coding-action-gate doctor --cwd .",
            "coding-action-gate init --template node"
          ]
        : [
            'coding-action-gate exec "git status" --cwd .',
            "coding-action-gate doctor --cwd .",
            "coding-action-gate read README.md --session-id default --json"
          ];
    case "deferred":
      return [
        "coding-action-gate decide <edit-action.json> --session-id default"
      ];
    case "observations":
      return ["coding-action-gate read README.md --session-id default --json"];
    case "validation":
      return [
        'coding-action-gate validate other --command "node -e \\"process.exit(0)\\"" --json'
      ];
  }
};

export const buildGitRowsWithFallback = (
  record: UiAuditRecord | undefined,
  gitState: unknown
): UiStatusRow[] => {
  const signals = record === undefined ? {} : signalSummaryForRecord(record);

  if (
    Object.keys(signals).some(
      (key) =>
        key.startsWith("git") || key.includes("Branch") || key === "branchRisk"
    )
  ) {
    return [];
  }

  if (!isRecord(gitState)) {
    return [];
  }

  return [
    {
      label: "Current branch",
      value: stringValue(gitState["currentBranch"]) ?? "Unknown branch"
    },
    {
      label: "Repo state",
      value: stringValue(gitState["repoIntegrityStatus"]) ?? "unknown",
      severity:
        gitState["repoIntegrityStatus"] === "dirty"
          ? "medium"
          : gitState["repoIntegrityStatus"] === "clean"
            ? "low"
            : "unknown"
    }
  ];
};
