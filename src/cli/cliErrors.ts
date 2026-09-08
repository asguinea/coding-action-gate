export type CliErrorCode =
  | "CLI_BAD_ARGUMENTS"
  | "CLI_ACTION_FILE_NOT_FOUND"
  | "CLI_ACTION_FILE_READ_ERROR"
  | "CLI_ACTION_PARSE_ERROR"
  | "CLI_POLICY_LOAD_ERROR"
  | "CLI_DECISION_ERROR"
  | "CLI_DEFERRED_ACTION_NOT_FOUND"
  | "CLI_DEFERRED_ACTION_NOT_PENDING"
  | "CLI_DEFERRED_RETRY_ERROR"
  | "CLI_VALIDATION_COMMAND_NOT_FOUND"
  | "CLI_VALIDATION_EXECUTION_ERROR"
  | "CLI_VALIDATION_TIMEOUT"
  | "CLI_VALIDATION_RESULT_STORE_ERROR"
  | "CLI_UI_SERVER_ERROR"
  | "CLI_UI_BUILD_NOT_FOUND"
  | "CLI_UI_UNSAFE_HOST"
  | "CLI_UI_INVALID_PORT"
  | "CLI_FEEDBACK_OUTPUT_EXISTS"
  | "CLI_FEEDBACK_EXPORT_ERROR"
  | "CLI_INIT_POLICY_EXISTS"
  | "CLI_INIT_UNKNOWN_TEMPLATE"
  | "CLI_INIT_CWD_NOT_FOUND"
  | "CLI_INIT_ERROR"
  | "CLI_AUDIT_ERROR"
  | "CLI_READ_FILE_NOT_FOUND"
  | "CLI_READ_FILE_ERROR"
  | "CLI_READ_FILE_TOO_LARGE"
  | "CLI_OBSERVATION_ERROR";

export interface CliError {
  code: CliErrorCode;
  message: string;
  details?: unknown;
}

export const createCliError = (
  code: CliErrorCode,
  message: string,
  details?: unknown
): CliError => {
  const error: CliError = {
    code,
    message
  };

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};
