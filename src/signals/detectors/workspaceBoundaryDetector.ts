import path from "node:path";
import type { NormalizedStepHarborAction } from "../../actions/actionErrors.js";
import type { StepHarborSignals } from "../../domain/signals.js";
import { findPathsOutsideWorkspaceRoots } from "../../workspace/workspaceBoundary.js";
import { resolveWorkspaceRoots } from "../../workspace/workspaceRoots.js";
import type { SafetySignalInput } from "../signalContext.js";
import type { SafetySignalDetector } from "./baseDetector.js";

const fileMutationActionTypes = new Set<NormalizedStepHarborAction["type"]>([
  "write_file",
  "edit_file",
  "delete_file"
]);

const readOnlyFileActionTypes = new Set<NormalizedStepHarborAction["type"]>([
  "read_file"
]);

const actionMutatesFilesystem = (
  input: SafetySignalInput
): boolean | undefined => {
  if (input.providedSignals?.mutatesFilesystem !== undefined) {
    return input.providedSignals.mutatesFilesystem;
  }

  if (fileMutationActionTypes.has(input.action.type)) {
    return true;
  }

  if (readOnlyFileActionTypes.has(input.action.type)) {
    return false;
  }

  return undefined;
};

const collectTargetPaths = (input: SafetySignalInput): string[] => {
  const cwd = path.resolve(input.context?.cwd ?? process.cwd());
  const paths: string[] = [];

  if (input.action.normalized.absoluteTargetPath !== undefined) {
    paths.push(input.action.normalized.absoluteTargetPath);
  } else if (
    "targetPath" in input.action &&
    typeof input.action.targetPath === "string"
  ) {
    paths.push(path.resolve(cwd, input.action.targetPath));
  }

  if (input.action.normalized.absoluteTargetPaths !== undefined) {
    paths.push(...input.action.normalized.absoluteTargetPaths);
  }

  return Array.from(new Set(paths));
};

const notApplicable = (reason: string): StepHarborSignals => ({
  workspaceBoundaryStatus: "not_applicable",
  workspaceBoundaryReason: reason
});

export const workspaceBoundaryDetector: SafetySignalDetector = {
  id: "workspace-boundary",
  compute: (input): StepHarborSignals => {
    const mutatesFilesystem = actionMutatesFilesystem(input);

    if (mutatesFilesystem !== true) {
      return notApplicable(
        "Workspace boundary checks apply only to filesystem mutations."
      );
    }

    const targetPaths = collectTargetPaths(input);

    if (targetPaths.length === 0) {
      return {
        workspaceBoundaryStatus: "unknown",
        workspaceBoundaryReason:
          "No target paths were available for workspace boundary checking."
      };
    }

    const workspaceRoots = resolveWorkspaceRoots({
      policy: input.policy,
      ...(input.context !== undefined ? { context: input.context } : {})
    });
    const outsidePaths = findPathsOutsideWorkspaceRoots(
      targetPaths,
      workspaceRoots
    );

    if (outsidePaths.length > 0) {
      return {
        workspaceBoundaryViolation: true,
        workspaceBoundaryStatus: "outside",
        workspaceBoundaryReason:
          "One or more mutating target paths are outside allowed workspace roots."
      };
    }

    return {
      workspaceBoundaryViolation: false,
      workspaceBoundaryStatus: "inside",
      workspaceBoundaryReason:
        "All mutating target paths are inside allowed workspace roots."
    };
  }
};
