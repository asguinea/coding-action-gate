import { describe, expect, it } from "vitest";

import { mockAuditRecords } from "../../ui/src/api/mockAuditRecords.js";
import { mockValidationRecords } from "../../ui/src/api/mockValidationRecords.js";
import {
  buildGitStatusRows,
  buildLandingRiskRows,
  buildValidationStatusRows,
  getStatusSeverity,
  hasGitSignals,
  hasLandingSignals,
  hasValidationSignals,
  summarizeValidationRecords
} from "../../ui/src/api/statusPanelFormatters.js";
import type { UiAuditRecord } from "../../ui/src/api/types.js";

const recordWithSignals = (
  signals: Record<string, unknown> = {}
): UiAuditRecord => ({
  decisionId: "dec_status",
  timestamp: "2026-05-03T10:00:00.000Z",
  sessionId: "demo",
  action: {
    id: "act_status",
    type: "run_command",
    command: "git status"
  },
  decision: "PROCEED",
  reason: "Allowed.",
  evidence: {
    signalSummary: signals
  }
});

const findRow = (rows: ReturnType<typeof buildGitStatusRows>, label: string) =>
  rows.find((row) => row.label === label);

describe("status panel formatters", () => {
  it("hasGitSignals is true when branch fields exist", () => {
    expect(hasGitSignals(recordWithSignals({ currentBranch: "main" }))).toBe(
      true
    );
  });

  it("hasGitSignals is false when Git fields are absent", () => {
    expect(hasGitSignals(recordWithSignals())).toBe(false);
  });

  it("buildGitStatusRows includes branch and protected status", () => {
    const rows = buildGitStatusRows(
      recordWithSignals({
        currentBranch: "main",
        protectedBranch: true
      })
    );

    expect(findRow(rows, "Current branch")).toMatchObject({
      value: "main"
    });
    expect(findRow(rows, "Protected branch")).toMatchObject({
      value: "true"
    });
  });

  it("buildGitStatusRows includes force push and hook bypass signals", () => {
    const rows = buildGitStatusRows(
      recordWithSignals({
        forcePush: true,
        hookBypass: true
      })
    );

    expect(findRow(rows, "Force push")).toMatchObject({
      value: "true",
      severity: "critical"
    });
    expect(findRow(rows, "Hook bypass")).toMatchObject({
      value: "true",
      severity: "critical"
    });
  });

  it("hasValidationSignals is true when validation fields exist", () => {
    expect(
      hasValidationSignals(
        recordWithSignals({
          validationStatus: "not_run"
        })
      )
    ).toBe(true);
  });

  it("buildValidationStatusRows includes required, status, and scope", () => {
    const rows = buildValidationStatusRows(
      recordWithSignals({
        validationRequired: true,
        validationStatus: "not_run",
        validationScope: "before_commit"
      })
    );

    expect(findRow(rows, "Required")).toMatchObject({
      value: "true"
    });
    expect(findRow(rows, "Status")).toMatchObject({
      value: "not_run",
      severity: "medium"
    });
    expect(findRow(rows, "Scope")).toMatchObject({
      value: "before_commit"
    });
  });

  it("summarizeValidationRecords includes kind, command, and status", () => {
    const rows = summarizeValidationRecords(mockValidationRecords);

    expect(rows[0]).toMatchObject({
      label: 'test: node -e "process.exit(0)"',
      value: expect.stringContaining("passed")
    });
  });

  it("hasLandingSignals is true when landingAction exists", () => {
    expect(
      hasLandingSignals(
        recordWithSignals({
          landingAction: true
        })
      )
    ).toBe(true);
  });

  it("buildLandingRiskRows includes landing action type and risk", () => {
    const rows = buildLandingRiskRows(
      recordWithSignals({
        landingActionType: "deploy",
        landingRisk: "critical"
      })
    );

    expect(findRow(rows, "Landing type")).toMatchObject({
      value: "deploy"
    });
    expect(findRow(rows, "Landing risk")).toMatchObject({
      value: "critical",
      severity: "critical"
    });
  });

  it("getStatusSeverity maps common status and risk values", () => {
    expect(getStatusSeverity("low")).toBe("low");
    expect(getStatusSeverity("medium")).toBe("medium");
    expect(getStatusSeverity("high")).toBe("high");
    expect(getStatusSeverity("critical")).toBe("critical");
    expect(getStatusSeverity("passed")).toBe("low");
    expect(getStatusSeverity("failed")).toBe("critical");
    expect(getStatusSeverity("not_run")).toBe("medium");
    expect(getStatusSeverity("stale")).toBe("medium");
  });

  it("mock validation records include passed and failed examples", () => {
    expect(
      mockValidationRecords.some((record) => record.status === "passed")
    ).toBe(true);
    expect(
      mockValidationRecords.some((record) => record.status === "failed")
    ).toBe(true);
  });

  it("mock audit records include Git, validation, and landing examples", () => {
    expect(mockAuditRecords.some((record) => hasGitSignals(record))).toBe(true);
    expect(
      mockAuditRecords.some((record) => hasValidationSignals(record))
    ).toBe(true);
    expect(mockAuditRecords.some((record) => hasLandingSignals(record))).toBe(
      true
    );
  });
});
