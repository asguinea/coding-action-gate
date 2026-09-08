export type FileObservationErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_READ_ERROR"
  | "OBSERVATION_WRITE_ERROR"
  | "OBSERVATION_READ_ERROR"
  | "OBSERVATION_VALIDATION_ERROR";

export interface FileObservationError {
  code: FileObservationErrorCode;
  message: string;
  path?: string;
  details?: unknown;
}

export const createFileObservationError = (
  code: FileObservationErrorCode,
  message: string,
  options: {
    path?: string;
    details?: unknown;
  } = {}
): FileObservationError => {
  const error: FileObservationError = {
    code,
    message
  };

  if (options.path !== undefined) {
    error.path = options.path;
  }

  if (options.details !== undefined) {
    error.details = options.details;
  }

  return error;
};
