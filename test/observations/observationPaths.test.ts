import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeObservationSessionId,
  resolveObservationLogPath,
  resolveObservedFilePath
} from "../../src/observations/observationPaths.js";

describe("observation paths", () => {
  it("resolves under .stepharbor/observations by default", () => {
    const cwd = path.resolve("/tmp/stepharbor-observation-paths");

    expect(resolveObservationLogPath({ cwd })).toBe(
      path.join(cwd, ".stepharbor/observations/session_default.jsonl")
    );
  });

  it("uses session-specific JSONL file names", () => {
    const cwd = path.resolve("/tmp/stepharbor-observation-paths");

    expect(resolveObservationLogPath({ cwd, sessionId: "session/a" })).toBe(
      path.join(cwd, ".stepharbor/observations/session_session_a.jsonl")
    );
  });

  it("normalizes empty session ids to default", () => {
    expect(normalizeObservationSessionId("")).toBe("default");
  });

  it("resolves observed file paths against cwd", () => {
    const cwd = path.resolve("/tmp/stepharbor-observation-paths");

    expect(resolveObservedFilePath("src/file.ts", cwd)).toEqual({
      absolutePath: path.join(cwd, "src/file.ts"),
      relativePath: "src/file.ts"
    });
  });
});
