import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLiveRuntimeClient,
  normalizeUiAuditRecord,
  safeArray,
  validateLiveRuntimeBaseUrl
} from "../../ui/src/api/liveRuntimeClient.js";

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

describe("live runtime client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/health with GET and parses health response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        service: "coding-action-gate-ui-api",
        readOnly: true
      })
    );
    const client = createLiveRuntimeClient({
      baseUrl: "http://127.0.0.1:17373"
    });

    await expect(client.getHealth()).resolves.toMatchObject({
      ok: true,
      readOnly: true
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17373/api/health",
      expect.objectContaining({
        method: "GET",
        credentials: "omit"
      })
    );
  });

  it("throws on non-ok responses with safe message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "UI_ROUTE_NOT_FOUND",
            message: "Route not found."
          }
        },
        {
          status: 404
        }
      )
    );
    const client = createLiveRuntimeClient();

    await expect(client.getHealth()).rejects.toThrow("Route not found.");
  });

  it("getAuditRecords uses limit query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        records: []
      })
    );
    const client = createLiveRuntimeClient({
      baseUrl: "http://127.0.0.1:17373/"
    });

    await client.getAuditRecords(25);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17373/api/audit?limit=25",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  it("getDeferredActions uses sessionId and limit query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        records: []
      })
    );
    const client = createLiveRuntimeClient({
      baseUrl: "http://127.0.0.1:17373"
    });

    await client.getDeferredActions("s1", 10);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17373/api/deferred?sessionId=s1&limit=10",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  it("client methods do not use mutation methods", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          records: [],
          record: null,
          state: {},
          policy: {},
          source: { type: "default" },
          status: {}
        })
      )
    );
    const client = createLiveRuntimeClient();

    await Promise.all([
      client.getHealth(),
      client.getStatus(),
      client.getAuditRecords(),
      client.getLatestAuditRecord(),
      client.getDeferredActions(),
      client.getObservations(),
      client.getValidationRecords(),
      client.getGitState(),
      client.getPolicy()
    ]);

    const methods = fetchMock.mock.calls.map(([, init]) =>
      init instanceof Object && "method" in init ? init.method : undefined
    );

    expect(methods).toEqual(Array(9).fill("GET"));
  });

  it("getPolicy calls /api/policy with GET", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        policy: {
          version: "0.1",
          protectedBranches: ["main"]
        },
        source: {
          type: "default",
          version: "0.1"
        }
      })
    );
    const client = createLiveRuntimeClient({
      baseUrl: "http://127.0.0.1:17373"
    });

    await expect(client.getPolicy()).resolves.toMatchObject({
      policy: {
        version: "0.1",
        protectedBranches: ["main"]
      },
      source: {
        type: "default"
      }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:17373/api/policy",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  it("rejects non-localhost API URLs", () => {
    expect(() => validateLiveRuntimeBaseUrl("https://example.com")).toThrow(
      "Live API URL must use"
    );
    expect(() =>
      createLiveRuntimeClient({ baseUrl: "http://10.0.0.2:17373" })
    ).toThrow("Live API URL must use");
  });

  it("request timeout returns safe error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init instanceof Object ? init.signal : undefined;

          if (signal instanceof AbortSignal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
        })
    );
    const client = createLiveRuntimeClient({
      timeoutMs: 1
    });

    await expect(client.getHealth()).rejects.toThrow(
      "Live API request timed out."
    );
  });

  it("malformed API responses surface safe errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        records: []
      })
    );
    const client = createLiveRuntimeClient();

    await expect(client.getAuditRecords()).rejects.toThrow(
      "Live API returned a malformed response."
    );
  });

  it("safeArray handles non-array values", () => {
    expect(safeArray("not-array")).toEqual([]);
    expect(safeArray([1])).toEqual([1]);
  });

  it("normalizeUiAuditRecord handles missing fields", () => {
    expect(normalizeUiAuditRecord({})).toBeNull();
    expect(
      normalizeUiAuditRecord({
        decisionId: "dec_live",
        timestamp: "2026-05-05T00:00:00.000Z",
        action: {
          id: "act_live",
          type: "run_command"
        },
        decision: "PROCEED",
        reason: "Allowed."
      })
    ).toMatchObject({
      decisionId: "dec_live",
      decision: "PROCEED"
    });
  });
});
