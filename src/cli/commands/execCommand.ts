import { randomBytes } from "node:crypto";
import path from "node:path";
import { normalizeAction } from "../../actions/normalizeAction.js";
import { recordDecisionCreated } from "../../analytics/analyticsRecorder.js";
import { appendAuditRecord } from "../../audit/auditLogger.js";
import { buildAuditRecord } from "../../audit/auditRecordBuilder.js";
import { decide } from "../../decision/decisionEngine.js";
import type { StepHarborAction } from "../../domain/actions.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { computeSafetySignals } from "../../signals/computeSignals.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { auditOutputFromResult, type CliSuccessOutput } from "../cliOutput.js";

export interface ExecCommandOptions {
  command: string;
  commandId?: string;
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
}

export type ExecCommandResult =
  | {
      ok: true;
      output: CliSuccessOutput;
    }
  | {
      ok: false;
      error: CliError;
    };

type ExecRunCommandAction = Extract<StepHarborAction, { type: "run_command" }>;

const generateActionId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `act_${safeTimestamp}_${suffix}`;
};

const buildSession = (options: ExecCommandOptions) => ({
  ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  ...(options.userId !== undefined ? { userId: options.userId } : {}),
  ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
  ...(options.repoId !== undefined ? { repoId: options.repoId } : {}),
  ...(options.workspaceId !== undefined
    ? { workspaceId: options.workspaceId }
    : {})
});

export const buildExecAction = (
  command: string,
  options: {
    cwd: string;
    commandId?: string;
  }
): ExecRunCommandAction => {
  const timestamp = new Date().toISOString();

  return {
    id: options.commandId ?? generateActionId(timestamp),
    type: "run_command",
    timestamp,
    proposedBy: "agent",
    origin: {
      toolId: "stepharbor-cli"
    },
    command,
    cwd: options.cwd,
    raw: {
      source: "stepharbor exec",
      command
    }
  };
};

export const runExecCommand = async (
  options: ExecCommandOptions
): Promise<ExecCommandResult> => {
  const command = options.command.trim();

  if (command.length === 0) {
    return {
      ok: false,
      error: createCliError(
        "CLI_BAD_ARGUMENTS",
        "Missing command string for exec."
      )
    };
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
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

  const action = buildExecAction(command, {
    cwd,
    ...(options.commandId !== undefined ? { commandId: options.commandId } : {})
  });
  const normalizedAction = normalizeAction(action, {
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

  await recordDecisionCreated({
    cwd,
    action: normalizedAction.action,
    decision: decisionResult.decision,
    detectorResults: signalResult.detectorResults
  });

  let audit: CliSuccessOutput["audit"] = {
    written: false
  };

  if (options.noAudit !== true) {
    const auditRecord = buildAuditRecord({
      action: normalizedAction.action,
      rawAction: action.raw,
      decision: decisionResult.decision,
      signals: signalResult.signals,
      session,
      policyVersion: policyResult.policy.version,
      evidence: {
        detectorResults: signalResult.detectorResults
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
      dryRun: true,
      executed: false,
      action: {
        id: action.id,
        type: action.type,
        command: action.command
      },
      decision: decisionResult.decision,
      policySource: policyResult.source,
      audit
    }
  };
};
