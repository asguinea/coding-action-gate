export type DeferredActionErrorCode =
  | "DEFERRED_ACTION_READ_ERROR"
  | "DEFERRED_ACTION_WRITE_ERROR"
  | "DEFERRED_ACTION_VALIDATION_ERROR";

export interface DeferredActionError {
  code: DeferredActionErrorCode;
  message: string;
  path?: string;
  details?: unknown;
}

export const createDeferredActionError = (
  code: DeferredActionErrorCode,
  message: string,
  options: {
    path?: string;
    details?: unknown;
  } = {}
): DeferredActionError => {
  const error: DeferredActionError = {
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
