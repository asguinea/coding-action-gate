import { z } from "zod";

import { isoTimestampSchema } from "../domain/common.js";
import type { ValidationError } from "./validationErrors.js";

export const validationKindSchema = z.enum([
  "test",
  "lint",
  "typecheck",
  "build",
  "security",
  "other"
]);

export type ValidationKind = z.infer<typeof validationKindSchema>;

export const validationStatusSchema = z.enum([
  "not_run",
  "running",
  "passed",
  "failed",
  "stale",
  "unknown"
]);

export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const validationResultStatusSchema = z.enum(["passed", "failed"]);

export const validationResultSourceSchema = z.enum([
  "cli_validate",
  "external_validation",
  "test",
  "unknown"
]);

export const validationResultRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  repoRoot: z.string().min(1).optional(),
  cwd: z.string().min(1),
  kind: validationKindSchema,
  command: z.string().min(1),
  status: validationResultStatusSchema,
  exitCode: z.number().int(),
  startedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema,
  durationMs: z.number().int().nonnegative().optional(),
  outputSummary: z.string().min(1).optional(),
  outputHash: z.string().min(1).optional(),
  changedFilesHash: z.string().min(1).optional(),
  policyVersion: z.string().min(1).optional(),
  source: validationResultSourceSchema
});

export type ValidationResultRecord = z.infer<
  typeof validationResultRecordSchema
>;

export interface ValidationFreshnessResult {
  status: ValidationStatus;
  latestResult?: ValidationResultRecord;
  reason: string;
  validationAgeMs?: number;
}

export interface ValidationStoreOptions {
  cwd?: string;
  validationDir?: string;
  sessionId?: string;
  repoRoot?: string;
}

export interface RecordValidationResultInput {
  kind: ValidationKind;
  command: string;
  status: "passed" | "failed";
  exitCode: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  outputSummary?: string;
  outputHash?: string;
  changedFilesHash?: string;
  source?: ValidationResultRecord["source"];
  policyVersion?: string;
}

export interface ListValidationResultsFilter {
  kind?: ValidationKind;
  command?: string;
}

export type ValidationStoreResult<T> =
  | {
      ok: true;
      path?: string;
      value: T;
    }
  | {
      ok: false;
      error: ValidationError;
    };

export interface ValidationResultStore {
  recordValidationResult(
    input: RecordValidationResultInput
  ): Promise<ValidationStoreResult<ValidationResultRecord>>;
  listValidationResults(
    filter?: ListValidationResultsFilter
  ): Promise<ValidationStoreResult<ValidationResultRecord[]>>;
  getLatestValidationResult(
    filter?: ListValidationResultsFilter
  ): Promise<ValidationStoreResult<ValidationResultRecord | null>>;
}
