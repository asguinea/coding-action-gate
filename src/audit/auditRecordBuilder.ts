import { randomBytes } from "node:crypto";
import type { NormalizedCodingActionGateAction } from "../actions/actionErrors.js";
import type { CodingActionGateAction } from "../domain/actions.js";
import {
  auditRecordSchema,
  type ApprovalStatus,
  type AuditRecord
} from "../domain/audit.js";
import type { CodingActionGateSignals } from "../domain/signals.js";
import type { CodingActionGateDecision } from "../decision/decisionErrors.js";
import { redactAuditPayload } from "../redaction/redactAuditPayload.js";
import { computeAuditRecordHash } from "./auditHash.js";

export interface BuildAuditRecordInput {
  action: CodingActionGateAction | NormalizedCodingActionGateAction;
  rawAction?: unknown;
  normalizedAction?: unknown;
  decision: CodingActionGateDecision;
  signals?: CodingActionGateSignals;
  session?: {
    sessionId?: string;
    userId?: string;
    agentId?: string;
    repoId?: string;
    workspaceId?: string;
  };
  policyVersion?: string;
  evidence?: Record<string, unknown>;
  previousRecordHash?: string;
  checkpointId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasNormalizedMetadata = (
  action: CodingActionGateAction | NormalizedCodingActionGateAction
): action is NormalizedCodingActionGateAction => {
  const normalized = "normalized" in action ? action.normalized : undefined;

  return isRecord(normalized) && typeof normalized["actionType"] === "string";
};

const generateDecisionId = (timestamp: string): string => {
  const safeTimestamp = timestamp.replace(/[^0-9A-Za-z]/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `dec_${safeTimestamp}_${suffix}`;
};

const approvalStatusForDecision = (
  decision: CodingActionGateDecision
): ApprovalStatus =>
  decision.decision === "ESCALATE" ? "pending" : "not_required";

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

const actionTargetPath = (
  action: CodingActionGateAction | NormalizedCodingActionGateAction
): string | undefined =>
  "targetPath" in action && typeof action.targetPath === "string"
    ? action.targetPath
    : undefined;

const extractTargetPaths = (
  action: CodingActionGateAction | NormalizedCodingActionGateAction
): string[] | undefined => {
  const paths: string[] = [];

  if (hasNormalizedMetadata(action)) {
    if (action.normalized.relativeTargetPath !== undefined) {
      paths.push(action.normalized.relativeTargetPath);
    }

    if (action.normalized.targetPath !== undefined) {
      paths.push(action.normalized.targetPath);
    }

    if (action.normalized.relativeTargetPaths !== undefined) {
      paths.push(...action.normalized.relativeTargetPaths);
    }

    if (action.normalized.targetPaths !== undefined) {
      paths.push(...action.normalized.targetPaths);
    }
  }

  const targetPath = actionTargetPath(action);

  if (targetPath !== undefined) {
    paths.push(targetPath);
  }

  const uniquePaths = dedupe(paths.filter((value) => value.length > 0));

  return uniquePaths.length > 0 ? uniquePaths : undefined;
};

const stripNormalizedMetadata = (
  action: CodingActionGateAction | NormalizedCodingActionGateAction
): CodingActionGateAction => {
  if (!hasNormalizedMetadata(action)) {
    return action;
  }

  const baseAction: Record<string, unknown> = { ...action };

  delete baseAction["normalized"];

  return baseAction as CodingActionGateAction;
};

const optionalSessionFields = (
  session: BuildAuditRecordInput["session"]
): Partial<AuditRecord> => ({
  ...(session?.sessionId !== undefined ? { sessionId: session.sessionId } : {}),
  ...(session?.agentId !== undefined ? { agentId: session.agentId } : {}),
  ...(session?.userId !== undefined ? { userId: session.userId } : {}),
  ...(session?.repoId !== undefined ? { repoId: session.repoId } : {}),
  ...(session?.workspaceId !== undefined
    ? { workspaceId: session.workspaceId }
    : {})
});

export const buildAuditRecord = (input: BuildAuditRecordInput): AuditRecord => {
  const timestamp = new Date().toISOString();
  const action = stripNormalizedMetadata(input.action);
  const targetPaths = extractTargetPaths(input.action);
  const rawAction =
    input.rawAction ??
    (hasNormalizedMetadata(input.action) ? input.action.raw : action.raw);
  const normalizedAction =
    input.normalizedAction ??
    (hasNormalizedMetadata(input.action) ? input.action : undefined);

  const record: AuditRecord = {
    decisionId: generateDecisionId(timestamp),
    timestamp,
    ...optionalSessionFields(input.session),
    action,
    ...(rawAction !== undefined ? { rawAction } : {}),
    ...(normalizedAction !== undefined ? { normalizedAction } : {}),
    ...(targetPaths !== undefined ? { targetPaths } : {}),
    decision: input.decision.decision,
    reason: input.decision.reason,
    ...(input.signals !== undefined ? { signals: input.signals } : {}),
    policyTrace: input.decision.matchedPolicies,
    evidence: {
      signalSummary: input.decision.signalSummary,
      ...(input.policyVersion !== undefined
        ? { policyVersion: input.policyVersion }
        : {}),
      ...(input.evidence !== undefined ? input.evidence : {})
    },
    ...(input.decision.missingContext !== undefined
      ? { missingContext: input.decision.missingContext }
      : {}),
    ...(input.decision.fetchPlan !== undefined
      ? { fetchPlan: input.decision.fetchPlan }
      : {}),
    ...(input.signals?.validationStatus !== undefined
      ? { validationStatus: input.signals.validationStatus }
      : {}),
    approvalStatus: approvalStatusForDecision(input.decision),
    ...(input.checkpointId !== undefined
      ? { checkpointId: input.checkpointId }
      : {}),
    ...(input.previousRecordHash !== undefined
      ? { previousRecordHash: input.previousRecordHash }
      : {})
  };

  const redactedRecord = redactAuditPayload(record, input.signals);
  const recordWithRedactionEvidence: AuditRecord = redactedRecord.redacted
    ? {
        ...redactedRecord.value,
        evidence: {
          ...(isRecord(redactedRecord.value.evidence)
            ? redactedRecord.value.evidence
            : {}),
          redaction: {
            applied: true,
            redactionCount: redactedRecord.redactionCount,
            matchedPatterns: redactedRecord.matchedPatterns
          }
        }
      }
    : redactedRecord.value;

  const parsedRecord = auditRecordSchema.parse(recordWithRedactionEvidence);
  const recordHash = computeAuditRecordHash(parsedRecord);

  return auditRecordSchema.parse({
    ...parsedRecord,
    recordHash
  });
};
