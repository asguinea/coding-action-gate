export type SafetySignalErrorCode =
  | "SIGNAL_COMPUTATION_ERROR"
  | "SIGNAL_DETECTOR_ERROR";

export interface SafetySignalError {
  code: SafetySignalErrorCode;
  message: string;
  detectorId?: string;
  details?: unknown;
}

export const createSafetySignalError = (
  code: SafetySignalErrorCode,
  message: string,
  options: {
    detectorId?: string;
    details?: unknown;
  } = {}
): SafetySignalError => {
  const error: SafetySignalError = {
    code,
    message
  };

  if (options.detectorId !== undefined) {
    error.detectorId = options.detectorId;
  }

  if (options.details !== undefined) {
    error.details = options.details;
  }

  return error;
};
