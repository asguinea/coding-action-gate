import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UiServerError } from "./uiServerErrors.js";
import { formatServerUrl, validateUiServerHost } from "./uiServerSecurity.js";

export interface StaticUiServerOptions {
  cwd?: string;
  host?: string;
  port?: number;
  distDir?: string;
}

export interface StaticUiServerStartedInfo {
  host: string;
  port: number;
  url: string;
  distDir: string;
}

export interface StaticUiServerInstance {
  start(): Promise<StaticUiServerStartedInfo>;
  stop(): Promise<void>;
}

export const defaultStaticUiServerPort = 5173;

export const resolvePackageRoot = (): string =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const resolveStaticUiDistDir = (
  options: StaticUiServerOptions = {}
): string =>
  options.distDir !== undefined
    ? path.resolve(options.cwd ?? process.cwd(), options.distDir)
    : options.cwd !== undefined
      ? path.resolve(options.cwd, "ui", "dist")
      : path.join(resolvePackageRoot(), "ui", "dist");

export const staticUiDistExists = async (distDir: string): Promise<boolean> => {
  try {
    const stats = await stat(distDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const applyStaticHeaders = (
  response: ServerResponse,
  contentType = "application/octet-stream"
): void => {
  response.setHeader("Content-Type", contentType);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Coding-Action-Gate-Read-Only", "true");
};

const sendText = (
  response: ServerResponse,
  statusCode: number,
  message: string
): void => {
  response.statusCode = statusCode;
  applyStaticHeaders(response, "text/plain; charset=utf-8");
  response.end(`${message}\n`);
};

const safeDecodePathname = (pathname: string): string | null => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
};

const resolveRequestPath = (
  distDir: string,
  pathname: string
): string | null => {
  const decoded = safeDecodePathname(pathname);

  if (decoded === null || decoded.includes("\0")) {
    return null;
  }

  const normalizedPath = decoded === "/" ? "/index.html" : decoded;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(distDir, relativePath);
  const relativeToDist = path.relative(distDir, absolutePath);

  if (
    relativeToDist.startsWith("..") ||
    path.isAbsolute(relativeToDist) ||
    relativeToDist.length === 0
  ) {
    return null;
  }

  return absolutePath;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

const serveFile = async (
  filePath: string,
  method: string,
  response: ServerResponse
): Promise<void> => {
  const extension = path.extname(filePath);
  applyStaticHeaders(response, contentTypes[extension] ?? undefined);
  response.statusCode = 200;

  if (method === "HEAD") {
    response.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.pipe(response);
  });
};

const listen = (
  server: Server,
  port: number,
  host: string,
  distDir: string
): Promise<StaticUiServerStartedInfo> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(
        new UiServerError(
          "UI_SERVER_START_ERROR",
          `Failed to start CodingActionGate static UI server: ${error.message}`,
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
            "Failed to determine CodingActionGate static UI server address.",
            500
          )
        );
        return;
      }

      const bound = address as AddressInfo;
      resolve({
        host,
        port: bound.port,
        url: formatServerUrl(host, bound.port),
        distDir
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

export const createStaticUiServer = (
  options: StaticUiServerOptions = {}
): StaticUiServerInstance => {
  const host = validateUiServerHost(options.host);
  const port = options.port ?? defaultStaticUiServerPort;
  const distDir = resolveStaticUiDistDir(options);
  let server: Server | undefined;
  let started: StaticUiServerStartedInfo | undefined;

  return {
    async start(): Promise<StaticUiServerStartedInfo> {
      if (started !== undefined) {
        return started;
      }

      if (!(await staticUiDistExists(distDir))) {
        throw new UiServerError(
          "UI_SERVER_START_ERROR",
          "CodingActionGate UI build was not found.",
          500
        );
      }

      const indexPath = path.join(distDir, "index.html");
      await access(indexPath);

      server = createServer((request, response) => {
        void (async () => {
          const method = request.method ?? "GET";

          if (method === "OPTIONS") {
            response.statusCode = 204;
            response.setHeader("Allow", "GET, HEAD, OPTIONS");
            response.setHeader(
              "Access-Control-Allow-Methods",
              "GET, HEAD, OPTIONS"
            );
            response.setHeader("X-Coding-Action-Gate-Read-Only", "true");
            response.end();
            return;
          }

          if (method !== "GET" && method !== "HEAD") {
            sendText(response, 405, "Method not allowed.");
            return;
          }

          const url = new URL(request.url ?? "/", "http://localhost");
          const requestedPath = resolveRequestPath(distDir, url.pathname);

          if (requestedPath === null) {
            sendText(response, 404, "Not found.");
            return;
          }

          const hasExtension = path.extname(requestedPath).length > 0;
          const filePath = (await fileExists(requestedPath))
            ? requestedPath
            : hasExtension
              ? null
              : indexPath;

          if (filePath === null) {
            sendText(response, 404, "Not found.");
            return;
          }

          await serveFile(filePath, method, response);
        })().catch(() => {
          if (!response.headersSent) {
            sendText(response, 500, "Static UI server error.");
          } else {
            response.end();
          }
        });
      });

      started = await listen(server, port, host, distDir);
      return started;
    },

    async stop(): Promise<void> {
      if (server === undefined || started === undefined) {
        return;
      }

      await closeServer(server);
      started = undefined;
      server = undefined;
    }
  };
};
