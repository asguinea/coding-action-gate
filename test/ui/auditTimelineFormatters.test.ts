import { describe, expect, it } from "vitest";

import {
  filterAuditRecords,
  getActionSearchText,
  getAuditTimelineSummary,
  getDetectorIds,
  getMatchedPolicyIds,
  sortAuditRecordsDescending
} from "../../ui/src/api/auditTimelineFormatters.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import type { UiAuditRecord } from "../../ui/src/api/types.js";

const record = (
  id: string,
  overrides: Partial<UiAuditRecord> = {}
): UiAuditRecord => ({
  decisionId: id,
  timestamp: "2026-05-03T10:00:00.000Z",
  action: {
    id: `act_${id}`,
    type: "run_command",
    command: "git status"
  },
  decision: "PROCEED",
  reason: "Allowed.",
  ...overrides
});

describe("audit timeline formatters", () => {
  it("sortAuditRecordsDescending orders newest first", () => {
    const sorted = sortAuditRecordsDescending([
      record("old", { timestamp: "2026-05-03T09:00:00.000Z" }),
      record("new", { timestamp: "2026-05-03T11:00:00.000Z" })
    ]);

    expect(sorted.map((entry) => entry.decisionId)).toEqual(["new", "old"]);
  });

  it("filters by decision posture", () => {
    const filtered = filterAuditRecords(mockAuditRecords, {
      decision: "DEFER"
    });

    expect(filtered.every((entry) => entry.decision === "DEFER")).toBe(true);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by action type", () => {
    const filtered = filterAuditRecords(mockAuditRecords, {
      actionType: "edit_file"
    });

    expect(filtered.every((entry) => entry.action.type === "edit_file")).toBe(
      true
    );
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("filters by target path search", () => {
    const filtered = filterAuditRecords(mockAuditRecords, {
      search: "README"
    });

    expect(filtered.map((entry) => entry.decisionId)).toContain(
      "dec_mock_readme_proceed"
    );
  });

  it("filters by command search", () => {
    const filtered = filterAuditRecords(mockAuditRecords, {
      search: "push origin"
    });

    expect(filtered.map((entry) => entry.decisionId)).toEqual([
      "dec_mock_block"
    ]);
  });

  it("getDetectorIds extracts detector IDs from evidence", () => {
    expect(
      getDetectorIds(
        record("detectors", {
          evidence: {
            detectorResults: [
              {
                detectorId: "command-risk",
                ok: true
              },
              {
                detectorId: "git-workflow",
                ok: true
              },
              {
                ok: true
              }
            ]
          }
        })
      )
    ).toEqual(["command-risk", "git-workflow"]);
  });

  it("getMatchedPolicyIds extracts matched policies", () => {
    expect(
      getMatchedPolicyIds(
        record("policies", {
          policyTrace: [
            {
              ruleId: "matched",
              matched: true,
              effect: "BLOCK"
            },
            {
              ruleId: "unmatched",
              matched: false
            }
          ]
        })
      )
    ).toEqual(["matched"]);
  });

  it("getAuditTimelineSummary includes decision, reason, and action summary", () => {
    expect(
      getAuditTimelineSummary(
        record("summary", {
          decision: "BLOCK",
          reason: "Blocked.",
          action: {
            id: "act_summary",
            type: "run_command",
            command: "rm -rf ."
          }
        })
      )
    ).toMatchObject({
      decisionId: "summary",
      decision: "BLOCK",
      reason: "Blocked.",
      actionSummary: "run_command: rm -rf ."
    });
  });

  it("getActionSearchText includes command and targets", () => {
    expect(
      getActionSearchText(
        record("search", {
          targetPaths: ["auth/service.ts"],
          action: {
            id: "act_search",
            type: "run_command",
            command: "git commit -m test"
          }
        })
      )
    ).toContain("auth/service.ts");
    expect(
      getActionSearchText(
        record("search", {
          targetPaths: ["auth/service.ts"],
          action: {
            id: "act_search",
            type: "run_command",
            command: "git commit -m test"
          }
        })
      )
    ).toContain("git commit");
  });

  it("timeline mock data includes at least 5 records", () => {
    expect(mockAuditRecords.length).toBeGreaterThanOrEqual(5);
  });
});
