import { z } from "zod";
import type { DecisionPosture } from "../domain/decisions.js";

export const deferReasonCategorySchema = z.enum([
  "target_file_never_read",
  "target_file_stale",
  "target_file_missing",
  "metadata_only_observation",
  "validation_not_run",
  "validation_stale",
  "environment_unknown",
  "branch_unknown",
  "context_incomplete",
  "large_change_lacks_plan",
  "agent_loop_detected",
  "unknown_defer_reason"
]);

export type DeferReasonCategory = z.infer<typeof deferReasonCategorySchema>;

export const expectedNextDecisionSchema = z.enum([
  "PROCEED",
  "DEFER",
  "ESCALATE",
  "BLOCK",
  "UNKNOWN"
]);

export type ExpectedNextDecision = DecisionPosture | "UNKNOWN";
