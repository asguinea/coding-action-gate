import type { StepHarborSignals } from "../../domain/signals.js";
import type { SafetySignalError } from "../signalErrors.js";
import type { SafetySignalInput } from "../signalContext.js";

export interface SafetySignalDetector {
  id: string;
  compute(
    input: SafetySignalInput
  ): Promise<StepHarborSignals> | StepHarborSignals;
}

export interface SafetySignalDetectorResult {
  detectorId: string;
  ok: boolean;
  signals?: StepHarborSignals;
  error?: SafetySignalError;
}
