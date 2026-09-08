import { createHash } from "node:crypto";
import type { NormalizedStepHarborAction } from "../actions/actionErrors.js";
import { tokenizeCommand } from "../actions/commandNormalization.js";
import type { StepHarborAction } from "../domain/actions.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasNormalizedMetadata = (
  action: StepHarborAction | NormalizedStepHarborAction
): action is NormalizedStepHarborAction =>
  "normalized" in action &&
  isRecord(action.normalized) &&
  typeof action.normalized["actionType"] === "string";

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => value.length > 0))).sort();

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(value).sort()) {
    const child = value[key];

    if (child !== undefined) {
      result[key] = canonicalize(child);
    }
  }

  return result;
};

export const stableCanonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

const getActionType = (
  action: StepHarborAction | NormalizedStepHarborAction
): string =>
  hasNormalizedMetadata(action) ? action.normalized.actionType : action.type;

export const actionTargetPathsForDeferral = (
  action: StepHarborAction | NormalizedStepHarborAction
): string[] => {
  const paths: string[] = [];

  if (hasNormalizedMetadata(action)) {
    if (action.normalized.relativeTargetPath !== undefined) {
      paths.push(action.normalized.relativeTargetPath);
    }

    if (action.normalized.relativeTargetPaths !== undefined) {
      paths.push(...action.normalized.relativeTargetPaths);
    }

    if (action.normalized.targetPath !== undefined) {
      paths.push(action.normalized.targetPath);
    }

    if (action.normalized.targetPaths !== undefined) {
      paths.push(...action.normalized.targetPaths);
    }
  }

  if ("targetPath" in action && typeof action.targetPath === "string") {
    paths.push(action.targetPath);
  }

  if ("targetPaths" in action && Array.isArray(action.targetPaths)) {
    paths.push(
      ...action.targetPaths.filter(
        (target): target is string => typeof target === "string"
      )
    );
  }

  return uniqueSorted(paths);
};

const normalizedCommand = (
  action: StepHarborAction | NormalizedStepHarborAction
): string | undefined => {
  if (
    hasNormalizedMetadata(action) &&
    action.normalized.command !== undefined
  ) {
    return action.normalized.command.trim();
  }

  return "command" in action && typeof action.command === "string"
    ? action.command.trim()
    : undefined;
};

export const actionCommandExecutableForDeferral = (
  action: StepHarborAction | NormalizedStepHarborAction
): string | undefined => {
  if (
    hasNormalizedMetadata(action) &&
    action.normalized.commandExecutable !== undefined
  ) {
    return action.normalized.commandExecutable;
  }

  const command = normalizedCommand(action);

  return command !== undefined ? tokenizeCommand(command)[0] : undefined;
};

const actionDiffStats = (
  action: StepHarborAction | NormalizedStepHarborAction
): unknown => ("diffStats" in action ? action.diffStats : undefined);

const validationKind = (
  action: StepHarborAction | NormalizedStepHarborAction
): unknown => ("validationKind" in action ? action.validationKind : undefined);

const fingerprintPayload = (
  action: StepHarborAction | NormalizedStepHarborAction
): Record<string, unknown> => ({
  actionType: getActionType(action),
  targetPaths: actionTargetPathsForDeferral(action),
  command: normalizedCommand(action),
  diffStats: actionDiffStats(action),
  validationKind: validationKind(action)
});

export const fingerprintAction = (
  action: StepHarborAction | NormalizedStepHarborAction
): string =>
  createHash("sha256")
    .update(stableCanonicalJson(fingerprintPayload(action)))
    .digest("hex");

const hasOverlappingTarget = (
  left: StepHarborAction | NormalizedStepHarborAction,
  right: StepHarborAction | NormalizedStepHarborAction
): boolean => {
  const leftTargets = new Set(actionTargetPathsForDeferral(left));

  return actionTargetPathsForDeferral(right).some((target) =>
    leftTargets.has(target)
  );
};

export const areActionsSimilarForDeferral = (
  left: StepHarborAction | NormalizedStepHarborAction,
  right: StepHarborAction | NormalizedStepHarborAction
): boolean => {
  if (fingerprintAction(left) === fingerprintAction(right)) {
    return true;
  }

  if (
    getActionType(left) === getActionType(right) &&
    hasOverlappingTarget(left, right)
  ) {
    return true;
  }

  const leftExecutable = actionCommandExecutableForDeferral(left);
  const rightExecutable = actionCommandExecutableForDeferral(right);
  const leftCommand = normalizedCommand(left);
  const rightCommand = normalizedCommand(right);

  return (
    leftExecutable !== undefined &&
    rightExecutable !== undefined &&
    leftExecutable === rightExecutable &&
    leftCommand !== undefined &&
    rightCommand !== undefined &&
    leftCommand === rightCommand
  );
};
