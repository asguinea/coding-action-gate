import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAction } from "../../src/actions/normalizeAction.js";
import { parseAndNormalizeAction } from "../../src/actions/parseAction.js";
import {
  readFileActionSchema,
  runCommandActionSchema
} from "../../src/domain/actions.js";
import readFileFixture from "../../src/fixtures/actions/read-file.json" with { type: "json" };
import runCommandFixture from "../../src/fixtures/actions/run-command.json" with { type: "json" };

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "coding-action-gate-action-")
  );
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true }))
  );
});

describe("normalizeAction", () => {
  const readFileAction = readFileActionSchema.parse(readFileFixture);
  const runCommandAction = runCommandActionSchema.parse(runCommandFixture);

  it("normalizes relative targetPath", async () => {
    const cwd = await createTempDir();
    const result = normalizeAction(
      {
        ...readFileAction,
        targetPath: "src/index.ts"
      },
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.type).toBe("read_file");
      expect(result.action.normalized.relativeTargetPath).toBe("src/index.ts");
    }
  });

  it("preserves original targetPath", async () => {
    const cwd = await createTempDir();
    const originalTargetPath = "./src/../src/index.ts";
    const result = normalizeAction(
      {
        ...readFileAction,
        targetPath: originalTargetPath
      },
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.type).toBe("read_file");

      if (result.action.type === "read_file") {
        expect(result.action.targetPath).toBe(originalTargetPath);
      }

      expect(result.action.normalized.targetPath).toBe(originalTargetPath);
    }
  });

  it("adds absoluteTargetPath and relativeTargetPath", async () => {
    const cwd = await createTempDir();
    const result = normalizeAction(
      {
        ...readFileAction,
        targetPath: "./src/../src/index.ts"
      },
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.normalized.absoluteTargetPath).toBe(
        path.join(cwd, "src/index.ts")
      );
      expect(result.action.normalized.relativeTargetPath).toBe("src/index.ts");
    }
  });

  it("detects isInsideWorkspace when workspaceRoots are provided", async () => {
    const cwd = await createTempDir();
    const result = normalizeAction(
      {
        ...readFileAction,
        targetPath: "src/index.ts"
      },
      {
        cwd,
        workspaceRoots: ["."]
      }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.normalized.isInsideWorkspace).toBe(true);
    }
  });

  it("normalizes command metadata on command actions", async () => {
    const cwd = await createTempDir();
    const result = normalizeAction(
      {
        ...runCommandAction,
        command: "  git status --short  "
      },
      { cwd }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.type).toBe("run_command");

      if (result.action.type === "run_command") {
        expect(result.action.command).toBe("  git status --short  ");
      }

      expect(result.action.normalized.command).toBe("git status --short");
      expect(result.action.normalized.commandExecutable).toBe("git");
      expect(result.action.normalized.commandTokens).toEqual([
        "git",
        "status",
        "--short"
      ]);
      expect(result.action.normalized.isGitLikeCommand).toBe(true);
    }
  });
});

describe("parseAndNormalizeAction", () => {
  it("preserves raw input", async () => {
    const cwd = await createTempDir();
    const input = {
      ...readFileFixture,
      raw: undefined
    };

    const result = parseAndNormalizeAction(input, { cwd });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.action.raw).toBe(input);
    }
  });
});
