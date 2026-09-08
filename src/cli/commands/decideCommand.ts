import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeAction } from "../../actions/normalizeAction.js";
import { parseAction } from "../../actions/parseAction.js";
import { appendAuditRecord } from "../../audit/auditLogger.js";
import { buildAuditRecord } from "../../audit/auditRecordBuilder.js";
import {
  recordDecisionCreated,
  recordDeferRecorded
} from "../../analytics/analyticsRecorder.js";
import { decide } from "../../decision/decisionEngine.js";
import { recordDeferredDecision } from "../../defer/deferredActionRegistry.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { computeSafetySignals } from "../../signals/computeSignals.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { auditOutputFromResult, type CliSuccessOutput } from "../cliOutput.js";

export interface DecideCommandOptions {
  actionFile: string;
  policy?: string;
  cwd?: string;
  auditDir?: string;
  json?: boolean;
  noAudit?: boolean;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  repoId?: string;
  workspaceId?: string;
  observationDir?: string;
  deferDir?: string;
}

export type DecideCommandResult =
  | {
      ok: true;
      output: CliSuccessOutput;
    }
  | {
      ok: false;
      error: CliError;
    };

const readActionFile = async (
  actionFile: string,
  cwd: string
): Promise<string | CliError> => {
  const actionPath = path.isAbsolute(actionFile)
    ? actionFile
    : path.resolve(cwd, actionFile);

  try {
    return await readFile(actionPath, "utf8");
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;

    if (code === "ENOENT") {
      return createCliError(
        "CLI_ACTION_FILE_NOT_FOUND",
        `Action file was not found: ${actionPath}`,
        error
      );
    }

    return createCliError(
      "CLI_ACTION_FILE_READ_ERROR",
      `Action file could not be read: ${actionPath}`,
      error
    );
  }
};

const parseJson = (content: string): unknown | CliError => {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    return createCliError(
      "CLI_ACTION_PARSE_ERROR",
      "Action JSON could not be parsed.",
      error
    );
  }
};

const isCliError = (value: unknown): value is CliError =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  "message" in value;

const buildSession = (options: DecideCommandOptions) => ({
  ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  ...(options.userId !== undefined ? { userId: options.userId } : {}),
  ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
  ...(options.repoId !== undefined ? { repoId: options.repoId } : {}),
  ...(options.workspaceId !== undefined
    ? { workspaceId: options.workspaceId }
    : {})
});

export const runDecideCommand = async (
  options: DecideCommandOptions
): Promise<DecideCommandResult> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const actionContent = await readActionFile(options.actionFile, cwd);

  if (isCliError(actionContent)) {
    return {
      ok: false,
      error: actionContent
    };
  }

  const rawAction = parseJson(actionContent);

  if (isCliError(rawAction)) {
    return {
      ok: false,
      error: rawAction
    };
  }

  const parsedAction = parseAction(rawAction);

  if (!parsedAction.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_ACTION_PARSE_ERROR",
        parsedAction.error.message,
        parsedAction.error
      )
    };
  }

  const policyResult = await loadPolicy({
    cwd,
    ...(options.policy !== undefined ? { explicitPath: options.policy } : {})
  });

  if (!policyResult.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_POLICY_LOAD_ERROR",
        policyResult.error.message,
        policyResult.error
      )
    };
  }

  const actionWithRaw =
    parsedAction.action.raw === undefined
      ? {
          ...parsedAction.action,
          raw: rawAction
        }
      : parsedAction.action;
  const normalizedAction = normalizeAction(actionWithRaw, {
    cwd,
    ...(policyResult.policy.workspace?.allowedRoots !== undefined
      ? { workspaceRoots: policyResult.policy.workspace.allowedRoots }
      : {})
  });

  if (!normalizedAction.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_ACTION_PARSE_ERROR",
        normalizedAction.error.message,
        normalizedAction.error
      )
    };
  }

  const session = buildSession(options);
  const signalResult = await computeSafetySignals({
    action: normalizedAction.action,
    policy: policyResult.policy,
    providedSignals: {},
    context: {
      cwd,
      ...(policyResult.policy.workspace?.allowedRoots !== undefined
        ? { workspaceRoots: policyResult.policy.workspace.allowedRoots }
        : {}),
      ...(options.observationDir !== undefined
        ? { observationDir: options.observationDir }
        : {}),
      session
    }
  });

  if (!signalResult.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_DECISION_ERROR",
        signalResult.error.message,
        signalResult.error
      )
    };
  }

  const decisionResult = decide({
    action: normalizedAction.action,
    policy: policyResult.policy,
    signals: signalResult.signals,
    session
  });

  if (!decisionResult.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_DECISION_ERROR",
        decisionResult.error.message,
        decisionResult.error
      )
    };
  }

  const deferredResult = await recordDeferredDecision({
    action: normalizedAction.action,
    decision: decisionResult.decision,
    cwd,
    ...(options.deferDir !== undefined ? { deferDir: options.deferDir } : {}),
    ...(session.sessionId !== undefined ? { sessionId: session.sessionId } : {})
  });

  if (!deferredResult.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_DECISION_ERROR",
        deferredResult.error.message,
        deferredResult.error
      )
    };
  }

  const deferredAction: CliSuccessOutput["deferredAction"] =
    deferredResult.value.recorded === true
      ? {
          recorded: true,
          id: deferredResult.value.record.id,
          ...(deferredResult.path !== undefined
            ? { path: deferredResult.path }
            : {})
        }
      : {
          recorded: false
        };

  await recordDecisionCreated({
    cwd,
    action: normalizedAction.action,
    decision: decisionResult.decision,
    detectorResults: signalResult.detectorResults
  });

  if (deferredResult.value.recorded === true) {
    await recordDeferRecorded({
      cwd,
      record: deferredResult.value.record
    });
  }

  let audit: CliSuccessOutput["audit"] = {
    written: false
  };

  if (options.noAudit !== true) {
    const auditRecord = buildAuditRecord({
      action: normalizedAction.action,
      rawAction,
      decision: decisionResult.decision,
      signals: signalResult.signals,
      session,
      policyVersion: policyResult.policy.version,
      evidence: {
        detectorResults: signalResult.detectorResults,
        ...(deferredAction?.recorded === true
          ? { deferredActionId: deferredAction.id }
          : {})
      }
    });
    const auditResult = await appendAuditRecord(auditRecord, {
      cwd,
      ...(options.auditDir !== undefined ? { auditDir: options.auditDir } : {})
    });

    if (!auditResult.ok) {
      return {
        ok: false,
        error: createCliError(
          "CLI_AUDIT_ERROR",
          auditResult.error.message,
          auditResult.error
        )
      };
    }

    audit = auditOutputFromResult(auditResult);
  }

  return {
    ok: true,
    output: {
      ok: true,
      decision: decisionResult.decision,
      deferredAction,
      policySource: policyResult.source,
      audit
    }
  };
};
