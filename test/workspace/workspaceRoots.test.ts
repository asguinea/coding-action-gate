import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceRoots } from "../../src/workspace/workspaceRoots.js";

describe("resolveWorkspaceRoots", () => {
  it("resolves roots from context.workspaceRoots", () => {
    const cwd = path.resolve("/tmp/stepharbor-root-context");

    expect(
      resolveWorkspaceRoots({
        policy: {
          version: "test",
          workspace: {
            allowedRoots: ["policy-root"]
          }
        },
        context: {
          cwd,
          workspaceRoots: ["context-root"]
        }
      })
    ).toEqual([path.join(cwd, "context-root")]);
  });

  it("resolves roots from policy.workspace.allowedRoots", () => {
    const cwd = path.resolve("/tmp/stepharbor-root-policy");

    expect(
      resolveWorkspaceRoots({
        policy: {
          version: "test",
          workspace: {
            allowedRoots: ["app"]
          }
        },
        context: {
          cwd
        }
      })
    ).toEqual([path.join(cwd, "app")]);
  });

  it("resolves relative policy roots against cwd", () => {
    const cwd = path.resolve("/tmp/stepharbor-root-relative");

    expect(
      resolveWorkspaceRoots({
        policy: {
          version: "test",
          workspace: {
            allowedRoots: ["."]
          }
        },
        context: {
          cwd
        }
      })
    ).toEqual([cwd]);
  });

  it("falls back to cwd", () => {
    const cwd = path.resolve("/tmp/stepharbor-root-fallback");

    expect(
      resolveWorkspaceRoots({
        context: {
          cwd
        }
      })
    ).toEqual([cwd]);
  });
});
