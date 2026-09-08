import { describe, expect, it } from "vitest";
import { redactString } from "../../src/redaction/redactString.js";

describe("redactString", () => {
  it("redacts AWS access keys", () => {
    const result = redactString("key=AKIA1234567890ABCDEF");

    expect(result.value).toBe("key=[REDACTED]");
    expect(result.matchedPatterns).toContain("aws_access_key_id");
  });

  it("redacts GitHub tokens", () => {
    const result = redactString("ghp_abcdefghijklmnopqrstuvwxyz123456");

    expect(result.value).toBe("[REDACTED]");
    expect(result.matchedPatterns).toContain("github_token");
  });

  it("redacts Stripe keys", () => {
    const result = redactString("sk_live_1234567890abcdefghij");

    expect(result.value).toBe("[REDACTED]");
    expect(result.matchedPatterns).toContain("stripe_secret_key");
  });

  it("redacts OpenAI-like keys", () => {
    const result = redactString("sk-abcdefghijklmnopqrstuvwxyz123456");

    expect(result.value).toBe("[REDACTED]");
    expect(result.matchedPatterns).toContain("openai_api_key");
  });

  it("redacts private key blocks", () => {
    const result = redactString(
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
    );

    expect(result.value).toBe("[REDACTED]");
    expect(result.matchedPatterns).toContain("private_key_block");
  });

  it("redacts bearer tokens while preserving the label", () => {
    const result = redactString(
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"
    );

    expect(result.value).toBe("Authorization: Bearer [REDACTED]");
    expect(result.matchedPatterns).toContain("authorization_bearer_token");
  });

  it("redacts generic assignments while preserving the key name", () => {
    const result = redactString("api_key=abcdefghijklmnopqrstuvwxyz1234567890");

    expect(result.value).toBe("api_key=[REDACTED]");
    expect(result.matchedPatterns).toContain("generic_secret_assignment");
  });

  it("returns redacted false for normal text", () => {
    expect(redactString("normal README text")).toEqual({
      value: "normal README text",
      redacted: false,
      redactionCount: 0,
      matchedPatterns: []
    });
  });
});
