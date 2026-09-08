import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeAction } from "../../actions/normalizeAction.js";
import { appendAuditRecord } from "../../audit/auditLogger.js";
import { buildAuditRecord } from "../../audit/auditRecordBuilder.js";
import { decide } from "../../decision/decisionEngine.js";
import type { CodingActionGateAction } from "../../domain/actions.js";
import { createFileObservationStore } from "../../observations/fileObservationStore.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { computeSafetySignals } from "../../signals/computeSignals.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { auditOutputFromResult, type CliSuccessOutput } from "../cliOutput.js";

export const defaultReadMaxBytes = 1024 * 1024;

export interface ReadCommandOptions {
  targetPath: string;
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
  metadataOnly?: boolean;
  observationDir?: string;
  maxBytes?: number;
}

export type ReadCommandResult =
  | {
      ok: true;
      output: CliSuccessOutput;
    }
  | {
      ok: false;
      error: CliError;
    };

type ReadFileCliAction = Extract<CodingActionGateAction, { type: "read_file" }>;

const generateActionId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `act_${safeTimestamp}_${suffix}`;
};

const buildSession = (options: ReadCommandOptions) => ({
  ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  ...(options.userId !== undefined ? { userId: options.userId } : {}),
  ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
  ...(options.repoId !== undefined ? { repoId: options.repoId } : {}),
  ...(options.workspaceId !== undefined
    ? { workspaceId: options.workspaceId }
    : {})
});

export const buildReadAction = (
  targetPath: string,
  options: {
    metadataOnly: boolean;
  }
): ReadFileCliAction => {
  const timestamp = new Date().toISOString();

  return {
    id: generateActionId(timestamp),
    type: "read_file",
    timestamp,
    proposedBy: "agent",
    origin: {
      toolId: "coding-action-gate-cli"
    },
    targetPath,
    raw: {
      source: "coding-action-gate read",
      targetPath,
      metadataOnly: options.metadataOnly
    }
  };
};

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readFileStats = async (
  filePath: string
): Promise<
  { ok: true; sizeBytes: number } | { ok: false; error: CliError }
> => {
  try {
    const fileStats = await stat(filePath);

    return {
      ok: true,
      sizeBytes: fileStats.size
    };
  } catch (error) {
    return {
      ok: false,
      error: createCliError(
        isNotFoundError(error)
          ? "CLI_READ_FILE_NOT_FOUND"
          : "CLI_READ_FILE_ERROR",
        isNotFoundError(error)
          ? `Read target was not found: ${filePath}`
          : `Read target could not be inspected: ${filePath}`,
        error
      )
    };
  }
};

const readAuthorizedFile = async (
  filePath: string
): Promise<{ ok: true; content: string } | { ok: false; error: CliError }> => {
  try {
    return {
      ok: true,
      content: await readFile(filePath, "utf8")
    };
  } catch (error) {
    return {
      ok: false,
      error: createCliError(
        isNotFoundError(error)
          ? "CLI_READ_FILE_NOT_FOUND"
          : "CLI_READ_FILE_ERROR",
        isNotFoundError(error)
          ? `Read target was not found: ${filePath}`
          : `Read target could not be read: ${filePath}`,
        error
      )
    };
  }
};

const nonProceedOutput = (
  baseOutput: Omit<CliSuccessOutput, "read" | "observation">,
  targetPath: string
): CliSuccessOutput => ({
  ...baseOutput,
  read: {
    targetPath,
    content: null,
    metadataOnly: false
  },
  observation: {
    recorded: false
  }
});

export const runReadCommand = async (
  options: ReadCommandOptions
): Promise<ReadCommandResult> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const metadataOnly = options.metadataOnly === true;
  const maxBytes = options.maxBytes ?? defaultReadMaxBytes;
  const action = buildReadAction(options.targetPath, { metadataOnly });
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

  let audit: CliSuccessOutput["audit"] = {
    written: false
  };
  const writeAudit = async (): Promise<ReadCommandResult | undefined> => {
    if (options.noAudit === true) {
      return undefined;
    }

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
    return undefined;
  };

  const baseOutput = {
    ok: true as const,
    decision: decisionResult.decision,
    policySource: policyResult.source,
    audit
  };

  if (decisionResult.decision.decision !== "PROCEED") {
    const auditError = await writeAudit();

    if (auditError !== undefined) {
      return auditError;
    }

    return {
      ok: true,
      output: nonProceedOutput(
        {
          ...baseOutput,
          audit
        },
        options.targetPath
      )
    };
  }

  const absoluteTargetPath =
    normalizedAction.action.normalized.absoluteTargetPath ??
    path.resolve(cwd, options.targetPath);
  const statsResult = await readFileStats(absoluteTargetPath);

  if (!statsResult.ok) {
    return {
      ok: false,
      error: statsResult.error
    };
  }

  if (!metadataOnly && statsResult.sizeBytes > maxBytes) {
    return {
      ok: false,
      error: createCliError(
        "CLI_READ_FILE_TOO_LARGE",
        `Read target is larger than the configured maxBytes (${maxBytes}).`,
        {
          path: absoluteTargetPath,
          sizeBytes: statsResult.sizeBytes,
          maxBytes
        }
      )
    };
  }

  const observationStore = createFileObservationStore({
    cwd,
    ...(options.observationDir !== undefined
      ? { observationDir: options.observationDir }
      : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {})
  });
  const observationResult = await observationStore.recordObservation({
    path: options.targetPath,
    source: "cli_read",
    metadataOnly
  });

  if (!observationResult.ok) {
    return {
      ok: false,
      error: createCliError(
        "CLI_OBSERVATION_ERROR",
        observationResult.error.message,
        observationResult.error
      )
    };
  }

  const contentResult = metadataOnly
    ? undefined
    : await readAuthorizedFile(absoluteTargetPath);

  if (contentResult !== undefined && !contentResult.ok) {
    return {
      ok: false,
      error: contentResult.error
    };
  }

  const auditError = await writeAudit();

  if (auditError !== undefined) {
    return auditError;
  }

  const readOutput: NonNullable<CliSuccessOutput["read"]> = metadataOnly
    ? {
        targetPath: options.targetPath,
        content: null,
        sizeBytes: statsResult.sizeBytes,
        metadataOnly
      }
    : {
        targetPath: options.targetPath,
        content: contentResult?.content ?? "",
        sizeBytes: statsResult.sizeBytes,
        contentHash: observationResult.record.contentHash,
        metadataOnly
      };

  return {
    ok: true,
    output: {
      ...baseOutput,
      audit,
      read: readOutput,
      observation: {
        recorded: true,
        metadataOnly,
        path: observationResult.path
      }
    }
  };
};
