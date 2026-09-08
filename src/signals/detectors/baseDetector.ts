import type { CodingActionGateSignals } from "../../domain/signals.js";
import type { SafetySignalError } from "../signalErrors.js";
import type { SafetySignalInput } from "../signalContext.js";

export interface SafetySignalDetector {
  id: string;
  compute(
    input: SafetySignalInput
  ): Promise<CodingActionGateSignals> | CodingActionGateSignals;
}

export interface SafetySignalDetectorResult {
  detectorId: string;
  ok: boolean;
  signals?: CodingActionGateSignals;
  error?: SafetySignalError;
}
