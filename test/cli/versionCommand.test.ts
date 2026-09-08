import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/cli.js";

const captureCli = async (
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
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

const packageVersion = async (): Promise<string> => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), "package.json"), "utf8")
  ) as { version: string };

  return packageJson.version;
};

describe("version command", () => {
  it("prints package version for --version", async () => {
    const version = await packageVersion();
    const result = await captureCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`CodingActionGate ${version}\n`);
  });

  it("prints equivalent output for version command", async () => {
    const version = await packageVersion();
    const flag = await captureCli(["--version"]);
    const command = await captureCli(["version"]);

    expect(command.exitCode).toBe(0);
    expect(command.stdout).toBe(`CodingActionGate ${version}\n`);
    expect(command.stdout).toBe(flag.stdout);
  });

  it("top-level help lists version and major commands", async () => {
    const result = await captureCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("coding-action-gate version");
    expect(result.stdout).toContain("coding-action-gate decide <actionFile>");
    expect(result.stdout).toContain("coding-action-gate ui [options]");
    expect(result.stdout).toContain("coding-action-gate doctor [options]");
    expect(result.stdout).toContain(
      "coding-action-gate analytics <summary|clear>"
    );
    expect(result.stdout).toContain(
      "coding-action-gate policy <show|validate|explain>"
    );
    expect(result.stdout).toContain("coding-action-gate help [topic]");
    expect(result.stdout).toContain("coding-action-gate help <topic>");
    expect(result.stdout).toContain("--version");
  });

  it("ui --help is available", async () => {
    const result = await captureCli(["ui", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("coding-action-gate ui [options]");
    expect(result.stdout).toContain("--no-ui-server");
  });
});
