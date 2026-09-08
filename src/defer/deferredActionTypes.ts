import { z } from "zod";
import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { StepHarborAction } from "../domain/actions.js";
import {
  fetchPlanStepSchema,
  isoTimestampSchema,
  missingContextEntrySchema
} from "../domain/common.js";
import { decisionOutputSchema } from "../domain/decisions.js";
import { policyTraceEntrySchema } from "../domain/policies.js";
import type { StepHarborDecision } from "../decision/decisionErrors.js";
import type { DeferredActionError } from "./deferredActionErrors.js";

export const deferredActionStatusSchema = z.enum([
  "pending",
  "satisfied",
  "superseded",
  "cancelled",
  "expired"
]);

export type DeferredActionStatus = z.infer<typeof deferredActionStatusSchema>;

export const deferredEvidenceRequirementTypeSchema = z.enum([
  "file_observation",
  "validation_result",
  "git_state",
  "environment_classification",
  "manual_approval",
  "other"
]);

export type DeferredEvidenceRequirementType = z.infer<
  typeof deferredEvidenceRequirementTypeSchema
>;

export const deferredEvidenceRequirementSchema = z.object({
  id: z.string().min(1),
  type: deferredEvidenceRequirementTypeSchema,
  target: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  required: z.boolean(),
  satisfied: z.boolean()
});

export type DeferredEvidenceRequirement = z.infer<
  typeof deferredEvidenceRequirementSchema
>;

export const deferredEvidenceSatisfactionSchema = z.object({
  requirementId: z.string().min(1),
  satisfiedAt: isoTimestampSchema,
  evidenceType: z.string().min(1),
  evidenceRef: z.string().min(1).optional(),
  details: z.record(z.unknown()).optional()
});

export type DeferredEvidenceSatisfaction = z.infer<
  typeof deferredEvidenceSatisfactionSchema
>;

export const deferredActionSummarySchema = z.object({
  actionType: z.string().min(1),
  targetPaths: z.array(z.string().min(1)).optional(),
  command: z.string().min(1).optional(),
  normalizedRelativeTargetPaths: z.array(z.string().min(1)).optional()
});

export type DeferredActionSummary = z.infer<typeof deferredActionSummarySchema>;

export const deferredActionRecordSchema = z.object({
  id: z.string().min(1),
  decisionId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  status: deferredActionStatusSchema,
  actionFingerprint: z.string().min(1),
  actionSummary: deferredActionSummarySchema,
  originalAction: z.unknown(),
  decision: decisionOutputSchema,
  missingContext: z.array(missingContextEntrySchema),
  fetchPlan: z.array(fetchPlanStepSchema),
  requiredEvidence: z.array(deferredEvidenceRequirementSchema),
  satisfiedEvidence: z.array(deferredEvidenceSatisfactionSchema).optional(),
  policyTrace: z.array(policyTraceEntrySchema).optional(),
  expiresAt: isoTimestampSchema.optional()
});

export type DeferredActionRecord = z.infer<typeof deferredActionRecordSchema>;

export interface DeferredEvidenceEvaluation {
  allRequiredSatisfied: boolean;
  requirements: DeferredEvidenceRequirement[];
  satisfactions: DeferredEvidenceSatisfaction[];
}

export type DeferredActionResult<T> =
  | {
      ok: true;
      path?: string;
      value: T;
    }
  | {
      ok: false;
      error: DeferredActionError;
    };

export interface RecordDeferredActionInput {
  record: DeferredActionRecord;
}

export interface RecordDeferredDecisionInput {
  action: NormalizedStepHarborAction;
  decision: StepHarborDecision;
  decisionId?: string;
  sessionId?: string;
  cwd?: string;
  deferDir?: string;
}

export type RecordDeferredDecisionResult = DeferredActionResult<
  | {
      recorded: true;
      record: DeferredActionRecord;
    }
  | {
      recorded: false;
    }
>;

export interface DeferredActionRegistryOptions {
  cwd?: string;
  deferDir?: string;
  sessionId?: string;
}

export interface ListDeferredActionFilter {
  status?: DeferredActionStatus | DeferredActionStatus[];
}

export interface DeferredBypassResult {
  possibleBypass: boolean;
  matchingDeferredAction?: DeferredActionRecord;
  reason?: string;
  unsatisfiedRequirements?: DeferredEvidenceRequirement[];
}

export interface DetectDeferredBypassInput {
  action: NormalizedStepHarborAction;
  registry: DeferredActionRegistry;
  context?: {
    cwd?: string;
    observationDir?: string;
  };
}

export interface DeferredActionRegistry {
  recordDeferredAction(
    input: RecordDeferredActionInput
  ): Promise<DeferredActionResult<DeferredActionRecord>>;
  listDeferredActions(
    filter?: ListDeferredActionFilter
  ): Promise<DeferredActionResult<DeferredActionRecord[]>>;
  getDeferredAction(
    id: string
  ): Promise<DeferredActionResult<DeferredActionRecord | null>>;
  findPendingSimilarAction(
    action: StepHarborAction | NormalizedStepHarborAction
  ): Promise<DeferredActionResult<DeferredActionRecord | null>>;
  markDeferredActionSatisfied(
    id: string,
    satisfaction: DeferredEvidenceSatisfaction | DeferredEvidenceSatisfaction[]
  ): Promise<DeferredActionResult<DeferredActionRecord | null>>;
  markDeferredActionSuperseded(
    id: string,
    reason?: string
  ): Promise<DeferredActionResult<DeferredActionRecord | null>>;
}
