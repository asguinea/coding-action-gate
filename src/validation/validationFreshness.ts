import { createValidationResultStore } from "./validationResultStore.js";
import type {
  ValidationFreshnessResult,
  ValidationKind
} from "./validationTypes.js";

export interface CheckValidationFreshnessInput {
  kind?: ValidationKind;
  command?: string;
  cwd?: string;
  sessionId?: string;
  validationDir?: string;
  maxAgeMs?: number;
}

export const checkValidationFreshness = async (
  input: CheckValidationFreshnessInput
): Promise<ValidationFreshnessResult> => {
  const store = createValidationResultStore({
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.validationDir !== undefined
      ? { validationDir: input.validationDir }
      : {})
  });
  const latest = await store.getLatestValidationResult({
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.command !== undefined ? { command: input.command } : {})
  });

  if (!latest.ok || latest.value === null) {
    return {
      status: "not_run",
      reason: "Required validation has not been run."
    };
  }

  const validationAgeMs = Math.max(
    0,
    Date.now() - Date.parse(latest.value.completedAt)
  );

  if (latest.value.status === "failed") {
    return {
      status: "failed",
      latestResult: latest.value,
      reason: "Latest validation failed.",
      validationAgeMs
    };
  }

  if (input.maxAgeMs !== undefined && validationAgeMs > input.maxAgeMs) {
    return {
      status: "stale",
      latestResult: latest.value,
      reason: "Latest validation is stale.",
      validationAgeMs
    };
  }

  return {
    status: "passed",
    latestResult: latest.value,
    reason: "Latest validation passed.",
    validationAgeMs
  };
};
