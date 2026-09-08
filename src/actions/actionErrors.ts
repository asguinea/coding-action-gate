import type { CodingActionGateAction } from "../domain/actions.js";

export type ActionParseErrorCode =
  | "ACTION_INVALID_JSON"
  | "ACTION_VALIDATION_ERROR";

export interface ActionParseError {
  code: ActionParseErrorCode;
  message: string;
  details?: unknown;
}

export type ActionNormalizationErrorCode =
  | "ACTION_PATH_OUTSIDE_WORKSPACE"
  | "ACTION_PATH_NORMALIZATION_ERROR"
  | "ACTION_COMMAND_NORMALIZATION_ERROR";

export interface ActionNormalizationError {
  code: ActionNormalizationErrorCode;
  message: string;
  details?: unknown;
}

export interface NormalizedActionMetadata {
  actionType: CodingActionGateAction["type"];
  targetPath?: string;
  targetPaths?: string[];
  absoluteTargetPath?: string;
  absoluteTargetPaths?: string[];
  relativeTargetPath?: string;
  relativeTargetPaths?: string[];
  isInsideWorkspace?: boolean;
  command?: string;
  commandTokens?: string[];
  commandExecutable?: string;
  cwd?: string;
  absoluteCwd?: string;
  isGitLikeCommand?: boolean;
  isValidationLikeCommand?: boolean;
}

export type NormalizedCodingActionGateAction = CodingActionGateAction & {
  raw: unknown;
  normalized: NormalizedActionMetadata;
};

export type ParsedActionResult =
  | {
      ok: true;
      action: CodingActionGateAction;
    }
  | {
      ok: false;
      error: ActionParseError;
    };

export type NormalizedActionResult =
  | {
      ok: true;
      action: NormalizedCodingActionGateAction;
    }
  | {
      ok: false;
      error: ActionNormalizationError;
    };

export type ParseAndNormalizeActionResult =
  | NormalizedActionResult
  | {
      ok: false;
      error: ActionParseError;
    };

export const createActionParseError = (
  code: ActionParseErrorCode,
  message: string,
  details?: unknown
): ActionParseError => {
  const error: ActionParseError = {
    code,
    message
  };

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};

export const createActionNormalizationError = (
  code: ActionNormalizationErrorCode,
  message: string,
  details?: unknown
): ActionNormalizationError => {
  const error: ActionNormalizationError = {
    code,
    message
  };

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};
