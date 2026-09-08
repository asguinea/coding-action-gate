import { describe, expect, it } from "vitest";

import { classifyGitCommand } from "../../src/git/gitCommandClassifier.js";

describe("classifyGitCommand", () => {
  it("classifies git status as a read command", () => {
    expect(classifyGitCommand(["git", "status"])).toMatchObject({
      gitCommandCategory: "git_read",
      mutatesGit: false
    });
  });

  it("classifies git commit as a git mutation", () => {
    expect(classifyGitCommand(["git", "commit", "-m", "x"])).toMatchObject({
      gitCommandCategory: "git_commit",
      mutatesGit: true
    });
  });

  it("classifies git push and derives remote target", () => {
    expect(classifyGitCommand(["git", "push", "origin", "main"])).toMatchObject(
      {
        gitCommandCategory: "git_push",
        mutatesGit: true,
        remoteTarget: "origin/main",
        targetBranch: "main"
      }
    );
  });

  it("sets forcePush for long force options", () => {
    expect(
      classifyGitCommand(["git", "push", "--force", "origin", "main"])
    ).toMatchObject({
      forcePush: true
    });

    expect(
      classifyGitCommand([
        "git",
        "push",
        "--force-with-lease",
        "origin",
        "main"
      ])
    ).toMatchObject({
      forcePush: true
    });
  });

  it("sets forcePush for -f", () => {
    expect(
      classifyGitCommand(["git", "push", "-f", "origin", "main"])
    ).toMatchObject({
      forcePush: true
    });
  });

  it("sets hookBypass for commit --no-verify", () => {
    expect(
      classifyGitCommand(["git", "commit", "--no-verify", "-m", "x"])
    ).toMatchObject({
      hookBypass: true
    });
  });

  it("sets hookBypass for push --no-verify", () => {
    expect(
      classifyGitCommand(["git", "push", "--no-verify", "origin", "main"])
    ).toMatchObject({
      hookBypass: true
    });
  });
});
