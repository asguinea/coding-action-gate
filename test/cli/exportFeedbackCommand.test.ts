import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";
import { resolveAuditLogPath } from "../../src/audit/auditPaths.js";

const tempDirs: string[] = [];
const now = "2026-05-06T12:00:00.000Z";

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "stepharbor-feedback-cli-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

const runCliCaptured = async (
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array) => {
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

const writeAuditRecords = async (cwd: string, count: number): Promise<void> => {
  const filePath = resolveAuditLogPath({ cwd });
  await mkdir(path.dirname(filePath), { recursive: true });
  const records = Array.from({ length: count }, (_, index) => ({
    decisionId: `decision-${index}`,
    timestamp: now,
    sessionId: "default",
    action: {
      id: `action-${index}`,
      timestamp: now,
      proposedBy: "agent",
      type: "run_command",
      command: "git status"
    },
    decision: index % 2 === 0 ? "PROCEED" : "DEFER",
    reason: "test decision",
    policyTrace: [
      {
        ruleId: "rule-test",
        matched: true,
        effect: index % 2 === 0 ? "PROCEED" : "DEFER"
      }
    ]
  }));

  await writeFile(
    filePath,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8"
  );
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("export-feedback command", () => {
  it("prints human output and creates the export file", async () => {
    const cwd = await createTempDir();
    await writeAuditRecords(cwd, 1);
    const out = path.join(await createTempDir(), "feedback.json");

    const result = await runCliCaptured([
      "export-feedback",
      "--cwd",
      cwd,
      "--out",
      out
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("StepHarbor feedback export created:");
    expect(result.stdout).toContain(out);
    await expect(readFile(out, "utf8")).resolves.toContain('"redacted": true');
  });

  it("prints JSON output with ok, path, and summary", async () => {
    const cwd = await createTempDir();
    await writeAuditRecords(cwd, 1);
    const out = path.join(await createTempDir(), "feedback.json");

    const result = await runCliCaptured([
      "export-feedback",
      "--cwd",
      cwd,
      "--out",
      out,
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      path: string;
      summary: { auditRecords: number };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.path).toBe(out);
    expect(parsed.summary.auditRecords).toBe(1);
  });

  it("caps audit records using --limit", async () => {
    const cwd = await createTempDir();
    await writeAuditRecords(cwd, 3);
    const out = path.join(await createTempDir(), "feedback.json");

    const result = await runCliCaptured([
      "export-feedback",
      "--cwd",
      cwd,
      "--out",
      out,
      "--limit",
      "2",
      "--json"
    ]);
    const parsed = JSON.parse(result.stdout) as {
      summary: { auditRecords: number };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.summary.auditRecords).toBe(2);
  });

  it("fails when the output file exists", async () => {
    const cwd = await createTempDir();
    await writeAuditRecords(cwd, 1);
    const out = path.join(await createTempDir(), "feedback.json");
    await writeFile(out, "exists", "utf8");

    const result = await runCliCaptured([
      "export-feedback",
      "--cwd",
      cwd,
      "--out",
      out
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CLI_FEEDBACK_OUTPUT_EXISTS");
  });

  it("export-feedback --help includes key options", async () => {
    const result = await runCliCaptured(["export-feedback", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("stepharbor export-feedback [options]");
    expect(result.stdout).toContain("--out <path>");
    expect(result.stdout).toContain("--limit <number>");
  });
});
