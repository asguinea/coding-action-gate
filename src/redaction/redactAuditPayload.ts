import type { CodingActionGateSignals } from "../domain/signals.js";
import { redactObject } from "./redactObject.js";
import type { RedactionOptions, RedactionResult } from "./redactionTypes.js";

export const shouldRedactForSignals = (
  signals: CodingActionGateSignals | undefined
): boolean =>
  signals?.secretTouch === "possible" ||
  signals?.secretTouch === "probable" ||
  signals?.secretTouch === "confirmed";

export const redactAuditPayload = <T>(
  input: T,
  signals?: CodingActionGateSignals,
  options: RedactionOptions = {}
): RedactionResult<T> => {
  void signals;

  return redactObject(input, options);
};
