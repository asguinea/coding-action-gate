import { z } from "zod";

export const isoTimestampSchema = z.string().datetime({ offset: true });

export const missingContextEntrySchema = z.object({
  type: z.string().min(1),
  target: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  required: z.boolean()
});

export type MissingContextEntry = z.infer<typeof missingContextEntrySchema>;

export const fetchPlanStepTypeSchema = z.enum([
  "read_file",
  "semantic_search",
  "read_related_tests",
  "run_validation",
  "inspect_git",
  "other"
]);

export type FetchPlanStepType = z.infer<typeof fetchPlanStepTypeSchema>;

export const fetchPlanStepSchema = z.object({
  type: fetchPlanStepTypeSchema,
  target: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  safe: z.boolean(),
  reason: z.string().min(1).optional()
});

export type FetchPlanStep = z.infer<typeof fetchPlanStepSchema>;
