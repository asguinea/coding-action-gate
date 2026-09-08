import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getInitialRuntimeDataSource,
  loadRuntimeDashboardData,
  runtimeDashboardToPlaceholderData,
  selectInitialDecisionId
} from "../../ui/src/api/dataSource.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import { mockValidationRecords } from "../../ui/src/api/mockValidationRecords.js";

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

describe("runtime data source loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects live mode from query params", () => {
    expect(getInitialRuntimeDataSource("?source=live")).toBe("live");
    expect(getInitialRuntimeDataSource("?source=mock")).toBe("mock");
    expect(getInitialRuntimeDataSource("")).toBe("mock");
  });

  it("loadRuntimeDashboardData mock returns mock records", async () => {
    await expect(
      loadRuntimeDashboardData({
        source: "mock"
      })
    ).resolves.toMatchObject({
      source: "mock",
      auditRecords: mockAuditRecords,
      validationRecords: mockValidationRecords
    });
  });

  it("loadRuntimeDashboardData live fetches all read-only resources", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);

        if (url.endsWith("/api/audit?limit=50")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              records: [
                {
                  decisionId: "dec_live",
                  timestamp: "2026-05-04T00:00:00.000Z",
                  action: {
                    id: "act_live",
                    type: "run_command",
                    command: "git status"
                  },
                  decision: "PROCEED",
                  reason: "Allowed."
                }
              ]
            })
          );
        }

        if (url.endsWith("/api/audit/latest")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              record: {
                decisionId: "dec_live",
                timestamp: "2026-05-04T00:00:00.000Z",
                action: {
                  id: "act_live",
                  type: "run_command",
                  command: "git status"
                },
                decision: "PROCEED",
                reason: "Allowed."
              }
            })
          );
        }

        if (url.endsWith("/api/validation?sessionId=s1&limit=50")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              records: [
                {
                  id: "val_live",
                  kind: "test",
                  command: "npm test",
                  status: "passed",
                  exitCode: 0,
                  completedAt: "2026-05-04T00:00:00.000Z"
                }
              ]
            })
          );
        }

        if (url.endsWith("/api/deferred?sessionId=s1&limit=50")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              records: [{ id: "def_live" }]
            })
          );
        }

        if (url.endsWith("/api/observations?sessionId=s1&limit=50")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              records: [{ id: "obs_live" }]
            })
          );
        }

        if (url.endsWith("/api/git-state")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              state: {
                isGitRepo: false,
                repoIntegrityStatus: "not_git_repo"
              }
            })
          );
        }

        if (url.endsWith("/api/status")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              readOnly: true
            })
          );
        }

        if (url.endsWith("/api/policy")) {
          return Promise.resolve(
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
        }

        return Promise.resolve(jsonResponse({}, { status: 404 }));
      });

    const data = await loadRuntimeDashboardData({
      source: "live",
      apiBaseUrl: "http://127.0.0.1:17373",
      sessionId: "s1",
      limit: 50
    });

    expect(data).toMatchObject({
      source: "live",
      auditRecords: [expect.objectContaining({ decisionId: "dec_live" })],
      latestAuditRecord: expect.objectContaining({ decisionId: "dec_live" }),
      validationRecords: [expect.objectContaining({ id: "val_live" })],
      deferredActions: [expect.objectContaining({ id: "def_live" })],
      observations: [expect.objectContaining({ id: "obs_live" })],
      gitState: expect.objectContaining({
        repoIntegrityStatus: "not_git_repo"
      }),
      status: expect.objectContaining({
        readOnly: true
      }),
      policy: expect.objectContaining({
        version: "0.1",
        protectedBranches: ["main"]
      }),
      policySource: expect.objectContaining({
        type: "default"
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("live loader surfaces API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            error: {
              message: "API unavailable."
            }
          },
          {
            status: 500
          }
        )
      )
    );

    await expect(
      loadRuntimeDashboardData({
        source: "live"
      })
    ).rejects.toThrow("API unavailable.");
  });

  it("malformed audit records do not crash live data loader", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/api/audit?limit=50")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            records: [
              { malformed: true },
              {
                decisionId: "dec_live",
                timestamp: "2026-05-05T00:00:00.000Z",
                action: {
                  id: "act_live",
                  type: "run_command"
                },
                decision: "PROCEED",
                reason: "Allowed."
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/audit/latest")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            record: null
          })
        );
      }

      if (
        url.endsWith("/api/validation?sessionId=s1&limit=50") ||
        url.endsWith("/api/deferred?sessionId=s1&limit=50") ||
        url.endsWith("/api/observations?sessionId=s1&limit=50")
      ) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            records: "malformed"
          })
        );
      }

      if (url.endsWith("/api/git-state")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            state: {
              isGitRepo: false
            }
          })
        );
      }

      if (url.endsWith("/api/status")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            readOnly: true
          })
        );
      }

      if (url.endsWith("/api/policy")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            policy: {},
            source: {
              type: "default"
            }
          })
        );
      }

      return Promise.resolve(jsonResponse({}, { status: 404 }));
    });

    const data = await loadRuntimeDashboardData({
      source: "live",
      sessionId: "s1",
      limit: 50
    });

    expect(data.auditRecords).toHaveLength(1);
    expect(data.auditRecords[0]?.decisionId).toBe("dec_live");
    expect(data.validationRecords).toEqual([]);
    expect(data.deferredActions).toEqual([]);
    expect(data.observations).toEqual([]);
  });

  it("safe error messages do not include stack traces", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("boom\nstack")
    );

    await expect(
      loadRuntimeDashboardData({
        source: "live"
      })
    ).rejects.not.toThrow("stack");
  });

  it("selects latest audit decision when present", () => {
    expect(
      selectInitialDecisionId({
        source: "live",
        auditRecords: [
          {
            decisionId: "dec_first",
            timestamp: "2026-05-04T00:00:00.000Z",
            action: {
              id: "act_first",
              type: "run_command"
            },
            decision: "PROCEED",
            reason: "Allowed."
          },
          {
            decisionId: "dec_latest",
            timestamp: "2026-05-04T00:01:00.000Z",
            action: {
              id: "act_latest",
              type: "run_command"
            },
            decision: "BLOCK",
            reason: "Blocked."
          }
        ],
        latestAuditRecord: {
          decisionId: "dec_latest",
          timestamp: "2026-05-04T00:01:00.000Z",
          action: {
            id: "act_latest",
            type: "run_command"
          },
          decision: "BLOCK",
          reason: "Blocked."
        },
        validationRecords: []
      })
    ).toBe("dec_latest");
  });

  it("converts runtime data to placeholder dashboard data", async () => {
    const runtimeData = await loadRuntimeDashboardData({
      source: "mock"
    });
    const placeholder = runtimeDashboardToPlaceholderData(runtimeData);

    expect(placeholder).toMatchObject({
      source: "mock",
      policy: expect.objectContaining({
        version: "0.1"
      }),
      policySource: expect.objectContaining({
        type: "default"
      }),
      auditTimeline: {
        count: mockAuditRecords.length
      },
      validationRecords: {
        count: mockValidationRecords.length
      }
    });
  });
});
