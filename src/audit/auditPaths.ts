import path from "node:path";
import type { AuditLoggerOptions } from "./auditErrors.js";

export const defaultAuditDir = ".stepharbor/audit";
export const defaultAuditFileName = "decisions.jsonl";

export const resolveAuditLogPath = (
  options: AuditLoggerOptions = {}
): string => {
  const cwd = options.cwd ?? process.cwd();
  const auditDir = options.auditDir ?? defaultAuditDir;
  const auditFileName = options.auditFileName ?? defaultAuditFileName;
  const resolvedAuditDir = path.isAbsolute(auditDir)
    ? auditDir
    : path.resolve(cwd, auditDir);

  return path.join(resolvedAuditDir, auditFileName);
};
