import { describe, expect, it } from "vitest";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import { decide } from "../../src/decision/decisionEngine.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";

const normalize = (action: CodingActionGateAction) => {
  const result = parseAndNormalizeAction(action, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const fileAction = (
  type: "edit_file" | "delete_file" | "read_file",
  targetPath: string
): CodingActionGateAction =>
  ({
    id: `${type}-${targetPath}`,
    type,
    timestamp: "2026-04-30T10:00:00.000Z",
    proposedBy: "agent",
    targetPath,
    ...(type === "edit_file" ? { diff: "@@\n-old\n+new\n" } : {})
  }) as CodingActionGateAction;

const runCommandAction = (command: string): CodingActionGateAction => ({
  id: `cmd-${command}`,
  type: "run_command",
  timestamp: "2026-04-30T10:00:00.000Z",
  proposedBy: "agent",
  command
});

describe("DEFER ordering", () => {
  it("reducible DEFER overrides ESCALATE for sensitive edit without fresh read", () => {
    const result = decide({
      action: normalize(fileAction("edit_file", "auth/service.ts")),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "unknown",
        pathSensitivity: "high"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("DEFER");
      expect(result.decision.deferReasonCategory).toBe(
        "target_file_never_read"
      );
      expect(result.decision.expectedNextDecision).toBe("ESCALATE");
      expect(result.decision.reason).toContain(
        "After context is refreshed, this action may still require human approval."
      );
      expect(result.decision.matchedPolicies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "read-before-write",
            matched: true,
            effect: "DEFER"
          }),
          expect.objectContaining({
            ruleId: "escalate-sensitive-change",
            matched: true,
            effect: "ESCALATE"
          })
        ])
      );
    }
  });

  it("auth edit after fresh read escalates", () => {
    const result = decide({
      action: normalize(fileAction("edit_file", "auth/service.ts")),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "fresh",
        pathSensitivity: "high"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("ESCALATE");
    }
  });

  it("safe stale README edit expects PROCEED after refresh", () => {
    const result = decide({
      action: normalize(fileAction("edit_file", "README.md")),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale",
        pathSensitivity: "low"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("DEFER");
      expect(result.decision.expectedNextDecision).toBe("PROCEED");
      expect(result.decision.riskIfProceeding).toEqual(
        expect.arrayContaining([
          "The proposed change may revert newer user or agent edits."
        ])
      );
    }
  });

  it("BLOCK still overrides reducible DEFER", () => {
    const result = decide({
      action: normalize(fileAction("edit_file", "../outside.ts")),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale",
        workspaceBoundaryViolation: true
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
    }
  });

  it("outside-workspace stale delete blocks", () => {
    const result = decide({
      action: normalize(fileAction("delete_file", "../outside.ts")),
      policy: defaultPolicy,
      signals: {
        targetFileFreshness: "stale",
        workspaceBoundaryViolation: true
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
    }
  });

  it("rm -rf . still blocks", () => {
    const result = decide({
      action: normalize(runCommandAction("rm -rf .")),
      policy: defaultPolicy,
      signals: {
        commandRiskScore: "critical"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
    }
  });

  it("read .env still blocks", () => {
    const result = decide({
      action: normalize(fileAction("read_file", ".env")),
      policy: defaultPolicy,
      signals: {
        secretTouch: "probable"
      }
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("BLOCK");
    }
  });
});
