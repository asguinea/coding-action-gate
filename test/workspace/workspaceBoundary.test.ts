import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPathsOutsideWorkspaceRoots,
  isPathInsideWorkspaceRoot
} from "../../src/workspace/workspaceBoundary.js";

describe("workspace boundary helpers", () => {
  it("target equal to root counts as inside", () => {
    const root = path.resolve("/tmp/stepharbor-boundary/app");

    expect(isPathInsideWorkspaceRoot(root, root)).toBe(true);
  });

  it("target descendant of root counts as inside", () => {
    const root = path.resolve("/tmp/stepharbor-boundary/app");
    const target = path.join(root, "src/index.ts");

    expect(isPathInsideWorkspaceRoot(target, root)).toBe(true);
  });

  it("sibling prefix path does not count as inside", () => {
    const root = path.resolve("/tmp/stepharbor-boundary/app");
    const sibling = path.resolve("/tmp/stepharbor-boundary/app2/file.ts");

    expect(isPathInsideWorkspaceRoot(sibling, root)).toBe(false);
  });

  it("finds paths outside all workspace roots", () => {
    const root = path.resolve("/tmp/stepharbor-boundary/app");
    const inside = path.join(root, "src/index.ts");
    const outside = path.resolve("/tmp/stepharbor-boundary/outside/file.ts");

    expect(findPathsOutsideWorkspaceRoots([inside, outside], [root])).toEqual([
      outside
    ]);
  });
});
