import { describe, expect, it } from "vitest";

import { isProtectedBranch } from "../../src/git/gitBranchProtection.js";

describe("git branch protection", () => {
  it("matches protected branches exactly", () => {
    expect(isProtectedBranch("main")).toBe(true);
    expect(isProtectedBranch("master")).toBe(true);
    expect(isProtectedBranch("production")).toBe(true);
  });

  it("matches wildcard protected branches", () => {
    expect(isProtectedBranch("release/1.0")).toBe(true);
  });

  it("does not match non-protected feature branches", () => {
    expect(isProtectedBranch("feature/foo")).toBe(false);
  });
});
