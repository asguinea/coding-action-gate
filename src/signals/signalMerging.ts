import {
  codingActionGateSignalsSchema,
  type CodingActionGateSignals
} from "../domain/signals.js";

const assignDefined = (
  target: Record<string, unknown>,
  source: CodingActionGateSignals | undefined
): void => {
  if (source === undefined) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }
};

export const mergeSignals = (
  providedSignals: CodingActionGateSignals | undefined,
  computedSignals: CodingActionGateSignals | undefined
): CodingActionGateSignals => {
  const merged: Record<string, unknown> = {};

  assignDefined(merged, computedSignals);
  assignDefined(merged, providedSignals);

  return codingActionGateSignalsSchema.parse(merged);
};
