import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runGitCommand } from "../../src/git/gitExec.js";
import { getGitState } from "../../src/git/gitStateReader.js";

const tempDirs: string[] = [];
const gitIntegrationTimeoutMs = 30_000;

vi.setConfig({
  testTimeout: gitIntegrationTimeoutMs,
  hookTimeout: gitIntegrationTimeoutMs
});

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-git-state-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const runGit = async (args: string[], cwd: string): Promise<string> => {
  const result = await runGitCommand(args, { cwd });

  if (!result.ok) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.error.message}\n${
        result.error.stderr ?? ""
      }`
    );
  }

  return result.stdout.trim();
};

const createCommittedRepo = async (): Promise<string> => {
  const cwd = await createTempDir();

  await runGit(["init"], cwd);
  await runGit(
    ["config", "user.email", "coding-action-gate@example.test"],
    cwd
  );
  await runGit(["config", "user.name", "CodingActionGate Test"], cwd);
  await writeFile(path.join(cwd, "README.md"), "# Repo\n", "utf8");
  await runGit(["add", "README.md"], cwd);
  await runGit(["commit", "-m", "initial"], cwd);

  return cwd;
};

describe("getGitState", () => {
  it("returns non-repo state outside a git repository", async () => {
    const cwd = await createTempDir();

    const state = await getGitState({ cwd });

    expect(state).toEqual({ isGitRepo: false });
  });

  it("detects a fresh git repository", async () => {
    const cwd = await createCommittedRepo();

    const state = await getGitState({ cwd });

    expect(state.isGitRepo).toBe(true);
    await expect(realpath(state.repoRoot ?? "")).resolves.toBe(
      await realpath(cwd)
    );
    expect(state.currentBranch).toEqual(expect.any(String));
    expect(state.isDetachedHead).toBe(false);
    expect(state.isDirty).toBe(false);
    expect(state.hasUncommittedChanges).toBe(false);
    expect(state.hasUntrackedFiles).toBe(false);
    expect(state.lastCommitHash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("detects modified tracked files as uncommitted changes", async () => {
    const cwd = await createCommittedRepo();

    await writeFile(path.join(cwd, "README.md"), "# Changed\n", "utf8");

    const state = await getGitState({ cwd });

    expect(state.isGitRepo).toBe(true);
    expect(state.isDirty).toBe(true);
    expect(state.hasUncommittedChanges).toBe(true);
    expect(state.hasUntrackedFiles).toBe(false);
  });

  it("detects untracked files", async () => {
    const cwd = await createCommittedRepo();

    await writeFile(path.join(cwd, "notes.txt"), "untracked\n", "utf8");

    const state = await getGitState({ cwd });

    expect(state.isGitRepo).toBe(true);
    expect(state.isDirty).toBe(true);
    expect(state.hasUntrackedFiles).toBe(true);
  });

  it("detects detached HEAD", async () => {
    const cwd = await createCommittedRepo();
    const commitHash = await runGit(["rev-parse", "HEAD"], cwd);

    await runGit(["checkout", commitHash], cwd);

    const state = await getGitState({ cwd });

    expect(state.isGitRepo).toBe(true);
    expect(state.isDetachedHead).toBe(true);
    expect(state.currentBranch).toBeUndefined();
  });

  it("detects upstream branch and remote when configured", async () => {
    const localCwd = await createCommittedRepo();
    const remoteCwd = await createTempDir();
    const localState = await getGitState({ cwd: localCwd });
    const branch = localState.currentBranch ?? "main";

    await runGit(["init", "--bare"], remoteCwd);
    await runGit(["remote", "add", "origin", remoteCwd], localCwd);
    await runGit(["push", "-u", "origin", branch], localCwd);

    const state = await getGitState({ cwd: localCwd });

    expect(state.upstreamBranch).toBe(`origin/${branch}`);
    expect(state.upstreamRemote).toBe("origin");
  });

  it("handles git command failures without crashing the reader", async () => {
    const cwd = await createTempDir();

    const result = await runGitCommand(["rev-parse", "HEAD"], { cwd });
    const state = await getGitState({ cwd });

    expect(result.ok).toBe(false);
    expect(state.isGitRepo).toBe(false);
  });
});
