import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import type { StepHarborAction } from "../../src/domain/actions.js";
import { defaultPolicy } from "../../src/policy/defaultPolicy.js";
import { runGitCommand } from "../../src/git/gitExec.js";
import { computeSafetySignals } from "../../src/signals/computeSignals.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "stepharbor-git-flow-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true }))
  );
});

const gitWorkflowIntegrationTimeout = 15_000;

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

const createRepo = async (branch = "main"): Promise<string> => {
  const cwd = await createTempDir();

  await runGit(["init", "-b", branch], cwd);
  await runGit(["config", "user.email", "stepharbor@example.test"], cwd);
  await runGit(["config", "user.name", "StepHarbor Test"], cwd);
  await writeFile(path.join(cwd, "README.md"), "# Repo\n", "utf8");
  await runGit(["add", "README.md"], cwd);
  await runGit(["commit", "-m", "initial"], cwd);

  return cwd;
};

const gitAction = (command: string, cwd: string): StepHarborAction => ({
  id: `act_${command.replace(/[^a-z0-9]+/gi, "_")}`,
  type: "run_command",
  timestamp: "2026-05-02T00:00:00.000Z",
  proposedBy: "agent",
  command,
  cwd
});

const computeGitSignals = async (
  command: string,
  cwd: string,
  providedSignals = {}
) => {
  const normalized = normalizeAction(gitAction(command, cwd), { cwd });

  if (!normalized.ok) {
    throw new Error(normalized.error.message);
  }

  const result = await computeSafetySignals({
    action: normalized.action,
    policy: defaultPolicy,
    providedSignals,
    context: { cwd }
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
};

const expectExecDecision = async (command: string, cwd: string) => {
  const result = await runExecCommand({
    command,
    cwd,
    noAudit: true
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.output.decision;
};

describe("git workflow detector", () => {
  it("detects direct mainline commit on main", async () => {
    const cwd = await createRepo("main");
    const result = await computeGitSignals("git commit -m test", cwd);

    expect(result.signals).toMatchObject({
      currentBranch: "main",
      protectedBranch: true,
      gitCommandCategory: "git_commit",
      directMainlineCommit: true,
      branchRisk: "high"
    });
  });

  it("detects direct mainline push to explicit protected target", async () => {
    const cwd = await createRepo("feature/foo");
    const result = await computeGitSignals("git push origin main", cwd);

    expect(result.signals).toMatchObject({
      currentBranch: "feature/foo",
      protectedBranch: false,
      gitCommandCategory: "git_push",
      remoteTarget: "origin/main",
      directMainlinePush: true,
      branchRisk: "critical"
    });
  });

  it("detects direct mainline push using current protected branch fallback", async () => {
    const cwd = await createRepo("main");
    const result = await computeGitSignals("git push", cwd);

    expect(result.signals).toMatchObject({
      currentBranch: "main",
      protectedBranch: true,
      directMainlinePush: true
    });
  });

  it("treats git status on a feature branch as low branch risk", async () => {
    const cwd = await createRepo("feature/foo");
    const result = await computeGitSignals("git status", cwd);

    expect(result.signals).toMatchObject({
      gitCommandCategory: "git_read",
      mutatesGit: false,
      protectedBranch: false,
      repoIntegrityStatus: "clean",
      branchRisk: "low"
    });
  });

  it("raises branch risk for mutation on detached HEAD", async () => {
    const cwd = await createRepo("feature/foo");
    const commitHash = await runGit(["rev-parse", "HEAD"], cwd);

    await runGit(["checkout", commitHash], cwd);

    const result = await computeGitSignals("git commit -m test", cwd);

    expect(result.signals).toMatchObject({
      isDetachedHead: true,
      branchRisk: "high"
    });
  });

  it("marks git commands outside a repository as unknown branch risk", async () => {
    const cwd = await createTempDir();
    const result = await computeGitSignals("git status", cwd);

    expect(result.signals).toMatchObject({
      gitCommandCategory: "git_read",
      repoIntegrityStatus: "not_git_repo",
      branchRisk: "unknown"
    });
  });

  it("marks dirty worktree git mutation as medium or higher", async () => {
    const cwd = await createRepo("feature/foo");

    await writeFile(path.join(cwd, "README.md"), "# Changed\n", "utf8");

    const result = await computeGitSignals("git commit -m test", cwd);

    expect(result.signals.repoIntegrityStatus).toBe("dirty");
    expect(["medium", "high", "critical"]).toContain(result.signals.branchRisk);
  });

  it(
    "default policy blocks direct mainline push",
    async () => {
      const cwd = await createRepo("feature/foo");
      const decision = await expectExecDecision("git push origin main", cwd);

      expect(decision.decision).toBe("BLOCK");
      expect(decision.reason).toBe(
        "Direct push to a protected branch is prohibited."
      );
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "default policy defers direct mainline commit until validation is present",
    async () => {
      const cwd = await createRepo("main");
      const decision = await expectExecDecision("git commit -m test", cwd);

      expect(decision.decision).toBe("DEFER");
      expect(decision.reason).toContain("Required validation");
      expect(decision.signalSummary.directMainlineCommit).toBe(true);
      expect(decision.signalSummary.validationStatus).toBe("not_run");
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "default policy blocks force push",
    async () => {
      const cwd = await createRepo("feature/foo");
      const decision = await expectExecDecision("git push --force", cwd);

      expect(decision.decision).toBe("BLOCK");
      expect(decision.signalSummary.forcePush).toBe(true);
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "default policy blocks hook bypass",
    async () => {
      const cwd = await createRepo("feature/foo");
      const decision = await expectExecDecision(
        "git commit --no-verify -m test",
        cwd
      );

      expect(decision.decision).toBe("BLOCK");
      expect(decision.signalSummary.hookBypass).toBe(true);
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "default policy defers unknown git state",
    async () => {
      const cwd = await createTempDir();
      const decision = await expectExecDecision("git status", cwd);

      expect(decision.decision).toBe("DEFER");
      expect(decision.reason).toBe("Git state is unknown.");
      expect(decision.signalSummary.branchRisk).toBe("unknown");
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "CLI exec git status in repo returns PROCEED",
    async () => {
      const cwd = await createRepo("feature/foo");
      const decision = await expectExecDecision("git status", cwd);

      expect(decision.decision).toBe("PROCEED");
      expect(decision.signalSummary.gitCommandCategory).toBe("git_read");
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "CLI exec git push origin main returns BLOCK",
    async () => {
      const cwd = await createRepo("feature/foo");
      const decision = await expectExecDecision("git push origin main", cwd);

      expect(decision.decision).toBe("BLOCK");
      expect(decision.signalSummary.directMainlinePush).toBe(true);
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "CLI exec git commit on main returns DEFER before validation",
    async () => {
      const cwd = await createRepo("main");
      const decision = await expectExecDecision("git commit -m test", cwd);

      expect(decision.decision).toBe("DEFER");
      expect(decision.signalSummary.directMainlineCommit).toBe(true);
      expect(decision.signalSummary.validationStatus).toBe("not_run");
    },
    gitWorkflowIntegrationTimeout
  );

  it(
    "CLI exec git commit --no-verify returns BLOCK",
    async () => {
      const cwd = await createRepo("main");
      const decision = await expectExecDecision(
        "git commit --no-verify -m test",
        cwd
      );

      expect(decision.decision).toBe("BLOCK");
      expect(decision.signalSummary.hookBypass).toBe(true);
    },
    gitWorkflowIntegrationTimeout
  );

  it("audit record includes git-workflow detector result", async () => {
    const cwd = await createRepo("feature/foo");
    const result = await runExecCommand({
      command: "git status",
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readFile(result.output.audit.path, "utf8");
      const auditRecord = JSON.parse(records.trim()) as {
        evidence?: { detectorResults?: unknown[] };
      };

      expect(auditRecord.evidence?.detectorResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detectorId: "git-workflow",
            ok: true,
            signals: expect.objectContaining({
              gitCommandCategory: "git_read",
              branchRisk: "low"
            })
          })
        ])
      );
    }
  });

  it("provided signals override computed branchRisk and currentBranch", async () => {
    const cwd = await createRepo("feature/foo");
    const result = await computeGitSignals("git status", cwd, {
      branchRisk: "critical",
      currentBranch: "provided/main"
    });

    expect(result.computedSignals.currentBranch).toBe("feature/foo");
    expect(result.computedSignals.branchRisk).toBe("low");
    expect(result.signals.currentBranch).toBe("provided/main");
    expect(result.signals.branchRisk).toBe("critical");
  });
});
