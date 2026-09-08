import path from "node:path";

export const isPathInsideWorkspaceRoot = (
  targetPath: string,
  workspaceRoot: string
): boolean => {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  return (
    relative === "" ||
    (relative.length > 0 &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative))
  );
};

export const isPathInsideAnyWorkspaceRoot = (
  targetPath: string,
  workspaceRoots: string[]
): boolean =>
  workspaceRoots.some((workspaceRoot) =>
    isPathInsideWorkspaceRoot(targetPath, workspaceRoot)
  );

export const findPathsOutsideWorkspaceRoots = (
  targetPaths: string[],
  workspaceRoots: string[]
): string[] =>
  targetPaths.filter(
    (targetPath) => !isPathInsideAnyWorkspaceRoot(targetPath, workspaceRoots)
  );
