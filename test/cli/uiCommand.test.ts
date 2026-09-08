import { EventEmitter } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getCliUsage, parseUiArgs } from "../../src/cli/cli.js";
import {
  buildUiDevInstructions,
  buildUiUrl,
  formatUiCommandOutput,
  runUiStartupSelfCheck,
  startUiCommand,
  type UiCommandRunResult,
  runUiCommand,
  validateUiPort
} from "../../src/cli/commands/uiCommand.js";
import { renderPolicyTemplate } from "../../src/policyTemplates/policyTemplateRenderer.js";
import { createStaticUiServer } from "../../src/uiServer/staticUiServer.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-ui-cli-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const getAvailablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Failed to allocate port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const canBindPort = async (port: number): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve(true);
      });
    });
  });

const expectPortReleased = async (
  port: number,
  timeoutMs = 1000
): Promise<void> => {
  const startedAt = Date.now();

  while (!(await canBindPort(port))) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for port ${port} to be released.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const writeUiDistFixture = async (cwd: string): Promise<void> => {
  const distDir = path.join(cwd, "ui", "dist");
  const assetsDir = path.join(distDir, "assets");

  await mkdir(assetsDir, { recursive: true });
  await writeFile(
    path.join(distDir, "index.html"),
    '<!doctype html><html><body><div id="app">StepHarbor</div></body></html>',
    "utf8"
  );
  await writeFile(path.join(assetsDir, "app.js"), "console.log('ok');", "utf8");
};

const startUiCommandWithAvailableApiPort = async (
  cwd: string,
  options: Omit<Parameters<typeof startUiCommand>[0], "cwd" | "apiPort"> = {}
): Promise<UiCommandRunResult> => {
  let lastResult: UiCommandRunResult | undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const apiPort = await getAvailablePort();
    const result = await startUiCommand({
      cwd,
      apiPort,
      uiPort: 5173,
      noUiServer: true,
      ...options
    });

    if (result.ok || !result.error.message.includes("EADDRINUSE")) {
      return result;
    }

    lastResult = result;
  }

  return lastResult ?? startUiCommand({ cwd, noUiServer: true });
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 1000
): Promise<void> => {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("ui command helpers", () => {
  it("rejects unsafe host 0.0.0.0", async () => {
    const result = await startUiCommand({
      host: "0.0.0.0",
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CLI_UI_UNSAFE_HOST"
      }
    });
  });

  it("rejects invalid api port", () => {
    try {
      validateUiPort(0, "api");
      throw new Error("Expected invalid API port to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "CLI_UI_INVALID_PORT",
        message: "--api-port must be an integer between 1 and 65535."
      });
    }
  });

  it("rejects invalid ui port", () => {
    try {
      validateUiPort(70_000, "ui");
      throw new Error("Expected invalid UI port to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "CLI_UI_INVALID_PORT",
        message: "--ui-port must be an integer between 1 and 65535."
      });
    }
  });

  it("builds live UI URL with source and encoded API URL", () => {
    const url = buildUiUrl({
      host: "127.0.0.1",
      uiPort: 5173,
      mode: "live",
      apiUrl: "http://127.0.0.1:17373"
    });

    expect(url).toBe(
      "http://127.0.0.1:5173/?source=live&apiUrl=http%3A%2F%2F127.0.0.1%3A17373"
    );
  });

  it("builds mock UI URL without API URL", () => {
    const url = buildUiUrl({
      host: "127.0.0.1",
      uiPort: 5173,
      mode: "mock",
      apiUrl: "http://127.0.0.1:17373"
    });

    expect(url).toBe("http://127.0.0.1:5173/?source=mock");
  });

  it("builds no-ui-server instructions", () => {
    const instructions = buildUiDevInstructions({
      uiPort: 5173,
      uiUrl: "http://127.0.0.1:5173/?source=live"
    });

    expect(instructions).toEqual([
      "npm run ui:dev -- --port 5173",
      "http://127.0.0.1:5173/?source=live"
    ]);
  });

  it("starts read-only API server in no-ui-server mode", async () => {
    const cwd = await createTempDir();
    const result = await startUiCommandWithAvailableApiPort(cwd, {
      noUiServer: true
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    try {
      const response = await fetch(`${result.started.api.url}/api/health`);
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(response.headers.get("x-stepharbor-read-only")).toBe("true");
      expect(body).toMatchObject({
        ok: true,
        readOnly: true
      });
    } finally {
      await result.started.stop();
    }
  });

  it("prints read-only security messaging", async () => {
    const cwd = await createTempDir();
    const apiPort = await getAvailablePort();
    const result = await startUiCommand({
      cwd,
      apiPort,
      uiPort: 5173,
      noUiServer: true
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    try {
      expect(result.outputText).toContain("StepHarbor UI beta");
      expect(result.outputText).toContain("API is read-only.");
      expect(result.outputText).toContain("UI is read-only.");
      expect(result.outputText).toContain("API is localhost-only.");
      expect(result.outputText).toContain(
        "No actions can be executed from the UI."
      );
    } finally {
      await result.started.stop();
    }
  });

  it("ui help includes policy and dashboard options", () => {
    const usage = getCliUsage();

    expect(usage).toContain("--policy <path>");
    expect(usage).toContain("--cwd <path>");
    expect(usage).toContain("--api-port <number>");
    expect(usage).toContain("--ui-port <number>");
    expect(usage).toContain("--mock");
    expect(usage).toContain("--live");
    expect(usage).toContain("--no-open");
    expect(usage).toContain("--open");
    expect(usage).toContain("--no-ui-server");
  });

  it("parses explicit policy for ui command", () => {
    expect(parseUiArgs(["--policy", "stepharbor.policy.yml"])).toEqual({
      ok: true,
      options: {
        policy: "stepharbor.policy.yml"
      }
    });
  });

  it("startup self-check reports policy loaded", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    const policy = renderPolicyTemplate("basic");

    if (policy === null) {
      throw new Error("Expected basic template to render.");
    }

    await writeFile(policyPath, policy, "utf8");
    const check = await runUiStartupSelfCheck({
      cwd,
      policy: policyPath,
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(check.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "PASS",
          label: "policy"
        })
      ])
    );
    expect(check.policyLabel).toContain("explicit");
  });

  it("startup self-check warns when no audit records exist", async () => {
    const cwd = await createTempDir();
    const check = await runUiStartupSelfCheck({
      cwd,
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(check.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "WARN",
          label: "audit records",
          message: "no audit records yet"
        })
      ])
    );
  });

  it("startup self-check fails invalid cwd", async () => {
    const result = await startUiCommand({
      cwd: path.join(await createTempDir(), "missing"),
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CLI_UI_SERVER_ERROR"
      }
    });
  });

  it("startup self-check fails when API port is unavailable", async () => {
    const cwd = await createTempDir();
    const server = createServer();
    const apiPort = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();

        if (address === null || typeof address === "string") {
          reject(new Error("Failed to allocate occupied port."));
          return;
        }

        resolve(address.port);
      });
    });

    try {
      const result = await startUiCommand({
        cwd,
        apiPort,
        noUiServer: true
      });

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "CLI_UI_SERVER_ERROR",
          message: `API port unavailable: 127.0.0.1:${apiPort}`
        }
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("startup self-check fails when UI port is unavailable for static serving", async () => {
    const cwd = await createTempDir();
    await writeUiDistFixture(cwd);
    const server = createServer();
    const uiPort = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();

        if (address === null || typeof address === "string") {
          reject(new Error("Failed to allocate occupied port."));
          return;
        }

        resolve(address.port);
      });
    });

    try {
      let result: UiCommandRunResult | undefined;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        result = await startUiCommand({
          cwd,
          apiPort: await getAvailablePort(),
          uiPort,
          uiDistDir: path.join(cwd, "ui", "dist")
        });

        if (
          result.ok ||
          !result.error.message.startsWith("API port unavailable:")
        ) {
          break;
        }
      }

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "CLI_UI_SERVER_ERROR",
          message: `UI port unavailable: 127.0.0.1:${uiPort}`
        }
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reports missing UI build with remediation", async () => {
    const cwd = await createTempDir();
    let result: UiCommandRunResult | undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      result = await startUiCommand({
        cwd,
        apiPort: await getAvailablePort(),
        uiPort: await getAvailablePort(),
        uiDistDir: path.join(cwd, "missing-dist")
      });

      if (result.ok || !result.error.message.includes("EADDRINUSE")) {
        break;
      }
    }

    if (result === undefined) {
      throw new Error("UI command did not run.");
    }

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    try {
      expect(result.outputText).toContain("UI build not found:");
      expect(result.outputText).toContain("npm run ui:build");
      expect(result.outputText).toContain("stepharbor ui --no-ui-server");
    } finally {
      await result.started.stop();
    }
  });

  it("passes explicit policy to UI server policy endpoint", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    const policy = renderPolicyTemplate("node");

    if (policy === null) {
      throw new Error("Expected node template to render.");
    }

    await writeFile(policyPath, policy, "utf8");
    const result = await startUiCommand({
      cwd,
      policy: policyPath,
      apiPort: await getAvailablePort(),
      noUiServer: true
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    try {
      const response = await fetch(`${result.started.api.url}/api/policy`);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body).toMatchObject({
        ok: true,
        source: {
          type: "explicit"
        }
      });
    } finally {
      await result.started.stop();
    }
  });

  it("formats output with static UI server details", () => {
    const output = formatUiCommandOutput({
      api: {
        host: "127.0.0.1",
        port: 17373,
        url: "http://127.0.0.1:17373",
        start: async () => ({
          host: "127.0.0.1",
          port: 17373,
          url: "http://127.0.0.1:17373"
        }),
        stop: async () => {}
      },
      ui: {
        host: "127.0.0.1",
        port: 5173,
        url: "http://127.0.0.1:5173",
        distDir: "/tmp/ui/dist"
      },
      uiUrl: "http://127.0.0.1:5173/?source=live",
      mode: "live",
      cwd: "/tmp/project",
      sessionId: "default",
      policyLabel: "default policy",
      distDir: "/tmp/ui/dist",
      uiBuildFound: true,
      startupChecks: [
        {
          status: "PASS",
          label: "policy",
          message: "policy loaded"
        }
      ],
      instructions: [],
      stop: async () => {}
    });

    expect(output).toContain("Static UI server:");
    expect(output).toContain("http://127.0.0.1:5173");
  });

  it("stops servers on SIGINT through the lifecycle helper", async () => {
    const cwd = await createTempDir();
    const apiPort = await getAvailablePort();
    const signals = new EventEmitter();
    let stdout = "";

    const runPromise = runUiCommand(
      {
        cwd,
        apiPort,
        uiPort: 5173,
        noUiServer: true
      },
      {
        stdout: {
          write: (chunk: string | Uint8Array): boolean => {
            stdout += String(chunk);
            return true;
          }
        },
        stderr: {
          write: (): boolean => true
        }
      },
      {
        signalRegistrar: {
          once: (event, listener) => {
            signals.once(event, listener);
            return signals as unknown as NodeJS.Process;
          },
          off: (event, listener) => {
            signals.off(event, listener);
            return signals as unknown as NodeJS.Process;
          }
        }
      }
    );

    await waitFor(() => stdout.includes("StepHarbor UI beta"));
    expect(stdout).toContain("StepHarbor UI beta");
    signals.emit("SIGINT");

    await expect(runPromise).resolves.toBe(0);
    await expect(expectPortReleased(apiPort)).resolves.toBeUndefined();
  });
});

describe("static UI server", () => {
  it("serves index.html from ui/dist", async () => {
    const cwd = await createTempDir();
    await writeUiDistFixture(cwd);
    const uiPort = await getAvailablePort();
    const server = createStaticUiServer({
      cwd,
      port: uiPort
    });
    const started = await server.start();

    try {
      const response = await fetch(`${started.url}/`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-stepharbor-read-only")).toBe("true");
      expect(text).toContain("StepHarbor");
    } finally {
      await server.stop();
    }
  });

  it("does not expose directory listings", async () => {
    const cwd = await createTempDir();
    await writeUiDistFixture(cwd);
    const server = createStaticUiServer({
      cwd,
      port: 0
    });
    const started = await server.start();

    try {
      const response = await fetch(`${started.url}/assets/`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toContain("StepHarbor");
      expect(text).not.toContain("app.js");
    } finally {
      await server.stop();
    }
  });

  it("exposes no mutation routes", async () => {
    const cwd = await createTempDir();
    const result = await startUiCommandWithAvailableApiPort(cwd);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    try {
      const response = await fetch(`${result.started.api.url}/api/audit`, {
        method: "POST"
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(405);
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "UI_METHOD_NOT_ALLOWED"
        }
      });
    } finally {
      await result.started.stop();
    }
  });
});
