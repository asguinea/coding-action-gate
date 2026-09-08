import path from "node:path";
import type { StepHarborPolicy } from "../domain/policies.js";
import type { SafetySignalContext } from "../signals/signalContext.js";

export interface ResolveWorkspaceRootsInput {
  policy?: StepHarborPolicy;
  context?: SafetySignalContext;
}

const nonEmptyRoots = (roots: string[] | undefined): string[] | undefined => {
  if (roots === undefined || roots.length === 0) {
    return undefined;
  }

  return roots;
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

export const resolveWorkspaceRoots = (
  input: ResolveWorkspaceRootsInput = {}
): string[] => {
  const cwd = path.resolve(input.context?.cwd ?? process.cwd());
  const roots = nonEmptyRoots(input.context?.workspaceRoots) ??
    nonEmptyRoots(input.policy?.workspace?.allowedRoots) ?? ["."];

  return dedupe(
    roots.map((root) => path.resolve(cwd, root.length > 0 ? root : "."))
  );
};
