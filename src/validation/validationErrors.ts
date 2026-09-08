export type ValidationErrorCode =
  | "VALIDATION_WRITE_ERROR"
  | "VALIDATION_READ_ERROR"
  | "VALIDATION_RECORD_INVALID";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  path?: string;
  details?: unknown;
}

export const createValidationError = (
  code: ValidationErrorCode,
  message: string,
  options: {
    path?: string;
    details?: unknown;
  } = {}
): ValidationError => ({
  code,
  message,
  ...(options.path !== undefined ? { path: options.path } : {}),
  ...(options.details !== undefined ? { details: options.details } : {})
});
