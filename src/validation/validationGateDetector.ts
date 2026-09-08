import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import type { StepHarborPolicy } from "../domain/policies.js";
import type { StepHarborSignals } from "../domain/signals.js";
import { getValidationCommands } from "./validationPolicy.js";
import { checkValidationFreshness } from "./validationFreshness.js";
import type {
  ValidationFreshnessResult,
  ValidationKind,
  ValidationStatus
} from "./validationTypes.js";
import {
  classifyLandingAction,
  type LandingActionScope
} from "./landingActionClassifier.js";

export const defaultValidationMaxAgeMs = 30 * 60 * 1000;

const statusRank: Record<ValidationStatus, number> = {
  failed: 5,
  stale: 4,
  not_run: 3,
  passed: 2,
  running: 1,
  unknown: 0
};

const strongerStatus = (
  current: ValidationStatus,
  next: ValidationStatus
): ValidationStatus =>
  statusRank[next] > statusRank[current] ? next : current;

const latestByCompletedAt = (
  results: ValidationFreshnessResult[]
): NonNullable<ValidationFreshnessResult["latestResult"]> | undefined =>
  results
    .map((result) => result.latestResult)
    .filter(
      (result): result is NonNullable<typeof result> => result !== undefined
    )
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
    .at(-1);

const reasonForStatus = (
  status: ValidationStatus,
  scope: LandingActionScope
): string => {
  switch (status) {
    case "not_run":
      return `Required validation has not been run for ${scope}.`;
    case "failed":
      return `Required validation failed for ${scope}.`;
    case "stale":
      return `Required validation is stale for ${scope}.`;
    case "passed":
      return `Required validation passed for ${scope}.`;
    case "running":
      return `Required validation is still running for ${scope}.`;
    case "unknown":
      return `Validation status is unknown for ${scope}.`;
  }
};

const policyMatchForScope = (scope: LandingActionScope): string | undefined => {
  switch (scope) {
    case "before_commit":
      return "validation.beforeCommit";
    case "before_push":
      return "validation.beforePush";
    case "none":
    case "unknown":
      return undefined;
  }
};

export const computeValidationGateSignals = async (input: {
  action: NormalizedStepHarborAction;
  policy: StepHarborPolicy;
  cwd?: string;
  sessionId?: string;
  validationDir?: string;
  maxAgeMs?: number;
}): Promise<StepHarborSignals> => {
  const scope = classifyLandingAction(input.action);

  if (scope === "none") {
    return {};
  }

  if (scope === "unknown") {
    return {
      validationRequired: undefined,
      validationStatus: "unknown",
      validationScope: "unknown",
      requiredValidationCommands: [],
      validationReason: "Landing validation scope could not be determined."
    };
  }

  const config = getValidationCommands(input.policy, scope);

  if (!config.required) {
    return {
      validationRequired: false,
      validationStatus: "unknown",
      validationScope: scope,
      requiredValidationCommands: [],
      validationPolicyMatch: policyMatchForScope(scope),
      validationReason: "Validation is not required by policy."
    };
  }

  const freshnessResults = await Promise.all(
    config.commands.map((command) =>
      checkValidationFreshness({
        command,
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        ...(input.sessionId !== undefined
          ? { sessionId: input.sessionId }
          : {}),
        ...(input.validationDir !== undefined
          ? { validationDir: input.validationDir }
          : {}),
        maxAgeMs: input.maxAgeMs ?? defaultValidationMaxAgeMs
      })
    )
  );
  const validationStatus =
    freshnessResults.length === 0
      ? "not_run"
      : freshnessResults.reduce<ValidationStatus>(
          (current, result) => strongerStatus(current, result.status),
          "passed"
        );
  const validationAge = freshnessResults
    .map((result) => result.validationAgeMs)
    .filter((age): age is number => age !== undefined)
    .reduce<number | undefined>(
      (current, age) => (current === undefined ? age : Math.max(current, age)),
      undefined
    );
  const latestResult = latestByCompletedAt(freshnessResults);

  return {
    validationRequired: true,
    validationStatus,
    ...(validationAge !== undefined ? { validationAge } : {}),
    validationScope: scope,
    requiredValidationCommands: config.commands,
    ...(latestResult !== undefined
      ? {
          latestValidationCommand: latestResult.command,
          latestValidationKind: latestResult.kind as ValidationKind,
          latestValidationExitCode: latestResult.exitCode
        }
      : {}),
    validationPolicyMatch: policyMatchForScope(scope),
    validationReason: reasonForStatus(validationStatus, scope)
  };
};
