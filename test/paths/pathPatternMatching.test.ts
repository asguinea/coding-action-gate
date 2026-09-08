import { describe, expect, it } from "vitest";
import {
  normalizePathForSensitivity,
  pathPatternMatches
} from "../../src/paths/pathPatternMatching.js";

describe("pathPatternMatches", () => {
  it("matches exact patterns", () => {
    expect(pathPatternMatches(".env", ".env")).toBe(true);
  });

  it("matches wildcard patterns", () => {
    expect(pathPatternMatches(".env.local", ".env.*")).toBe(true);
  });

  it("matches recursive patterns", () => {
    expect(pathPatternMatches("auth/service.ts", "auth/**")).toBe(true);
  });

  it("matches nested recursive patterns", () => {
    expect(pathPatternMatches("auth/sub/service.ts", "auth/**")).toBe(true);
  });

  it("matches basename wildcards below directories", () => {
    expect(pathPatternMatches("certs/private.pem", "*.pem")).toBe(true);
  });

  it("matches dot directories", () => {
    expect(pathPatternMatches(".ssh/id_rsa", ".ssh/**")).toBe(true);
  });

  it("normalizes Windows-style paths before matching", () => {
    expect(pathPatternMatches("auth\\service.ts", "auth/**")).toBe(true);
  });

  it("does not use naive prefix matching", () => {
    expect(pathPatternMatches("authorization/service.ts", "auth/**")).toBe(
      false
    );
  });

  it("normalizes redundant path segments", () => {
    expect(normalizePathForSensitivity("./auth/../auth/service.ts")).toBe(
      "auth/service.ts"
    );
  });
});
