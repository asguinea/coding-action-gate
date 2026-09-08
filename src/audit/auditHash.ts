import { createHash } from "node:crypto";
import type { AuditRecord } from "../domain/audit.js";

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      const item = record[key];

      if (item !== undefined) {
        normalized[key] = stableNormalize(item);
      }
    }

    return normalized;
  }

  return value;
};

export const stableStringify = (value: unknown): string =>
  JSON.stringify(stableNormalize(value));

export const computeAuditRecordHash = (record: AuditRecord): string => {
  const recordWithoutHash = { ...record };

  delete recordWithoutHash.recordHash;

  return createHash("sha256")
    .update(stableStringify(recordWithoutHash))
    .digest("hex");
};
