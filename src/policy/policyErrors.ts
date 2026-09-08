import type { StepHarborPolicy } from "../domain/policies.js";

export type PolicyLoadErrorCode =
  | "POLICY_FILE_NOT_FOUND"
  | "POLICY_FILE_READ_ERROR"
  | "POLICY_PARSE_ERROR"
  | "POLICY_VALIDATION_ERROR";

export interface PolicyLoadError {
  code: PolicyLoadErrorCode;
  message: string;
  path?: string;
  details?: unknown;
}

export type LoadedPolicySource =
  | {
      type: "explicit";
      path: string;
    }
  | {
      type: "discovered";
      path: string;
    }
  | {
      type: "default";
    };

export type LoadedPolicyResult =
  | {
      ok: true;
      policy: StepHarborPolicy;
      source: LoadedPolicySource;
    }
  | {
      ok: false;
      error: PolicyLoadError;
    };

export const createPolicyLoadError = (
  code: PolicyLoadErrorCode,
  message: string,
  options: {
    path?: string;
    details?: unknown;
  } = {}
): PolicyLoadError => {
  const error: PolicyLoadError = {
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
