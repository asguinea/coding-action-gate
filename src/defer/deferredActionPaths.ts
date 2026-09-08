import path from "node:path";

export const defaultDeferredActionDir = ".coding-action-gate/deferred";
export const defaultDeferredActionSessionId = "default";

export const normalizeDeferredActionSessionId = (
  sessionId?: string
): string => {
  const rawSessionId =
    sessionId !== undefined && sessionId.trim().length > 0
      ? sessionId
      : defaultDeferredActionSessionId;
  const normalized = rawSessionId.replace(/[^0-9A-Za-z._-]/g, "_");

  return normalized.length > 0 ? normalized : defaultDeferredActionSessionId;
};

export const resolveDeferredActionDir = (
  options: {
    cwd?: string;
    deferDir?: string;
  } = {}
): string => {
  const cwd = options.cwd ?? process.cwd();
  const deferDir = options.deferDir ?? defaultDeferredActionDir;

  return path.isAbsolute(deferDir) ? deferDir : path.resolve(cwd, deferDir);
};

export const resolveDeferredActionLogPath = (
  options: {
    cwd?: string;
    deferDir?: string;
    sessionId?: string;
  } = {}
): string =>
  path.join(
    resolveDeferredActionDir(options),
    `session_${normalizeDeferredActionSessionId(options.sessionId)}.jsonl`
  );
