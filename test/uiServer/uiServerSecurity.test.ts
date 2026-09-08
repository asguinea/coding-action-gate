import { describe, expect, it } from "vitest";

import {
  formatServerUrl,
  normalizeUiServerLimit,
  parseLimitQuery,
  resolveSessionId,
  validateUiServerHost
} from "../../src/uiServer/uiServerSecurity.js";

describe("UI server security helpers", () => {
  it("allows localhost-only hosts", () => {
    expect(validateUiServerHost()).toBe("127.0.0.1");
    expect(validateUiServerHost("localhost")).toBe("localhost");
    expect(validateUiServerHost("::1")).toBe("::1");
  });

  it("rejects non-local hosts", () => {
    expect(() => validateUiServerHost("0.0.0.0")).toThrow(
      "UI server host must be localhost-only."
    );
  });

  it("normalizes and caps limits", () => {
    expect(normalizeUiServerLimit()).toBe(100);
    expect(normalizeUiServerLimit(999)).toBe(500);
    expect(parseLimitQuery("25")).toBe(25);
    expect(() => normalizeUiServerLimit(0)).toThrow(
      "Limit must be a positive integer."
    );
    expect(() => parseLimitQuery("-1")).toThrow(
      "Limit must be a positive integer."
    );
  });

  it("resolves session ids without directory controls", () => {
    expect(resolveSessionId(null)).toBe("default");
    expect(resolveSessionId("", "s1")).toBe("s1");
    expect(resolveSessionId("s2", "s1")).toBe("s2");
    expect(() => resolveSessionId("../evil", "s1")).toThrow(
      "Session id may only contain letters"
    );
    expect(() => resolveSessionId("s1/evil", "s1")).toThrow(
      "Session id may only contain letters"
    );
  });

  it("formats IPv6 localhost URLs with brackets", () => {
    expect(formatServerUrl("::1", 1234)).toBe("http://[::1]:1234");
  });
});
