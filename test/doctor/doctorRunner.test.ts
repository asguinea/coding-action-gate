import { createServer, type Server } from "node:net";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "../../src/doctor/doctorRunner.js";
import type {
  DoctorCheck,
  DoctorResult
} from "../../src/doctor/doctorTypes.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-doctor-"));
  tempDirs.push(tempDir);
  return tempDir;
};

const findCheck = (result: DoctorResult, id: string): DoctorCheck => {
  const check = result.checks.find((candidate) => candidate.id === id);

  if (check === undefined) {
    throw new Error(`Missing doctor check: ${id}`);
  }

  return check;
};

const listenOnLocalhost = async (): Promise<{
  server: Server;
  port: number;
}> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Failed to allocate test port."));
        return;
      }

      resolve({
        server,
        port: address.port
      });
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("runDoctor", () => {
  it("returns fail when cwd is missing", async () => {
    const tempDir = await createTempDir();
    const missing = path.join(tempDir, "missing");

    const result = await runDoctor({
      cwd: missing,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(result.ok).toBe(false);
    expect(findCheck(result, "cwd-exists")).toMatchObject({
      status: "fail"
    });
  });

  it("passes cwd for a temp directory", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(findCheck(result, "cwd-exists")).toMatchObject({
      status: "pass"
    });
  });

  it("reports explicit invalid policy path as fail", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      policy: path.join(tempDir, "missing-policy.yml"),
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(result.ok).toBe(false);
    expect(findCheck(result, "policy-load")).toMatchObject({
      status: "fail"
    });
  });

  it("reports missing project policy as default warning", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(findCheck(result, "policy-load")).toMatchObject({
      status: "warn",
      details: {
        source: "default"
      }
    });
  });

  it("warns when UI build is missing", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(findCheck(result, "ui-build")).toMatchObject({
      status: "warn"
    });
  });

  it("passes when UI build contains index.html", async () => {
    const tempDir = await createTempDir();
    const uiDistDir = path.join(tempDir, "ui-dist");
    await mkdir(uiDistDir, { recursive: true });
    await writeFile(path.join(uiDistDir, "index.html"), "<html></html>");

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir
    });

    expect(findCheck(result, "ui-build")).toMatchObject({
      status: "pass"
    });
  });

  it("reports missing audit store as info", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(findCheck(result, "audit-store")).toMatchObject({
      status: "info"
    });
  });

  it("warns when the API port is unavailable", async () => {
    const tempDir = await createTempDir();
    const { server, port } = await listenOnLocalhost();

    try {
      const result = await runDoctor({
        cwd: tempDir,
        checkApiPort: port,
        uiDistDir: path.join(tempDir, "missing-ui")
      });

      expect(findCheck(result, "api-port-available")).toMatchObject({
        status: "warn"
      });
    } finally {
      await closeServer(server);
    }
  });

  it("marks API port check as skipped when requested", async () => {
    const tempDir = await createTempDir();

    const result = await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    expect(findCheck(result, "api-port-available")).toMatchObject({
      status: "info",
      details: {
        skipped: true
      }
    });
  });

  it("does not create project runtime files", async () => {
    const tempDir = await createTempDir();
    const before = await readdir(tempDir);

    await runDoctor({
      cwd: tempDir,
      skipPortCheck: true,
      uiDistDir: path.join(tempDir, "missing-ui")
    });

    const after = await readdir(tempDir);

    expect(after).toEqual(before);
  });
});
