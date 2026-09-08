import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";
import {
  buildValidationAction,
  runValidateCommand
} from "../../src/cli/commands/validateCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import { cliExitCodes } from "../../src/cli/exitCodes.js";
import { createValidationResultStore } from "../../src/validation/validationResultStore.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-validate-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const writePolicy = async (cwd: string, yaml: string): Promise<string> => {
  const policyPath = path.join(cwd, "policy.yml");

  await writeFile(policyPath, yaml, "utf8");

  return policyPath;
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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

const parseJson = (stdout: string): Record<string, unknown> =>
  JSON.parse(stdout) as Record<string, unknown>;

describe("validate command", () => {
  it("constructs a validation_command action", async () => {
    const cwd = await createTempDir();
    const action = buildValidationAction("npm test", "test", { cwd });

    expect(action).toMatchObject({
      type: "validation_command",
      proposedBy: "agent",
      origin: {
        toolId: "coding-action-gate-cli"
      },
      command: "npm test",
      cwd,
      validationKind: "test",
      raw: {
        source: "coding-action-gate validate",
        command: "npm test",
        kind: "test"
      }
    });
  });

  it("runs an explicit command only after PROCEED authorization", async () => {
    const cwd = await createTempDir();
    const marker = path.join(cwd, "marker.txt");
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: `node -e "require('fs').writeFileSync('${marker}', 'ok')"`,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);
    expect(await exists(marker)).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("PROCEED");
      expect(result.output.validation).toMatchObject({
        executed: true,
        status: "passed"
      });
    }
  });

  it("does not execute when authorization blocks", async () => {
    const cwd = await createTempDir();
    const marker = path.join(cwd, "blocked.txt");
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: block-validation",
        "    decision: BLOCK",
        "    when:",
        "      action_type: validation_command",
        "    reason: Validation blocked in test."
      ].join("\n")
    );
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: `node -e "require('fs').writeFileSync('${marker}', 'bad')"`,
      cwd,
      policy: policyPath,
      noAudit: true
    });

    expect(result.ok).toBe(true);
    expect(await exists(marker)).toBe(false);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.validation).toEqual({
        executed: false,
        reason: "Validation command was not authorized."
      });
    }
  });

  it("selects a matching policy command for test kind", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "validation:",
        "  beforeCommit:",
        "    required: true",
        "    commands:",
        "      - node -e \"console.log('test ok')\""
      ].join("\n")
    );
    const result = await runValidateCommand({
      kindOrCommand: "test",
      cwd,
      policy: policyPath,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.validation?.executed) {
      expect(result.output.validation.command).toContain("test");
      expect(result.output.validation.status).toBe("passed");
    }
  });

  it("selects a matching policy command for lint kind", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "validation:",
        "  beforePush:",
        "    required: true",
        "    commands:",
        "      - node -e \"console.log('lint ok')\""
      ].join("\n")
    );
    const result = await runValidateCommand({
      kindOrCommand: "lint",
      cwd,
      policy: policyPath,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.validation?.executed) {
      expect(result.output.validation.command).toContain("lint");
      expect(result.output.validation.status).toBe("passed");
    }
  });

  it("returns command-not-found for missing configured kind", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "security",
      cwd,
      noAudit: true
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CLI_VALIDATION_COMMAND_NOT_FOUND"
      }
    });
  });

  it("records a passed validation result", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(0)"',
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    const listed = await createValidationResultStore({
      cwd
    }).listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.at(-1)).toMatchObject({
        status: "passed",
        exitCode: 0,
        source: "cli_validate"
      });
    }
  });

  it("records a failed validation result", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(1)"',
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    const listed = await createValidationResultStore({
      cwd
    }).listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.at(-1)).toMatchObject({
        status: "failed",
        exitCode: 1
      });
    }
  });

  it("summarizes and hashes validation output", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: "node -e \"console.log('ok')\"",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.validation?.executed) {
      expect(result.output.validation.outputSummary).toContain("ok");
      expect(result.output.validation.outputHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("redacts output summary", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command:
        "node -e \"console.log('sk-abcdefghijklmnopqrstuvwxyz1234567890')\"",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.validation?.executed) {
      expect(result.output.validation.outputSummary).not.toContain(
        "sk-abcdefghijklmnopqrstuvwxyz1234567890"
      );
    }
  });

  it("records validation results with session id", async () => {
    const cwd = await createTempDir();

    await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(0)"',
      cwd,
      sessionId: "s1",
      noAudit: true
    });

    const listed = await createValidationResultStore({
      cwd,
      sessionId: "s1"
    }).listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value.at(-1)?.sessionId).toBe("s1");
    }
  });

  it("respects validationDir", async () => {
    const cwd = await createTempDir();
    const validationDir = path.join(cwd, "custom-validation");

    await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(0)"',
      cwd,
      validationDir,
      noAudit: true
    });

    const listed = await createValidationResultStore({
      cwd,
      validationDir
    }).listValidationResults();

    expect(listed.ok).toBe(true);

    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
    }
  });

  it("audit evidence includes validationRun", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(0)"',
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.audit.written) {
      const records = await readFile(result.output.audit.path, "utf8");
      const auditRecord = JSON.parse(records.trim()) as {
        evidence?: { validationRun?: unknown };
      };

      expect(auditRecord.evidence?.validationRun).toMatchObject({
        kind: "other",
        command: 'node -e "process.exit(0)"',
        status: "passed",
        exitCode: 0,
        validationRecordId: expect.any(String)
      });
    }
  });

  it("--no-audit skips audit", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "process.exit(0)"',
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit.written).toBe(false);
    }
  });

  it("JSON output includes validation executed true", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "validate",
      "other",
      "--command",
      'node -e "process.exit(0)"',
      "--cwd",
      cwd,
      "--json",
      "--no-audit"
    ]);
    const output = parseJson(result.stdout);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(output["validation"]).toMatchObject({
      executed: true,
      status: "passed"
    });
  });

  it("JSON output includes validation executed false when unauthorized", async () => {
    const cwd = await createTempDir();
    const policyPath = await writePolicy(
      cwd,
      [
        "version: 0.1",
        "rules:",
        "  - id: block-validation",
        "    decision: BLOCK",
        "    when:",
        "      action_type: validation_command",
        "    reason: Validation blocked in test."
      ].join("\n")
    );
    const result = await captureCli([
      "validate",
      "other",
      "--command",
      'node -e "process.exit(0)"',
      "--cwd",
      cwd,
      "--policy",
      policyPath,
      "--json",
      "--no-audit"
    ]);
    const output = parseJson(result.stdout);

    expect(result.exitCode).toBe(cliExitCodes.block);
    expect(output["validation"]).toEqual({
      executed: false,
      reason: "Validation command was not authorized."
    });
  });

  it("human output shows status and record id", async () => {
    const cwd = await createTempDir();
    const result = await captureCli([
      "validate",
      "other",
      "--command",
      'node -e "process.exit(0)"',
      "--cwd",
      cwd,
      "--no-audit"
    ]);

    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(result.stdout).toContain("Validation status: passed");
    expect(result.stdout).toContain("Result recorded: val_");
  });

  it("timeout returns a deterministic runtime error", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: 'node -e "setTimeout(() => {}, 1000)"',
      cwd,
      timeoutMs: 20,
      noAudit: true
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CLI_VALIDATION_TIMEOUT"
      }
    });
  });

  it("maxOutputBytes truncates summary", async () => {
    const cwd = await createTempDir();
    const result = await runValidateCommand({
      kindOrCommand: "other",
      command: "node -e \"console.log('abcdefghijklmnopqrstuvwxyz')\"",
      cwd,
      maxOutputBytes: 8,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.validation?.executed) {
      expect(result.output.validation.outputSummary.length).toBeLessThanOrEqual(
        8
      );
      expect(result.output.validation.outputSummary).not.toContain("z");
    }
  });

  it("does not alter exec dry-run behavior", async () => {
    const cwd = await createTempDir();
    const marker = path.join(cwd, "exec-marker.txt");
    const result = await runExecCommand({
      command: `node -e "require('fs').writeFileSync('${marker}', 'bad')"`,
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);
    expect(await exists(marker)).toBe(false);

    if (result.ok) {
      expect(result.output.executed).toBe(false);
    }
  });
});
