import { mkdir, readFile, stat, appendFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { auditRecordSchema, type AuditRecord } from "../domain/audit.js";
import {
  createAuditLoggerError,
  type AuditLoggerOptions,
  type AuditLoggerResult
} from "./auditErrors.js";
import { computeAuditRecordHash } from "./auditHash.js";
import { resolveAuditLogPath } from "./auditPaths.js";

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const readPreviousRecordHash = async (
  filePath: string
): Promise<string | undefined> => {
  if (!(await fileExists(filePath))) {
    return undefined;
  }

  const content = await readFile(filePath, "utf8");
  const lastLine = content
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().length > 0);

  if (lastLine === undefined) {
    return undefined;
  }

  const parsed = JSON.parse(lastLine) as unknown;

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "recordHash" in parsed &&
    typeof parsed.recordHash === "string"
  ) {
    return parsed.recordHash;
  }

  return undefined;
};

const prepareRecordForAppend = async (
  record: AuditRecord,
  filePath: string
): Promise<AuditRecord> => {
  const previousRecordHash =
    record.previousRecordHash ?? (await readPreviousRecordHash(filePath));
  const recordWithPreviousHash = {
    ...record,
    ...(previousRecordHash !== undefined ? { previousRecordHash } : {})
  };
  const parsedRecord = auditRecordSchema.parse(recordWithPreviousHash);

  return {
    ...parsedRecord,
    recordHash: computeAuditRecordHash(parsedRecord)
  };
};

export const appendAuditRecord = async (
  record: AuditRecord,
  options: AuditLoggerOptions = {}
): Promise<AuditLoggerResult> => {
  const filePath = resolveAuditLogPath(options);
  const auditDir = path.dirname(filePath);

  try {
    await mkdir(auditDir, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: createAuditLoggerError(
        "AUDIT_DIR_CREATE_ERROR",
        `Audit directory could not be created: ${auditDir}`,
        { path: auditDir, details: error }
      )
    };
  }

  let preparedRecord: AuditRecord;

  try {
    preparedRecord = await prepareRecordForAppend(record, filePath);
  } catch (error) {
    return {
      ok: false,
      error: createAuditLoggerError(
        "AUDIT_RECORD_VALIDATION_ERROR",
        "Audit record failed schema validation.",
        {
          path: filePath,
          details: error instanceof ZodError ? error.issues : error
        }
      )
    };
  }

  try {
    await appendFile(filePath, `${JSON.stringify(preparedRecord)}\n`, "utf8");

    return {
      ok: true,
      path: filePath,
      record: preparedRecord
    };
  } catch (error) {
    return {
      ok: false,
      error: createAuditLoggerError(
        "AUDIT_WRITE_ERROR",
        `Audit record could not be written: ${filePath}`,
        { path: filePath, details: error }
      )
    };
  }
};

export const createAuditLogger = (options: AuditLoggerOptions = {}) => ({
  append: (record: AuditRecord): Promise<AuditLoggerResult> =>
    appendAuditRecord(record, options)
});

export type { AuditLoggerOptions, AuditLoggerResult };
