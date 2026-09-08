import { randomBytes } from "node:crypto";
import path from "node:path";
import { normalizeAction } from "../../actions/normalizeAction.js";
import { appendAuditRecord } from "../../audit/auditLogger.js";
import { buildAuditRecord } from "../../audit/auditRecordBuilder.js";
import { decide } from "../../decision/decisionEngine.js";
import type {
  StepHarborAction,
  ValidationKind as ActionValidationKind
} from "../../domain/actions.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { redactString } from "../../redaction/redactString.js";
import { computeSafetySignals } from "../../signals/computeSignals.js";
import {
  createValidationResultStore,
  hashValidationOutput
} from "../../validation/validationResultStore.js";
import { runValidationCommand } from "../../validation/validationCommandRunner.js";
import type { ValidationKind } from "../../validation/validationTypes.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { auditOutputFromResult, type CliSuccessOutput } from "../cliOutput.js";

export interface ValidateCommandOptions {
  kindOrCommand?: string;
  command?: string;
  policy?: string;
  cwd?: string;
  auditDir?: string;
  validationDir?: string;
  json?: boolean;
  noAudit?: boolean;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  repoId?: string;
  workspaceId?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export type ValidateCommandResult =
  | {
      ok: true;
      output: CliSuccessOutput;
    }
  | {
      ok: false;
      error: CliError;
    };

type ValidationCommandAction = Extract<
  StepHarborAction,
  { type: "validation_command" }
>;

const validationKinds = new Set<ValidationKind>([
  "test",
  "lint",
  "typecheck",
  "build",
  "security",
  "other"
]);

const generateActionId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `act_${safeTimestamp}_${suffix}`;
};

const buildSession = (options: ValidateCommandOptions) => ({
  ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  ...(options.userId !== undefined ? { userId: options.userId } : {}),
  ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
  ...(options.repoId !== undefined ? { repoId: options.repoId } : {}),
  ...(options.workspaceId !== undefined
    ? { workspaceId: options.workspaceId }
    : {})
});

const normalizeKind = (value: string | undefined): ValidationKind => {
  if (value !== undefined && validationKinds.has(value as ValidationKind)) {
    return value as ValidationKind;
  }

  return "other";
};

const isValidationKind = (value: string | undefined): value is ValidationKind =>
  value !== undefined && validationKinds.has(value as ValidationKind);

const commandMatchesKind = (command: string, kind: ValidationKind): boolean => {
  const lower = command.toLowerCase();

  switch (kind) {
    case "test":
      return lower.includes("test");
    case "lint":
      return lower.includes("lint");
    case "typecheck":
      return lower.includes("typecheck") || lower.includes("tsc");
    case "build":
      return lower.includes("build");
    case "security":
      return (
        lower.includes("audit") ||
        lower.includes("security") ||
        lower.includes("snyk")
      );
    case "other":
      return false;
  }
};

const selectConfiguredCommand = (
  commands: string[],
  kind: ValidationKind
): string | undefined =>
  commands.find((command) => commandMatchesKind(command, kind));

export const buildValidationAction = (
  command: string,
  kind: ValidationKind,
  options: {
    cwd: string;
  }
): ValidationCommandAction => {
  const timestamp = new Date().toISOString();

  return {
    id: generateActionId(timestamp),
    type: "validation_command",
    timestamp,
    proposedBy: "agent",
    origin: {
      toolId: "stepharbor-cli"
    },
    command,
    cwd: options.cwd,
    validationKind: kind as ActionValidationKind,
    raw: {
      source: "stepharbor validate",
      command,
      kind
    }
  };
};

const outputSummary = (
  combinedOutput: string,
  maxOutputBytes: number
): string => {
  const summary = combinedOutput.trim();
  const truncated =
    Buffer.byteLength(summary, "utf8") > maxOutputBytes
      ? `${Buffer.from(summary, "utf8")
          .subarray(0, maxOutputBytes)
          .toString("utf8")}\n[truncated]`
      : summary;

  return redactString(truncated.length > 0 ? truncated : "(no output)").value;
};

const buildValidationRunEvidence = (
  validation: NonNullable<CliSuccessOutput["validation"]>
): Record<string, unknown> =>
  validation.executed
    ? {
        validationRun: {
          kind: validation.kind,
          command: validation.command,
          status: validation.status,
          exitCode: validation.exitCode,
          durationMs: validation.durationMs,
          outputHash: validation.outputHash,
          validationRecordId: validation.recordId
        }
      }
    : {};

export const runValidateCommand = async (
  options: ValidateCommandOptions
): Promise<ValidateCommandResult> => {
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

  const requestedKind = normalizeKind(options.kindOrCommand);
  const positionalCommand =
    options.command === undefined && !isValidationKind(options.kindOrCommand)
      ? options.kindOrCommand?.trim()
      : undefined;
  const configuredCommands = [
    ...(policyResult.policy.validation?.beforeCommit?.commands ?? []),
    ...(policyResult.policy.validation?.beforePush?.commands ?? [])
  ];
  const command =
    options.command?.trim() ??
    (positionalCommand !== undefined && positionalCommand.length > 0
      ? positionalCommand
      : undefined) ??
    selectConfiguredCommand(configuredCommands, requestedKind);

  if (command === undefined || command.length === 0) {
    return {
      ok: false,
      error: createCliError(
        "CLI_VALIDATION_COMMAND_NOT_FOUND",
        `No validation command is configured for kind: ${requestedKind}.`
      )
    };
  }

  const action = buildValidationAction(command, requestedKind, { cwd });
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

  let validation: NonNullable<CliSuccessOutput["validation"]> = {
    executed: false,
    reason: "Validation command was not authorized."
  };

  if (decisionResult.decision.decision === "PROCEED") {
    const runResult = await runValidationCommand(command, {
      cwd,
      timeoutMs: options.timeoutMs ?? 120000,
      maxOutputBytes: options.maxOutputBytes ?? 20000
    });

    if (!runResult.ok) {
      return {
        ok: false,
        error: createCliError(
          runResult.timedOut
            ? "CLI_VALIDATION_TIMEOUT"
            : "CLI_VALIDATION_EXECUTION_ERROR",
          runResult.error.message,
          runResult.error
        )
      };
    }

    const maxOutputBytes = options.maxOutputBytes ?? 20000;
    const summary = outputSummary(runResult.combinedOutput, maxOutputBytes);
    const store = createValidationResultStore({
      cwd,
      ...(options.sessionId !== undefined
        ? { sessionId: options.sessionId }
        : {}),
      ...(options.validationDir !== undefined
        ? { validationDir: options.validationDir }
        : {})
    });
    const status = runResult.exitCode === 0 ? "passed" : "failed";
    const recordResult = await store.recordValidationResult({
      kind: requestedKind,
      command,
      status,
      exitCode: runResult.exitCode,
      startedAt: runResult.startedAt,
      completedAt: runResult.completedAt,
      durationMs: runResult.durationMs,
      outputSummary: summary,
      outputHash:
        runResult.outputHash.length > 0
          ? runResult.outputHash
          : hashValidationOutput(runResult.combinedOutput),
      source: "cli_validate",
      policyVersion: policyResult.policy.version
    });

    if (!recordResult.ok) {
      return {
        ok: false,
        error: createCliError(
          "CLI_VALIDATION_RESULT_STORE_ERROR",
          recordResult.error.message,
          recordResult.error
        )
      };
    }

    validation = {
      executed: true,
      kind: requestedKind,
      command,
      status,
      exitCode: runResult.exitCode,
      durationMs: runResult.durationMs,
      outputSummary: summary,
      outputHash: recordResult.value.outputHash ?? runResult.outputHash,
      recorded: true,
      recordId: recordResult.value.id
    };
  }

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
        detectorResults: signalResult.detectorResults,
        ...buildValidationRunEvidence(validation)
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
      action: {
        id: action.id,
        type: action.type,
        command: action.command
      },
      validation,
      decision: decisionResult.decision,
      policySource: policyResult.source,
      audit
    }
  };
};
