import {
  stepHarborSignalsSchema,
  type StepHarborSignals
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
      signals: StepHarborSignals;
      computedSignals: StepHarborSignals;
      providedSignals?: StepHarborSignals;
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
  current: StepHarborSignals,
  next: StepHarborSignals
): StepHarborSignals => mergeSignals(next, current);

export const computeSafetySignals = async (
  input: SafetySignalInput,
  options: ComputeSafetySignalOptions = {}
): Promise<SafetySignalResult> => {
  try {
    const detectors = options.detectors ?? defaultSafetySignalDetectors;
    let computedSignals: StepHarborSignals = {};
    const detectorResults: SafetySignalDetectorResult[] = [];

    for (const detector of detectors) {
      try {
        const detectorSignals = stepHarborSignalsSchema.parse(
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
            providedSignals: stepHarborSignalsSchema.parse(
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
