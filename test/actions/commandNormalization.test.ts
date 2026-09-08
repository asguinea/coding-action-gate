import { describe, expect, it } from "vitest";
import { normalizeCommandForAction } from "../../src/actions/commandNormalization.js";
import { runCommandActionSchema } from "../../src/domain/actions.js";
import runCommandFixture from "../../src/fixtures/actions/run-command.json" with { type: "json" };

describe("normalizeCommandForAction", () => {
  const runCommandAction = runCommandActionSchema.parse(runCommandFixture);

  it("normalizes command whitespace", () => {
    const result = normalizeCommandForAction({
      ...runCommandAction,
      command: "  npm test  "
    });

    expect(result.command).toBe("npm test");
  });

  it("extracts commandExecutable", () => {
    const result = normalizeCommandForAction({
      ...runCommandAction,
      command: "pnpm lint"
    });

    expect(result.commandExecutable).toBe("pnpm");
  });

  it("extracts commandTokens", () => {
    const result = normalizeCommandForAction({
      ...runCommandAction,
      command: 'npm run "typecheck"'
    });

    expect(result.commandTokens).toEqual(["npm", "run", "typecheck"]);
  });

  it("detects git-like run_command", () => {
    const result = normalizeCommandForAction({
      ...runCommandAction,
      command: "git status --short"
    });

    expect(result.isGitLikeCommand).toBe(true);
  });

  it("detects validation-like commands", () => {
    const direct = normalizeCommandForAction({
      ...runCommandAction,
      command: "pnpm typecheck"
    });
    const npmRun = normalizeCommandForAction({
      ...runCommandAction,
      command: "npm run build"
    });

    expect(direct.isValidationLikeCommand).toBe(true);
    expect(npmRun.isValidationLikeCommand).toBe(true);
  });
});
