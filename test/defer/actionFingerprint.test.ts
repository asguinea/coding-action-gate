import { describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import {
  areActionsSimilarForDeferral,
  fingerprintAction
} from "../../src/defer/actionFingerprint.js";
import type { StepHarborAction } from "../../src/domain/actions.js";

const base = {
  timestamp: "2026-05-01T10:00:00.000Z",
  proposedBy: "agent" as const
};

const editAction = (
  id: string,
  targetPath: string,
  timestamp = base.timestamp
): StepHarborAction => ({
  ...base,
  id,
  timestamp,
  type: "edit_file",
  targetPath,
  diffStats: {
    files: 1,
    addedLines: 1,
    deletedLines: 0
  }
});

const commandAction = (command: string): StepHarborAction => ({
  ...base,
  id: `cmd-${command}`,
  type: "run_command",
  command
});

const normalize = (action: StepHarborAction, cwd = process.cwd()) => {
  const result = normalizeAction(action, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.action;
};

describe("action fingerprinting", () => {
  it("ignores id and timestamp", () => {
    expect(
      fingerprintAction(editAction("a1", "README.md", base.timestamp))
    ).toBe(
      fingerprintAction(
        editAction("a2", "README.md", "2026-05-01T11:00:00.000Z")
      )
    );
  });

  it("changes when target path changes", () => {
    expect(fingerprintAction(editAction("a1", "README.md"))).not.toBe(
      fingerprintAction(editAction("a1", "src/index.ts"))
    );
  });

  it("changes when command changes", () => {
    expect(fingerprintAction(commandAction("npm test"))).not.toBe(
      fingerprintAction(commandAction("npm run lint"))
    );
  });

  it("treats same normalized target path with different id as similar", () => {
    expect(
      areActionsSimilarForDeferral(
        normalize(editAction("a1", "./README.md")),
        normalize(editAction("a2", "README.md"))
      )
    ).toBe(true);
  });

  it("treats overlapping target paths as similar", () => {
    const left = {
      ...normalize(editAction("a1", "README.md")),
      normalized: {
        ...normalize(editAction("a1", "README.md")).normalized,
        relativeTargetPaths: ["README.md", "src/index.ts"]
      }
    };

    expect(
      areActionsSimilarForDeferral(
        left,
        normalize(editAction("a2", "src/index.ts"))
      )
    ).toBe(true);
  });

  it("does not treat unrelated targets as similar", () => {
    expect(
      areActionsSimilarForDeferral(
        normalize(editAction("a1", "README.md")),
        normalize(editAction("a2", "src/index.ts"))
      )
    ).toBe(false);
  });
});
