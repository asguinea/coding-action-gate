import { z } from "zod";
import type { StepHarborAction } from "../domain/actions.js";
import {
  createActionNormalizationError,
  type NormalizedActionMetadata,
  type NormalizedActionResult
} from "./actionErrors.js";
import {
  normalizeCommandForAction,
  normalizedActionCommandSchema
} from "./commandNormalization.js";
import {
  normalizePathForAction,
  normalizedActionPathSchema,
  type PathNormalizationOptions
} from "./pathNormalization.js";

export type NormalizeActionOptions = PathNormalizationOptions;

export const normalizedActionMetadataSchema = z.object({
  actionType: z.enum([
    "read_file",
    "write_file",
    "edit_file",
    "delete_file",
    "run_command",
    "git_command",
    "validation_command"
  ]),
  targetPath: z.string().optional(),
  targetPaths: z.array(z.string()).optional(),
  absoluteTargetPath: z.string().optional(),
  absoluteTargetPaths: z.array(z.string()).optional(),
  relativeTargetPath: z.string().optional(),
  relativeTargetPaths: z.array(z.string()).optional(),
  isInsideWorkspace: z.boolean().optional(),
  command: z.string().optional(),
  commandTokens: z.array(z.string()).optional(),
  commandExecutable: z.string().optional(),
  cwd: z.string().optional(),
  absoluteCwd: z.string().optional(),
  isGitLikeCommand: z.boolean().optional(),
  isValidationLikeCommand: z.boolean().optional()
});

export const normalizedStepHarborActionSchema = z
  .object({
    raw: z.unknown(),
    normalized: normalizedActionMetadataSchema
  })
  .passthrough();

const fileActionTypes = new Set<StepHarborAction["type"]>([
  "read_file",
  "write_file",
  "edit_file",
  "delete_file"
]);

const commandActionTypes = new Set<StepHarborAction["type"]>([
  "run_command",
  "git_command",
  "validation_command"
]);

const isFileAction = (
  action: StepHarborAction
): action is Extract<
  StepHarborAction,
  { type: "read_file" | "write_file" | "edit_file" | "delete_file" }
> => fileActionTypes.has(action.type);

const isCommandAction = (
  action: StepHarborAction
): action is Extract<
  StepHarborAction,
  { type: "run_command" | "git_command" | "validation_command" }
> => commandActionTypes.has(action.type);

export const normalizeAction = (
  action: StepHarborAction,
  options: NormalizeActionOptions = {}
): NormalizedActionResult => {
  const normalized: NormalizedActionMetadata = {
    actionType: action.type
  };

  if (isFileAction(action)) {
    try {
      const pathMetadata = normalizePathForAction(action.targetPath, options);
      const parsedPathMetadata = normalizedActionPathSchema.parse(pathMetadata);

      normalized.targetPath = parsedPathMetadata.targetPath;
      normalized.absoluteTargetPath = parsedPathMetadata.absoluteTargetPath;
      normalized.relativeTargetPath = parsedPathMetadata.relativeTargetPath;

      if (parsedPathMetadata.isInsideWorkspace !== undefined) {
        normalized.isInsideWorkspace = parsedPathMetadata.isInsideWorkspace;
      }
    } catch (error) {
      return {
        ok: false,
        error: createActionNormalizationError(
          "ACTION_PATH_NORMALIZATION_ERROR",
          "Action target path could not be normalized.",
          error
        )
      };
    }
  }

  if (isCommandAction(action)) {
    try {
      const commandMetadata = normalizeCommandForAction(action, options);
      const parsedCommandMetadata =
        normalizedActionCommandSchema.parse(commandMetadata);

      normalized.command = parsedCommandMetadata.command;
      normalized.commandTokens = parsedCommandMetadata.commandTokens;
      normalized.isGitLikeCommand = parsedCommandMetadata.isGitLikeCommand;
      normalized.isValidationLikeCommand =
        parsedCommandMetadata.isValidationLikeCommand;

      if (parsedCommandMetadata.commandExecutable !== undefined) {
        normalized.commandExecutable = parsedCommandMetadata.commandExecutable;
      }

      if (parsedCommandMetadata.cwd !== undefined) {
        normalized.cwd = parsedCommandMetadata.cwd;
      }

      if (parsedCommandMetadata.absoluteCwd !== undefined) {
        normalized.absoluteCwd = parsedCommandMetadata.absoluteCwd;
      }
    } catch (error) {
      return {
        ok: false,
        error: createActionNormalizationError(
          "ACTION_COMMAND_NORMALIZATION_ERROR",
          "Action command could not be normalized.",
          error
        )
      };
    }
  }

  const normalizedAction = {
    ...action,
    raw: action.raw ?? action,
    normalized
  };

  normalizedStepHarborActionSchema.parse(normalizedAction);

  return {
    ok: true,
    action: normalizedAction
  };
};

export type {
  ActionNormalizationError,
  NormalizedActionMetadata,
  NormalizedActionResult,
  NormalizedStepHarborAction
} from "./actionErrors.js";
