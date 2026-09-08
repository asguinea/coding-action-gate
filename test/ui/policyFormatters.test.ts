import { describe, expect, it } from "vitest";

import {
  normalizeUiPolicy,
  normalizeUiPolicySource,
  summarizePolicyCondition,
  summarizePolicyRules,
  summarizePolicySource,
  summarizeProtectedBranches,
  summarizeSensitivePaths,
  summarizeThresholds,
  summarizeValidationPolicy
} from "../../ui/src/api/policyFormatters.js";
import { mockPolicy, mockPolicySource } from "../../ui/src/api/mockPolicy.js";

describe("policy UI formatters", () => {
  it("mock data includes policy summary", () => {
    expect(mockPolicy).toMatchObject({
      version: "0.1",
      protectedBranches: expect.arrayContaining(["main"]),
      validation: {
        beforeCommit: {
          required: true
        }
      }
    });
    expect(mockPolicySource).toMatchObject({
      type: "default"
    });
  });

  it("summarizePolicySource handles default, discovered, and explicit", () => {
    expect(summarizePolicySource({ type: "default", version: "0.1" })).toBe(
      "default · version 0.1"
    );
    expect(
      summarizePolicySource({
        type: "discovered",
        path: "/repo/stepharbor.policy.yml",
        version: "0.1"
      })
    ).toContain("discovered (/repo/stepharbor.policy.yml)");
    expect(
      summarizePolicySource({
        type: "explicit",
        path: "/tmp/policy.yml"
      })
    ).toBe("explicit (/tmp/policy.yml)");
  });

  it("summarizeProtectedBranches returns configured branches", () => {
    expect(summarizeProtectedBranches(mockPolicy)).toEqual(
      expect.arrayContaining(["main", "release/*"])
    );
  });

  it("summarizeSensitivePaths groups levels", () => {
    expect(summarizeSensitivePaths(mockPolicy)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "critical",
          patterns: expect.arrayContaining([".env"])
        }),
        expect.objectContaining({
          level: "high",
          patterns: expect.arrayContaining(["auth/**"])
        })
      ])
    );
  });

  it("summarizeValidationPolicy handles beforeCommit and beforePush", () => {
    expect(summarizeValidationPolicy(mockPolicy)).toEqual([
      expect.stringContaining("Before commit: required"),
      expect.stringContaining("Before push: required")
    ]);
  });

  it("summarizeThresholds handles missing and present values", () => {
    expect(summarizeThresholds(undefined)).toEqual([]);
    expect(summarizeThresholds(mockPolicy)).toEqual(
      expect.arrayContaining([
        {
          key: "contextCompletenessMinimum",
          value: "0.7"
        }
      ])
    );
  });

  it("summarizePolicyRules includes id and decision", () => {
    expect(summarizePolicyRules(mockPolicy)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "read-before-write",
          decision: "DEFER"
        })
      ])
    );
  });

  it("summarizePolicyCondition handles simple when object", () => {
    expect(
      summarizePolicyCondition({
        validation_required: true,
        validation_status: ["not_run", "stale"]
      })
    ).toBe("validation_required: true; validation_status: not_run, stale");
  });

  it("normalizes live policy and source defensively", () => {
    expect(
      normalizeUiPolicy({
        version: "0.1",
        protectedBranches: ["main", 1],
        rules: [
          {
            id: "block",
            decision: "BLOCK",
            when: {
              force_push: true
            }
          },
          {
            malformed: true
          }
        ]
      })
    ).toMatchObject({
      protectedBranches: ["main"],
      rules: [
        {
          id: "block",
          decision: "BLOCK"
        }
      ]
    });
    expect(
      normalizeUiPolicySource({ type: "explicit", path: "/tmp/p.yml" })
    ).toEqual({
      type: "explicit",
      path: "/tmp/p.yml"
    });
  });
});
