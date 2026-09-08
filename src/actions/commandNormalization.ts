import path from "node:path";
import { z } from "zod";
import type { StepHarborAction } from "../domain/actions.js";

export interface CommandNormalizationOptions {
  cwd?: string;
}

export interface NormalizedActionCommand {
  command: string;
  commandTokens: string[];
  commandExecutable?: string;
  cwd?: string;
  absoluteCwd?: string;
  isGitLikeCommand: boolean;
  isValidationLikeCommand: boolean;
}

export const normalizedActionCommandSchema = z.object({
  command: z.string(),
  commandTokens: z.array(z.string()),
  commandExecutable: z.string().optional(),
  cwd: z.string().optional(),
  absoluteCwd: z.string().optional(),
  isGitLikeCommand: z.boolean(),
  isValidationLikeCommand: z.boolean()
});

export const tokenizeCommand = (command: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (const character of command) {
    if ((character === "'" || character === '"') && quote === null) {
      quote = character;
      continue;
    }

    if (character === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(character) && quote === null) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }

      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

const isGitLike = (tokens: string[]): boolean => tokens[0] === "git";

const validationExecutables = new Set(["npm", "pnpm", "yarn"]);
const validationDirectScripts = new Set(["test", "lint", "typecheck", "build"]);

const isValidationLike = (
  actionType: StepHarborAction["type"],
  tokens: string[]
): boolean => {
  if (actionType === "validation_command") {
    return true;
  }

  const executable = tokens[0];
  const firstArg = tokens[1];
  const secondArg = tokens[2];

  if (executable === undefined || !validationExecutables.has(executable)) {
    return false;
  }

  if (firstArg !== undefined && validationDirectScripts.has(firstArg)) {
    return true;
  }

  return firstArg === "run" && secondArg !== undefined
    ? validationDirectScripts.has(secondArg)
    : false;
};

export const normalizeCommandForAction = (
  action: Extract<
    StepHarborAction,
    { type: "run_command" | "git_command" | "validation_command" }
  >,
  options: CommandNormalizationOptions = {}
): NormalizedActionCommand => {
  const command = action.command.trim();
  const commandTokens = tokenizeCommand(command);
  const commandExecutable = commandTokens[0];
  const cwd = action.cwd ?? options.cwd;
  const normalized: NormalizedActionCommand = {
    command,
    commandTokens,
    isGitLikeCommand: action.type === "git_command" || isGitLike(commandTokens),
    isValidationLikeCommand: isValidationLike(action.type, commandTokens)
  };

  if (commandExecutable !== undefined) {
    normalized.commandExecutable = commandExecutable;
  }

  if (cwd !== undefined) {
    normalized.cwd = cwd;
    normalized.absoluteCwd = path.resolve(options.cwd ?? process.cwd(), cwd);
  }

  return normalized;
};
