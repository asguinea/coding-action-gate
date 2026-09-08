import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { UiServerError } from "./uiServerErrors.js";
import {
  handleUiServerRoute,
  normalizeUiServerOptions
} from "./uiServerRoutes.js";
import {
  defaultUiServerPort,
  formatServerUrl,
  validateUiServerHost
} from "./uiServerSecurity.js";
import { sendError, sendJson, sendOptions } from "./uiServerResponse.js";
import type {
  StartedUiServer,
  StartedUiServerInfo,
  UiServerInstance,
  UiServerInternalState,
  UiServerOptions
} from "./uiServerTypes.js";

const listen = (
  server: Server,
  port: number,
  host: string
): Promise<StartedUiServerInfo> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(
        new UiServerError(
          "UI_SERVER_START_ERROR",
          `Failed to start StepHarbor UI server: ${error.message}`,
          500
        )
      );
    };

    const onListening = (): void => {
      server.off("error", onError);
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(
          new UiServerError(
            "UI_SERVER_START_ERROR",
            "Failed to determine StepHarbor UI server address.",
            500
          )
        );
        return;
      }

      const bound = address as AddressInfo;
      resolve({
        host,
        port: bound.port,
        url: formatServerUrl(host, bound.port)
      });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }

      reject(error);
    });
  });

export const createReadOnlyUiServer = (
  options: UiServerOptions = {}
): UiServerInstance => {
  const host = validateUiServerHost(options.host);
  const normalizedOptions = normalizeUiServerOptions({
    ...options,
    host
  });
  const state: UiServerInternalState = {};

  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (request.method === "OPTIONS") {
          sendOptions(response, normalizedOptions);
          return;
        }

        const result = await handleUiServerRoute(request, {
          options: normalizedOptions
        });

        sendJson(
          response,
          result.statusCode,
          result.body,
          normalizedOptions,
          request.method === "HEAD"
        );
      } catch (error) {
        sendError(response, error, normalizedOptions);
      }
    })();
  });

  state.server = server;

  return {
    async start(): Promise<StartedUiServerInfo> {
      if (state.started !== undefined) {
        return state.started;
      }

      const port = normalizedOptions.port ?? defaultUiServerPort;
      const started = await listen(server, port, host);
      state.started = started;

      return started;
    },

    async stop(): Promise<void> {
      if (state.started === undefined) {
        return;
      }

      await closeServer(server);
      delete state.started;
    }
  };
};

export const startReadOnlyUiServer = async (
  options: UiServerOptions = {}
): Promise<StartedUiServer> => {
  const instance = createReadOnlyUiServer(options);
  const started = await instance.start();

  return {
    ...started,
    start: instance.start,
    stop: instance.stop
  };
};
