import path from "node:path";
import { z } from "zod";

export interface PathNormalizationOptions {
  cwd?: string;
  workspaceRoots?: string[];
}

export interface NormalizedActionPath {
  targetPath: string;
  absoluteTargetPath: string;
  relativeTargetPath: string;
  isInsideWorkspace?: boolean;
}

export const normalizedActionPathSchema = z.object({
  targetPath: z.string().min(1),
  absoluteTargetPath: z.string().min(1),
  relativeTargetPath: z.string(),
  isInsideWorkspace: z.boolean().optional()
});

const ensureWithinPathBoundary = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const normalizeWorkspaceRoots = (
  roots: string[] | undefined,
  cwd: string
): string[] | undefined => {
  if (roots === undefined) {
    return undefined;
  }

  return roots.map((root) => path.resolve(cwd, root.length > 0 ? root : "."));
};

export const normalizePathForAction = (
  targetPath: string,
  options: PathNormalizationOptions = {}
): NormalizedActionPath => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const absoluteTargetPath = path.resolve(cwd, targetPath);
  const relativeTargetPath = path.relative(cwd, absoluteTargetPath) || ".";
  const workspaceRoots = normalizeWorkspaceRoots(options.workspaceRoots, cwd);

  const normalized: NormalizedActionPath = {
    targetPath,
    absoluteTargetPath,
    relativeTargetPath
  };

  if (workspaceRoots !== undefined) {
    normalized.isInsideWorkspace = workspaceRoots.some((root) =>
      ensureWithinPathBoundary(absoluteTargetPath, root)
    );
  }

  return normalized;
};

export const normalizePathsForAction = (
  targetPaths: string[],
  options: PathNormalizationOptions = {}
): NormalizedActionPath[] =>
  targetPaths.map((targetPath) => normalizePathForAction(targetPath, options));
