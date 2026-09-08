import type {
  UiAuditRecord,
  UiFetchPlanStep,
  UiMissingContextEntry,
  UiSignalSummary,
  UiSuggestedCommand
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const signalSummaryForDeferRecord = (
  record: UiAuditRecord
): UiSignalSummary => {
  if (isRecord(record.evidence?.signalSummary)) {
    return record.evidence.signalSummary;
  }

  return record.signals ?? {};
};

const shellArg = (value: string): string =>
  /^[A-Za-z0-9_./:=@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

export const sessionIdForRecord = (record: UiAuditRecord): string =>
  record.sessionId !== undefined && record.sessionId.trim().length > 0
    ? record.sessionId
    : "default";

export const getDeferredActionId = (
  record: UiAuditRecord
): string | undefined => {
  if (
    typeof record.evidence?.deferredActionId === "string" &&
    record.evidence.deferredActionId.length > 0
  ) {
    return record.evidence.deferredActionId;
  }

  if (
    typeof record.evidence?.deferredAction?.id === "string" &&
    record.evidence.deferredAction.id.length > 0
  ) {
    return record.evidence.deferredAction.id;
  }

  return undefined;
};

export const getDeferReasonCategory = (
  record: UiAuditRecord
): string | undefined => {
  if (record.deferReasonCategory !== undefined) {
    return record.deferReasonCategory;
  }

  const signals = signalSummaryForDeferRecord(record);
  const value = signals["deferReasonCategory"];

  return typeof value === "string" ? value : undefined;
};

export const getExpectedNextDecision = (
  record: UiAuditRecord
): string | undefined => {
  if (record.expectedNextDecision !== undefined) {
    return record.expectedNextDecision;
  }

  const signals = signalSummaryForDeferRecord(record);
  const value = signals["expectedNextDecision"];

  return typeof value === "string" ? value : undefined;
};

export const getReanalysisRequired = (
  record: UiAuditRecord
): boolean | undefined => {
  if (record.reanalysisRequired !== undefined) {
    return record.reanalysisRequired;
  }

  const signals = signalSummaryForDeferRecord(record);
  const value = signals["reanalysisRequired"];

  return typeof value === "boolean" ? value : undefined;
};

export const buildReadCommandFromFetchStep = (
  step: UiFetchPlanStep,
  sessionId = "default"
): string | null => {
  if (
    (step.type === "read_file" || step.type === "read_related_tests") &&
    step.target !== undefined
  ) {
    return `coding-action-gate read ${shellArg(step.target)} --session-id ${shellArg(
      sessionId
    )}`;
  }

  return null;
};

export const buildValidationCommandFromFetchStep = (
  step: UiFetchPlanStep,
  sessionId = "default"
): string | null => {
  if (step.type !== "run_validation") {
    return null;
  }

  if (step.command !== undefined && step.command.trim().length > 0) {
    return `coding-action-gate validate other --command ${shellArg(
      step.command
    )} --session-id ${shellArg(sessionId)}`;
  }

  return `coding-action-gate validate ${
    step.validationKind ?? "<kind>"
  } --session-id ${shellArg(sessionId)}`;
};

export const buildRetryCommand = (
  deferredActionId: string | undefined,
  sessionId = "default"
): string | null =>
  deferredActionId !== undefined && deferredActionId.length > 0
    ? `coding-action-gate retry ${shellArg(deferredActionId)} --session-id ${shellArg(
        sessionId
      )}`
    : null;

export const buildSuggestedCommands = (
  record: UiAuditRecord
): UiSuggestedCommand[] => {
  const sessionId = sessionIdForRecord(record);
  const fetchCommands = (record.fetchPlan ?? []).flatMap((step) => {
    const readCommand = buildReadCommandFromFetchStep(step, sessionId);
    const validationCommand = buildValidationCommandFromFetchStep(
      step,
      sessionId
    );
    const command = readCommand ?? validationCommand;

    return command !== null
      ? [
          {
            label:
              step.type === "run_validation"
                ? "Run required validation"
                : "Gather missing context",
            command
          }
        ]
      : [];
  });
  const retryCommand = buildRetryCommand(
    getDeferredActionId(record),
    sessionId
  );

  return [
    ...fetchCommands,
    ...(retryCommand !== null
      ? [
          {
            label: "Retry authorization",
            command: retryCommand
          }
        ]
      : [])
  ];
};

export const summarizeMissingContext = (
  entry: UiMissingContextEntry
): string => {
  const target = entry.target !== undefined ? ` for ${entry.target}` : "";
  const required = entry.required ? "required" : "optional";
  const reason = entry.reason !== undefined ? `: ${entry.reason}` : "";

  return `${entry.type}${target} (${required})${reason}`;
};

export const summarizeFetchStep = (step: UiFetchPlanStep): string => {
  const target =
    step.target !== undefined
      ? ` ${step.target}`
      : step.query !== undefined
        ? ` ${step.query}`
        : "";
  const safe = step.safe ? "safe" : "unsafe";
  const reason = step.reason !== undefined ? `: ${step.reason}` : "";

  return `${step.type}${target} (${safe})${reason}`;
};
