import { auditRecordSchema } from "../domain/audit.js";
import { resolveAuditLogPath } from "../audit/auditPaths.js";
import { readJsonlRecords } from "./jsonlReader.js";
import type {
  ReadAuditRecordsOptions,
  UiAuditRecord
} from "./uiAdapterTypes.js";

export const readAuditRecords = async (
  options: ReadAuditRecordsOptions = {}
): Promise<UiAuditRecord[]> =>
  readJsonlRecords({
    filePath: resolveAuditLogPath({
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.auditDir !== undefined ? { auditDir: options.auditDir } : {})
    }),
    schema: auditRecordSchema,
    ...(options.limit !== undefined ? { limit: options.limit } : {})
  });

export const readLatestAuditRecord = async (
  options: ReadAuditRecordsOptions = {}
): Promise<UiAuditRecord | null> => {
  const records = await readAuditRecords({
    ...options,
    limit: 1
  });

  return records[0] ?? null;
};
