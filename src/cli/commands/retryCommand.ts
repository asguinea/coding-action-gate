import path from "node:path";
import { normalizeAction } from "../../actions/normalizeAction.js";
import {
  recordDecisionCreated,
  recordRetryCompleted
} from "../../analytics/analyticsRecorder.js";
import { appendAuditRecord } from "../../audit/auditLogger.js";
import { buildAuditRecord } from "../../audit/auditRecordBuilder.js";
import { decide } from "../../decision/decisionEngine.js";
import type { StepHarborDecision } from "../../decision/decisionErrors.js";
import { evaluateDeferredEvidence } from "../../defer/deferredEvidence.js";
import { createDeferredActionRegistry } from "../../defer/deferredActionRegistry.js";
import type {
  DeferredActionRecord,
  DeferredEvidenceRequirement
} from "../../defer/deferredActionTypes.js";
import {
  stepHarborActionSchema,
  type StepHarborAction
} from "../../domain/actions.js";
import { decisionOutputSchema } from "../../domain/decisions.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { computeSafetySignals } from "../../signals/computeSignals.js";
import { createCliError, type CliError } from "../cliErrors.js";
import { auditOutputFromResult, type CliSuccessOutput } from "../cliOutput.js";

export interface RetryCommandOptions {
  deferredActionId: string;
  policy?: string;
  cwd?: string;
  auditDir?: string;
  deferDir?: string;
  observationDir?: string;
  json?: boolean;
  noAudit?: boolean;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  repoId?: string;
  workspaceId?: string;
}

export type RetryCommandResult =
  | {
      ok: true;
      output: CliSuccessOutput;
    }
  | {
      ok: false;
      error: CliError;
    };

const buildSession = (options: RetryCommandOptions) => ({
  ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  ...(options.userId !== undefined ? { userId: options.userId } : {}),
  ...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
  ...(options.repoId !== undefined ? { repoId: options.repoId } : {}),
  ...(options.workspaceId !== undefined
    ? { workspaceId: options.workspaceId }
    : {})
});

const parseOriginalAction = (
  record: DeferredActionRecord
): { ok: true; action: StepHarborAction } | { ok: false; error: CliError } => {
  const parsed = stepHarborActionSchema.safeParse(record.originalAction);

  if (!parsed.success) {
    return {
      ok: false,
      error: createCliError(
        "CLI_DEFERRED_RETRY_ERROR",
        "Deferred action original action could not be reconstructed.",
        parsed.error.issues
      )
    };
  }

  return {
    ok: true,
    action: parsed.data
  };
};

const missingEvidenceDecision = (
  record: DeferredActionRecord
): StepHarborDecision =>
  decisionOutputSchema.parse({
    decision: "DEFER",
    reason: "Deferred action evidence is still missing.",
    matchedPolicies: record.policyTrace ?? record.decision.matchedPolicies,
    signalSummary: record.decision.signalSummary,
    deferReasonCategory:
      record.decision.deferReasonCategory ?? "context_incomplete",
    missingContext: record.missingContext,
    fetchPlan: record.fetchPlan,
    ...(record.decision.riskIfProceeding !== undefined
      ? { riskIfProceeding: record.decision.riskIfProceeding }
      : {}),
    reanalysisRequired: true,
    expectedNextDecision: record.decision.expectedNextDecision ?? "UNKNOWN",
    requiredNextSteps: [
      "Satisfy the deferred action evidence requirements, then retry authorization."
    ]
  });

const unsatisfiedRequirements = (
  requirements: DeferredEvidenceRequirement[]
): DeferredEvidenceRequirement[] =>
  requirements.filter(
    (requirement) => requirement.required && !requirement.satisfied
  );

const retryEvidence = (
  deferredActionId: string,
  evidenceSatisfied: boolean,
  unsatisfied: DeferredEvidenceRequirement[],
  reauthorized: boolean
): NonNullable<CliSuccessOutput["retry"]> => ({
  deferredActionId,
  evidenceSatisfied,
  unsatisfiedRequirements: unsatisfied,
  reauthorized,
  executed: false
});

export const runRetryCommand = async (
  options: RetryCommandOptions
): Promise<RetryCommandResult> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const session = buildSession(options);
  const registry = createDeferredActionRegistry({
    cwd,
    ...(options.deferDir !== undefined ? { deferDir: options.deferDir } : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {})
  });
  const deferredAction = await registry.getDeferredAction(
    options.deferredActionId
  );

  if (!deferredAction.ok) {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: createCliError(
        "CLI_DEFERRED_RETRY_ERROR",
        deferredAction.error.message,
        deferredAction.error
      )
    };
  }

  if (deferredAction.value === null) {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: createCliError(
        "CLI_DEFERRED_ACTION_NOT_FOUND",
        `Deferred action was not found: ${options.deferredActionId}`
      )
    };
  }

  if (deferredAction.value.status !== "pending") {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: createCliError(
        "CLI_DEFERRED_ACTION_NOT_PENDING",
        `Deferred action is not pending: ${options.deferredActionId}`,
        {
          status: deferredAction.value.status
        }
      )
    };
  }

  const originalAction = parseOriginalAction(deferredAction.value);

  if (!originalAction.ok) {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: originalAction.error
    };
  }

  const policyResult = await loadPolicy({
    cwd,
    ...(options.policy !== undefined ? { explicitPath: options.policy } : {})
  });

  if (!policyResult.ok) {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: createCliError(
        "CLI_POLICY_LOAD_ERROR",
        policyResult.error.message,
        policyResult.error
      )
    };
  }

  const normalizedAction = normalizeAction(originalAction.action, {
    cwd,
    ...(policyResult.policy.workspace?.allowedRoots !== undefined
      ? { workspaceRoots: policyResult.policy.workspace.allowedRoots }
      : {})
  });

  if (!normalizedAction.ok) {
    await recordRetryCompleted({ cwd, failed: true });
    return {
      ok: false,
      error: createCliError(
        "CLI_DEFERRED_RETRY_ERROR",
        normalizedAction.error.message,
        normalizedAction.error
      )
    };
  }

  const evidence = await evaluateDeferredEvidence(deferredAction.value, {
    cwd,
    ...(options.observationDir !== undefined
      ? { observationDir: options.observationDir }
      : {})
  });
  const unsatisfied = unsatisfiedRequirements(evidence.requirements);
  const evidenceSatisfied = unsatisfied.length === 0;
  const retry = retryEvidence(
    options.deferredActionId,
    evidenceSatisfied,
    unsatisfied,
    evidenceSatisfied
  );

  let decision: StepHarborDecision;
  let signalResult:
    | Awaited<ReturnType<typeof computeSafetySignals>>
    | undefined;

  if (!evidenceSatisfied) {
    decision = missingEvidenceDecision(deferredAction.value);
  } else {
    signalResult = await computeSafetySignals({
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
      await recordRetryCompleted({ cwd, failed: true });
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
      await recordRetryCompleted({ cwd, failed: true });
      return {
        ok: false,
        error: createCliError(
          "CLI_DECISION_ERROR",
          decisionResult.error.message,
          decisionResult.error
        )
      };
    }

    decision = decisionResult.decision;
  }

  await recordDecisionCreated({
    cwd,
    action: normalizedAction.action,
    decision,
    ...(signalResult?.ok === true
      ? { detectorResults: signalResult.detectorResults }
      : {})
  });
  await recordRetryCompleted({
    cwd,
    retryDecision: decision.decision
  });

  let audit: CliSuccessOutput["audit"] = {
    written: false
  };

  if (options.noAudit !== true) {
    const auditRecord = buildAuditRecord({
      action: normalizedAction.action,
      rawAction: originalAction.action.raw,
      decision,
      ...(signalResult?.ok === true ? { signals: signalResult.signals } : {}),
      session,
      policyVersion: policyResult.policy.version,
      evidence: {
        ...(signalResult?.ok === true
          ? { detectorResults: signalResult.detectorResults }
          : {}),
        retry: {
          deferredActionId: options.deferredActionId,
          evidenceSatisfied,
          reauthorized: evidenceSatisfied,
          unsatisfiedRequirements: unsatisfied
        }
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

  if (evidenceSatisfied && decision.decision !== "DEFER") {
    const marked = await registry.markDeferredActionSatisfied(
      options.deferredActionId,
      evidence.satisfactions
    );

    if (!marked.ok) {
      return {
        ok: false,
        error: createCliError(
          "CLI_DEFERRED_RETRY_ERROR",
          marked.error.message,
          marked.error
        )
      };
    }
  }

  return {
    ok: true,
    output: {
      ok: true,
      retry,
      decision,
      policySource: policyResult.source,
      audit
    }
  };
};
