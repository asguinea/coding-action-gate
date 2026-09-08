import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import type { StartedUiServer } from "../../uiServer/uiServerTypes.js";
import { recordUiLaunched } from "../../analytics/analyticsRecorder.js";
import { resolveAuditLogPath } from "../../audit/auditPaths.js";
import { loadPolicy } from "../../policy/loadPolicy.js";
import { startReadOnlyUiServer } from "../../uiServer/uiServer.js";
import { UiServerError } from "../../uiServer/uiServerErrors.js";
import {
  defaultUiServerHost,
  formatServerUrl,
  validateUiServerHost
} from "../../uiServer/uiServerSecurity.js";
import {
  createStaticUiServer,
  defaultStaticUiServerPort,
  resolveStaticUiDistDir,
  staticUiDistExists,
  type StaticUiServerInstance,
  type StaticUiServerStartedInfo
} from "../../uiServer/staticUiServer.js";
import { createCliError, type CliError } from "../cliErrors.js";

export type UiMode = "mock" | "live";

export interface UiCommandOptions {
  cwd?: string;
  host?: string;
  apiPort?: number;
  uiPort?: number;
  sessionId?: string;
  policy?: string;
  mode?: UiMode;
  noOpen?: boolean;
  open?: boolean;
  noUiServer?: boolean;
  uiDistDir?: string;
}

export interface UiCommandStarted {
  api: StartedUiServer;
  ui?: StaticUiServerStartedInfo;
  uiUrl: string;
  mode: UiMode;
  cwd: string;
  sessionId: string;
  policyLabel: string;
  distDir: string;
  uiBuildFound: boolean;
  startupChecks: UiStartupCheck[];
  instructions: string[];
  stop(): Promise<void>;
}

export interface UiCommandRunOptions {
  waitUntilStopped?: boolean;
  signalRegistrar?: Pick<NodeJS.Process, "once" | "off">;
}

export interface UiCommandResult {
  ok: true;
  started: UiCommandStarted;
  outputText: string;
}

export type UiCommandRunResult =
  | UiCommandResult
  | {
      ok: false;
      error: CliError;
    };

export const defaultUiApiPort = 17373;

export type UiStartupCheckStatus = "PASS" | "WARN" | "FAIL";

export interface UiStartupCheck {
  status: UiStartupCheckStatus;
  label: string;
  message: string;
}

export interface UiStartupSelfCheck {
  cwd: string;
  host: string;
  apiPort: number;
  uiPort: number;
  sessionId: string;
  mode: UiMode;
  distDir: string;
  uiBuildFound: boolean;
  policyLabel: string;
  checks: UiStartupCheck[];
}

const execFileAsync = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = execFile(file, args, (error) => {
      if (error === null) {
        resolve();
        return;
      }

      reject(error);
    });

    child.unref();
  });

export const openUiUrlInBrowser = async (url: string): Promise<boolean> => {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
      return true;
    }

    if (process.platform === "linux") {
      await execFileAsync("xdg-open", [url]);
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

export const validateUiPort = (
  value: number | undefined,
  label: string
): number => {
  const resolved =
    value ?? (label === "api" ? defaultUiApiPort : defaultStaticUiServerPort);

  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 65_535) {
    throw createCliError(
      "CLI_UI_INVALID_PORT",
      `${label === "api" ? "--api-port" : "--ui-port"} must be an integer between 1 and 65535.`
    );
  }

  return resolved;
};

export const validateUiHost = (host?: string): string => {
  try {
    return validateUiServerHost(host);
  } catch {
    throw createCliError(
      "CLI_UI_UNSAFE_HOST",
      "UI host must be localhost-only."
    );
  }
};

export const buildUiUrl = (input: {
  host?: string;
  uiPort?: number;
  mode?: UiMode;
  apiUrl?: string;
}): string => {
  const host = input.host ?? defaultUiServerHost;
  const uiPort = input.uiPort ?? defaultStaticUiServerPort;
  const mode = input.mode ?? "live";
  const url = new URL(formatServerUrl(host, uiPort));

  url.searchParams.set("source", mode);

  if (mode === "live" && input.apiUrl !== undefined) {
    url.searchParams.set("apiUrl", input.apiUrl);
  }

  return url.toString();
};

export const buildUiDevInstructions = (input: {
  uiPort?: number;
  uiUrl: string;
}): string[] => [
  `npm run ui:dev -- --port ${input.uiPort ?? defaultStaticUiServerPort}`,
  input.uiUrl
];

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const portAvailable = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });

const policyLabel = (source: { type: string; path?: string }): string => {
  if (source.type === "default") {
    return "default policy";
  }

  if (source.path !== undefined) {
    return `${source.type} ${source.path}`;
  }

  return `${source.type} policy`;
};

const hasFailed = (checks: UiStartupCheck[]): boolean =>
  checks.some((check) => check.status === "FAIL");

const firstFailureMessage = (checks: UiStartupCheck[]): string =>
  checks.find((check) => check.status === "FAIL")?.message ??
  "StepHarbor UI startup self-check failed.";

export const runUiStartupSelfCheck = async (
  options: UiCommandOptions
): Promise<UiStartupSelfCheck> => {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const host = validateUiHost(options.host);
  const apiPort = validateUiPort(options.apiPort, "api");
  const uiPort = validateUiPort(options.uiPort, "ui");
  const sessionId = options.sessionId ?? "default";
  const mode = options.mode ?? "live";
  const distDir = resolveStaticUiDistDir({
    ...(options.uiDistDir !== undefined ? { distDir: options.uiDistDir } : {})
  });
  const checks: UiStartupCheck[] = [];
  let cwdOk: boolean;

  try {
    const cwdStat = await stat(cwd);
    cwdOk = cwdStat.isDirectory();
  } catch {
    cwdOk = false;
  }

  checks.push(
    cwdOk
      ? {
          status: "PASS",
          label: "cwd",
          message: `cwd exists: ${cwd}`
        }
      : {
          status: "FAIL",
          label: "cwd",
          message: `cwd does not exist or is not a directory: ${cwd}`
        }
  );

  if (cwdOk) {
    const policyResult = await loadPolicy({
      cwd,
      ...(options.policy !== undefined ? { explicitPath: options.policy } : {})
    });

    if (policyResult.ok) {
      checks.push({
        status: policyResult.source.type === "default" ? "WARN" : "PASS",
        label: "policy",
        message:
          policyResult.source.type === "default"
            ? "no project policy discovered; default policy will be used"
            : `policy loaded: ${policyLabel(policyResult.source)}`
      });
    } else {
      checks.push({
        status: options.policy !== undefined ? "FAIL" : "WARN",
        label: "policy",
        message: policyResult.error.message
      });
    }
  }

  const uiBuildFound =
    (await staticUiDistExists(distDir)) &&
    (await fileExists(path.join(distDir, "index.html")));

  if (options.noUiServer === true) {
    checks.push({
      status: "PASS",
      label: "ui build",
      message: "UI static server disabled with --no-ui-server"
    });
  } else if (uiBuildFound) {
    checks.push({
      status: "PASS",
      label: "ui build",
      message: `UI build found: ${distDir}`
    });
  } else {
    checks.push({
      status: "WARN",
      label: "ui build",
      message: `UI build not found: ${path.join(distDir, "index.html")}`
    });
  }

  checks.push(
    (await portAvailable(apiPort, host))
      ? {
          status: "PASS",
          label: "api port",
          message: `API port available: ${host}:${apiPort}`
        }
      : {
          status: "FAIL",
          label: "api port",
          message: `API port unavailable: ${host}:${apiPort}`
        }
  );

  if (options.noUiServer !== true && uiBuildFound) {
    checks.push(
      (await portAvailable(uiPort, host))
        ? {
            status: "PASS",
            label: "ui port",
            message: `UI port available: ${host}:${uiPort}`
          }
        : {
            status: "FAIL",
            label: "ui port",
            message: `UI port unavailable: ${host}:${uiPort}`
          }
    );
  }

  if (cwdOk) {
    const runtimeDir = path.join(cwd, ".stepharbor");
    checks.push(
      (await fileExists(runtimeDir))
        ? {
            status: "PASS",
            label: "runtime data",
            message: ".stepharbor runtime data exists"
          }
        : {
            status: "WARN",
            label: "runtime data",
            message: "no .stepharbor runtime data found yet"
          }
    );
    checks.push(
      (await fileExists(resolveAuditLogPath({ cwd })))
        ? {
            status: "PASS",
            label: "audit records",
            message: "audit records found"
          }
        : {
            status: "WARN",
            label: "audit records",
            message: "no audit records yet"
          }
    );
  }

  const loadedPolicy = cwdOk
    ? await loadPolicy({
        cwd,
        ...(options.policy !== undefined
          ? { explicitPath: options.policy }
          : {})
      })
    : undefined;

  return {
    cwd,
    host,
    apiPort,
    uiPort,
    sessionId,
    mode,
    distDir,
    uiBuildFound,
    policyLabel:
      loadedPolicy?.ok === true
        ? policyLabel(loadedPolicy.source)
        : "unavailable",
    checks
  };
};

export const formatUiCommandOutput = (started: UiCommandStarted): string => {
  const modeLabel = started.mode === "live" ? "Live Local" : "Mock Demo";
  const lines = [
    "StepHarbor UI beta",
    "",
    "Project:",
    `  cwd: ${started.cwd}`,
    `  session: ${started.sessionId}`,
    `  policy: ${started.policyLabel}`,
    "",
    "Runtime:",
    `  API: ${started.api.url}`,
    `  UI:  ${started.uiUrl}`,
    "",
    "Mode:",
    `  ${modeLabel}`,
    "",
    "Status:"
  ];

  for (const check of started.startupChecks) {
    lines.push(`  ${check.status} ${check.message}`);
  }

  lines.push(
    "",
    "Security:",
    "  API is localhost-only.",
    "  API is read-only.",
    "  UI is read-only.",
    "  UI cannot execute actions.",
    "  No actions can be executed from the UI."
  );

  if (started.ui !== undefined) {
    lines.push("", `Static UI server:`, `  ${started.ui.url}`);
  } else {
    lines.push("");

    if (started.uiBuildFound) {
      lines.push("UI static server was not started.");
    } else {
      lines.push(
        "UI build not found:",
        `  ${path.join(started.distDir, "index.html")}`,
        "",
        "Run:",
        "  npm run ui:build",
        "",
        "Or start only the API:",
        "  stepharbor ui --no-ui-server"
      );
    }

    if (started.instructions.length > 0) {
      lines.push("", "Start UI separately:");
      for (const instruction of started.instructions) {
        lines.push(`  ${instruction}`);
      }
    }
  }

  lines.push("", "Press Ctrl+C to stop.");

  return `${lines.join("\n")}\n`;
};

const toCliUiServerError = (error: unknown): CliError => {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error
  ) {
    const code = String((error as { code: unknown }).code);

    if (code === "CLI_UI_UNSAFE_HOST" || code === "CLI_UI_INVALID_PORT") {
      return error as CliError;
    }
  }

  if (
    error instanceof UiServerError &&
    error.code === "UI_SERVER_UNSAFE_HOST"
  ) {
    return createCliError(
      "CLI_UI_UNSAFE_HOST",
      "UI host must be localhost-only."
    );
  }

  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Failed to start StepHarbor UI.";

  return createCliError("CLI_UI_SERVER_ERROR", message);
};

export const startUiCommand = async (
  options: UiCommandOptions
): Promise<UiCommandRunResult> => {
  let api: StartedUiServer | undefined;
  let staticUi: StaticUiServerInstance | undefined;

  try {
    const selfCheck = await runUiStartupSelfCheck(options);

    if (hasFailed(selfCheck.checks)) {
      return {
        ok: false,
        error: createCliError(
          "CLI_UI_SERVER_ERROR",
          firstFailureMessage(selfCheck.checks)
        )
      };
    }

    api = await startReadOnlyUiServer({
      cwd: selfCheck.cwd,
      host: selfCheck.host,
      port: selfCheck.apiPort,
      sessionId: selfCheck.sessionId,
      ...(options.policy !== undefined ? { policyPath: options.policy } : {})
    });

    const uiUrl = buildUiUrl({
      host: selfCheck.host,
      uiPort: selfCheck.uiPort,
      mode: selfCheck.mode,
      apiUrl: api.url
    });
    let ui: StaticUiServerStartedInfo | undefined;

    if (options.noUiServer !== true && selfCheck.uiBuildFound) {
      staticUi = createStaticUiServer({
        host: selfCheck.host,
        port: selfCheck.uiPort,
        distDir: selfCheck.distDir
      });
      ui = await staticUi.start();
    }

    const started: UiCommandStarted = {
      api,
      uiUrl,
      mode: selfCheck.mode,
      cwd: selfCheck.cwd,
      sessionId: selfCheck.sessionId,
      policyLabel: selfCheck.policyLabel,
      distDir: selfCheck.distDir,
      uiBuildFound: selfCheck.uiBuildFound,
      startupChecks: selfCheck.checks,
      instructions:
        ui === undefined
          ? buildUiDevInstructions({
              uiPort: selfCheck.uiPort,
              uiUrl
            })
          : [],
      async stop(): Promise<void> {
        await staticUi?.stop();
        await api?.stop();
      }
    };

    if (ui !== undefined) {
      started.ui = ui;
    }

    await recordUiLaunched({
      cwd: selfCheck.cwd,
      mode: selfCheck.mode,
      uiServerEnabled: options.noUiServer !== true && ui !== undefined,
      bundledUiAssetsFound: selfCheck.uiBuildFound
    });

    return {
      ok: true,
      started,
      outputText: formatUiCommandOutput(started)
    };
  } catch (error) {
    await staticUi?.stop();
    await api?.stop();

    return {
      ok: false,
      error: toCliUiServerError(error)
    };
  }
};

const waitForShutdownSignal = async (
  started: UiCommandStarted,
  signalRegistrar: Pick<NodeJS.Process, "once" | "off"> = process
): Promise<void> =>
  new Promise((resolve) => {
    const stop = (): void => {
      signalRegistrar.off("SIGINT", stop);
      signalRegistrar.off("SIGTERM", stop);
      void started.stop().finally(resolve);
    };

    signalRegistrar.once("SIGINT", stop);
    signalRegistrar.once("SIGTERM", stop);
  });

export const runUiCommand = async (
  options: UiCommandOptions,
  io: {
    stdout: Pick<NodeJS.WriteStream, "write">;
    stderr: Pick<NodeJS.WriteStream, "write">;
  },
  runOptions: UiCommandRunOptions = {}
): Promise<number> => {
  const result = await startUiCommand(options);

  if (!result.ok) {
    io.stderr.write(`${result.error.code}: ${result.error.message}\n`);
    return 1;
  }

  io.stdout.write(result.outputText);

  if (options.open === true && options.noOpen !== true) {
    const opened = await openUiUrlInBrowser(result.started.uiUrl);

    if (!opened) {
      io.stderr.write(
        "Browser open was not available. Open the UI URL manually.\n"
      );
    }
  }

  if (runOptions.waitUntilStopped === false) {
    return 0;
  }

  await waitForShutdownSignal(result.started, runOptions.signalRegistrar);
  return 0;
};
