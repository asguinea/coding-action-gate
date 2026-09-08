import { describe, expect, it } from "vitest";

import {
  buildReadCommandFromFetchStep,
  buildRetryCommand,
  buildSuggestedCommands,
  summarizeFetchStep,
  summarizeMissingContext
} from "../../ui/src/api/deferFormatters.js";
import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import type { UiAuditRecord } from "../../ui/src/api/types.js";

const deferRecord = (
  overrides: Partial<UiAuditRecord> = {}
): UiAuditRecord => ({
  decisionId: "dec_defer",
  timestamp: "2026-05-03T10:00:00.000Z",
  sessionId: "s1",
  action: {
    id: "act_defer",
    type: "edit_file",
    targetPath: "README.md"
  },
  decision: "DEFER",
  reason: "Target file state is not fresh.",
  evidence: {
    deferredActionId: "def_123"
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
  ...overrides
});

describe("DEFER UI formatters", () => {
  it("buildReadCommandFromFetchStep handles read_file", () => {
    expect(
      buildReadCommandFromFetchStep(
        {
          type: "read_file",
          target: "README.md",
          safe: true
        },
        "s1"
      )
    ).toBe("coding-action-gate read README.md --session-id s1");
  });

  it("buildReadCommandFromFetchStep handles read_related_tests", () => {
    expect(
      buildReadCommandFromFetchStep(
        {
          type: "read_related_tests",
          target: "src/service.test.ts",
          safe: true
        },
        "s1"
      )
    ).toBe("coding-action-gate read src/service.test.ts --session-id s1");
  });

  it("buildRetryCommand handles deferredActionId", () => {
    expect(buildRetryCommand("def_123", "s1")).toBe(
      "coding-action-gate retry def_123 --session-id s1"
    );
  });

  it("buildRetryCommand without deferredActionId returns null", () => {
    expect(buildRetryCommand(undefined, "s1")).toBeNull();
  });

  it("buildSuggestedCommands includes read commands and retry command", () => {
    const commands = buildSuggestedCommands(
      deferRecord({
        fetchPlan: [
          {
            type: "read_file",
            target: "README.md",
            safe: true
          },
          {
            type: "read_related_tests",
            target: "src/service.test.ts",
            safe: true
          }
        ]
      })
    );

    expect(commands.map((entry) => entry.command)).toEqual([
      "coding-action-gate read README.md --session-id s1",
      "coding-action-gate read src/service.test.ts --session-id s1",
      "coding-action-gate retry def_123 --session-id s1"
    ]);
  });

  it("sessionId defaults to default", () => {
    const record = deferRecord();
    delete record.sessionId;
    const commands = buildSuggestedCommands(record);

    expect(commands.map((entry) => entry.command)).toContain(
      "coding-action-gate read README.md --session-id default"
    );
  });

  it("summarizeMissingContext handles target and reason", () => {
    expect(
      summarizeMissingContext({
        type: "current_file_contents",
        target: "README.md",
        reason: "Target file has not been observed.",
        required: true
      })
    ).toBe(
      "current_file_contents for README.md (required): Target file has not been observed."
    );
  });

  it("summarizeFetchStep handles target, query, and reason", () => {
    expect(
      summarizeFetchStep({
        type: "semantic_search",
        query: "service callers",
        safe: true,
        reason: "Inspect callers."
      })
    ).toBe("semantic_search service callers (safe): Inspect callers.");
  });

  it("DEFER mock record includes missingContext, fetchPlan, and riskIfProceeding", () => {
    const record = mockAuditRecords.find((entry) => entry.decision === "DEFER");

    expect(record).toBeDefined();
    expect(record?.missingContext?.length).toBeGreaterThan(1);
    expect(record?.fetchPlan?.length).toBeGreaterThan(1);
    expect(record?.riskIfProceeding?.length).toBeGreaterThan(0);
    expect(record?.evidence?.deferredActionId).toBe("def_mock_service_edit");
  });
});
