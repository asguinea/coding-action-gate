import type { Server } from "node:http";
import type { UiServerError } from "./uiServerErrors.js";

export interface UiServerOptions {
  cwd?: string;
  host?: string;
  port?: number;
  auditDir?: string;
  deferDir?: string;
  observationDir?: string;
  validationDir?: string;
  policyPath?: string;
  sessionId?: string;
  limit?: number;
  allowCorsOrigin?: string;
}

export interface StartedUiServerInfo {
  host: string;
  port: number;
  url: string;
}

export interface UiServerInstance {
  start(): Promise<StartedUiServerInfo>;
  stop(): Promise<void>;
}

export interface StartedUiServer extends UiServerInstance {
  host: string;
  port: number;
  url: string;
}

export interface UiServerContext {
  options: UiServerOptions;
}

export interface UiServerRouteResult {
  statusCode: number;
  body: unknown;
}

export interface UiServerErrorResponse {
  ok: false;
  error: {
    code: UiServerError["code"];
    message: string;
  };
}

export interface UiServerOkResponse<T> {
  ok: true;
  [key: string]: T | true;
}

export interface UiServerInternalState {
  server?: Server;
  started?: StartedUiServerInfo;
}
