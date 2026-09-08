import { z } from "zod";
import { fetchPlanStepSchema, missingContextEntrySchema } from "./common.js";
import {
  deferReasonCategorySchema,
  expectedNextDecisionSchema
} from "../defer/deferTypes.js";
import type { PolicyTraceEntry } from "./policies.js";

export const decisionPostures = [
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK"
] as const;

export const decisionPostureSchema = z.enum(decisionPostures);

export type DecisionPosture = z.infer<typeof decisionPostureSchema>;

export const isDecisionPosture = (value: unknown): value is DecisionPosture =>
  decisionPostureSchema.safeParse(value).success;

const decisionPolicyTraceEntrySchema = z.object({
  ruleId: z.string().min(1),
  matched: z.boolean(),
  effect: z
    .union([
      decisionPostureSchema,
      z.enum(["PENDING_AFTER_DEFER", "PENDING_RECHECK_AFTER_DEFER"])
    ])
    .optional(),
  reason: z.string().min(1).optional()
}) satisfies z.ZodType<PolicyTraceEntry>;

export const decisionOutputSchema = z.object({
  decision: decisionPostureSchema,
  reason: z.string().min(1),
  matchedPolicies: z.array(decisionPolicyTraceEntrySchema),
  signalSummary: z.record(z.unknown()),
  deferReasonCategory: deferReasonCategorySchema.optional(),
  requiredNextSteps: z.array(z.string().min(1)).optional(),
  missingContext: z.array(missingContextEntrySchema).optional(),
  fetchPlan: z.array(fetchPlanStepSchema).optional(),
  riskIfProceeding: z.array(z.string().min(1)).optional(),
  reanalysisRequired: z.boolean().optional(),
  expectedNextDecision: expectedNextDecisionSchema.optional(),
  audit: z
    .object({
      auditRecordId: z.string().min(1).optional()
    })
    .optional()
});

export type DecisionOutput = z.infer<typeof decisionOutputSchema>;
