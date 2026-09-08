import {
  stepHarborSignalsSchema,
  type StepHarborSignals
} from "../domain/signals.js";

const assignDefined = (
  target: Record<string, unknown>,
  source: StepHarborSignals | undefined
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
  providedSignals: StepHarborSignals | undefined,
  computedSignals: StepHarborSignals | undefined
): StepHarborSignals => {
  const merged: Record<string, unknown> = {};

  assignDefined(merged, computedSignals);
  assignDefined(merged, providedSignals);

  return stepHarborSignalsSchema.parse(merged);
};
