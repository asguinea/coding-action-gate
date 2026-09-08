import {
  codingActionGateSignalsSchema,
  type CodingActionGateSignals
} from "../domain/signals.js";
import {
  defaultSafetySignalDetectors,
  type SafetySignalDetector,
  type SafetySignalDetectorResult
} from "./detectors/index.js";
import {
  createSafetySignalError,
  type SafetySignalError
} from "./signalErrors.js";
import type { SafetySignalInput } from "./signalContext.js";
import { mergeSignals } from "./signalMerging.js";

export type SafetySignalResult =
  | {
      ok: true;
      signals: CodingActionGateSignals;
      computedSignals: CodingActionGateSignals;
      providedSignals?: CodingActionGateSignals;
      detectorResults: SafetySignalDetectorResult[];
    }
  | {
      ok: false;
      error: SafetySignalError;
    };

export interface ComputeSafetySignalOptions {
  detectors?: SafetySignalDetector[];
}

const mergeComputedSignals = (
  current: CodingActionGateSignals,
  next: CodingActionGateSignals
): CodingActionGateSignals => mergeSignals(next, current);

export const computeSafetySignals = async (
  input: SafetySignalInput,
  options: ComputeSafetySignalOptions = {}
): Promise<SafetySignalResult> => {
  try {
    const detectors = options.detectors ?? defaultSafetySignalDetectors;
    let computedSignals: CodingActionGateSignals = {};
    const detectorResults: SafetySignalDetectorResult[] = [];

    for (const detector of detectors) {
      try {
        const detectorSignals = codingActionGateSignalsSchema.parse(
          await detector.compute(input)
        );

        computedSignals = mergeComputedSignals(
          computedSignals,
          detectorSignals
        );
        detectorResults.push({
          detectorId: detector.id,
          ok: true,
          signals: detectorSignals
        });
      } catch (error) {
        const signalError = createSafetySignalError(
          "SIGNAL_DETECTOR_ERROR",
          `Safety signal detector failed: ${detector.id}`,
          {
            detectorId: detector.id,
            details: error
          }
        );

        detectorResults.push({
          detectorId: detector.id,
          ok: false,
          error: signalError
        });

        return {
          ok: false,
          error: signalError
        };
      }
    }

    return {
      ok: true,
      signals: mergeSignals(input.providedSignals, computedSignals),
      computedSignals,
      ...(input.providedSignals !== undefined
        ? {
            providedSignals: codingActionGateSignalsSchema.parse(
              input.providedSignals
            )
          }
        : {}),
      detectorResults
    };
  } catch (error) {
    return {
      ok: false,
      error: createSafetySignalError(
        "SIGNAL_COMPUTATION_ERROR",
        "Safety signal computation failed.",
        { details: error }
      )
    };
  }
};
