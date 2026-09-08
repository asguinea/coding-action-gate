import { z } from "zod";
import { isoTimestampSchema } from "../domain/common.js";
import type { FileObservationError } from "./observationErrors.js";

export const fileObservationSourceSchema = z.enum([
  "read_file",
  "cli_read",
  "external_observation",
  "test",
  "unknown"
]);

export const fileObservationRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  path: z.string().min(1),
  absolutePath: z.string().min(1),
  relativePath: z.string().min(1).optional(),
  observedAt: isoTimestampSchema,
  contentHash: z.string().min(1),
  hashAlgorithm: z.literal("sha256"),
  sizeBytes: z.number().int().nonnegative(),
  exists: z.boolean(),
  source: fileObservationSourceSchema,
  metadataOnly: z.boolean().optional()
});

export type FileObservationRecord = z.infer<typeof fileObservationRecordSchema>;

export type FileObservationSource = z.infer<typeof fileObservationSourceSchema>;

export const fileFreshnessStatusSchema = z.enum([
  "fresh",
  "stale",
  "unknown",
  "missing"
]);

export type FileFreshnessStatus = z.infer<typeof fileFreshnessStatusSchema>;

export interface FileFreshnessResult {
  status: FileFreshnessStatus;
  path: string;
  absolutePath: string;
  lastObservation?: FileObservationRecord;
  currentHash?: string;
  currentSizeBytes?: number;
  reason: string;
}

export interface ObservationStoreOptions {
  cwd?: string;
  observationDir?: string;
  sessionId?: string;
}

export interface RecordFileObservationInput extends ObservationStoreOptions {
  path: string;
  source?: FileObservationSource;
  metadataOnly?: boolean;
}

export type FileHashResult =
  | {
      ok: true;
      hash: string;
      algorithm: "sha256";
      sizeBytes: number;
    }
  | {
      ok: false;
      error: FileObservationError;
    };

export type FileObservationRecordResult =
  | {
      ok: true;
      path: string;
      record: FileObservationRecord;
    }
  | {
      ok: false;
      error: FileObservationError;
    };

export type LatestFileObservationResult =
  | {
      ok: true;
      record: FileObservationRecord | null;
    }
  | {
      ok: false;
      error: FileObservationError;
    };

export type ListFileObservationsResult =
  | {
      ok: true;
      records: FileObservationRecord[];
    }
  | {
      ok: false;
      error: FileObservationError;
    };
