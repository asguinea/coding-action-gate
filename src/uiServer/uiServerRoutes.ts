import { access } from "node:fs/promises";
import type { IncomingMessage } from "node:http";

import { resolveAuditLogPath } from "../audit/auditPaths.js";
import { resolveDeferredActionLogPath } from "../defer/deferredActionPaths.js";
import { resolveObservationLogPath } from "../observations/observationPaths.js";
import { loadPolicy } from "../policy/loadPolicy.js";
import {
  readAuditRecords,
  readLatestAuditRecord
} from "../uiAdapter/auditReader.js";
import { readDeferredActions } from "../uiAdapter/deferredReader.js";
import { readGitStateSummary } from "../uiAdapter/gitStateSummary.js";
import { readObservations } from "../uiAdapter/observationReader.js";
import { readValidationRecords } from "../uiAdapter/validationReader.js";
import { resolveValidationLogPath } from "../validation/validationPaths.js";
import { UiServerError } from "./uiServerErrors.js";
import {
  normalizeUiServerLimit,
  parseLimitQuery,
  resolveSessionId
} from "./uiServerSecurity.js";
import type { UiServerContext, UiServerRouteResult } from "./uiServerTypes.js";

const isStoreAvailable = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
};

const requestUrl = (request: IncomingMessage): URL =>
  new URL(request.url ?? "/", "http://127.0.0.1");

const requireGetOrOptions = (request: IncomingMessage): void => {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  ) {
    return;
  }

  throw new UiServerError("UI_METHOD_NOT_ALLOWED", "Method not allowed.", 405);
};

const baseReadOptions = (
  context: UiServerContext,
  limit: number
): {
  cwd?: string;
  limit: number;
} => ({
  ...(context.options.cwd !== undefined ? { cwd: context.options.cwd } : {}),
  limit
});

const readPolicy = async (
  context: UiServerContext
): Promise<{
  policy: unknown;
  source: {
    type: "explicit" | "discovered" | "default";
    path?: string;
    version?: string;
  };
}> => {
  const result = await loadPolicy({
    ...(context.options.cwd !== undefined ? { cwd: context.options.cwd } : {}),
    ...(context.options.policyPath !== undefined
      ? { explicitPath: context.options.policyPath }
      : {})
  });

  if (!result.ok) {
    throw new UiServerError("UI_ADAPTER_ERROR", result.error.message, 500);
  }

  return {
    policy: result.policy,
    source: {
      ...result.source,
      version: result.policy.version
    }
  };
};

export const handleUiServerRoute = async (
  request: IncomingMessage,
  context: UiServerContext
): Promise<UiServerRouteResult> => {
  requireGetOrOptions(request);

  const url = requestUrl(request);
  const limit = parseLimitQuery(
    url.searchParams.get("limit"),
    context.options.limit
  );

  switch (url.pathname) {
    case "/api/health":
      return {
        statusCode: 200,
        body: {
          ok: true,
          service: "stepharbor-ui-api",
          readOnly: true
        }
      };

    case "/api/audit":
      return {
        statusCode: 200,
        body: {
          ok: true,
          records: await readAuditRecords({
            ...baseReadOptions(context, limit),
            ...(context.options.auditDir !== undefined
              ? { auditDir: context.options.auditDir }
              : {})
          })
        }
      };

    case "/api/audit/latest":
      return {
        statusCode: 200,
        body: {
          ok: true,
          record: await readLatestAuditRecord({
            ...(context.options.cwd !== undefined
              ? { cwd: context.options.cwd }
              : {}),
            ...(context.options.auditDir !== undefined
              ? { auditDir: context.options.auditDir }
              : {})
          })
        }
      };

    case "/api/deferred": {
      const sessionId = resolveSessionId(
        url.searchParams.get("sessionId"),
        context.options.sessionId
      );

      return {
        statusCode: 200,
        body: {
          ok: true,
          records: await readDeferredActions({
            ...baseReadOptions(context, limit),
            sessionId,
            ...(context.options.deferDir !== undefined
              ? { deferDir: context.options.deferDir }
              : {})
          })
        }
      };
    }

    case "/api/observations": {
      const sessionId = resolveSessionId(
        url.searchParams.get("sessionId"),
        context.options.sessionId
      );

      return {
        statusCode: 200,
        body: {
          ok: true,
          records: await readObservations({
            ...baseReadOptions(context, limit),
            sessionId,
            ...(context.options.observationDir !== undefined
              ? { observationDir: context.options.observationDir }
              : {})
          })
        }
      };
    }

    case "/api/validation": {
      const sessionId = resolveSessionId(
        url.searchParams.get("sessionId"),
        context.options.sessionId
      );

      return {
        statusCode: 200,
        body: {
          ok: true,
          records: await readValidationRecords({
            ...baseReadOptions(context, limit),
            sessionId,
            ...(context.options.validationDir !== undefined
              ? { validationDir: context.options.validationDir }
              : {})
          })
        }
      };
    }

    case "/api/git-state":
      return {
        statusCode: 200,
        body: {
          ok: true,
          state: await readGitStateSummary({
            ...(context.options.cwd !== undefined
              ? { cwd: context.options.cwd }
              : {})
          })
        }
      };

    case "/api/policy": {
      const policy = await readPolicy(context);

      return {
        statusCode: 200,
        body: {
          ok: true,
          policy: policy.policy,
          source: policy.source
        }
      };
    }

    case "/api/status": {
      const cwd = context.options.cwd ?? process.cwd();
      const sessionId = resolveSessionId(null, context.options.sessionId);
      const common = {
        ...(context.options.cwd !== undefined
          ? { cwd: context.options.cwd }
          : {})
      };

      return {
        statusCode: 200,
        body: {
          ok: true,
          cwd,
          sessionId,
          readOnly: true,
          stores: {
            audit: {
              available: await isStoreAvailable(
                resolveAuditLogPath({
                  ...common,
                  ...(context.options.auditDir !== undefined
                    ? { auditDir: context.options.auditDir }
                    : {})
                })
              )
            },
            deferred: {
              available: await isStoreAvailable(
                resolveDeferredActionLogPath({
                  ...common,
                  sessionId,
                  ...(context.options.deferDir !== undefined
                    ? { deferDir: context.options.deferDir }
                    : {})
                })
              )
            },
            observations: {
              available: await isStoreAvailable(
                resolveObservationLogPath({
                  ...common,
                  sessionId,
                  ...(context.options.observationDir !== undefined
                    ? { observationDir: context.options.observationDir }
                    : {})
                })
              )
            },
            validation: {
              available: await isStoreAvailable(
                resolveValidationLogPath({
                  ...common,
                  sessionId,
                  ...(context.options.validationDir !== undefined
                    ? { validationDir: context.options.validationDir }
                    : {})
                })
              )
            }
          }
        }
      };
    }

    default:
      throw new UiServerError("UI_ROUTE_NOT_FOUND", "Route not found.", 404);
  }
};

export const normalizeUiServerOptions = (
  options: UiServerContext["options"]
): UiServerContext["options"] => ({
  ...options,
  limit: normalizeUiServerLimit(options.limit)
});
