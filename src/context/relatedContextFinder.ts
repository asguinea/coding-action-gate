import { stat } from "node:fs/promises";
import path from "node:path";
import type { RelatedContextDiscovery } from "./relatedContextTypes.js";

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const fileStats = await stat(filePath);

    return fileStats.isFile();
  } catch {
    return false;
  }
};

export const inferRelatedTestPaths = (targetPath: string): string[] => {
  const parsed = path.posix.parse(targetPath.replaceAll(path.sep, "/"));
  const extension = parsed.ext;
  const baseName = extension.length > 0 ? parsed.name : parsed.base;
  const directory = parsed.dir;
  const sameDirectoryPrefix = directory.length > 0 ? `${directory}/` : "";

  return Array.from(
    new Set([
      `${sameDirectoryPrefix}${baseName}.test${extension}`,
      `${sameDirectoryPrefix}${baseName}.spec${extension}`,
      `tests/${baseName}.test${extension}`,
      `__tests__/${baseName}.test${extension}`
    ])
  );
};

export const findRelatedContext = async (input: {
  targetPath: string;
  cwd?: string;
}): Promise<RelatedContextDiscovery> => {
  const cwd = input.cwd ?? process.cwd();
  const candidates = await Promise.all(
    inferRelatedTestPaths(input.targetPath).map(async (candidatePath) => ({
      path: candidatePath,
      exists: await fileExists(path.resolve(cwd, candidatePath))
    }))
  );

  return {
    targetPath: input.targetPath,
    relatedTestCandidates: candidates,
    existingRelatedTests: candidates
      .filter((candidate) => candidate.exists)
      .map((candidate) => candidate.path)
  };
};
