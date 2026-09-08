import path from "node:path";
import type { ObservationStoreOptions } from "./fileObservationTypes.js";

export const defaultObservationDir = ".coding-action-gate/observations";
export const defaultObservationSessionId = "default";

export const normalizeObservationSessionId = (sessionId?: string): string => {
  const rawSessionId =
    sessionId !== undefined && sessionId.trim().length > 0
      ? sessionId
      : defaultObservationSessionId;
  const normalized = rawSessionId.replace(/[^0-9A-Za-z._-]/g, "_");

  return normalized.length > 0 ? normalized : defaultObservationSessionId;
};

export const resolveObservationDir = (
  options: ObservationStoreOptions = {}
): string => {
  const cwd = options.cwd ?? process.cwd();
  const observationDir = options.observationDir ?? defaultObservationDir;

  return path.isAbsolute(observationDir)
    ? observationDir
    : path.resolve(cwd, observationDir);
};

export const resolveObservationLogPath = (
  options: ObservationStoreOptions = {}
): string =>
  path.join(
    resolveObservationDir(options),
    `session_${normalizeObservationSessionId(options.sessionId)}.jsonl`
  );

export const resolveObservedFilePath = (
  filePath: string,
  cwd = process.cwd()
): {
  absolutePath: string;
  relativePath: string;
} => {
  const resolvedCwd = path.resolve(cwd);
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedCwd, filePath);
  const relativePath = path.relative(resolvedCwd, absolutePath) || ".";

  return {
    absolutePath,
    relativePath
  };
};
