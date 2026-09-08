import { ZodError } from "zod";
import {
  codingActionGateActionSchema,
  type CodingActionGateAction
} from "../domain/actions.js";
import {
  createActionParseError,
  type ParseAndNormalizeActionResult,
  type ParsedActionResult
} from "./actionErrors.js";
import {
  normalizeAction,
  type NormalizeActionOptions
} from "./normalizeAction.js";

export const parseAction = (input: unknown): ParsedActionResult => {
  const result = codingActionGateActionSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      action: result.data
    };
  }

  return {
    ok: false,
    error: createActionParseError(
      "ACTION_VALIDATION_ERROR",
      "Action failed schema validation.",
      result.error instanceof ZodError ? result.error.issues : result.error
    )
  };
};

export const parseActionJsonString = (json: string): ParsedActionResult => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: createActionParseError(
        "ACTION_INVALID_JSON",
        "Action JSON could not be parsed.",
        error
      )
    };
  }

  return parseAction(parsed);
};

export const parseAndNormalizeAction = (
  input: unknown,
  options: NormalizeActionOptions = {}
): ParseAndNormalizeActionResult => {
  const parsed = parseAction(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actionWithRaw: CodingActionGateAction =
    parsed.action.raw === undefined
      ? {
          ...parsed.action,
          raw: input
        }
      : parsed.action;

  return normalizeAction(actionWithRaw, options);
};
