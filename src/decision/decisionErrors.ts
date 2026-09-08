import type { DecisionOutput } from "../domain/decisions.js";

export type StepHarborDecision = DecisionOutput;

export type DecisionEngineErrorCode =
  | "DECISION_INVALID_INPUT"
  | "DECISION_RULE_EVALUATION_ERROR";

export interface DecisionEngineError {
  code: DecisionEngineErrorCode;
  message: string;
  details?: unknown;
}

export type DecisionEngineResult =
  | {
      ok: true;
      decision: StepHarborDecision;
    }
  | {
      ok: false;
      error: DecisionEngineError;
    };

export const createDecisionEngineError = (
  code: DecisionEngineErrorCode,
  message: string,
  details?: unknown
): DecisionEngineError => {
  const error: DecisionEngineError = {
    code,
    message
  };

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};
