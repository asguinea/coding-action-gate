import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseActionJsonString } from "../../src/actions/parseAction.js";
import { runCli } from "../../src/cli/cli.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { runValidateCommand } from "../../src/cli/commands/validateCommand.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";
import { runGitCommand } from "../../src/git/gitExec.js";
import { loadPolicy } from "../../src/policy/loadPolicy.js";

const tempDirs: string[] = [];
const phase4IntegrationTimeoutMs = 30_000;
const repoRoot = process.cwd();
const phase4ActionDir = path.join(repoRoot, "examples/actions/phase4");
const phase4PolicyPath = path.join(
  repoRoot,
  "examples/policies/phase4-demo.policy.yml"
);
const validationCommand = 'node -e "process.exit(0)"';
const failingValidationCommand = 'node -e "process.exit(1)"';
const fakeSecret = "sk-abcdefghijklmnopqrstuvwxyz1234567890";

vi.setConfig({
  testTimeout: phase4IntegrationTimeoutMs,
  hookTimeout: phase4IntegrationTimeoutMs
});

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-p4-e2e-")
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

const createRepo = async (branch = "feature/e2e"): Promise<string> => {
  const cwd = await createTempDir();

  await runGit(["init", "-b", branch], cwd);
  await runGit(
    ["config", "user.email", "coding-action-gate@example.test"],
    cwd
  );
  await runGit(["config", "user.name", "CodingActionGate Test"], cwd);
  await writeFile(path.join(cwd, "README.md"), "# Repo\n", "utf8");
  await writeFile(
    path.join(cwd, ".gitignore"),
    ".coding-action-gate/\n",
    "utf8"
  );
  await runGit(["add", "README.md", ".gitignore"], cwd);
  await runGit(["commit", "-m", "initial"], cwd);

  return cwd;
};

const writePhase4Policy = async (
  cwd: string,
  command = validationCommand
): Promise<string> => {
  const policyPath = path.join(cwd, "phase4-policy.yml");
  const template = await readFile(phase4PolicyPath, "utf8");

  await writeFile(
    policyPath,
    template.replaceAll(
      JSON.stringify(validationCommand),
      JSON.stringify(command)
    ),
    "utf8"
  );

  return policyPath;
};

const exec = async (
  command: string,
  cwd: string,
  options: {
    policy?: string;
    sessionId?: string;
    noAudit?: boolean;
    auditDir?: string;
  } = {}
) => {
  const result = await runExecCommand({
    command,
    cwd,
    policy: options.policy ?? phase4PolicyPath,
    sessionId: options.sessionId ?? "s1",
    noAudit: options.noAudit ?? true,
    ...(options.auditDir !== undefined ? { auditDir: options.auditDir } : {})
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.output;
};

const validate = async (
  cwd: string,
  command = validationCommand,
  options: {
    sessionId?: string;
    noAudit?: boolean;
  } = {}
) => {
  const result = await runValidateCommand({
    kindOrCommand: "other",
    command,
    cwd,
    policy: phase4PolicyPath,
    sessionId: options.sessionId ?? "s1",
    noAudit: options.noAudit ?? true
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.output;
};

const readJsonl = async (
  filePath: string
): Promise<Record<string, unknown>[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

const captureCli = async (args: string[]) => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array): boolean => {
        stderr += String(chunk);
        return true;
      }
    }
  });

  return { exitCode, stdout, stderr };
};

describe("Phase 4 end-to-end Git, validation, and landing flow", () => {
  it("Phase 4 example actions parse and demo policy loads", async () => {
    for (const fileName of [
      "git-status.json",
      "git-commit.json",
      "git-commit-no-verify.json",
      "git-push-main.json",
      "git-push-force.json",
      "vercel-deploy.json",
      "vercel-deploy-prod.json",
      "npm-publish.json",
      "terraform-destroy.json"
    ]) {
      const content = await readFile(
        path.join(phase4ActionDir, fileName),
        "utf8"
      );
      const parsed = parseActionJsonString(content);

      expect(parsed.ok, `${fileName} should parse`).toBe(true);
    }

    const policy = await loadPolicy({
      explicitPath: phase4PolicyPath,
      cwd: repoRoot
    });

    expect(policy.ok).toBe(true);
  });

  it("git status in a repo proceeds", async () => {
    const cwd = await createRepo();
    const output = await exec("git status", cwd);

    expect(output.dryRun).toBe(true);
    expect(output.executed).toBe(false);
    expect(output.decision.decision).toBe("PROCEED");
    expect(output.decision.signalSummary.gitCommandCategory).toBe("git_read");
  });

  it("git status outside a repo defers due unknown Git state", async () => {
    const cwd = await createTempDir();
    const output = await exec("git status", cwd);

    expect(output.decision.decision).toBe("DEFER");
    expect(output.decision.signalSummary.branchRisk).toBe("unknown");
  });

  it("feature branch commit before validation defers", async () => {
    const cwd = await createRepo("feature/e2e");
    const output = await exec("git commit -m test", cwd);

    expect(output.decision.decision).toBe("DEFER");
    expect(output.decision.signalSummary.validationStatus).toBe("not_run");
    expect(output.decision.signalSummary.landingActionType).toBe("commit");
  });

  it("passing validation allows feature branch commit", async () => {
    const cwd = await createRepo("feature/e2e");

    await validate(cwd);

    const output = await exec("git commit -m test", cwd);

    expect(output.decision.decision).toBe("PROCEED");
    expect(output.decision.signalSummary.validationStatus).toBe("passed");
  });

  it("failing validation blocks feature branch commit", async () => {
    const cwd = await createRepo("feature/e2e");
    const policy = await writePhase4Policy(cwd, failingValidationCommand);

    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: failingValidationCommand,
      cwd,
      policy,
      sessionId: "s1",
      noAudit: true
    });

    expect(result.ok).toBe(true);

    const output = await exec("git commit -m test", cwd, { policy });

    expect(output.decision.decision).toBe("BLOCK");
    expect(output.decision.signalSummary.validationStatus).toBe("failed");
  });

  it("main branch commit with missing validation defers before escalation", async () => {
    const cwd = await createRepo("main");
    const output = await exec("git commit -m test", cwd);

    expect(output.decision.decision).toBe("DEFER");
    expect(output.decision.signalSummary.validationStatus).toBe("not_run");
    expect(output.decision.signalSummary.landingRisk).toBe("high");
  });

  it("main branch commit after passing validation escalates", async () => {
    const cwd = await createRepo("main");

    await validate(cwd);

    const output = await exec("git commit -m test", cwd);

    expect(output.decision.decision).toBe("ESCALATE");
    expect(output.decision.signalSummary.directMainlineCommit).toBe(true);
  });

  it("hook bypass, force push, and protected push are blocked", async () => {
    const cwd = await createRepo("feature/e2e");

    const hookBypass = await exec("git commit --no-verify -m test", cwd);
    const forcePush = await exec("git push --force", cwd);
    const protectedPush = await exec("git push origin main", cwd);

    expect(hookBypass.decision.decision).toBe("BLOCK");
    expect(hookBypass.decision.signalSummary.hookBypass).toBe(true);
    expect(forcePush.decision.decision).toBe("BLOCK");
    expect(forcePush.decision.signalSummary.forcePush).toBe(true);
    expect(protectedPush.decision.decision).toBe("BLOCK");
    expect(protectedPush.decision.signalSummary.directMainlinePush).toBe(true);
  });

  it("feature branch push defers before validation and proceeds after validation", async () => {
    const cwd = await createRepo("feature/e2e");

    const before = await exec("git push origin feature/e2e", cwd);
    await validate(cwd);
    const after = await exec("git push origin feature/e2e", cwd);

    expect(before.decision.decision).toBe("DEFER");
    expect(before.decision.signalSummary.validationScope).toBe("before_push");
    expect(after.decision.decision).toBe("PROCEED");
    expect(after.decision.signalSummary.validationStatus).toBe("passed");
  });

  it("deploy, production deploy, publish, and terraform destroy are gated", async () => {
    const featureCwd = await createRepo("feature/e2e");
    const mainCwd = await createRepo("main");

    const deploy = await exec("vercel deploy", featureCwd);
    const prodDeploy = await exec("vercel deploy --prod", featureCwd);
    const publishFeature = await exec("npm publish", featureCwd);
    const publishMain = await exec("npm publish", mainCwd);
    const terraformDestroy = await exec("terraform destroy", featureCwd);

    expect(deploy.decision.decision).toBe("ESCALATE");
    expect(prodDeploy.decision.decision).toBe("BLOCK");
    expect(publishFeature.decision.decision).toBe("ESCALATE");
    expect(publishMain.decision.decision).toBe("BLOCK");
    expect(terraformDestroy.decision.decision).toBe("BLOCK");
  });

  it("validation output summary is redacted and validation JSONL omits raw output", async () => {
    const cwd = await createRepo("feature/e2e");
    const secretOutputCommand =
      "node -e \"console.log('sk-' + 'abcdefghijklmnopqrstuvwxyz1234567890')\"";
    const output = await validate(cwd, secretOutputCommand);

    expect(output.validation?.executed).toBe(true);

    if (output.validation?.executed !== true) {
      throw new Error("Expected validation command to execute.");
    }

    expect(output.validation.outputSummary).not.toContain(fakeSecret);
    expect(output.validation.outputHash).toEqual(expect.any(String));

    const validationPath = path.join(
      cwd,
      ".coding-action-gate/validation/session_s1.jsonl"
    );
    const records = await readJsonl(validationPath);
    const serialized = JSON.stringify(records);

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "passed",
          outputHash: expect.any(String)
        })
      ])
    );
    expect(serialized).not.toContain(fakeSecret);
    expect(serialized).not.toContain("stdout");
    expect(serialized).not.toContain("stderr");
  });

  it("audit evidence includes Git, validation, and landing detector results", async () => {
    const cwd = await createRepo("feature/e2e");
    const auditDir = path.join(cwd, "audit");

    await validate(cwd);

    const output = await exec("git commit -m test", cwd, {
      auditDir,
      noAudit: false
    });

    expect(output.audit.written).toBe(true);

    if (output.audit.written !== true) {
      throw new Error("Expected audit to be written.");
    }

    const records = await readJsonl(output.audit.path);
    const detectorResults = records[0]?.evidence as
      | { detectorResults?: Array<{ detectorId?: string }> }
      | undefined;
    const detectorIds = detectorResults?.detectorResults?.map(
      (entry) => entry.detectorId
    );

    expect(detectorIds).toEqual(
      expect.arrayContaining([
        "git-workflow",
        "validation-gate",
        "landing-gate"
      ])
    );
  });

  it("coding-action-gate exec remains dry-run and validate executes only after authorization", async () => {
    const cwd = await createRepo("feature/e2e");
    const execOutput = await exec("git push origin main", cwd);
    const blockedValidationPolicy = path.join(cwd, "block-validation.yml");

    await writeFile(
      blockedValidationPolicy,
      [
        "version: 0.1",
        "rules:",
        "  - id: block-validation",
        "    decision: BLOCK",
        "    when:",
        "      action_type: validation_command",
        "    reason: Validation blocked in e2e test."
      ].join("\n"),
      "utf8"
    );

    const validationOutput = await runValidateCommand({
      kindOrCommand: "other",
      command: validationCommand,
      cwd,
      policy: blockedValidationPolicy,
      noAudit: true
    });

    expect(execOutput.dryRun).toBe(true);
    expect(execOutput.executed).toBe(false);
    expect(validationOutput.ok).toBe(true);

    if (validationOutput.ok) {
      expect(validationOutput.output.validation).toEqual({
        executed: false,
        reason: "Validation command was not authorized."
      });
      expect(validationOutput.output.decision.decision).toBe("BLOCK");
    }
  });

  it("failed validate command exits 5 and CLI help includes validate options", async () => {
    const cwd = await createRepo("feature/e2e");
    const failed = await captureCli([
      "validate",
      "other",
      "--command",
      failingValidationCommand,
      "--cwd",
      cwd,
      "--policy",
      phase4PolicyPath,
      "--session-id",
      "s1",
      "--json",
      "--no-audit"
    ]);
    const help = await captureCli(["--help"]);

    expect(failed.exitCode).toBe(cliExitCodes.validationFailed);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: true,
      validation: {
        executed: true,
        status: "failed"
      }
    });
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("coding-action-gate validate <kind>");
    expect(help.stdout).toContain("--validation-dir <path>");
    expect(help.stdout).toContain("--timeout-ms <number>");
    expect(help.stdout).toContain("--max-output-bytes <number>");
  });
});
