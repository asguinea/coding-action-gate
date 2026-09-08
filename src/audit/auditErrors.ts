import type { AuditRecord } from "../domain/audit.js";

export type AuditLoggerErrorCode =
  | "AUDIT_DIR_CREATE_ERROR"
  | "AUDIT_WRITE_ERROR"
  | "AUDIT_RECORD_VALIDATION_ERROR";

export interface AuditLoggerError {
  code: AuditLoggerErrorCode;
  message: string;
  path?: string;
  details?: unknown;
}

export interface AuditLoggerOptions {
  auditDir?: string;
  auditFileName?: string;
  cwd?: string;
}

export type AuditLoggerResult =
  | {
      ok: true;
      path: string;
      record: AuditRecord;
    }
  | {
      ok: false;
      error: AuditLoggerError;
    };

export const createAuditLoggerError = (
  code: AuditLoggerErrorCode,
  message: string,
  options: {
    path?: string;
    details?: unknown;
  } = {}
): AuditLoggerError => {
  const error: AuditLoggerError = {
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
