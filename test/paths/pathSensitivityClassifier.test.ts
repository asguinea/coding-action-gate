import { describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import type { StepHarborPolicy } from "../../src/domain/policies.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import {
  classifyPathSensitivity,
  collectClassifiablePaths
} from "../../src/paths/pathSensitivityClassifier.js";

const actionForPath = (
  targetPath: string,
  type: StepHarborAction["type"] = "edit_file"
): StepHarborAction => ({
  id: `action-${targetPath.replace(/\W+/g, "-")}`,
  type: type as "edit_file",
  timestamp: "2026-04-30T08:00:00.000Z",
  proposedBy: "agent",
  targetPath
});

const normalizePathAction = (
  targetPath: string,
  policy: StepHarborPolicy = defaultPolicy
) => {
  const normalized = normalizeAction(actionForPath(targetPath), {
    cwd: process.cwd()
  });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  return classifyPathSensitivity(normalized.action, policy);
};

describe("classifyPathSensitivity", () => {
  it("classifies .env as critical", () => {
    expect(normalizePathAction(".env")).toMatchObject({
      pathSensitivity: "critical",
      matchedSensitivePath: ".env",
      matchedSensitivePathLevel: "critical"
    });
  });

  it("classifies .env.local as critical", () => {
    expect(normalizePathAction(".env.local").pathSensitivity).toBe("critical");
  });

  it("classifies auth paths as high", () => {
    expect(normalizePathAction("auth/service.ts")).toMatchObject({
      pathSensitivity: "high",
      matchedSensitivePathLevel: "high"
    });
  });

  it("classifies nested auth paths as high", () => {
    expect(normalizePathAction("auth/sub/service.ts").pathSensitivity).toBe(
      "high"
    );
  });

  it("classifies certificate basenames as critical", () => {
    expect(normalizePathAction("certs/private.pem").pathSensitivity).toBe(
      "critical"
    );
  });

  it("classifies .ssh files as critical", () => {
    expect(normalizePathAction(".ssh/id_rsa").pathSensitivity).toBe("critical");
  });

  it("classifies ordinary paths as low", () => {
    expect(normalizePathAction("README.md")).toMatchObject({
      pathSensitivity: "low"
    });
  });

  it("returns unknown when no target path is available", () => {
    const normalized = normalizeAction({
      id: "action-command",
      type: "run_command",
      timestamp: "2026-04-30T08:00:00.000Z",
      proposedBy: "agent",
      command: "npm test"
    });

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    expect(classifyPathSensitivity(normalized.action, defaultPolicy)).toEqual({
      pathSensitivity: "unknown",
      pathSensitivityReason:
        "No target paths were available for classification."
    });
  });

  it("normalizes Windows-style paths to match policy globs", () => {
    expect(normalizePathAction("auth\\service.ts").pathSensitivity).toBe(
      "high"
    );
  });

  it("chooses the highest severity across multiple paths", () => {
    const normalized = normalizeAction({
      ...actionForPath("README.md"),
      targetPaths: ["README.md", "auth/service.ts", ".env"]
    } as unknown as StepHarborAction);

    if (!normalized.ok) {
      throw new Error(normalized.error.message);
    }

    expect(collectClassifiablePaths(normalized.action)).toEqual(
      expect.arrayContaining(["README.md", "auth/service.ts", ".env"])
    );
    expect(
      classifyPathSensitivity(normalized.action, defaultPolicy)
    ).toMatchObject({
      pathSensitivity: "critical",
      matchedSensitivePathLevel: "critical"
    });
  });

  it("uses policy-defined medium paths", () => {
    expect(
      normalizePathAction("custom-medium/file.ts", {
        ...defaultPolicy,
        sensitivePaths: {
          medium: ["custom-medium/**"]
        }
      }).pathSensitivity
    ).toBe("medium");
  });

  it("uses policy-defined high paths", () => {
    expect(
      normalizePathAction("custom-high/file.ts", {
        ...defaultPolicy,
        sensitivePaths: {
          high: ["custom-high/**"]
        }
      }).pathSensitivity
    ).toBe("high");
  });

  it("uses policy-defined critical paths", () => {
    expect(
      normalizePathAction("custom-critical/file.ts", {
        ...defaultPolicy,
        sensitivePaths: {
          critical: ["custom-critical/**"]
        }
      }).pathSensitivity
    ).toBe("critical");
  });
});
