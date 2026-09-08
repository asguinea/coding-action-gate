import { describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { buildDeferDecisionDetails } from "../../src/defer/deferDecisionBuilder.js";
import type { PolicyRule } from "../../src/domain/policies.js";

const editAction = parseAndNormalizeAction(
  {
    id: "edit-readme",
    type: "edit_file",
    timestamp: "2026-04-30T10:00:00.000Z",
    proposedBy: "agent",
    targetPath: "README.md",
    diff: "@@\n-old\n+new\n"
  },
  { cwd: process.cwd() }
);

if (!editAction.ok) {
  throw new Error(editAction.error.message);
}

const readBeforeWriteRule: PolicyRule = {
  id: "read-before-write",
  decision: "DEFER",
  when: {
    action_type: ["edit_file", "write_file", "delete_file"],
    target_file_freshness: ["stale", "unknown", "missing"]
  }
};

const validationRule: PolicyRule = {
  id: "require-validation",
  decision: "DEFER",
  when: {
    action_type: "git_command",
    validation_status: ["not_run", "stale"]
  }
};

const escalationRule: PolicyRule = {
  id: "escalate-sensitive",
  decision: "ESCALATE",
  when: {
    path_sensitivity: ["high", "critical"]
  }
};

describe("buildDeferDecisionDetails", () => {
  it("classifies unknown freshness as target_file_never_read", () => {
    const details = buildDeferDecisionDetails(
      [readBeforeWriteRule],
      editAction.action,
      { targetFileFreshness: "unknown" }
    );

    expect(details.deferReasonCategory).toBe("target_file_never_read");
    expect(details.reason).toBe(
      "Target file has not been observed in this session."
    );
    expect(details.reanalysisRequired).toBe(true);
    expect(details.expectedNextDecision).toBe("PROCEED");
  });

  it("classifies stale freshness and expects escalation for sensitive paths", () => {
    const details = buildDeferDecisionDetails(
      [readBeforeWriteRule, escalationRule],
      editAction.action,
      {
        targetFileFreshness: "stale",
        pathSensitivity: "high"
      }
    );

    expect(details.deferReasonCategory).toBe("target_file_stale");
    expect(details.expectedNextDecision).toBe("ESCALATE");
    expect(details.reason).toContain(
      "After context is refreshed, this action may still require human approval."
    );
    expect(details.riskIfProceeding).toContain(
      "After context is refreshed, this action may still require human approval."
    );
  });

  it("classifies missing freshness", () => {
    const details = buildDeferDecisionDetails(
      [readBeforeWriteRule],
      editAction.action,
      { targetFileFreshness: "missing" }
    );

    expect(details.deferReasonCategory).toBe("target_file_missing");
  });

  it("classifies metadata-only observations", () => {
    const details = buildDeferDecisionDetails(
      [readBeforeWriteRule],
      editAction.action,
      {
        targetFileFreshness: "unknown",
        readBeforeWriteReason: "Latest observation is metadata-only."
      }
    );

    expect(details.deferReasonCategory).toBe("metadata_only_observation");
  });

  it("classifies validation not_run and stale", () => {
    expect(
      buildDeferDecisionDetails([validationRule], editAction.action, {
        validationStatus: "not_run"
      }).deferReasonCategory
    ).toBe("validation_not_run");
    expect(
      buildDeferDecisionDetails([validationRule], editAction.action, {
        validationStatus: "stale"
      }).deferReasonCategory
    ).toBe("validation_stale");
  });
});
