import { z } from "zod";
import { decisionPostureSchema } from "./decisions.js";

export const validationPolicySchema = z.object({
  required: z.boolean().optional(),
  commands: z.array(z.string().min(1)).optional(),
  allowStaleResults: z.boolean().optional(),
  maxAgeMinutes: z.number().int().nonnegative().optional()
});

export type ValidationPolicy = z.infer<typeof validationPolicySchema>;

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  decision: decisionPostureSchema,
  when: z.record(z.unknown()),
  reason: z.string().min(1).optional()
});

export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policyTraceEffectSchema = z.union([
  decisionPostureSchema,
  z.enum(["PENDING_AFTER_DEFER", "PENDING_RECHECK_AFTER_DEFER"])
]);

export type PolicyTraceEffect = z.infer<typeof policyTraceEffectSchema>;

export const policyTraceEntrySchema = z.object({
  ruleId: z.string().min(1),
  matched: z.boolean(),
  effect: policyTraceEffectSchema.optional(),
  reason: z.string().min(1).optional()
});

export type PolicyTraceEntry = z.infer<typeof policyTraceEntrySchema>;

export const codingActionGatePolicySchema = z.object({
  version: z.string().min(1),
  workspace: z
    .object({
      allowedRoots: z.array(z.string().min(1)).optional(),
      forbiddenMutationOutsideWorkspace: z.boolean().optional()
    })
    .optional(),
  protectedBranches: z.array(z.string().min(1)).optional(),
  sensitivePaths: z
    .object({
      critical: z.array(z.string().min(1)).optional(),
      high: z.array(z.string().min(1)).optional(),
      medium: z.array(z.string().min(1)).optional()
    })
    .optional(),
  validation: z
    .object({
      beforeCommit: validationPolicySchema.optional(),
      beforePush: validationPolicySchema.optional()
    })
    .optional(),
  thresholds: z
    .object({
      largeDiffFiles: z.number().int().nonnegative().optional(),
      largeDiffLines: z.number().int().nonnegative().optional(),
      contextCompletenessMinimum: z.number().min(0).max(1).optional(),
      sensitiveContextCompletenessMinimum: z.number().min(0).max(1).optional(),
      maxRetriesSameGoal: z.number().int().nonnegative().optional(),
      maxSessionMinutesWithoutProgress: z
        .number()
        .int()
        .nonnegative()
        .optional()
    })
    .optional(),
  rules: z.array(policyRuleSchema).optional()
});

export type CodingActionGatePolicy = z.infer<
  typeof codingActionGatePolicySchema
>;
