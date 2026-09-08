import { describe, expect, it } from "vitest";

import {
  finalizeFeedbackExport,
  sanitizeFeedbackText,
  sanitizeCommandSummary,
  summarizePathForFeedback
} from "../../src/feedback/feedbackSanitizer.js";

describe("feedback sanitizer", () => {
  it("redacts token-like strings", () => {
    const summary = sanitizeCommandSummary(
      "echo sk-abcdefghijklmnopqrstuvwxyz1234567890"
    );

    expect(summary).toBe("echo [REDACTED]");
  });

  it("omits raw command arguments from feedback command summaries", () => {
    expect(sanitizeCommandSummary("echo hello")).toBe(
      "echo [arguments omitted]"
    );
    expect(sanitizeCommandSummary("rm -rf .")).toBe("rm [arguments omitted]");
  });

  it("redacts absolute paths in feedback text", () => {
    const sanitized = sanitizeFeedbackText(
      "Working directory is available: /tmp/private-project/src/app.ts"
    );

    expect(sanitized).toContain("Working directory is available: [PATH]");
    expect(sanitized).not.toContain("/tmp/private-project");
  });

  it("removes raw action, normalized action, diff, and content fields", () => {
    const sanitized = finalizeFeedbackExport({
      rawAction: {
        secret: "sk-abcdefghijklmnopqrstuvwxyz1234567890"
      },
      normalizedAction: {
        content: "source code"
      },
      diff: "raw diff",
      content: "file contents",
      decision: "BLOCK"
    }) as Record<string, unknown>;

    expect(sanitized.rawAction).toBeUndefined();
    expect(sanitized.normalizedAction).toBeUndefined();
    expect(sanitized.diff).toBeUndefined();
    expect(sanitized.content).toBeUndefined();
    expect(sanitized.decision).toBe("BLOCK");
  });

  it("redacts absolute paths during final export sanitization", () => {
    const sanitized = finalizeFeedbackExport({
      doctor: {
        message: "cwd exists: /Users/example/private-repo"
      }
    }) as { doctor: { message: string } };

    expect(sanitized.doctor.message).toBe("cwd exists: [PATH]");
  });

  it("hashes absolute paths and preserves only a basename", () => {
    const summary = summarizePathForFeedback(
      "/Users/example/project/src/app.ts"
    );

    expect(summary.basename).toBe("app.ts");
    expect(summary.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(summary)).not.toContain("/Users/example");
  });

  it("redacts secret-like basenames", () => {
    const summary = summarizePathForFeedback("/tmp/project/.env");

    expect(summary.basename).toBe("[REDACTED]");
  });

  it("preserves decision counts through final redaction", () => {
    const sanitized = finalizeFeedbackExport({
      decisions: {
        counts: {
          PROCEED: 1,
          DEFER: 2,
          ESCALATE: 3,
          BLOCK: 4
        }
      }
    }) as { decisions: { counts: Record<string, number> } };

    expect(sanitized.decisions.counts).toEqual({
      PROCEED: 1,
      DEFER: 2,
      ESCALATE: 3,
      BLOCK: 4
    });
  });
});
