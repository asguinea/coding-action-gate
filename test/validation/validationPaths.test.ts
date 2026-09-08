import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  normalizeValidationSessionId,
  resolveValidationLogPath
} from "../../src/validation/validationPaths.js";

describe("validation paths", () => {
  it("resolves under .stepharbor/validation by default", () => {
    const cwd = path.join(os.tmpdir(), "stepharbor-validation-paths");

    expect(resolveValidationLogPath({ cwd })).toBe(
      path.join(cwd, ".stepharbor/validation/session_default.jsonl")
    );
  });

  it("normalizes validation session ids", () => {
    expect(normalizeValidationSessionId("session / one")).toBe("session___one");
  });
});
