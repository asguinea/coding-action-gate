import { z } from "zod";
import { codingActionGateActionSchema } from "./actions.js";
import {
  fetchPlanStepSchema,
  isoTimestampSchema,
  missingContextEntrySchema
} from "./common.js";
import { decisionPostureSchema } from "./decisions.js";
import { policyTraceEntrySchema } from "./policies.js";
import { codingActionGateSignalsSchema } from "./signals.js";

export const approvalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
  "unknown"
]);

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const auditRecordSchema = z.object({
  decisionId: z.string().min(1),
  timestamp: isoTimestampSchema,
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  repoId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  action: codingActionGateActionSchema,
  rawAction: z.unknown().optional(),
  normalizedAction: z.unknown().optional(),
  targetPaths: z.array(z.string().min(1)).optional(),
  decision: decisionPostureSchema,
  reason: z.string().min(1),
  signals: codingActionGateSignalsSchema.optional(),
  policyTrace: z.array(policyTraceEntrySchema).optional(),
  evidence: z.record(z.unknown()).optional(),
  missingContext: z.array(missingContextEntrySchema).optional(),
  fetchPlan: z.array(fetchPlanStepSchema).optional(),
  validationStatus: z.string().min(1).optional(),
  approvalStatus: approvalStatusSchema.optional(),
  humanApprover: z.string().min(1).optional(),
  overrideReason: z.string().min(1).optional(),
  beforeHashes: z.record(z.string().min(1)).optional(),
  afterHashes: z.record(z.string().min(1)).optional(),
  checkpointId: z.string().min(1).optional(),
  previousRecordHash: z.string().min(1).optional(),
  recordHash: z.string().min(1).optional()
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;
