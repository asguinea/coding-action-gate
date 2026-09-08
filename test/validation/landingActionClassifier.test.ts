import { describe, expect, it } from "vitest";

import { normalizeAction } from "../../src/actions/normalizeAction.js";
import type { CodingActionGateAction } from "../../src/domain/actions.js";
import { classifyLandingAction } from "../../src/validation/landingActionClassifier.js";

const normalize = (action: CodingActionGateAction) => {
  const result = normalizeAction(action, { cwd: process.cwd() });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

const commandAction = (command: string): CodingActionGateAction => ({
  id: "act",
  type: "run_command",
  timestamp: "2026-05-02T00:00:00.000Z",
  proposedBy: "agent",
  command
});

describe("classifyLandingAction", () => {
  it("classifies git commit as before_commit", () => {
    expect(
      classifyLandingAction(normalize(commandAction("git commit -m test")))
    ).toBe("before_commit");
  });

  it("classifies git push as before_push", () => {
    expect(classifyLandingAction(normalize(commandAction("git push")))).toBe(
      "before_push"
    );
  });

  it("classifies non-git actions as none", () => {
    expect(
      classifyLandingAction(
        normalize({
          id: "read",
          type: "read_file",
          timestamp: "2026-05-02T00:00:00.000Z",
          proposedBy: "agent",
          targetPath: "README.md"
        })
      )
    ).toBe("none");
  });
});
