import { describe, expect, it } from "vitest";

import {
  buildRuntimeStatusBadges,
  buildRuntimeStatusRows,
  defaultPolicyEmptyStateHint,
  isBetaDemoRuntimeData
} from "../../ui/src/api/runtimeStatusFormatters.js";
import type { RuntimeDashboardData } from "../../ui/src/api/runtimeDataTypes.js";

const baseData = (
  overrides: Partial<RuntimeDashboardData> = {}
): RuntimeDashboardData => ({
  source: "live",
  auditRecords: [],
  validationRecords: [],
  ...overrides
});

describe("runtime status formatters", () => {
  it("shows Mock Demo status", () => {
    const rows = buildRuntimeStatusRows(
      baseData({
        source: "mock",
        status: {
          readOnly: true
        }
      }),
      {
        connectionState: "idle"
      }
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Data source",
          value: "Mock Demo"
        }),
        expect.objectContaining({
          label: "API status",
          value: "mock mode"
        })
      ])
    );
  });

  it("shows Live Local connected status", () => {
    const rows = buildRuntimeStatusRows(baseData(), {
      connectionState: "connected",
      apiBaseUrl: "http://127.0.0.1:17373"
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Data source",
          value: "Live Local"
        }),
        expect.objectContaining({
          label: "API status",
          value: "connected"
        }),
        expect.objectContaining({
          label: "API URL",
          value: "http://127.0.0.1:17373"
        })
      ])
    );
  });

  it("shows store availability", () => {
    const rows = buildRuntimeStatusRows(
      baseData({
        status: {
          stores: {
            audit: { available: true },
            deferred: { available: false },
            observations: { available: true },
            validation: { available: false }
          }
        }
      })
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Audit store",
          value: "available"
        }),
        expect.objectContaining({
          label: "Deferred store",
          value: "missing"
        })
      ])
    );
  });

  it("shows policy source", () => {
    const rows = buildRuntimeStatusRows(
      baseData({
        policySource: {
          type: "explicit",
          path: "/tmp/coding-action-gate.policy.yml",
          version: "0.1"
        }
      })
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Policy source",
          value: "explicit: /tmp/coding-action-gate.policy.yml"
        }),
        expect.objectContaining({
          label: "Policy version",
          value: "0.1"
        })
      ])
    );
  });

  it("detects beta demo runtime data", () => {
    expect(
      isBetaDemoRuntimeData(
        baseData({
          status: {
            cwd: "/repo/examples/beta-demo/workdir",
            sessionId: "default"
          }
        })
      )
    ).toBe(true);

    expect(
      buildRuntimeStatusBadges(
        baseData({
          auditRecords: [
            {
              decisionId: "dec_beta",
              timestamp: "2026-05-06T00:00:00.000Z",
              sessionId: "beta-demo",
              action: {
                id: "act_beta",
                type: "run_command"
              },
              decision: "PROCEED",
              reason: "Allowed."
            }
          ]
        })
      ).map((badge) => badge.label)
    ).toContain("Beta demo data");
  });

  it("suggests init when default policy is active", () => {
    expect(defaultPolicyEmptyStateHint({ type: "default" })).toContain(
      "coding-action-gate init --template node"
    );
    expect(defaultPolicyEmptyStateHint({ type: "explicit" })).toEqual([]);
  });
});
