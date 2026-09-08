import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/cli.js";
import { runDecideCommand } from "../../src/cli/commands/decideCommand.js";
import { runExecCommand } from "../../src/cli/commands/execCommand.js";
import {
  buildReadAction,
  runReadCommand
} from "../../src/cli/commands/readCommand.js";
import { formatJsonOutput } from "../../src/cli/cliOutput.js";
import { resolveObservationLogPath } from "../../src/observations/observationPaths.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };

const tempDirs: string[] = [];
const fakeToken = "sk-abcdefghijklmnopqrstuvwxyz1234567890";
const envSentinel = "ENV_SENTINEL_SHOULD_NOT_LEAK";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-read-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
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

  return {
    exitCode,
    stdout,
    stderr
  };
};

describe("read command", () => {
  it("constructs a read_file action", () => {
    expect(
      buildReadAction("src/file.ts", { metadataOnly: true })
    ).toMatchObject({
      type: "read_file",
      proposedBy: "agent",
      origin: {
        toolId: "coding-action-gate-cli"
      },
      targetPath: "src/file.ts",
      raw: {
        source: "coding-action-gate read",
        targetPath: "src/file.ts",
        metadataOnly: true
      }
    });
  });

  it("reads a safe file, returns PROCEED, and includes content", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello world", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("PROCEED");
      expect(result.output.read).toMatchObject({
        targetPath: "hello.txt",
        content: "hello world",
        sizeBytes: 11,
        metadataOnly: false
      });
    }
  });

  it("records a full observation for a safe read", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok && result.output.observation?.recorded) {
      const records = await readJsonl(result.output.observation.path ?? "");

      expect(records[0]).toMatchObject({
        path: "hello.txt",
        source: "cli_read",
        exists: true,
        sizeBytes: 5
      });
    }
  });

  it("writes audit for a safe read by default", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit.written).toBe(true);
    }
  });

  it("metadata-only read does not print content and records metadataOnly", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hidden", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true,
      metadataOnly: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.read).toMatchObject({
        content: null,
        metadataOnly: true,
        sizeBytes: 6
      });
      expect(result.output.observation).toMatchObject({
        recorded: true,
        metadataOnly: true
      });

      const records = await readJsonl(result.output.observation?.path ?? "");

      expect(records[0]).toMatchObject({
        metadataOnly: true,
        contentHash: "metadata-only"
      });
    }
  });

  it("blocks .env reads by default without printing content or recording observation", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, ".env"), envSentinel, "utf8");

    const result = await runReadCommand({
      targetPath: ".env",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(JSON.stringify(result.output)).not.toContain(envSentinel);
      expect(result.output.read?.content).toBeNull();
      expect(result.output.observation?.recorded).toBe(false);
    }

    expect(await exists(resolveObservationLogPath({ cwd }))).toBe(false);
  });

  it("metadata-only .env read remains blocked and records no observation", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, ".env"), envSentinel, "utf8");

    const result = await runReadCommand({
      targetPath: ".env",
      cwd,
      noAudit: true,
      metadataOnly: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.decision.decision).toBe("BLOCK");
      expect(result.output.read?.content).toBeNull();
      expect(result.output.observation?.recorded).toBe(false);
    }
  });

  it("returns structured error for missing files", async () => {
    const cwd = await createTempDir();
    const result = await runReadCommand({
      targetPath: "missing.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("CLI_READ_FILE_NOT_FOUND");
    }
  });

  it("returns structured error when file exceeds maxBytes", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "large.txt"), "123456", "utf8");

    const result = await runReadCommand({
      targetPath: "large.txt",
      cwd,
      noAudit: true,
      maxBytes: 3
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("CLI_READ_FILE_TOO_LARGE");
    }

    expect(await exists(resolveObservationLogPath({ cwd }))).toBe(false);
  });

  it("respects --session-id in the observation store", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true,
      sessionId: "test-session"
    });

    expect(
      await exists(
        resolveObservationLogPath({ cwd, sessionId: "test-session" })
      )
    ).toBe(true);
  });

  it("respects --observation-dir", async () => {
    const cwd = await createTempDir();
    const observationDir = path.join(cwd, "custom-observations");

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true,
      observationDir
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.observation?.path?.startsWith(observationDir)).toBe(
        true
      );
    }
  });

  it("--no-audit skips audit writing", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.output.audit).toEqual({
        written: false
      });
    }
  });

  it("JSON output includes content for safe reads", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "hello.txt"), "hello", "utf8");

    const result = await runReadCommand({
      targetPath: "hello.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const output = JSON.parse(formatJsonOutput(result.output)) as {
        read: { content: string };
      };

      expect(output.read.content).toBe("hello");
    }
  });

  it("JSON output redacts read content containing secret-like patterns", async () => {
    const cwd = await createTempDir();

    await writeFile(path.join(cwd, "note.txt"), fakeToken, "utf8");

    const result = await runReadCommand({
      targetPath: "note.txt",
      cwd,
      noAudit: true
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      const output = formatJsonOutput(result.output);

      expect(output).not.toContain(fakeToken);
      expect(output).toContain("[REDACTED]");
    }
  });

  it("read help output is available", async () => {
    const result = await captureCli(["read", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("coding-action-gate read <path>");
  });

  it("does not alter decide or exec behavior", async () => {
    const cwd = await createTempDir();
    const actionPath = path.join(cwd, "action.json");

    await writeFile(path.join(cwd, "README.md"), "hello", "utf8");
    await writeFile(actionPath, JSON.stringify(readFileFixture), "utf8");

    const decideResult = await runDecideCommand({
      actionFile: actionPath,
      cwd,
      noAudit: true
    });
    const execResult = await runExecCommand({
      command: "git status",
      cwd,
      noAudit: true
    });

    expect(decideResult.ok).toBe(true);
    expect(execResult.ok).toBe(true);

    if (decideResult.ok && execResult.ok) {
      expect(decideResult.output.read).toBeUndefined();
      expect(execResult.output.read).toBeUndefined();
    }
  });
});
