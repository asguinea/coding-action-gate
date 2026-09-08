import { describe, expect, it } from "vitest";
import { detectSecretPatterns } from "../../src/secrets/secretPatterns.js";

const patternNames = (source: string): string[] =>
  detectSecretPatterns(source).map((finding) => finding.patternName);

describe("detectSecretPatterns", () => {
  it("detects AWS access key ids", () => {
    expect(patternNames("AKIA1234567890ABCDEF")).toContain("aws_access_key_id");
  });

  it("detects private key blocks", () => {
    expect(patternNames("-----BEGIN PRIVATE KEY-----")).toContain(
      "private_key_block"
    );
  });

  it("detects GitHub tokens", () => {
    expect(patternNames("ghp_abcdefghijklmnopqrstuvwxyz123456")).toContain(
      "github_token"
    );
  });

  it("detects Stripe secret keys", () => {
    expect(patternNames("sk_live_1234567890abcdefghij")).toContain(
      "stripe_secret_key"
    );
  });

  it("detects OpenAI-like keys", () => {
    expect(patternNames("sk-abcdefghijklmnopqrstuvwxyz123456")).toContain(
      "openai_api_key"
    );
  });

  it("detects generic long secret assignments", () => {
    expect(
      patternNames("api_key=abcdefghijklmnopqrstuvwxyz1234567890")
    ).toContain("generic_secret_assignment");
  });

  it("returns pattern names without raw values", () => {
    const source = "api_key=abcdefghijklmnopqrstuvwxyz1234567890";
    const findings = detectSecretPatterns(source);

    expect(findings).toEqual([
      {
        patternName: "generic_secret_assignment",
        confidence: "probable"
      }
    ]);
    expect(JSON.stringify(findings)).not.toContain(
      "abcdefghijklmnopqrstuvwxyz1234567890"
    );
  });
});
