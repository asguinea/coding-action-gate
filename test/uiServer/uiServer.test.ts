import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildAuditRecord } from "../../src/audit/auditRecordBuilder.js";
import {
  createReadOnlyUiServer,
  startReadOnlyUiServer
} from "../../src/uiServer/uiServer.js";
import type { StartedUiServer } from "../../src/uiServer/uiServerTypes.js";
import type { DeferredActionRecord } from "../../src/defer/deferredActionTypes.js";
import type { FileObservationRecord } from "../../src/observations/fileObservationTypes.js";
import type { ValidationResultRecord } from "../../src/validation/validationTypes.js";

const tempDirs: string[] = [];
const servers: StartedUiServer[] = [];
const timestamp = "2026-05-04T00:00:00.000Z";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-ui-server-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writeJsonl = async (
  filePath: string,
  records: unknown[]
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    records.map((record) => JSON.stringify(record)).join("\n"),
    "utf8"
  );
};

const fetchJson = async (
  server: StartedUiServer,
  pathName: string,
  init?: RequestInit
): Promise<{
  response: Response;
  body: unknown;
}> => {
  const response = await fetch(`${server.url}${pathName}`, init);
  const body = (await response.json()) as unknown;

  return { response, body };
};

const auditRecord = (id: string) =>
  buildAuditRecord({
    action: {
      id: `act_${id}`,
      type: "run_command",
      timestamp,
      proposedBy: "agent",
      command: "git status"
    },
    decision: {
      decision: "PROCEED",
      reason: "Allowed.",
      matchedPolicies: [],
      signalSummary: {}
    },
    session: {
      sessionId: "s1"
    }
  });

const deferredRecord = (id: string): DeferredActionRecord => ({
  id,
  sessionId: "s1",
  createdAt: timestamp,
  updatedAt: timestamp,
  status: "pending",
  actionFingerprint: `fingerprint_${id}`,
  actionSummary: {
    actionType: "edit_file",
    targetPaths: ["README.md"]
  },
  originalAction: {
    id: `act_${id}`,
    type: "edit_file",
    timestamp,
    proposedBy: "agent",
    targetPath: "README.md"
  },
  decision: {
    decision: "DEFER",
    reason: "Target file has not been observed in this session.",
    matchedPolicies: [],
    signalSummary: {}
  },
  missingContext: [
    {
      type: "current_file_contents",
      target: "README.md",
      reason: "Target file has not been observed in this session.",
      required: true
    }
  ],
  fetchPlan: [
    {
      type: "read_file",
      target: "README.md",
      safe: true,
      reason: "Read the current target file before retrying authorization."
    }
  ],
  requiredEvidence: [
    {
      id: `req_${id}`,
      type: "file_observation",
      target: "README.md",
      required: true,
      satisfied: false
    }
  ],
  policyTrace: []
});

const observationRecord = (id: string): FileObservationRecord => ({
  id,
  sessionId: "s1",
  path: "README.md",
  absolutePath: "/tmp/repo/README.md",
  relativePath: "README.md",
  observedAt: timestamp,
  contentHash: `hash_${id}`,
  hashAlgorithm: "sha256",
  sizeBytes: 10,
  exists: true,
  source: "cli_read",
  metadataOnly: false
});

const validationRecord = (id: string): ValidationResultRecord => ({
  id,
  sessionId: "s1",
  cwd: "/tmp/repo",
  kind: "test",
  command: "npm test",
  status: "passed",
  exitCode: 0,
  startedAt: timestamp,
  completedAt: timestamp,
  durationMs: 12,
  outputSummary: "ok",
  outputHash: `hash_${id}`,
  source: "test"
});

const startServer = async (
  options: Parameters<typeof startReadOnlyUiServer>[0]
): Promise<StartedUiServer> => {
  const server = await startReadOnlyUiServer(options);
  servers.push(server);

  return server;
};

describe("read-only UI server", () => {
  it("starts on 127.0.0.1 with a random port", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
  });

  it("rejects unsafe host 0.0.0.0", () => {
    expect(() => createReadOnlyUiServer({ host: "0.0.0.0" })).toThrow(
      "UI server host must be localhost-only."
    );
  });

  it("GET /api/health returns readOnly true", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-stepharbor-read-only")).toBe("true");
    expect(body).toMatchObject({
      ok: true,
      service: "stepharbor-ui-api",
      readOnly: true
    });
  });

  it("GET /api/audit returns records from temp audit JSONL", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), [
      auditRecord("one"),
      auditRecord("two")
    ]);
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/audit");

    expect(body).toMatchObject({
      ok: true,
      records: [
        expect.objectContaining({
          action: expect.objectContaining({ id: "act_one" })
        }),
        expect.objectContaining({
          action: expect.objectContaining({ id: "act_two" })
        })
      ]
    });
  });

  it("GET /api/audit/latest returns latest record", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), [
      auditRecord("one"),
      auditRecord("two")
    ]);
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/audit/latest");

    expect(body).toMatchObject({
      ok: true,
      record: expect.objectContaining({
        action: expect.objectContaining({ id: "act_two" })
      })
    });
  });

  it("GET /api/deferred returns session records", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/deferred/session_s1.jsonl"), [
      deferredRecord("def_one")
    ]);
    const server = await startServer({ cwd, sessionId: "default" });
    const { body } = await fetchJson(server, "/api/deferred?sessionId=s1");

    expect(body).toMatchObject({
      ok: true,
      records: [expect.objectContaining({ id: "def_one" })]
    });
  });

  it("GET /api/observations returns session records", async () => {
    const cwd = await createTempDir();
    await writeJsonl(
      path.join(cwd, ".stepharbor/observations/session_s1.jsonl"),
      [observationRecord("obs_one")]
    );
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/observations?sessionId=s1");

    expect(body).toMatchObject({
      ok: true,
      records: [expect.objectContaining({ id: "obs_one" })]
    });
  });

  it("GET /api/validation returns session records", async () => {
    const cwd = await createTempDir();
    await writeJsonl(
      path.join(cwd, ".stepharbor/validation/session_s1.jsonl"),
      [validationRecord("val_one")]
    );
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/validation?sessionId=s1");

    expect(body).toMatchObject({
      ok: true,
      records: [expect.objectContaining({ id: "val_one" })]
    });
  });

  it("GET /api/git-state works outside git repo", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/git-state");

    expect(body).toMatchObject({
      ok: true,
      state: {
        isGitRepo: false,
        repoIntegrityStatus: "not_git_repo"
      }
    });
  });

  it("GET /api/policy returns default policy when no policy file exists", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/policy");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      policy: expect.objectContaining({
        version: "0.1",
        protectedBranches: expect.arrayContaining(["main", "release/*"])
      }),
      source: {
        type: "default",
        version: "0.1"
      }
    });
  });

  it("GET /api/policy returns explicit policy when policyPath provided", async () => {
    const cwd = await createTempDir();
    const policyPath = path.join(cwd, "stepharbor.policy.yml");
    await writeFile(
      policyPath,
      [
        'version: "9.9"',
        "protected_branches:",
        "  - trunk",
        "rules:",
        "  - id: explicit-rule",
        "    decision: BLOCK",
        "    when:",
        "      action_type: run_command",
        "    reason: Explicit policy test."
      ].join("\n"),
      "utf8"
    );
    const server = await startServer({ cwd, policyPath });
    const { response, body } = await fetchJson(server, "/api/policy");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      policy: expect.objectContaining({
        version: "9.9",
        protectedBranches: ["trunk"]
      }),
      source: {
        type: "explicit",
        path: policyPath,
        version: "9.9"
      }
    });
  });

  it("GET /api/policy returns structured error on invalid policy path", async () => {
    const cwd = await createTempDir();
    const server = await startServer({
      cwd,
      policyPath: path.join(cwd, "missing.policy.yml")
    });
    const { response, body } = await fetchJson(server, "/api/policy");

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "UI_ADAPTER_ERROR"
      }
    });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("GET /api/status returns store availability", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), [
      auditRecord("one")
    ]);
    await writeJsonl(path.join(cwd, ".stepharbor/deferred/session_s1.jsonl"), [
      deferredRecord("def_one")
    ]);
    const server = await startServer({ cwd, sessionId: "s1" });
    const { body } = await fetchJson(server, "/api/status");

    expect(body).toMatchObject({
      ok: true,
      cwd,
      sessionId: "s1",
      readOnly: true,
      stores: {
        audit: { available: true },
        deferred: { available: true },
        observations: { available: false },
        validation: { available: false }
      }
    });
  });

  it("limit query caps returned records", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), [
      auditRecord("one"),
      auditRecord("two"),
      auditRecord("three")
    ]);
    const server = await startServer({ cwd });
    const { body } = await fetchJson(server, "/api/audit?limit=2");

    expect(body).toMatchObject({
      ok: true,
      records: [
        expect.objectContaining({
          action: expect.objectContaining({ id: "act_two" })
        }),
        expect.objectContaining({
          action: expect.objectContaining({ id: "act_three" })
        })
      ]
    });
  });

  it("invalid limit returns 400", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/audit?limit=nope");

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "UI_INVALID_QUERY"
      }
    });
  });

  it("limit over maximum is capped safely", async () => {
    const cwd = await createTempDir();
    await writeJsonl(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), [
      auditRecord("one"),
      auditRecord("two")
    ]);
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(
      server,
      "/api/audit?limit=999999"
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      records: expect.arrayContaining([
        expect.objectContaining({
          action: expect.objectContaining({ id: "act_one" })
        })
      ])
    });
  });

  it("unsafe session id values are rejected", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });

    for (const sessionId of ["../evil", "s1/evil"]) {
      const { response, body } = await fetchJson(
        server,
        `/api/deferred?sessionId=${encodeURIComponent(sessionId)}`
      );

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "UI_INVALID_QUERY"
        }
      });
    }
  });

  it("unknown route returns 404", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/missing");

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "UI_ROUTE_NOT_FOUND",
        message: "Route not found."
      }
    });
  });

  it("POST to a read route returns 405", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/audit", {
      method: "POST"
    });

    expect(response.status).toBe(405);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "UI_METHOD_NOT_ALLOWED"
      }
    });
  });

  it("HEAD /api/health returns read-only headers", async () => {
    const cwd = await createTempDir();
    const server = createReadOnlyUiServer({
      cwd,
      host: "127.0.0.1",
      port: 0
    });
    const started = await server.start();

    try {
      const response = await fetch(`${started.url}/api/health`, {
        method: "HEAD"
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("x-stepharbor-read-only")).toBe("true");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    } finally {
      await server.stop();
    }
  });

  it("does not set wildcard CORS by default", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const { response } = await fetchJson(server, "/api/health");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allowCorsOrigin sets CORS header", async () => {
    const cwd = await createTempDir();
    const server = await startServer({
      cwd,
      allowCorsOrigin: "http://127.0.0.1:5173"
    });
    const { response } = await fetchJson(server, "/api/health");

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173"
    );
  });

  it("adapter errors return safe UI_ADAPTER_ERROR without stack trace", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, ".stepharbor/audit/decisions.jsonl"), {
      recursive: true
    });
    const server = await startServer({ cwd });
    const { response, body } = await fetchJson(server, "/api/audit");

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "UI_ADAPTER_ERROR",
        message: "StepHarbor UI adapter failed to read runtime data."
      }
    });
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("EISDIR");
  });

  it("server stop closes listener", async () => {
    const cwd = await createTempDir();
    const server = await startServer({ cwd });
    const url = server.url;

    await server.stop();
    servers.splice(servers.indexOf(server), 1);

    await expect(fetch(`${url}/api/health`)).rejects.toThrow();
  });
});
