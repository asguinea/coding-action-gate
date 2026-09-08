import type { ServerResponse } from "node:http";
import { UiServerError } from "./uiServerErrors.js";
import type { UiServerOptions } from "./uiServerTypes.js";

export const applyCorsHeaders = (
  response: ServerResponse,
  options: UiServerOptions
): void => {
  if (options.allowCorsOrigin !== undefined) {
    response.setHeader("Access-Control-Allow-Origin", options.allowCorsOrigin);
    response.setHeader("Vary", "Origin");
  }
};

export const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  options: UiServerOptions,
  headOnly = false
): void => {
  applyCorsHeaders(response, options);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-StepHarbor-Read-Only", "true");
  response.end(headOnly ? undefined : `${JSON.stringify(body)}\n`);
};

export const sendOptions = (
  response: ServerResponse,
  options: UiServerOptions
): void => {
  applyCorsHeaders(response, options);
  response.statusCode = 204;
  response.setHeader("Allow", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-StepHarbor-Read-Only", "true");
  response.end();
};

export const toSafeUiServerError = (error: unknown): UiServerError => {
  if (error instanceof UiServerError) {
    return error;
  }

  return new UiServerError(
    "UI_ADAPTER_ERROR",
    "StepHarbor UI adapter failed to read runtime data.",
    500
  );
};

export const sendError = (
  response: ServerResponse,
  error: unknown,
  options: UiServerOptions
): void => {
  const safeError = toSafeUiServerError(error);

  sendJson(
    response,
    safeError.statusCode,
    {
      ok: false,
      error: {
        code: safeError.code,
        message: safeError.message
      }
    },
    options
  );
};
