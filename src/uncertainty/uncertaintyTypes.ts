import { z } from "zod";
import { decisionPostureSchema } from "../domain/decisions.js";

export const uncertaintyProfileSchemaVersion =
  "uncertainty-profile.v1" as const;

export const uncertaintyDimensions = [
  "context",
  "freshness",
  "validation",
  "command",
  "sensitivity",
  "workspace_boundary",
  "git_workflow",
  "environment",
  "recovery",
  "autonomy_budget",
  "provenance"
] as const;

export const uncertaintyDimensionSchema = z.enum(uncertaintyDimensions);

export type UncertaintyDimension = z.infer<typeof uncertaintyDimensionSchema>;

export const uncertaintyLevels = ["low", "medium", "high", "critical"] as const;

export const uncertaintyLevelSchema = z.enum(uncertaintyLevels);

export type UncertaintyLevel = z.infer<typeof uncertaintyLevelSchema>;

export const impactLevels = ["low", "medium", "high", "critical"] as const;

export const impactLevelSchema = z.enum(impactLevels);

export type ImpactLevel = z.infer<typeof impactLevelSchema>;

export const reducibilityValues = [
  "reducible",
  "partially_reducible",
  "irreducible"
] as const;

export const reducibilitySchema = z.enum(reducibilityValues);

export type Reducibility = z.infer<typeof reducibilitySchema>;

export const uncertaintyCategoryIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);

export const uncertaintyDimensionProfileSchema = z.object({
  dimension: uncertaintyDimensionSchema,
  score: z.number().min(0).max(1),
  level: uncertaintyLevelSchema,
  impact: impactLevelSchema,
  reducibility: reducibilitySchema,
  drivers: z.array(uncertaintyCategoryIdSchema),
  evidence: z.array(uncertaintyCategoryIdSchema),
  missingEvidence: z.array(uncertaintyCategoryIdSchema)
});

export type UncertaintyDimensionProfile = z.infer<
  typeof uncertaintyDimensionProfileSchema
>;

export const uncertaintyDimensionsRecordSchema = z.object(
  Object.fromEntries(
    uncertaintyDimensions.map((dimension) => [
      dimension,
      uncertaintyDimensionProfileSchema
    ])
  ) as Record<UncertaintyDimension, typeof uncertaintyDimensionProfileSchema>
);

export type UncertaintyDimensionsRecord = z.infer<
  typeof uncertaintyDimensionsRecordSchema
>;

export const uncertaintyReductionPlanSchemaVersion =
  "uncertainty-reduction-plan.v1" as const;

export const uncertaintyReductionStepKinds = [
  "read_target_file",
  "refresh_target_file",
  "read_related_tests",
  "inspect_related_context",
  "run_validation",
  "inspect_validation_config",
  "inspect_validation_failure",
  "fix_validation_failure_before_retry",
  "inspect_package_script",
  "classify_command",
  "inspect_environment",
  "confirm_deploy_target",
  "inspect_git_state",
  "inspect_branch_policy",
  "inspect_workspace_boundary",
  "inspect_recovery_state",
  "create_checkpoint",
  "narrow_action_scope",
  "refresh_context",
  "inspect_progress_state",
  "limit_retry_scope",
  "inspect_provenance",
  "stop_and_request_human_review"
] as const;

export const uncertaintyReductionStepKindSchema = z.enum(
  uncertaintyReductionStepKinds
);

export type UncertaintyReductionStepKind = z.infer<
  typeof uncertaintyReductionStepKindSchema
>;

export const uncertaintyReductionPriorityLevels = [
  "low",
  "medium",
  "high",
  "critical"
] as const;

export const uncertaintyReductionPrioritySchema = z.enum(
  uncertaintyReductionPriorityLevels
);

export type UncertaintyReductionPriority = z.infer<
  typeof uncertaintyReductionPrioritySchema
>;

export const uncertaintyReductionExpectedNextDecisionSchema = z.union([
  decisionPostureSchema,
  z.enum(["PROCEED_OR_ESCALATE", "UNKNOWN"])
]);

export type UncertaintyReductionExpectedNextDecision = z.infer<
  typeof uncertaintyReductionExpectedNextDecisionSchema
>;

export const uncertaintyReductionStepSchema = z.object({
  id: uncertaintyCategoryIdSchema,
  kind: uncertaintyReductionStepKindSchema,
  reduces: z.array(uncertaintyDimensionSchema),
  driversAddressed: z.array(uncertaintyCategoryIdSchema),
  requiredEvidence: z.array(uncertaintyCategoryIdSchema),
  rationale: uncertaintyCategoryIdSchema,
  priority: uncertaintyReductionPrioritySchema
});

export type UncertaintyReductionStep = z.infer<
  typeof uncertaintyReductionStepSchema
>;

export const uncertaintyReductionPlanSchema = z.object({
  schemaVersion: z.literal(uncertaintyReductionPlanSchemaVersion),
  summary: uncertaintyCategoryIdSchema,
  steps: z.array(uncertaintyReductionStepSchema),
  expectedNextDecision:
    uncertaintyReductionExpectedNextDecisionSchema.optional()
});

export type UncertaintyReductionPlan = z.infer<
  typeof uncertaintyReductionPlanSchema
>;

export const uncertaintyProfileSchema = z.object({
  schemaVersion: z.literal(uncertaintyProfileSchemaVersion),
  overallScore: z.number().min(0).max(1),
  overallLevel: uncertaintyLevelSchema,
  impact: impactLevelSchema,
  reducibility: reducibilitySchema,
  topDrivers: z.array(uncertaintyCategoryIdSchema),
  dimensions: uncertaintyDimensionsRecordSchema,
  recommendedDecision: decisionPostureSchema.optional(),
  uncertaintyReductionPlan: uncertaintyReductionPlanSchema.optional()
});

export type UncertaintyProfile = z.infer<typeof uncertaintyProfileSchema>;

export const defaultUncertaintyDimensionProfile = (
  dimension: UncertaintyDimension
): UncertaintyDimensionProfile => ({
  dimension,
  score: 0,
  level: "low",
  impact: "low",
  reducibility: "reducible",
  drivers: [],
  evidence: [],
  missingEvidence: []
});

export const createDefaultUncertaintyDimensions =
  (): UncertaintyDimensionsRecord =>
    uncertaintyDimensionsRecordSchema.parse(
      Object.fromEntries(
        uncertaintyDimensions.map((dimension) => [
          dimension,
          defaultUncertaintyDimensionProfile(dimension)
        ])
      )
    );
