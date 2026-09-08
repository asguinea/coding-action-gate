import path from "node:path";

import type { ValidationStoreOptions } from "./validationTypes.js";

export const defaultValidationDir = ".coding-action-gate/validation";
export const defaultValidationSessionId = "default";

export const normalizeValidationSessionId = (sessionId?: string): string => {
  const rawSessionId =
    sessionId !== undefined && sessionId.trim().length > 0
      ? sessionId
      : defaultValidationSessionId;
  const normalized = rawSessionId.replace(/[^0-9A-Za-z._-]/g, "_");

  return normalized.length > 0 ? normalized : defaultValidationSessionId;
};

export const resolveValidationDir = (
  options: ValidationStoreOptions = {}
): string => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const validationDir = options.validationDir ?? defaultValidationDir;

  return path.isAbsolute(validationDir)
    ? validationDir
    : path.resolve(cwd, validationDir);
};

export const resolveValidationLogPath = (
  options: ValidationStoreOptions = {}
): string =>
  path.join(
    resolveValidationDir(options),
    `session_${normalizeValidationSessionId(options.sessionId)}.jsonl`
  );
