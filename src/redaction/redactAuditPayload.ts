import type { StepHarborSignals } from "../domain/signals.js";
import { redactObject } from "./redactObject.js";
import type { RedactionOptions, RedactionResult } from "./redactionTypes.js";

export const shouldRedactForSignals = (
  signals: StepHarborSignals | undefined
): boolean =>
  signals?.secretTouch === "possible" ||
  signals?.secretTouch === "probable" ||
  signals?.secretTouch === "confirmed";

export const redactAuditPayload = <T>(
  input: T,
  signals?: StepHarborSignals,
  options: RedactionOptions = {}
): RedactionResult<T> => {
  void signals;

  return redactObject(input, options);
};
